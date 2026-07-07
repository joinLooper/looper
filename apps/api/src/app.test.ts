import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildApp } from "./app.js";
import { InMemoryStore } from "./store.js";

const adminHeaders = { "x-looper-role": "admin" };
const merchantHeaders = { "x-looper-role": "merchant" };
const businessHours = [
  { day: "monday", closed: true, periods: [] },
  { day: "tuesday", closed: false, periods: [{ start: "11:00", end: "14:00" }, { start: "17:00", end: "20:00" }] },
  { day: "wednesday", closed: false, periods: [{ start: "11:00", end: "20:00" }] },
  { day: "thursday", closed: false, periods: [{ start: "11:00", end: "20:00" }] },
  { day: "friday", closed: false, periods: [{ start: "11:00", end: "21:00" }] },
  { day: "saturday", closed: false, periods: [{ start: "10:00", end: "21:00" }] },
  { day: "sunday", closed: false, periods: [{ start: "10:00", end: "18:00" }] },
] as const;

function payload(email: string) {
  return {
    storeName: "森林蔬食測試店",
    contactName: "林店長",
    contactLineId: "forest.manager",
    phone: "0912345678",
    email,
    address: "台北市森林路 1 號",
    storeCategory: "餐廳",
    otherStoreCategory: "",
    vegetarianOffering: ["火鍋", "咖哩飯", "拉麵", "其他"],
    otherMealType: "蔬食鐵板料理",
    businessHours,
  };
}

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "looper-api-"));
  const dbPath = join(dir, "test.sqlite");
  const store = new InMemoryStore(dbPath);
  const app = await buildApp(store);
  await app.ready();
  return { app, store, dir, dbPath, async close() { await app.close(); store.close(); rmSync(dir, { recursive: true, force: true }); } };
}

async function onboardMerchant(app: Awaited<ReturnType<typeof setup>>["app"], email: string, plan?: "sprout" | "grove" | "forest") {
  const submitted = await app.inject({ method: "POST", url: "/merchant-applications", payload: payload(email) });
  assert.equal(submitted.statusCode, 201, submitted.body);
  const application = submitted.json();
  const approved = await app.inject({ method: "POST", url: `/merchant-applications/${application.id}/review`, headers: adminHeaders, payload: { decision: "approve", reviewerId: "admin-demo" } });
  assert.equal(approved.statusCode, 200, approved.body);
  const approvedApplication = approved.json();
  if (plan) {
    const planResponse = await app.inject({ method: "POST", url: `/merchants/${approvedApplication.merchantId}/plan`, headers: adminHeaders, payload: { merchantPlan: plan } });
    assert.equal(planResponse.statusCode, 200, planResponse.body);
  }
  const missions = (await app.inject({ method: "GET", url: "/missions" })).json();
  return { application: approvedApplication, mission: missions.find((mission: { merchantId: string }) => mission.merchantId === approvedApplication.merchantId) };
}

async function completeVegetarianRedemption(context: Awaited<ReturnType<typeof setup>>, suffix: string, plan?: "sprout" | "grove" | "forest") {
  const { application, mission } = await onboardMerchant(context.app, `forest-${suffix}@example.com`, plan);
  const accepted = await context.app.inject({ method: "POST", url: `/missions/${mission.id}/accept`, payload: { userId: "user-demo" } });
  assert.equal(accepted.statusCode, 201, accepted.body);
  const redeemed = await context.app.inject({ method: "POST", url: "/redemptions", headers: merchantHeaders, payload: { userId: "user-demo", missionId: mission.id, merchantId: application.merchantId, idempotencyKey: `redeem-${suffix}` } });
  assert.equal(redeemed.statusCode, 201, redeemed.body);
  return redeemed.json();
}

test("initial state is persisted in SQLite and has no missions", async () => {
  const context = await setup();
  assert.deepEqual((await context.app.inject({ method: "GET", url: "/merchants" })).json(), []);
  assert.deepEqual((await context.app.inject({ method: "GET", url: "/missions" })).json(), []);
  const user = (await context.app.inject({ method: "GET", url: "/users/user-demo/state" })).json();
  assert.equal(user.resources.currentLevel, 1);
  assert.equal(user.growth.carbonTotalGrams, 0);
  await context.close();
});

test("merchant onboarding creates merchant and mission with centralized rewards", async () => {
  const context = await setup();
  const { application, mission } = await onboardMerchant(context.app, "onboard@example.com");
  assert.equal(application.status, "approved");
  assert.equal(mission.starReward, 400);
  assert.equal(mission.energyReward, 30);
  assert.equal(mission.expReward, 100);
  assert.equal(mission.carbonGrams, 800);
  await context.close();
});

