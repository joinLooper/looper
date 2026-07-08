import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { configureDatabase, migrateDatabase, MIGRATIONS } from "./database.js";
import { InMemoryStore } from "./store.js";

import { DatabaseSync } from "node:sqlite";

const adminHeaders = { "x-looper-role": "admin" };
const merchantHeaders = { "x-looper-role": "merchant" };
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
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

async function getFreePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
    server.on("error", reject);
  });
}

async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + 15000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw lastError instanceof Error ? lastError : new Error(`API process did not become healthy on ${port}`);
}

async function withApiProcess<T>(dbPath: string, callback: (baseUrl: string) => Promise<T>): Promise<T> {
  const port = await getFreePort();
  const tsxCli = resolve(repoRoot, "apps/api/node_modules/tsx/dist/cli.mjs");
  const child = spawn(process.execPath, [tsxCli, "src/index.ts"], {
    cwd: resolve(repoRoot, "apps/api"),
    env: { ...process.env, LOOPER_DATABASE_PATH: dbPath, API_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  try {
    await waitForHealth(port);
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    child.kill();
    await new Promise<void>((resolveClose) => child.once("close", () => resolveClose()));
    if (stderr.includes("EADDRINUSE")) throw new Error(stderr);
  }
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

test("empty database runs versioned migrations and seeds 120 second energy regeneration", () => {
  const dir = mkdtempSync(join(tmpdir(), "looper-migrate-empty-"));
  const dbPath = join(dir, "test.sqlite");
  const store = new InMemoryStore(dbPath);
  const versions = store.db.prepare("SELECT version, name FROM schema_migrations ORDER BY version").all() as Array<{ version: number; name: string }>;
  assert.deepEqual(versions.map((item) => item.version), [1, 2]);
  assert.equal(versions[1].name, "core_economy_integrity_constraints");
  assert.equal(store.getUser("user-demo").resources.energyRegenIntervalSeconds, 120);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test("migration upgrades legacy 1200 second data to 120 seconds and preserves custom legal intervals", () => {
  const dir = mkdtempSync(join(tmpdir(), "looper-migrate-legacy-"));
  const dbPath = join(dir, "legacy.sqlite");
  const db = new DatabaseSync(dbPath);
  configureDatabase(db);
  db.exec(`
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
INSERT INTO schema_migrations (version, applied_at) VALUES (1, datetime('now'));
CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE user_resources (
  user_id TEXT PRIMARY KEY,
  star_balance INTEGER NOT NULL,
  current_energy INTEGER NOT NULL,
  max_energy INTEGER NOT NULL,
  energy_regen_interval_seconds INTEGER NOT NULL,
  energy_last_updated_at TEXT NOT NULL,
  energy_overflow_pending INTEGER NOT NULL,
  current_exp INTEGER NOT NULL,
  current_level INTEGER NOT NULL,
  next_level_exp INTEGER NOT NULL,
  unlock_flags_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE economy_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
INSERT INTO users (id, display_name, created_at) VALUES ('legacy-1200', 'Legacy', datetime('now')), ('custom-300', 'Custom', datetime('now'));
INSERT INTO user_resources VALUES ('legacy-1200', 0, 0, 100, 1200, datetime('now'), 0, 0, 1, 500, '[]', datetime('now'));
INSERT INTO user_resources VALUES ('custom-300', 0, 0, 100, 300, datetime('now'), 0, 0, 1, 500, '[]', datetime('now'));
INSERT INTO economy_settings VALUES ('core', '{"vegetarianCarbonGrams":800,"carbonGramsPerSeed":2000,"seedsPerPlant":10,"plantsPerTree":10,"redemptionEnergy":30,"redemptionExp":100,"energyRegenIntervalSeconds":1200,"energyOverflowMultiplier":1.5}', datetime('now'));
`);
  migrateDatabase(db);
  const legacy = db.prepare("SELECT energy_regen_interval_seconds FROM user_resources WHERE user_id = 'legacy-1200'").get() as { energy_regen_interval_seconds: number };
  const custom = db.prepare("SELECT energy_regen_interval_seconds FROM user_resources WHERE user_id = 'custom-300'").get() as { energy_regen_interval_seconds: number };
  const versions = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: number }>;
  assert.deepEqual(versions.map((item) => item.version), [1, 2]);
  assert.equal(legacy.energy_regen_interval_seconds, 120);
  assert.equal(custom.energy_regen_interval_seconds, 300);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number }).count, 2);
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test("failed migration rolls back schema and schema_migrations row", () => {
  const db = new DatabaseSync(":memory:");
  configureDatabase(db);
  const failing = { version: 999, name: "failing_test_migration", up(database: DatabaseSync) { database.exec("CREATE TABLE should_rollback (id TEXT PRIMARY KEY);"); throw new Error("boom"); } };
  MIGRATIONS.push(failing);
  try {
    assert.throws(() => migrateDatabase(db), /boom/);
    assert.equal(Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'should_rollback'").get()), false);
    assert.equal(Boolean(db.prepare("SELECT version FROM schema_migrations WHERE version = 999").get()), false);
  } finally {
    MIGRATIONS.pop();
    db.close();
  }
});

test("database constraints reject invalid core settings and resource balances", () => {
  const dir = mkdtempSync(join(tmpdir(), "looper-constraints-"));
  const dbPath = join(dir, "constraints.sqlite");
  const store = new InMemoryStore(dbPath);
  assert.throws(() => store.db.prepare("UPDATE user_resources SET star_balance = -1 WHERE user_id = 'user-demo'").run(), /constraint/i);
  assert.throws(() => store.db.prepare("UPDATE economy_settings SET value_json = ? WHERE key = 'core'").run(JSON.stringify({
    vegetarianCarbonGrams: 0,
    carbonGramsPerSeed: 2000,
    seedsPerPlant: 10,
    plantsPerTree: 10,
    redemptionEnergy: 30,
    redemptionExp: 100,
    energyRegenIntervalSeconds: 120,
    energyOverflowMultiplier: 1.5,
  })), /constraint/i);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test("natural energy regeneration uses 120 second ticks and preserves only partial seconds", async () => {
  const context = await setup();
  const last = new Date(Date.now() - 120 * 1000).toISOString();
  context.store.setUserResourcesForTest("user-demo", { currentEnergy: 10, maxEnergy: 100, energyLastUpdatedAt: last });
  const user = (await context.app.inject({ method: "GET", url: "/users/user-demo/state" })).json();
  assert.equal(user.resources.currentEnergy, 11);
  assert.equal(user.resources.energyRegenIntervalSeconds, 120);
  await context.close();
});

test("full energy does not accumulate hidden regeneration backlog", async () => {
  const context = await setup();
  const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  context.store.setUserResourcesForTest("user-demo", { currentEnergy: 100, maxEnergy: 100, energyLastUpdatedAt: old });
  const full = (await context.app.inject({ method: "GET", url: "/users/user-demo/state" })).json();
  assert.equal(full.resources.currentEnergy, 100);
  context.store.setUserResourcesForTest("user-demo", { currentEnergy: 99 });
  const afterSpend = (await context.app.inject({ method: "GET", url: "/users/user-demo/state" })).json();
  assert.equal(afterSpend.resources.currentEnergy, 99);
  await context.close();
});

test("future energy timestamp and repeated reads do not double regenerate", async () => {
  const context = await setup();
  const future = new Date(Date.now() + 120 * 1000).toISOString();
  context.store.setUserResourcesForTest("user-demo", { currentEnergy: 10, energyLastUpdatedAt: future });
  const first = (await context.app.inject({ method: "GET", url: "/users/user-demo/state" })).json();
  const second = (await context.app.inject({ method: "GET", url: "/users/user-demo/state" })).json();
  assert.equal(first.resources.currentEnergy, 10);
  assert.equal(second.resources.currentEnergy, 10);
  await context.close();
});

test("generic reward idempotency replays same payload and rejects changed payload", async () => {
  const context = await setup();
  const request = { userId: "user-demo", sourceType: "event_checkin", sourceId: "event-replay", idempotencyKey: "event-replay-key", stars: 10, energy: 1, exp: 5 };
  const first = await context.app.inject({ method: "POST", url: "/admin/reward-events", headers: adminHeaders, payload: request });
  const replay = await context.app.inject({ method: "POST", url: "/admin/reward-events", headers: adminHeaders, payload: request });
  const changed = await context.app.inject({ method: "POST", url: "/admin/reward-events", headers: adminHeaders, payload: { ...request, stars: 11 } });
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().replayed, true);
  assert.equal(changed.statusCode, 409);
  assert.equal(context.store.listRewardEvents().filter((event) => event.idempotencyKey === request.idempotencyKey).length, 1);
  await context.close();
});

test("concurrent identical reward requests settle once and replay once", async () => {
  const context = await setup();
  const request = { method: "POST" as const, url: "/admin/reward-events", headers: adminHeaders, payload: { userId: "user-demo", sourceType: "event_checkin", sourceId: "event-concurrent", idempotencyKey: "event-concurrent-key", stars: 10, exp: 5 } };
  const [first, second] = await Promise.all([context.app.inject(request), context.app.inject(request)]);
  assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 200]);
  assert.equal(context.store.listRewardEvents().filter((event) => event.idempotencyKey === "event-concurrent-key").length, 1);
  assert.equal(context.store.listResourceTransactions().filter((tx) => tx.idempotencyKey === "event-concurrent-key" && tx.resourceType === "stars").length, 1);
  await context.close();
});

test("merchant approval duplicate and rollback keep application merchant mission audit consistent", async () => {
  const context = await setup();
  const submitted = await context.app.inject({ method: "POST", url: "/merchant-applications", payload: payload("approval-integrity@example.com") });
  const application = submitted.json();
  context.store.failNextMerchantMissionWrite = true;
  const failed = await context.app.inject({ method: "POST", url: `/merchant-applications/${application.id}/review`, headers: adminHeaders, payload: { decision: "approve", reviewerId: "admin-demo" } });
  assert.equal(failed.statusCode, 500);
  assert.equal(context.store.merchants.length, 0);
  assert.equal(context.store.missions.length, 0);
  assert.equal(context.store.merchantApplications[0].status, "pending");
  const approved = await context.app.inject({ method: "POST", url: `/merchant-applications/${application.id}/review`, headers: adminHeaders, payload: { decision: "approve", reviewerId: "admin-demo" } });
  const duplicate = await context.app.inject({ method: "POST", url: `/merchant-applications/${application.id}/review`, headers: adminHeaders, payload: { decision: "approve", reviewerId: "admin-demo" } });
  assert.equal(approved.statusCode, 200, approved.body);
  assert.equal(duplicate.statusCode, 409);
  assert.equal(context.store.merchants.length, 1);
  assert.equal(context.store.missions.length, 1);
  await context.close();
});

test("actual API process restart preserves settlement data and idempotency replay", async () => {
  const dir = mkdtempSync(join(tmpdir(), "looper-api-process-"));
  const dbPath = join(dir, "restart.sqlite");
  let replayPayload: { userId: string; missionId: string; merchantId: string; idempotencyKey: string } | undefined;
  await withApiProcess(dbPath, async (baseUrl) => {
    const submitted = await fetch(`${baseUrl}/merchant-applications`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload("process-restart@example.com")) });
    assert.equal(submitted.status, 201);
    const application = await submitted.json() as { id: string; merchantId?: string };
    const approved = await fetch(`${baseUrl}/merchant-applications/${application.id}/review`, { method: "POST", headers: { "content-type": "application/json", ...adminHeaders }, body: JSON.stringify({ decision: "approve", reviewerId: "admin-demo" }) });
    assert.equal(approved.status, 200);
    const approvedApplication = await approved.json() as { merchantId: string };
    const missions = await (await fetch(`${baseUrl}/missions`)).json() as Array<{ id: string; merchantId: string }>;
    const mission = missions.find((item) => item.merchantId === approvedApplication.merchantId)!;
    const accepted = await fetch(`${baseUrl}/missions/${mission.id}/accept`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "user-demo" }) });
    assert.equal(accepted.status, 201);
    replayPayload = { userId: "user-demo", missionId: mission.id, merchantId: approvedApplication.merchantId, idempotencyKey: "process-restart-key" };
    const redeemed = await fetch(`${baseUrl}/redemptions`, { method: "POST", headers: { "content-type": "application/json", ...merchantHeaders }, body: JSON.stringify(replayPayload) });
    assert.equal(redeemed.status, 201);
  });
  assert.ok(replayPayload);
  await withApiProcess(dbPath, async (baseUrl) => {
    const user = await (await fetch(`${baseUrl}/users/user-demo/state`)).json() as { resources: { starBalance: number }; growth: { carbonTotalGrams: number } };
    assert.equal(user.resources.starBalance, 400);
    assert.equal(user.growth.carbonTotalGrams, 800);
    const replay = await fetch(`${baseUrl}/redemptions`, { method: "POST", headers: { "content-type": "application/json", ...merchantHeaders }, body: JSON.stringify(replayPayload) });
    assert.equal(replay.status, 200);
    const overview = await (await fetch(`${baseUrl}/admin/overview`, { headers: adminHeaders })).json() as { redemptions: unknown[]; rewardEvents: unknown[]; resourceTransactions: unknown[]; metrics: { completedMissions: number } };
    assert.equal(overview.redemptions.length, 1);
    assert.equal(overview.rewardEvents.length, 1);
    assert.ok(overview.resourceTransactions.length >= 5);
    assert.equal(overview.metrics.completedMissions, 1);
  });
  await withApiProcess(dbPath, async (baseUrl) => {
    const overview = await (await fetch(`${baseUrl}/admin/overview`, { headers: adminHeaders })).json() as { redemptions: unknown[]; rewardEvents: unknown[] };
    assert.equal(overview.redemptions.length, 1);
    assert.equal(overview.rewardEvents.length, 1);
  });
  rmSync(dir, { recursive: true, force: true });
});
