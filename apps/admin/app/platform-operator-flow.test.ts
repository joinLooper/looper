import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PlatformOperatorListItem } from "@looper/types";
import { hasPlatformPermission } from "./admin-session-flow";
import {
  accountStatusLabel,
  canChangePlatformOperatorRole,
  canReactivatePlatformOperator,
  canResendPlatformInvitation,
  canSuspendPlatformOperator,
  classifyPlatformOperatorError,
  createPlatformOperatorRequest,
  invitationStatusLabel,
  invitationUrl,
  isDifferentRole,
  isValidReason,
  membershipStatusLabel,
  nextIdempotencyKey,
  oneTimeInvitationFromResponse,
  platformOperatorErrorMessage,
  platformOperatorRequest,
  resendPlatformInvitationRequest,
  updatePlatformOperatorRoleRequest,
  updatePlatformOperatorStatusRequest,
} from "./platform-operator-flow";

function item(overrides: Partial<PlatformOperatorListItem> = {}): PlatformOperatorListItem {
  return {
    accountId: "account-1",
    displayName: "平台操作人員",
    accountStatus: "active",
    membershipId: "membership-1",
    role: "operations_admin",
    membershipStatus: "active",
    membershipCreatedAt: "2026-07-18T01:00:00.000Z",
    membershipUpdatedAt: "2026-07-18T01:00:00.000Z",
    grantedByAccountId: "account-super",
    pendingInvitationId: "invitation-1",
    pendingInvitationExpiresAt: "2026-07-21T01:00:00.000Z",
    lastInvitationCreatedAt: "2026-07-18T01:00:00.000Z",
    ...overrides,
  };
}

function body(request: RequestInit): Record<string, unknown> {
  return JSON.parse(String(request.body)) as Record<string, unknown>;
}

test("admin platform operator management gates entry and direct route only by backend permission", () => {
  assert.equal(hasPlatformPermission(null, "platform.identity.manage"), false);
  assert.equal(hasPlatformPermission({ accountId: "a", displayName: "A", accountStatus: "active", membershipId: "m", membershipStatus: "active", role: "super_admin", permissions: [] }, "platform.identity.manage"), false);
  const home = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("./platform-operators/page.tsx", import.meta.url), "utf8");
  assert.match(home, /canManagePlatformIdentity \? <Link[\s\S]*\/platform-operators/);
  assert.match(route, /if \(!canManage \|\| accessDenied\) return/);
  assert.match(route, /if \(!canManage \|\| !session\) return false/);
});

test("admin platform operator management list request uses cookie credentials without spoofed headers", () => {
  assert.deepEqual(platformOperatorRequest, { credentials: "include" });
  assert.equal("headers" in platformOperatorRequest, false);
});

test("admin platform operator management renders canonical role, account, membership and invitation states", () => {
  assert.deepEqual([accountStatusLabel("active"), accountStatusLabel("suspended"), accountStatusLabel("closed")], ["啟用中", "帳號已停權", "帳號已關閉"]);
  assert.deepEqual([membershipStatusLabel("active"), membershipStatusLabel("suspended"), membershipStatusLabel("left")], ["啟用中", "已停權", "已離職"]);
  assert.equal(invitationStatusLabel(item()), "待接受邀請");
  assert.equal(invitationStatusLabel(item({ pendingInvitationId: null, pendingInvitationExpiresAt: null })), "邀請已失效或目前沒有待接受邀請");
});

test("admin platform operator management create request sends only the formal fields", () => {
  const request = createPlatformOperatorRequest({ displayName: "新管理員", role: "finance_admin", idempotencyKey: "create-key-1" });
  assert.equal(request.credentials, "include");
  assert.deepEqual(body(request), { displayName: "新管理員", role: "finance_admin", idempotencyKey: "create-key-1" });
  assert.equal(/actor|account|permission|force|override/i.test(JSON.stringify(body(request))), false);
});

test("admin platform operator management lifecycle requests use formal payloads and cookie credentials", () => {
  const status = updatePlatformOperatorStatusRequest({ status: "suspended", reason: "職務調整", idempotencyKey: "status-key-1" });
  const role = updatePlatformOperatorRoleRequest({ role: "finance_admin", reason: "職務調整", idempotencyKey: "role-key-1" });
  const resend = resendPlatformInvitationRequest("invite-key-1");
  assert.deepEqual(body(status), { status: "suspended", reason: "職務調整", idempotencyKey: "status-key-1" });
  assert.deepEqual(body(role), { role: "finance_admin", reason: "職務調整", idempotencyKey: "role-key-1" });
  assert.deepEqual(body(resend), { idempotencyKey: "invite-key-1" });
  assert.deepEqual([status.credentials, role.credentials, resend.credentials], ["include", "include", "include"]);
});

test("admin platform operator management keeps a retry key and creates a new key for a new operation", () => {
  const values = ["key-a", "key-b"];
  const first = nextIdempotencyKey(() => values.shift() ?? "none");
  assert.equal(body(updatePlatformOperatorStatusRequest({ status: "suspended", reason: "原因", idempotencyKey: first })).idempotencyKey, first);
  assert.equal(body(updatePlatformOperatorStatusRequest({ status: "suspended", reason: "原因", idempotencyKey: first })).idempotencyKey, first);
  assert.equal(nextIdempotencyKey(() => values.shift() ?? "none"), "key-b");
});