test("merchant application validation still blocks invalid other meal type and hours", async () => {
  const context = await setup();
  const missingOther = await context.app.inject({ method: "POST", url: "/merchant-applications", payload: { ...payload("other-meal@example.com"), vegetarianOffering: ["其他"], otherMealType: "" } });
  assert.equal(missingOther.statusCode, 400);
  const overlapping = businessHours.map((day) => day.day === "tuesday" ? { ...day, periods: [{ start: "11:00", end: "18:00" }, { start: "17:00", end: "20:00" }] } : day);
  const overlapResponse = await context.app.inject({ method: "POST", url: "/merchant-applications", payload: { ...payload("overlap@example.com"), businessHours: overlapping } });
  assert.equal(overlapResponse.statusCode, 400);
  await context.close();
});

test("first vegetarian redemption grants stars energy exp and 800g carbon without seed", async () => {
  const context = await setup();
  const result = await completeVegetarianRedemption(context, "one");
  assert.equal(result.rewardSummary.stars, 400);
  assert.equal(result.rewardSummary.energy, 30);
  assert.equal(result.rewardSummary.exp, 100);
  assert.equal(result.rewardSummary.carbonGrams, 800);
  assert.equal(result.growthSummary.carbonTotalGrams, 800);
  assert.equal(result.growthSummary.carbonBalanceGrams, 800);
  assert.equal(result.growthSummary.seedCount, 0);
  assert.equal(result.user.resources.starBalance, 400);
  assert.equal(result.user.resources.currentEnergy, 30);
  await context.close();
});

test("1600g balance plus one redemption creates one seed and keeps 400g remainder", async () => {
  const context = await setup();
  context.store.setGrowthBalanceForTest("user-demo", { carbonBalanceGrams: 1600, carbonTotalGrams: 1600 });
  const result = await completeVegetarianRedemption(context, "seed");
  assert.equal(result.growthSummary.carbonTotalGrams, 2400);
  assert.equal(result.growthSummary.carbonBalanceGrams, 400);
  assert.equal(result.growthSummary.generatedSeeds, 1);
  assert.equal(result.growthSummary.seedCount, 1);
  await context.close();
});

test("three redemptions create 2.4kg total carbon and one seed", async () => {
  const context = await setup();
  await completeVegetarianRedemption(context, "a");
  await completeVegetarianRedemption(context, "b");
  const result = await completeVegetarianRedemption(context, "c");
  assert.equal(result.growthSummary.carbonTotalGrams, 2400);
  assert.equal(result.growthSummary.carbonBalanceGrams, 400);
  assert.equal(result.growthSummary.seedCount, 1);
  await context.close();
});

test("nine seeds plus generated seed combines into one plant", async () => {
  const context = await setup();
  context.store.setGrowthBalanceForTest("user-demo", { carbonBalanceGrams: 1600, carbonTotalGrams: 1600, seedCount: 9, plantCount: 0, treeCount: 0 });
  const result = await completeVegetarianRedemption(context, "plant");
  assert.equal(result.growthSummary.carbonBalanceGrams, 400);
  assert.equal(result.growthSummary.seedCount, 0);
  assert.equal(result.growthSummary.generatedPlants, 1);
  assert.equal(result.growthSummary.plantCount, 1);
  await context.close();
});

test("nine plants plus generated plant combines into one tree", async () => {
  const context = await setup();
  context.store.setGrowthBalanceForTest("user-demo", { carbonBalanceGrams: 1600, carbonTotalGrams: 1600, seedCount: 9, plantCount: 9, treeCount: 0 });
  const result = await completeVegetarianRedemption(context, "tree");
  assert.equal(result.growthSummary.seedCount, 0);
  assert.equal(result.growthSummary.plantCount, 0);
  assert.equal(result.growthSummary.generatedTrees, 1);
  assert.equal(result.growthSummary.treeCount, 1);
  await context.close();
});

test("tree count keeps accumulating and does not convert at ten", async () => {
  const context = await setup();
  context.store.setGrowthBalanceForTest("user-demo", { treeCount: 10 });
  const state = (await context.app.inject({ method: "GET", url: "/users/user-demo/state" })).json();
  assert.equal(state.growth.treeCount, 10);
  await context.close();
});

