import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PlatformOperatorContext } from "@looper/types";
import {
  canReadMerchantApplications,
  canReviewMerchantApplications,
  classifyMerchantReviewError,
  merchantApplicationReviewRequest,
  merchantReviewErrorMessage,
} from "./admin-merchant-review-flow";

function context(permissions: PlatformOperatorContext["permissions"], role: PlatformOperatorContext["role"] = "operations_admin"): PlatformOperatorContext {
  return {
    accountId: "platform-reviewer",
    displayName: "平台審核人員",
    accountStatus: "active",
    membershipId: "platform-review-membership",
    membershipStatus: "active",
    role,
    permissions,
  };
}

test("admin merchant review session flow uses only canonical Context permissions", () => {
  const allowed = context(["platform.merchant_application.read", "platform.merchant_application.review"]);
  assert.equal(canReadMerchantApplications(allowed), true);
  assert.equal(canReviewMerchantApplications(allowed), true);
  assert.equal(canReadMerchantApplications(context([], "super_admin")), false);
  assert.equal(canReviewMerchantApplications(context([], "super_admin")), false);
  assert.equal(canReadMerchantApplications(context([], "finance_admin")), false);
  assert.equal(canReadMerchantApplications(null), false);
  assert.equal(canReviewMerchantApplications(null), false);
});

test("admin merchant review session flow sends only the formal body with cookie credentials", () => {
  const approve = merchantApplicationReviewRequest("approve", "");
  const revision = merchantApplicationReviewRequest("request_revision", "請補件");
  assert.equal(approve.method, "POST");
  assert.equal(approve.credentials, "include");
  assert.deepEqual(approve.headers, { "content-type": "application/json" });
  assert.deepEqual(JSON.parse(String(approve.body)), { decision: "approve", note: "" });
  assert.deepEqual(JSON.parse(String(revision.body)), { decision: "request_revision", note: "請補件" });
  assert.equal(/reviewerId|actorId|accountId|role|permission|force|override/i.test(String(approve.body)), false);
  assert.equal(/x-looper-role|origin|account|actor|permission/i.test(JSON.stringify(approve.headers)), false);
});

test("admin merchant review session flow classifies safe errors without raw API data", () => {
  assert.equal(classifyMerchantReviewError(400), "invalid");
  assert.equal(classifyMerchantReviewError(401), "unauthenticated");
  assert.equal(classifyMerchantReviewError(403), "forbidden");
  assert.equal(classifyMerchantReviewError(404), "stale");
  assert.equal(classifyMerchantReviewError(409), "stale");
  assert.equal(classifyMerchantReviewError(null), "network");
  assert.match(merchantReviewErrorMessage("network"), /重新整理正式狀態/);
  assert.match(merchantReviewErrorMessage("stale"), /最新資料/);
});

test("admin merchant review session flow gates identifiable applications and review buttons separately", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(page, /canReadMerchantApplications\(adminSession\?\.context \?\? null\)/);
  assert.match(page, /canReviewMerchantApplications\(adminSession\?\.context \?\? null\)/);
  assert.match(page, /canReadApplications \? <section[\s\S]*目前帳號沒有店家申請讀取權限/);
  assert.match(page, /application\.status !== "rejected" && canReviewApplications/);
  assert.match(page, /canReadApplications \? overview\?\.merchantApplications/);
});

test("admin merchant review session flow clears stale data when permissions or Session change", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(page, /if \(!canReadApplications\)[\s\S]*merchantApplications: \[\]/);
  assert.match(page, /error === "unauthenticated"[\s\S]*setOverview\(null\)[\s\S]*setSettingsForm\(null\)[\s\S]*invalidateSession/);
  assert.match(page, /error === "forbidden"[\s\S]*merchantApplications: \[\][\s\S]*setReviewPermissionBlocked\(true\)/);
  assert.match(page, /reviewRequestVersion\.current \+= 1/);
});

test("admin merchant review session flow prevents duplicate clicks and stale responses", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(page, /if \(isBusy \|\| !adminSession \|\| !canReviewApplications\) return/);
  assert.match(page, /version !== reviewRequestVersion\.current/);
  assert.match(page, /disabled=\{isBusy\}/);
  assert.equal(/setOverview\([^)]*status:.*approved|optimistic/i.test(page), false);
});

test("admin merchant review session flow refreshes canonical data without automatic mutation retry", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(page, /if \(response\.ok\)[\s\S]*await refresh\(\)/);
  assert.match(page, /操作已完成，但資料更新失敗/);
  assert.match(page, /error === "stale"[\s\S]*await refresh\(\)/);
  assert.equal((page.match(/merchantApplicationReviewRequest\(/g) ?? []).length, 1);
});

test("admin merchant review session flow preserves P0-4A Overview request security", () => {
  const overview = readFileSync(new URL("./admin-overview-flow.ts", import.meta.url), "utf8");
  assert.match(overview, /credentials: "include"/);
  assert.match(overview, /cache: "no-store"/);
  assert.equal(/x-looper-role|localStorage|sessionStorage|indexedDB|document\.cookie/i.test(overview), false);
});

test("admin merchant review session flow contains no frontend authority map storage or manual Origin", () => {
  const helper = readFileSync(new URL("./admin-merchant-review-flow.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const sources = `${helper}\n${page}`;
  assert.equal(/PLATFORM_ROLE_PERMISSIONS|rolePermissions|permissionsForRole/i.test(sources), false);
  assert.equal(/localStorage|sessionStorage|indexedDB|document\.cookie/i.test(sources), false);
  assert.equal(/headers:\s*\{[^}]*origin/i.test(sources), false);
  assert.equal(/reviewerId|raw JSON|stack trace/i.test(sources), false);
});

test("admin merchant review session flow keeps P0-3B platform operator management available", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(page, /hasPlatformPermission\(adminSession\?\.context \?\? null, "platform\.identity\.manage"\)/);
  assert.match(page, /href="\/platform-operators"/);
});