test("admin platform operator management validates reason and rejects unchanged role in UI", () => {
  assert.equal(isValidReason("原因"), true);
  assert.equal(isValidReason(" "), false);
  assert.equal(isValidReason("字".repeat(501)), false);
  assert.equal(isDifferentRole("operations_admin", "operations_admin"), false);
  assert.equal(isDifferentRole("operations_admin", "finance_admin"), true);
});

test("admin platform operator management action visibility uses only returned lifecycle status", () => {
  const active = item();
  const suspended = item({ membershipStatus: "suspended" });
  assert.deepEqual([canSuspendPlatformOperator(active), canChangePlatformOperatorRole(active), canResendPlatformInvitation(active)], [true, true, true]);
  assert.equal(canReactivatePlatformOperator(active), false);
  assert.equal(canReactivatePlatformOperator(suspended), true);
  assert.deepEqual([canSuspendPlatformOperator(suspended), canChangePlatformOperatorRole(suspended), canResendPlatformInvitation(suspended)], [false, false, false]);
});

test("admin platform operator management reveals an invitation only on the first token-bearing result", () => {
  const revealed = oneTimeInvitationFromResponse({ tokenRevealed: true, invitationToken: "opaque", invitation: { expiresAt: "2026-07-21T01:00:00.000Z" } }, "新管理員");
  assert.deepEqual(revealed, { token: "opaque", expiresAt: "2026-07-21T01:00:00.000Z", displayName: "新管理員" });
  assert.equal(oneTimeInvitationFromResponse({ tokenRevealed: false, invitation: { expiresAt: "2026-07-21T01:00:00.000Z" } }, "新管理員"), null);
  assert.equal(oneTimeInvitationFromResponse({ tokenRevealed: true, invitationToken: "opaque", invitation: null }, "新管理員"), null);
  assert.equal(invitationUrl("https://admin.looper.test/", "opaque+/"), "https://admin.looper.test/invite?token=opaque%2B%2F");
});

test("admin platform operator management classifies API errors only by status and uses safe messages", () => {
  assert.deepEqual([400, 401, 403, 404, 409, 500].map(classifyPlatformOperatorError), ["validation", "unauthenticated", "forbidden", "not_found", "conflict", "unknown"]);
  assert.equal(classifyPlatformOperatorError(null), "network");
  assert.match(platformOperatorErrorMessage("conflict"), /狀態已變更|衝突/);
  assert.match(platformOperatorErrorMessage("network"), /同一操作內容安全重試/);
});

test("admin platform operator management refreshes after mutations and distinguishes refresh failure", () => {
  const route = readFileSync(new URL("./platform-operators/page.tsx", import.meta.url), "utf8");
  assert.match(route, /refreshAfterMutation/);
  assert.match(route, /操作已完成，但列表更新失敗/);
  assert.match(route, /error === "not_found" \|\| error === "conflict"[\s\S]*loadOperators/);
  assert.match(route, /if \(busyMutation/);
});

test("admin platform operator management clears data for 401, 403, logout and stale requests", () => {
  const route = readFileSync(new URL("./platform-operators/page.tsx", import.meta.url), "utf8");
  const gate = readFileSync(new URL("./admin-session-gate.tsx", import.meta.url), "utf8");
  assert.match(route, /setItems\(\[\]\);[\s\S]*setOneTimeInvitation\(null\)/);
  assert.match(route, /error === "unauthenticated"[\s\S]*invalidateSession\("unauthenticated"\)[\s\S]*setAccessDenied\(true\)/);
  assert.match(route, /version !== requestVersion\.current \|\| !mounted\.current/);
  assert.match(gate, /setContext\(null\);[\s\S]*requestAdminLogout/);
});

test("admin platform operator management closes the one-time result by clearing token state", () => {
  const route = readFileSync(new URL("./platform-operators/page.tsx", import.meta.url), "utf8");
  assert.match(route, /function closeInvitation\(\)[\s\S]*setOneTimeInvitation\(null\)/);
  assert.match(route, /tokenRevealed === false && result\.replayed/);
  assert.match(route, /重送結果不會再次顯示/);
});

test("admin platform operator management has no frontend authority bypass or sensitive persistence", () => {
  const helper = readFileSync(new URL("./platform-operator-flow.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("./platform-operators/page.tsx", import.meta.url), "utf8");
  const sources = `${helper}\n${route}`;
  assert.equal(/PLATFORM_ROLE_PERMISSIONS|permissionsForRole|rolePermissions/i.test(sources), false);
  assert.equal(/localStorage|sessionStorage|indexedDB|document\.cookie|console\./i.test(sources), false);
  assert.equal(/x-looper-role|x-account|actorId\s*:/i.test(sources), false);
  assert.equal(/response\.(text|clone)\(|JSON\.stringify\(result\)/i.test(sources), false);
});

test("admin platform operator management provides complete 390px card, dialog and copy controls", () => {
  const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
  const route = readFileSync(new URL("./platform-operators/page.tsx", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.platform-operator-card-head[\s\S]*\.platform-dialog-actions/);
  assert.match(route, /platform-operator-card/);
  assert.match(route, /原因（1–500字）/);
  assert.match(route, /複製邀請連結/);
  assert.match(route, /danger-button/);
});