test("duplicate redemption replays settlement without second ledger or rewards", async () => {
  const context = await setup();
  const { application, mission } = await onboardMerchant(context.app, "duplicate@example.com");
  await context.app.inject({ method: "POST", url: `/missions/${mission.id}/accept`, payload: { userId: "user-demo" } });
  const request = { method: "POST" as const, url: "/redemptions", headers: merchantHeaders, payload: { userId: "user-demo", missionId: mission.id, merchantId: application.merchantId, idempotencyKey: "same-request-0001" } };
  const first = await context.app.inject(request);
  const second = await context.app.inject(request);
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(second.statusCode, 200, second.body);
  const user = (await context.app.inject({ method: "GET", url: "/users/user-demo/state" })).json();
  assert.equal(user.resources.starBalance, 400);
  assert.equal(user.resources.currentEnergy, 30);
  assert.equal(user.resources.currentExp, 100);
  assert.equal(user.growth.carbonTotalGrams, 800);
  assert.equal(context.store.listRewardEvents().length, 1);
  assert.equal(context.store.listResourceTransactions().filter((item) => item.sourceId === first.json().redemption.id).length, 5);
  await context.close();
});

test("same completed mission with a new idempotency key is blocked", async () => {
  const context = await setup();
  const result = await completeVegetarianRedemption(context, "blocked");
  const second = await context.app.inject({ method: "POST", url: "/redemptions", headers: merchantHeaders, payload: { userId: "user-demo", missionId: result.redemption.missionId, merchantId: result.redemption.merchantId, idempotencyKey: "different-key-0001" } });
  assert.equal(second.statusCode, 409);
  await context.close();
});

test("EXP crossing threshold levels up and keeps overflow EXP", async () => {
  const context = await setup();
  context.store.setUserResourcesForTest("user-demo", { currentExp: 450 });
  const result = await completeVegetarianRedemption(context, "level");
  assert.equal(result.levelSummary.previousLevel, 1);
  assert.equal(result.levelSummary.currentLevel, 2);
  assert.equal(result.user.resources.currentExp, 550);
  assert.equal(result.user.resources.maxEnergy, 110);
  assert.equal(result.user.resources.starBalance, 450);
  await context.close();
});

test("large EXP supports multiple level-ups and all rewards", async () => {
  const context = await setup();
  const response = await context.app.inject({ method: "POST", url: "/admin/reward-events", headers: adminHeaders, payload: { userId: "user-demo", sourceType: "event_checkin", sourceId: "big-exp-event", idempotencyKey: "big-exp-key", stars: 0, exp: 2300 } });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.equal(body.levelSummary.currentLevel, 4);
  assert.equal(body.levelSummary.levelsGained, 3);
  assert.equal(body.user.resources.currentExp, 2300);
  assert.equal(body.user.resources.maxEnergy, 135);
  await context.close();
});

test("level-up refills energy to the new max energy", async () => {
  const context = await setup();
  context.store.setUserResourcesForTest("user-demo", { currentEnergy: 10, currentExp: 450 });
  const result = await completeVegetarianRedemption(context, "energy-refill");
  assert.equal(result.user.resources.maxEnergy, 110);
  assert.equal(result.user.resources.currentEnergy, 110);
  await context.close();
});

test("natural energy regeneration is lazy and never exceeds max energy", async () => {
  const context = await setup();
  const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  context.store.setUserResourcesForTest("user-demo", { currentEnergy: 99, maxEnergy: 100, energyLastUpdatedAt: old });
  const user = (await context.app.inject({ method: "GET", url: "/users/user-demo/state" })).json();
  assert.equal(user.resources.currentEnergy, 100);
  assert.equal(user.resources.energyOverflowPending, 0);
  await context.close();
});

test("reward energy can exceed max energy up to 150 percent and records overflow pending", async () => {
  const context = await setup();
  context.store.setUserResourcesForTest("user-demo", { currentEnergy: 145, maxEnergy: 100 });
  const result = await completeVegetarianRedemption(context, "overflow");
  assert.equal(result.user.resources.currentEnergy, 150);
  assert.equal(result.user.resources.energyOverflowPending, 25);
  assert.equal(result.rewardSummary.energyOverflow, 25);
  await context.close();
});

