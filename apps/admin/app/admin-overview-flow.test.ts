import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PlatformOperatorContext } from "@looper/types";
import {
  ADMIN_OVERVIEW_PERMISSIONS,
  adminOverviewErrorMessage,
  adminOverviewRequest,
  canLoadAdminOverview,
  classifyAdminOverviewError,
} from "./admin-overview-flow";

function context(permissions: PlatformOperatorContext["permissions"]): PlatformOperatorContext {
  return {
    accountId: "platform-account",
    displayName: "平台人員",
    accountStatus: "active",
    membershipId: "platform-membership",
    membershipStatus: "active",
    role: "super_admin",
    permissions,
  };
}

test("admin overview session flow uses canonical backend permissions instead of role names", () => {
  assert.deepEqual(ADMIN_OVERVIEW_PERMISSIONS, ["platform.reporting.read", "platform.audit.read"]);
  assert.equal(canLoadAdminOverview(context(["platform.reporting.read", "platform.audit.read"])), true);
  assert.equal(canLoadAdminOverview(context(["platform.reporting.read"])), false);
  assert.equal(canLoadAdminOverview(context(["platform.audit.read"])), false);
  assert.equal(canLoadAdminOverview(context([])), false);
  assert.equal(canLoadAdminOverview(null), false);
});

test("admin overview session flow request includes credentials and no-store without legacy or spoofed headers", () => {
  assert.deepEqual(adminOverviewRequest, { credentials: "include", cache: "no-store" });
  assert.equal("headers" in adminOverviewRequest, false);
  assert.equal(/role|account|actor|permission/i.test(JSON.stringify(adminOverviewRequest)), false);
});

test("admin overview session flow does not request data before Context permission succeeds", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const gate = readFileSync(new URL("./admin-session-gate.tsx", import.meta.url), "utf8");
  assert.match(page, /if \(!adminSession \|\| !canLoadOverview\)[\s\S]*return;/);
  assert.match(page, /fetch\(`\$\{API_URL\}\/admin\/overview`, adminOverviewRequest\)/);
  assert.match(gate, /status !== "authenticated" \|\| !context/);
});

test("admin overview session flow classifies 401 and 403 separately from network errors", () => {
  assert.equal(classifyAdminOverviewError(401), "unauthenticated");
  assert.equal(classifyAdminOverviewError(403), "forbidden");
  assert.equal(classifyAdminOverviewError(null), "network");
  assert.equal(classifyAdminOverviewError(500), "unknown");
  assert.match(adminOverviewErrorMessage("forbidden"), /沒有此區塊權限/);
  assert.match(adminOverviewErrorMessage("unauthenticated"), /登入狀態已失效/);
});

test("admin overview session flow clears all overview data for 401 and the permission block for 403", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(page, /setOverview\(null\);[\s\S]*setEconomy\(null\);[\s\S]*setSettingsForm\(null\)/);
  assert.match(page, /error === "unauthenticated"[\s\S]*invalidateSession\("unauthenticated"\)/);
  assert.match(page, /canLoadOverview \? <>[\s\S]*目前帳號沒有此區塊權限/);
  assert.equal(/fetch\(`\$\{API_URL\}\/admin\/overview`,\s*\{\s*headers/.test(page), false);
});

test("admin overview session flow ignores stale requests and clears data across logout or Session changes", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const gate = readFileSync(new URL("./admin-session-gate.tsx", import.meta.url), "utf8");
  assert.match(page, /version !== overviewRequestVersion\.current/);
  assert.match(page, /overviewRequestVersion\.current \+= 1/);
  assert.match(gate, /setContext\(null\);[\s\S]*requestAdminLogout/);
  assert.match(gate, /loadAdminSession\(fetch, API_URL\)/);
});

test("admin overview session flow contains no storage cache identity spoofing or permission map", () => {
  const helper = readFileSync(new URL("./admin-overview-flow.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const sources = `${helper}\n${page}`;
  assert.equal(/localStorage|sessionStorage|indexedDB|document\.cookie|console\./i.test(sources), false);
  assert.equal(/PLATFORM_ROLE_PERMISSIONS|permissionsForRole|rolePermissions/i.test(sources), false);
  assert.equal(/x-looper-account|x-account-id|actorId\s*:|permission.*header/i.test(sources), false);
  assert.equal(/fetch\(`\$\{API_URL\}\/admin\/overview`,\s*\{[^}]*x-looper-role/i.test(sources), false);
});

test("admin overview session flow keeps the P0-3B permission-aware management entry", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(page, /hasPlatformPermission\(adminSession\?\.context \?\? null, "platform\.identity\.manage"\)/);
  assert.match(page, /canManagePlatformIdentity \? <Link[\s\S]*\/platform-operators/);
});
