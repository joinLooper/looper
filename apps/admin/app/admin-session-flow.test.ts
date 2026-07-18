import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PlatformOperatorContext } from "@looper/types";
import {
  classifyInvitationFailure,
  hasPlatformPermission,
  invitationRedeemRequest,
  loadAdminSession,
  logoutRequest,
  platformRoleLabel,
  removeInvitationToken,
} from "./admin-session-flow";

const context: PlatformOperatorContext = {
  accountId: "account-platform-1",
  displayName: "平台管理員",
  accountStatus: "active",
  membershipId: "platform-membership-1",
  role: "super_admin",
  membershipStatus: "active",
  permissions: ["platform.identity.manage"],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("admin invitation session flow sends invitation redemption with cookie credentials and no spoofed identity headers", () => {
  const request = invitationRedeemRequest("opaque-invitation-value");
  assert.equal(request.method, "POST");
  assert.equal(request.credentials, "include");
  assert.deepEqual(request.headers, { "content-type": "application/json" });
  assert.deepEqual(JSON.parse(String(request.body)), { token: "opaque-invitation-value" });
  assert.equal(/x-looper-role|account|actor/i.test(JSON.stringify(request.headers)), false);
});

test("admin invitation session flow removes only the invitation token from the successful URL", () => {
  const original = new URL("https://admin.looper.test/invite?token=opaque&source=mail#login");
  assert.equal(removeInvitationToken(original), "/invite?source=mail#login");
  assert.equal(original.searchParams.get("token"), "opaque");
});

test("admin invitation session flow classifies terminal invitation errors without exposing raw responses", () => {
  assert.equal(classifyInvitationFailure(409, "邀請已逾期"), "expired");
  assert.equal(classifyInvitationFailure(409, "邀請已被兌換"), "redeemed");
  assert.equal(classifyInvitationFailure(409, "邀請已撤銷"), "revoked");
  assert.equal(classifyInvitationFailure(403, "不允許的 Origin"), "origin");
  assert.equal(classifyInvitationFailure(500, "internal"), "error");
});

test("admin invitation session flow calls auth session before admin context and uses cookie credentials", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const result = await loadAdminSession(async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1 ? jsonResponse({ authenticated: true, account: { accountId: "ignored" } }) : jsonResponse(context);
  }, "https://api.looper.test");
  assert.deepEqual(calls.map((call) => call.url), ["https://api.looper.test/auth/session", "https://api.looper.test/admin/context"]);
  assert.deepEqual(calls.map((call) => call.init?.credentials), ["include", "include"]);
  assert.deepEqual(result, { status: "authenticated", context });
});

test("admin invitation session flow does not request context when unauthenticated", async () => {
  const calls: string[] = [];
  const result = await loadAdminSession(async (url) => {
    calls.push(url);
    return jsonResponse({ authenticated: false });
  }, "https://api.looper.test");
  assert.deepEqual(calls, ["https://api.looper.test/auth/session"]);
  assert.deepEqual(result, { status: "unauthenticated" });
});

test("admin invitation session flow treats revoked sessions and context 403 as closed gates", async () => {
  const revoked = await loadAdminSession(async () => jsonResponse({ authenticated: false }), "https://api.looper.test");
  let count = 0;
  const forbidden = await loadAdminSession(async () => ++count === 1 ? jsonResponse({ authenticated: true }) : jsonResponse({}, 403), "https://api.looper.test");
  assert.equal(revoked.status, "unauthenticated");
  assert.equal(forbidden.status, "forbidden");
  assert.equal("context" in forbidden, false);
});

test("admin invitation session flow uses only backend context role and permissions", () => {
  assert.equal(hasPlatformPermission(context, "platform.identity.manage"), true);
  assert.equal(hasPlatformPermission({ ...context, role: "operations_admin", permissions: [] }, "platform.identity.manage"), false);
  assert.equal(hasPlatformPermission({ ...context, role: "finance_admin", permissions: [] }, "platform.identity.manage"), false);
  assert.equal(hasPlatformPermission(context, "platform.unknown"), false);
  assert.equal(hasPlatformPermission(null, "platform.identity.manage"), false);
  assert.deepEqual(["operations_admin", "finance_admin", "super_admin"].map((role) => platformRoleLabel(role as PlatformOperatorContext["role"])), ["營運管理員", "財務管理員", "最高管理員"]);
});

test("admin invitation session flow logout uses cookie credentials and no identity payload", () => {
  assert.deepEqual(logoutRequest(), { method: "POST", credentials: "include" });
});

test("admin invitation session flow gate clears protected content before checks and after logout", () => {
  const source = readFileSync(new URL("./admin-session-gate.tsx", import.meta.url), "utf8");
  assert.match(source, /setContext\(null\);\s*setStatus\("checking"\)/);
  assert.match(source, /setContext\(null\);[\s\S]*requestAdminLogout/);
  assert.match(source, /setStatus\("unauthenticated"\)/);
  assert.match(source, /status !== "authenticated" \|\| !context/);
  assert.match(source, /useEffect\([\s\S]*checkSession/);
});

test("admin invitation session flow invite page supports safe network retry and terminal states", () => {
  const source = readFileSync(new URL("./invite/page.tsx", import.meta.url), "utf8");
  assert.match(source, /window\.history\.replaceState/);
  assert.match(source, /window\.location\.replace\("\/"\)/);
  assert.match(source, /status === "network"/);
  assert.match(source, /setAttempt/);
  assert.match(source, /expired:[\s\S]*redeemed:[\s\S]*revoked:[\s\S]*origin:/);
  assert.equal(/console\.|raw JSON|stack trace/i.test(source), false);
});

test("admin invitation session flow contains no browser identity persistence or frontend role permission map", () => {
  const helper = readFileSync(new URL("./admin-session-flow.ts", import.meta.url), "utf8");
  const gate = readFileSync(new URL("./admin-session-gate.tsx", import.meta.url), "utf8");
  const invite = readFileSync(new URL("./invite/page.tsx", import.meta.url), "utf8");
  const sources = `${helper}\n${gate}\n${invite}`;
  assert.equal(/localStorage|sessionStorage|indexedDB|document\.cookie/i.test(sources), false);
  assert.equal(/PLATFORM_ROLE_PERMISSIONS|rolePermissions|permissionsForRole/i.test(sources), false);
  assert.equal(/x-looper-role|x-account|actorId/i.test(sources), false);
});

test("admin invitation session flow provides readable narrow-screen gate and identity controls", () => {
  const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
  const gate = readFileSync(new URL("./admin-session-gate.tsx", import.meta.url), "utf8");
  const invite = readFileSync(new URL("./invite/page.tsx", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.admin-identity-bar/);
  assert.match(css, /\.admin-auth-card[\s\S]*width: min\(100%, 520px\)/);
  assert.match(gate, /admin-logout-button/);
  assert.match(invite, /admin-auth-action/);
});