test("activity cards can grant stars exp and optional energy but never carbon or plants", async () => {
  const context = await setup();
  const response = await context.app.inject({ method: "POST", url: "/admin/reward-events", headers: adminHeaders, payload: { userId: "user-demo", sourceType: "event_checkin", sourceId: "event-1", idempotencyKey: "event-key-1", stars: 50, energy: 5, exp: 20 } });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.equal(body.rewardSummary.stars, 50);
  assert.equal(body.rewardSummary.energy, 5);
  assert.equal(body.rewardSummary.carbonGrams, 0);
  assert.equal(body.growthSummary.seedCount, 0);
  await context.close();
});

test("merchant plans grant 400 500 600 stars while carbon remains 800g", async () => {
  const context = await setup();
  const sprout = await completeVegetarianRedemption(context, "sprout", "sprout");
  const grove = await completeVegetarianRedemption(context, "grove", "grove");
  const forest = await completeVegetarianRedemption(context, "forest", "forest");
  assert.equal(sprout.rewardSummary.stars, 400);
  assert.equal(grove.rewardSummary.stars, 500);
  assert.equal(forest.rewardSummary.stars, 600);
  assert.equal(sprout.rewardSummary.carbonGrams, 800);
  assert.equal(grove.rewardSummary.carbonGrams, 800);
  assert.equal(forest.rewardSummary.carbonGrams, 800);
  await context.close();
});

test("transaction rollback prevents partial redemption and ledger writes", async () => {
  const context = await setup();
  const { application, mission } = await onboardMerchant(context.app, "rollback@example.com");
  await context.app.inject({ method: "POST", url: `/missions/${mission.id}/accept`, payload: { userId: "user-demo" } });
  context.store.failNextLedgerWrite = true;
  const failed = await context.app.inject({ method: "POST", url: "/redemptions", headers: merchantHeaders, payload: { userId: "user-demo", missionId: mission.id, merchantId: application.merchantId, idempotencyKey: "rollback-key" } });
  assert.equal(failed.statusCode, 500);
  assert.equal(context.store.redemptions.length, 0);
  assert.equal(context.store.listRewardEvents().length, 0);
  assert.equal(context.store.listResourceTransactions().length, 0);
  const user = (await context.app.inject({ method: "GET", url: "/users/user-demo/state" })).json();
  assert.equal(user.resources.starBalance, 0);
  assert.equal(user.growth.carbonTotalGrams, 0);
  assert.equal(user.enrollments[0].status, "awaiting_verification");
  await context.close();
});

test("API restart keeps applications missions redemptions rewards and growth", async () => {
  const context = await setup();
  await completeVegetarianRedemption(context, "persist");
  await context.app.close();
  context.store.close();
  const reopenedStore = new InMemoryStore(context.dbPath);
  const reopenedApp = await buildApp(reopenedStore);
  await reopenedApp.ready();
  const user = (await reopenedApp.inject({ method: "GET", url: "/users/user-demo/state" })).json();
  assert.equal(user.resources.starBalance, 400);
  assert.equal(user.growth.carbonTotalGrams, 800);
  assert.equal((await reopenedApp.inject({ method: "GET", url: "/missions" })).json().length, 1);
  assert.equal(reopenedStore.redemptions.length, 1);
  await reopenedApp.close();
  reopenedStore.close();
  rmSync(context.dir, { recursive: true, force: true });
});

test("admin overview exposes resource audit data and no diamond reward path", async () => {
  const context = await setup();
  await completeVegetarianRedemption(context, "overview");
  const overview = (await context.app.inject({ method: "GET", url: "/admin/overview", headers: adminHeaders })).json();
  assert.equal(overview.metrics.completedMissions, 1);
  assert.equal(overview.metrics.starsGranted, 400);
  assert.equal(overview.metrics.energyGranted, 30);
  assert.equal(overview.metrics.expGranted, 100);
  assert.equal(overview.metrics.carbonTotalGrams, 800);
  assert.ok(overview.resourceTransactions.length >= 4);
  assert.equal(JSON.stringify(overview).includes("diamond"), false);
  await context.close();
});

test("complete MVP flow still returns compatible routes and settlement response", async () => {
  const context = await setup();
  const result = await completeVegetarianRedemption(context, "mvp");
  assert.equal(result.redemption.starsGranted, 400);
  assert.equal(result.user.latestRewardEvent.rewardPayload.carbonGrams, 800);
  assert.equal((await context.app.inject({ method: "GET", url: "/health" })).statusCode, 200);
  assert.equal((await context.app.inject({ method: "GET", url: "/merchant/redemptions", headers: merchantHeaders })).statusCode, 200);
  assert.equal((await context.app.inject({ method: "GET", url: "/admin/economy", headers: adminHeaders })).statusCode, 200);
  await context.close();
});
