import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { EconomySettings, PlatformOperatorContext } from "@looper/types";
import {
  ADMIN_ECONOMY_READ_PERMISSIONS,
  adminEconomyRequest,
  canManageEconomySettings,
  canManageMerchantPlans,
  canReadAdminEconomy,
  classifyAdminEconomyError,
  economySettingsUpdateRequest,
  merchantPlanUpdateRequest,
} from "./admin-economy-flow";

function context(role: PlatformOperatorContext["role"], permissions: PlatformOperatorContext["permissions"]): PlatformOperatorContext {
  return {
    accountId: `account-${role}`,
    displayName: role,
    accountStatus: "active",
    membershipId: `membership-${role}`,
    membershipStatus: "active",
    role,
    permissions,
  };
}

const settings: EconomySettings = {
  vegetarianCarbonGrams: 800,
  carbonGramsPerSeed: 2000,
  seedsPerPlant: 5,
  plantsPerTree: 5,
  redemptionEnergy: 30,
  redemptionExp: 100,
  energyRegenIntervalSeconds: 120,
  energyOverflowMultiplier: 1,
};

test("admin merchant plan economy flow uses only canonical Context permissions", () => {
  const operations = context("operations_admin", ["platform.merchant_plan.read", "platform.economy.read"]);
  const finance = context("finance_admin", ["platform.merchant_plan.read", "platform.merchant_plan.manage", "platform.economy.read", "platform.economy.manage"]);
  const superWithoutPermissions = context("super_admin", []);
  assert.deepEqual(ADMIN_ECONOMY_READ_PERMISSIONS, ["platform.merchant_plan.read", "platform.economy.read"]);
  assert.equal(canReadAdminEconomy(operations), true);
  assert.equal(canManageMerchantPlans(operations), false);
  assert.equal(canManageEconomySettings(operations), false);
  assert.equal(canReadAdminEconomy(finance), true);
  assert.equal(canManageMerchantPlans(finance), true);
  assert.equal(canManageEconomySettings(finance), true);
  assert.equal(canReadAdminEconomy(superWithoutPermissions), false);
  assert.equal(canManageMerchantPlans(superWithoutPermissions), false);
  assert.equal(canManageEconomySettings(superWithoutPermissions), false);
  assert.equal(canReadAdminEconomy(null), false);
});

test("admin merchant plan economy flow requests use credentials without legacy identity or manual Origin", () => {
  assert.deepEqual(adminEconomyRequest, { credentials: "include", cache: "no-store" });
  assert.equal("headers" in adminEconomyRequest, false);

  const planRequest = merchantPlanUpdateRequest("forest");
  assert.equal(planRequest.method, "POST");
  assert.equal(planRequest.credentials, "include");
  assert.deepEqual(JSON.parse(String(planRequest.body)), { merchantPlan: "forest" });

  const economyRequest = economySettingsUpdateRequest(settings, 7);
  assert.equal(economyRequest.method, "PUT");
  assert.equal(economyRequest.credentials, "include");
  assert.deepEqual(JSON.parse(String(economyRequest.body)), { ...settings, expectedVersion: 7 });

  const requests = JSON.stringify([adminEconomyRequest, planRequest, economyRequest]);
  assert.equal(/x-looper-role|updatedBy|actorId|accountId|rewardStarAmount|permission|origin|referer/i.test(requests), false);
});

test("admin merchant plan economy flow classifies safe status handling", () => {
  assert.equal(classifyAdminEconomyError(401), "unauthenticated");
  assert.equal(classifyAdminEconomyError(403), "forbidden");
  assert.equal(classifyAdminEconomyError(404), "not_found");
  assert.equal(classifyAdminEconomyError(409), "conflict");
  assert.equal(classifyAdminEconomyError(null), "network");
  assert.equal(classifyAdminEconomyError(500), "unknown");
});

test("admin merchant plan economy flow page clears stale sensitive data and gates mutations", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const helper = readFileSync(new URL("./admin-economy-flow.ts", import.meta.url), "utf8");
  const sources = `${helper}\n${page}`;

  assert.match(page, /if \(!adminSession \|\| !canLoadOverview\)[\s\S]*setOverview\(null\);[\s\S]*setEconomy\(null\)/);
  assert.match(page, /fetch\(`\$\{API_URL\}\/admin\/overview`, adminOverviewRequest\)/);
  assert.match(page, /if \(canLoadEconomy\)[\s\S]*fetch\(`\$\{API_URL\}\/admin\/economy`, adminEconomyRequest\)/);
  assert.match(page, /version !== overviewRequestVersion\.current/);
  assert.match(page, /overviewRequestVersion\.current \+= 1/);
  assert.match(page, /!canReadMerchantPlans[\s\S]*merchants: \[\], merchantPlans: \[\]/);
  assert.match(page, /!canReadEconomySettings[\s\S]*economySettings: null, levelDefinitions: \[\]/);
  assert.match(page, /canManagePlans \? <select/);
  assert.match(page, /canManageEconomy \? <div className="settings-actions"/);
  assert.match(page, /if \(isBusy \|\| !adminSession \|\| !canManagePlans\) return/);
  assert.match(page, /if \(!economy \|\| !settingsForm \|\| isBusy \|\| !adminSession \|\| !canManageEconomy\) return/);
  assert.match(page, /操作已完成，但資料更新失敗/);
  assert.match(page, /error === "unauthenticated"[\s\S]*invalidateSession\("unauthenticated"\)/);
  assert.match(page, /error === "forbidden"[\s\S]*setMerchantPlanPermissionBlocked\(true\)/);
  assert.match(page, /error === "not_found"[\s\S]*await refresh\(\)/);
  assert.match(page, /error === "conflict"[\s\S]*await refresh\(\)/);
  assert.match(page, /merchantPlanUpdateRequest\(merchantPlan\)/);
  assert.match(page, /economySettingsUpdateRequest\(payload, economy\.settings\.version\)/);
  assert.match(page, /adminOverviewRequest/);
  assert.match(page, /merchantApplicationReviewRequest/);
  assert.match(page, /\/platform-operators/);
  assert.equal(/legacyAdminMutationHeaders|x-looper-role|updatedBy:\s*"admin|localStorage|sessionStorage|indexedDB|document\.cookie|window\.location\.reload/i.test(sources), false);
  assert.equal(/optimistic/i.test(sources), false);
});
