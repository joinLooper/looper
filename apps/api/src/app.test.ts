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

async function setup(options?: { taskCodeSecret?: string }) {
  const dir = mkdtempSync(join(tmpdir(), "looper-api-"));
  const dbPath = join(dir, "test.sqlite");
  const store = new InMemoryStore(dbPath, options);
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

type TestContext = Awaited<ReturnType<typeof setup>>;
type ResourceTx = ReturnType<TestContext["store"]["listResourceTransactions"]>[number];
type GrowthFailurePoint = NonNullable<TestContext["store"]["failNextGrowthSettlementAt"]>;
type LevelFailurePoint = NonNullable<TestContext["store"]["failNextLevelSettlementAt"]>;

const growthResourceTypes = new Set<ResourceTx["resourceType"]>(["carbon_total", "carbon_balance", "seed", "plant", "tree"]);
const economySettingKeys = ["vegetarianCarbonGrams", "carbonGramsPerSeed", "seedsPerPlant", "plantsPerTree", "redemptionEnergy", "redemptionExp", "energyRegenIntervalSeconds", "energyOverflowMultiplier"] as const;

async function prepareAcceptedMission(context: TestContext, suffix: string) {
  const { application, mission } = await onboardMerchant(context.app, `accepted-${suffix}@example.com`);
  const accepted = await context.app.inject({ method: "POST", url: `/missions/${mission.id}/accept`, payload: { userId: "user-demo" } });
  assert.equal(accepted.statusCode, 201, accepted.body);
  return { application, mission };
}

function redeemMission(context: TestContext, prepared: Awaited<ReturnType<typeof prepareAcceptedMission>>, idempotencyKey: string, occurredAt?: string) {
  return context.app.inject({
    method: "POST",
    url: "/redemptions",
    headers: merchantHeaders,
    payload: { userId: "user-demo", missionId: prepared.mission.id, merchantId: prepared.application.merchantId, idempotencyKey, ...(occurredAt ? { occurredAt } : {}) },
  });
}

function setMerchantRewardCategory(context: TestContext, merchantId: string, rewardCategory: "general" | "star", timezone = "Asia/Taipei"): void {
  context.store.db.prepare("UPDATE merchants SET reward_category = ?, timezone = ? WHERE id = ?").run(rewardCategory, timezone, merchantId);
}

function transactionsForSource(context: TestContext, sourceId: string): ResourceTx[] {
  return context.store.listResourceTransactions().filter((tx) => tx.sourceId === sourceId);
}

function growthTransactionsForSource(context: TestContext, sourceId: string): ResourceTx[] {
  return transactionsForSource(context, sourceId).filter((tx) => growthResourceTypes.has(tx.resourceType));
}

function assertLedgerEquations(transactions: ResourceTx[]): void {
  for (const tx of transactions) {
    assert.equal(tx.balanceAfter, tx.balanceBefore + tx.amount, tx.id);
  }
}

function assertConversionPair(transactions: ResourceTx[], conversionType: ResourceTx["conversionType"], debitResource: ResourceTx["resourceType"], debitAmount: number, creditResource: ResourceTx["resourceType"], creditAmount: number): void {
  const pair = transactions.filter((tx) => tx.conversionType === conversionType);
  const debit = pair.find((tx) => tx.transactionKind === "convert_debit");
  const credit = pair.find((tx) => tx.transactionKind === "convert_credit");
  assert.ok(debit, `${conversionType} debit`);
  assert.ok(credit, `${conversionType} credit`);
  assert.equal(debit.resourceType, debitResource);
  assert.equal(debit.amount, debitAmount);
  assert.equal(credit.resourceType, creditResource);
  assert.equal(credit.amount, creditAmount);
  assert.notEqual(debit.conversionId, "");
  assert.equal(credit.conversionId, debit.conversionId);
}

function updateEconomySettings(context: TestContext, partial: Partial<TestContext["store"]["economySettings"]>): void {
  const current = context.store.economySettings;
  const settings = Object.fromEntries(economySettingKeys.map((key) => [key, partial[key] ?? current[key]]));
  context.store.db.prepare("UPDATE economy_settings SET value_json = ?, updated_at = datetime('now') WHERE key = 'core'").run(JSON.stringify(settings));
}

function economyPayload(context: TestContext, partial: Partial<TestContext["store"]["economySettings"]> = {}) {
  const current = context.store.economySettings;
  return {
    ...Object.fromEntries(economySettingKeys.map((key) => [key, partial[key] ?? current[key]])),
    expectedVersion: current.version,
    updatedBy: "admin-test",
  };
}

function replaceLevelDefinitions(context: TestContext, definitions: Array<{ level: number; requiredTotalExp: number; rewardStars: number; maxEnergyIncrease: number; unlockFlags: string[] }>): void {
  context.store.db.exec("DELETE FROM level_definitions;");
  const insert = context.store.db.prepare("INSERT INTO level_definitions (level, required_total_exp, reward_stars, max_energy_increase, unlock_flags_json) VALUES (?, ?, ?, ?, ?)");
  for (const definition of definitions) {
    insert.run(definition.level, definition.requiredTotalExp, definition.rewardStars, definition.maxEnergyIncrease, JSON.stringify(definition.unlockFlags));
  }
}

function countRows(context: TestContext, table: string): number {
  return (context.store.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
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

async function createTaskCodePendingSubmission(context: TestContext, suffix: string) {
  const { application, mission } = await onboardMerchant(context.app, `task-code-decision-${suffix}@example.com`);
  const current = (await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${application.merchantId}`, headers: merchantHeaders })).json();
  const response = await context.app.inject({
    method: "POST",
    url: "/task-code-submissions",
    payload: { userId: "user-demo", missionId: mission.id, merchantId: application.merchantId, code: current.code, idempotencyKey: `task-code-submit-${suffix}` },
  });
  assert.equal(response.statusCode, 201, response.body);
  return { application, mission, current, submission: response.json() };
}

test("task code thin slice migration creates tables", () => {
  const dir = mkdtempSync(join(tmpdir(), "looper-task-code-migrate-"));
  const dbPath = join(dir, "task-code.sqlite");
  const store = new InMemoryStore(dbPath);
  const tables = store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('task_code_windows', 'task_code_submissions') ORDER BY name").all() as Array<{ name: string }>;
  assert.deepEqual(tables.map((item) => item.name), ["task_code_submissions", "task_code_windows"]);
  assert.ok(store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_task_code_windows_one_active_per_merchant'").get());
  const versions = store.db.prepare("SELECT version, name FROM schema_migrations ORDER BY version").all() as Array<{ version: number; name: string }>;
  assert.equal(versions.at(-1)?.version, 8);
  assert.equal(versions.at(-1)?.name, "finalized_core_economy_rules");
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test("task code windows can persist 4 and 6 digit lengths without plaintext", async () => {
  const context = await setup();
  const first = await onboardMerchant(context.app, "task-code-4@example.com");
  const second = await onboardMerchant(context.app, "task-code-6@example.com");
  const validFrom = new Date(Date.now() - 60 * 1000).toISOString();
  const validUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const four = context.store.createTaskCodeWindow({ merchantId: first.application.merchantId, codeLength: 4, validFrom, validUntil });
  const six = context.store.createTaskCodeWindow({ merchantId: second.application.merchantId, codeLength: 6, validFrom, validUntil });
  assert.equal(four.codeLength, 4);
  assert.equal(six.codeLength, 6);
  assert.match(four.codeHash, /^[a-f0-9]{64}$/);
  assert.match(six.codeHash, /^[a-f0-9]{64}$/);
  assert.equal(/^\d{4}$/.test(four.codeHash), false);
  assert.equal(/^\d{6}$/.test(six.codeHash), false);
  assert.equal(context.store.listTaskCodeWindows().length, 2);
  await context.close();
});

test("task code submission idempotency replays same content and rejects changed content", async () => {
  const context = await setup();
  const { application, mission } = await onboardMerchant(context.app, "task-code-idempotency@example.com");
  const window = context.store.createTaskCodeWindow({
    merchantId: application.merchantId,
    codeLength: 4,
    validFrom: new Date(Date.now() - 60 * 1000).toISOString(),
    validUntil: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  });
  const input = { taskCodeWindowId: window.id, merchantId: application.merchantId, missionId: mission.id, userId: "user-demo", idempotencyKey: "task-code-key-1" };
  const first = context.store.createTaskCodeSubmission(input);
  const replay = context.store.createTaskCodeSubmission(input);
  assert.equal(replay.id, first.id);
  assert.equal(context.store.listTaskCodeSubmissions().length, 1);
  let conflictError: unknown;
  try {
    context.store.createTaskCodeSubmission({ ...input, missionId: "different-mission" });
  } catch (error) {
    conflictError = error;
  }
  assert.equal((conflictError as { statusCode?: number }).statusCode, 409);
  await context.close();
});

test("task code pending submission does not create rewards or resource ledger", async () => {
  const context = await setup();
  const { application, mission } = await onboardMerchant(context.app, "task-code-pending@example.com");
  const window = context.store.createTaskCodeWindow({
    merchantId: application.merchantId,
    codeLength: 4,
    validFrom: new Date(Date.now() - 60 * 1000).toISOString(),
    validUntil: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  });
  const rewardCount = context.store.listRewardEvents().length;
  const ledgerCount = context.store.listResourceTransactions().length;
  const submission = context.store.createTaskCodeSubmission({ taskCodeWindowId: window.id, merchantId: application.merchantId, missionId: mission.id, userId: "user-demo", idempotencyKey: "task-code-pending-key" });
  assert.equal(submission.status, "pending");
  assert.equal(new Date(submission.confirmationExpiresAt).getTime() - new Date(submission.submittedAt).getTime(), 5 * 60 * 1000);
  assert.equal(context.store.listRewardEvents().length, rewardCount);
  assert.equal(context.store.listResourceTransactions().length, ledgerCount);
  await context.close();
});

test("task code expired window cannot create pending submission", async () => {
  const context = await setup();
  const { application, mission } = await onboardMerchant(context.app, "task-code-expired@example.com");
  const window = context.store.createTaskCodeWindow({
    merchantId: application.merchantId,
    codeLength: 4,
    validFrom: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    validUntil: new Date(Date.now() - 60 * 1000).toISOString(),
  });
  let expiredError: unknown;
  try {
    context.store.createTaskCodeSubmission({ taskCodeWindowId: window.id, merchantId: application.merchantId, missionId: mission.id, userId: "user-demo", idempotencyKey: "task-code-expired-key" });
  } catch (error) {
    expiredError = error;
  }
  assert.equal((expiredError as { statusCode?: number }).statusCode, 409);
  assert.equal(context.store.listTaskCodeSubmissions().length, 0);
  await context.close();
});

test("task code current endpoint creates first 4 digit active window", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application } = await onboardMerchant(context.app, "task-code-current@example.com");
  const response = await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${application.merchantId}`, headers: merchantHeaders });
  assert.equal(response.statusCode, 200, response.body);
  const current = response.json();
  assert.equal(current.merchantId, application.merchantId);
  assert.equal(current.codeLength, 4);
  assert.match(current.code, /^\d{4}$/);
  assert.equal(current.status, "active");
  assert.equal(context.store.listTaskCodeWindows().length, 1);
  assert.notEqual(context.store.listTaskCodeWindows()[0].codeHash, current.code);
  await context.close();
});

test("task code current endpoint reuses same active window and code", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application } = await onboardMerchant(context.app, "task-code-reuse@example.com");
  const first = await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${application.merchantId}`, headers: merchantHeaders });
  const second = await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${application.merchantId}`, headers: merchantHeaders });
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(second.statusCode, 200, second.body);
  assert.equal(second.json().windowId, first.json().windowId);
  assert.equal(second.json().code, first.json().code);
  assert.equal(context.store.listTaskCodeWindows().length, 1);
  await context.close();
});

test("task code correct submission creates pending submission through API", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, mission } = await onboardMerchant(context.app, "task-code-submit@example.com");
  const current = (await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${application.merchantId}`, headers: merchantHeaders })).json();
  const response = await context.app.inject({
    method: "POST",
    url: "/task-code-submissions",
    payload: { userId: "user-demo", missionId: mission.id, merchantId: application.merchantId, code: current.code, idempotencyKey: "task-code-submit-key" },
  });
  assert.equal(response.statusCode, 201, response.body);
  const submission = response.json();
  assert.equal(submission.taskCodeWindowId, current.windowId);
  assert.equal(submission.status, "pending");
  assert.equal(new Date(submission.confirmationExpiresAt).getTime() - new Date(submission.submittedAt).getTime(), 5 * 60 * 1000);
  await context.close();
});

test("task code wrong code rejects submission without creating row", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, mission } = await onboardMerchant(context.app, "task-code-wrong@example.com");
  const current = (await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${application.merchantId}`, headers: merchantHeaders })).json();
  const wrongCode = current.code === "0000" ? "0001" : "0000";
  const response = await context.app.inject({
    method: "POST",
    url: "/task-code-submissions",
    payload: { userId: "user-demo", missionId: mission.id, merchantId: application.merchantId, code: wrongCode, idempotencyKey: "task-code-wrong-key" },
  });
  assert.equal(response.statusCode, 400, response.body);
  assert.equal(context.store.listTaskCodeSubmissions().length, 0);
  await context.close();
});

test("task code expired active window cannot be submitted", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, mission } = await onboardMerchant(context.app, "task-code-api-expired@example.com");
  const current = (await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${application.merchantId}`, headers: merchantHeaders })).json();
  context.store.db.prepare("UPDATE task_code_windows SET valid_from = ?, valid_until = ? WHERE id = ?").run(
    new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    new Date(Date.now() - 60 * 1000).toISOString(),
    current.windowId,
  );
  const response = await context.app.inject({
    method: "POST",
    url: "/task-code-submissions",
    payload: { userId: "user-demo", missionId: mission.id, merchantId: application.merchantId, code: current.code, idempotencyKey: "task-code-api-expired-key" },
  });
  assert.equal(response.statusCode, 409, response.body);
  assert.equal(context.store.listTaskCodeSubmissions().length, 0);
  assert.equal(context.store.listTaskCodeWindows()[0].status, "expired");
  await context.close();
});

test("task code merchant pending list only includes own submissions", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const first = await onboardMerchant(context.app, "task-code-pending-first@example.com");
  const second = await onboardMerchant(context.app, "task-code-pending-second@example.com");
  const firstCode = (await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${first.application.merchantId}`, headers: merchantHeaders })).json();
  const secondCode = (await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${second.application.merchantId}`, headers: merchantHeaders })).json();
  await context.app.inject({ method: "POST", url: "/task-code-submissions", payload: { userId: "user-demo", missionId: first.mission.id, merchantId: first.application.merchantId, code: firstCode.code, idempotencyKey: "task-code-pending-first-key" } });
  await context.app.inject({ method: "POST", url: "/task-code-submissions", payload: { userId: "user-demo", missionId: second.mission.id, merchantId: second.application.merchantId, code: secondCode.code, idempotencyKey: "task-code-pending-second-key" } });
  const response = await context.app.inject({ method: "GET", url: `/merchant/task-code-submissions?merchantId=${first.application.merchantId}&status=pending`, headers: merchantHeaders });
  assert.equal(response.statusCode, 200, response.body);
  const submissions = response.json();
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].merchantId, first.application.merchantId);
  assert.equal(submissions[0].user.id, "user-demo");
  assert.equal(submissions[0].mission.id, first.mission.id);
  assert.equal(submissions[0].resources, undefined);
  await context.close();
});

test("task code pending list expires submissions after confirmation window", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, mission } = await onboardMerchant(context.app, "task-code-pending-expiry@example.com");
  const current = (await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${application.merchantId}`, headers: merchantHeaders })).json();
  const created = await context.app.inject({
    method: "POST",
    url: "/task-code-submissions",
    payload: { userId: "user-demo", missionId: mission.id, merchantId: application.merchantId, code: current.code, idempotencyKey: "task-code-pending-expiry-key" },
  });
  const submission = created.json();
  context.store.db.prepare("UPDATE task_code_submissions SET confirmation_expires_at = ? WHERE id = ?").run(new Date(Date.now() - 60 * 1000).toISOString(), submission.id);
  const pending = await context.app.inject({ method: "GET", url: `/merchant/task-code-submissions?merchantId=${application.merchantId}&status=pending`, headers: merchantHeaders });
  assert.equal(pending.statusCode, 200, pending.body);
  assert.deepEqual(pending.json(), []);
  assert.equal(context.store.listTaskCodeSubmissions()[0].status, "expired");
  await context.close();
});

test("task code submission endpoint replays same idempotency key without a second row", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, mission } = await onboardMerchant(context.app, "task-code-api-idempotency@example.com");
  const current = (await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${application.merchantId}`, headers: merchantHeaders })).json();
  const payload = { userId: "user-demo", missionId: mission.id, merchantId: application.merchantId, code: current.code, idempotencyKey: "task-code-api-idempotency-key" };
  const first = await context.app.inject({ method: "POST", url: "/task-code-submissions", payload });
  const replay = await context.app.inject({ method: "POST", url: "/task-code-submissions", payload });
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().id, first.json().id);
  assert.equal(context.store.listTaskCodeSubmissions().length, 1);
  await context.close();
});

test("task code current submit pending flow creates no reward or resource transactions", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, mission } = await onboardMerchant(context.app, "task-code-no-reward@example.com");
  const rewardCount = context.store.listRewardEvents().length;
  const ledgerCount = context.store.listResourceTransactions().length;
  const current = (await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${application.merchantId}`, headers: merchantHeaders })).json();
  const response = await context.app.inject({
    method: "POST",
    url: "/task-code-submissions",
    payload: { userId: "user-demo", missionId: mission.id, merchantId: application.merchantId, code: current.code, idempotencyKey: "task-code-no-reward-key" },
  });
  assert.equal(response.statusCode, 201, response.body);
  assert.equal(context.store.listRewardEvents().length, rewardCount);
  assert.equal(context.store.listResourceTransactions().length, ledgerCount);
  await context.close();
});

test("task code pending submission can be confirmed", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, submission } = await createTaskCodePendingSubmission(context, "confirm");
  const response = await context.app.inject({
    method: "POST",
    url: `/merchant/task-code-submissions/${submission.id}/decision`,
    headers: merchantHeaders,
    payload: { merchantId: application.merchantId, decision: "confirm", actorId: "staff-confirm", idempotencyKey: "task-code-decision-confirm" },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().status, "confirmed");
  assert.equal(context.store.listTaskCodeSubmissions()[0].status, "confirmed");
  await context.close();
});

test("task code pending submission can be rejected", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, submission } = await createTaskCodePendingSubmission(context, "reject");
  const response = await context.app.inject({
    method: "POST",
    url: `/merchant/task-code-submissions/${submission.id}/decision`,
    headers: merchantHeaders,
    payload: { merchantId: application.merchantId, decision: "reject", actorId: "staff-reject", idempotencyKey: "task-code-decision-reject" },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().status, "rejected");
  assert.equal(context.store.listTaskCodeSubmissions()[0].status, "rejected");
  await context.close();
});

test("task code confirmed decision writes confirmed timestamp actor and audit", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, submission } = await createTaskCodePendingSubmission(context, "confirm-metadata");
  const response = await context.app.inject({
    method: "POST",
    url: `/merchant/task-code-submissions/${submission.id}/decision`,
    headers: merchantHeaders,
    payload: { merchantId: application.merchantId, decision: "confirm", actorId: "staff-confirm-meta", idempotencyKey: "task-code-confirm-meta" },
  });
  assert.equal(response.statusCode, 200, response.body);
  const decided = response.json();
  assert.ok(decided.confirmedAt);
  assert.equal(decided.rejectedAt, undefined);
  assert.equal(decided.decidedBy, "staff-confirm-meta");
  assert.equal(decided.decisionIdempotencyKey, "task-code-confirm-meta");
  const audit = context.store.auditEvents.find((event) => event.action === "task_code_submission.confirmed" && event.entityId === submission.id);
  assert.ok(audit);
  assert.equal(audit.metadata.submissionId, submission.id);
  assert.equal(audit.metadata.merchantId, application.merchantId);
  assert.equal(audit.metadata.actorId, "staff-confirm-meta");
  assert.equal(audit.metadata.decision, "confirm");
  assert.equal(audit.metadata.decisionIdempotencyKey, "task-code-confirm-meta");
  await context.close();
});

test("task code rejected decision writes rejected timestamp actor and audit", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, submission } = await createTaskCodePendingSubmission(context, "reject-metadata");
  const response = await context.app.inject({
    method: "POST",
    url: `/merchant/task-code-submissions/${submission.id}/decision`,
    headers: merchantHeaders,
    payload: { merchantId: application.merchantId, decision: "reject", actorId: "staff-reject-meta", idempotencyKey: "task-code-reject-meta" },
  });
  assert.equal(response.statusCode, 200, response.body);
  const decided = response.json();
  assert.ok(decided.rejectedAt);
  assert.equal(decided.confirmedAt, undefined);
  assert.equal(decided.decidedBy, "staff-reject-meta");
  assert.equal(decided.decisionIdempotencyKey, "task-code-reject-meta");
  const audit = context.store.auditEvents.find((event) => event.action === "task_code_submission.rejected" && event.entityId === submission.id);
  assert.ok(audit);
  assert.equal(audit.metadata.submissionId, submission.id);
  assert.equal(audit.metadata.merchantId, application.merchantId);
  assert.equal(audit.metadata.actorId, "staff-reject-meta");
  assert.equal(audit.metadata.decision, "reject");
  assert.equal(audit.metadata.decisionIdempotencyKey, "task-code-reject-meta");
  await context.close();
});

test("task code expired submission cannot be confirmed or rejected", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, submission } = await createTaskCodePendingSubmission(context, "expired-decision");
  context.store.db.prepare("UPDATE task_code_submissions SET confirmation_expires_at = ? WHERE id = ?").run(new Date(Date.now() - 60 * 1000).toISOString(), submission.id);
  const confirm = await context.app.inject({
    method: "POST",
    url: `/merchant/task-code-submissions/${submission.id}/decision`,
    headers: merchantHeaders,
    payload: { merchantId: application.merchantId, decision: "confirm", actorId: "staff-expired", idempotencyKey: "task-code-expired-confirm" },
  });
  const reject = await context.app.inject({
    method: "POST",
    url: `/merchant/task-code-submissions/${submission.id}/decision`,
    headers: merchantHeaders,
    payload: { merchantId: application.merchantId, decision: "reject", actorId: "staff-expired", idempotencyKey: "task-code-expired-reject" },
  });
  assert.equal(confirm.statusCode, 409, confirm.body);
  assert.equal(reject.statusCode, 409, reject.body);
  assert.equal(context.store.listTaskCodeSubmissions()[0].status, "expired");
  await context.close();
});

test("task code other merchant cannot decide submission", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const first = await createTaskCodePendingSubmission(context, "other-merchant-first");
  const second = await onboardMerchant(context.app, "task-code-decision-other-merchant@example.com");
  const response = await context.app.inject({
    method: "POST",
    url: `/merchant/task-code-submissions/${first.submission.id}/decision`,
    headers: merchantHeaders,
    payload: { merchantId: second.application.merchantId, decision: "confirm", actorId: "staff-other", idempotencyKey: "task-code-other-merchant" },
  });
  assert.equal(response.statusCode, 403, response.body);
  assert.equal(context.store.listTaskCodeSubmissions()[0].status, "pending");
  await context.close();
});

test("task code same decision idempotency key replays original decision", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, submission } = await createTaskCodePendingSubmission(context, "decision-replay");
  const payload = { merchantId: application.merchantId, decision: "confirm", actorId: "staff-replay", idempotencyKey: "task-code-decision-replay" };
  const first = await context.app.inject({ method: "POST", url: `/merchant/task-code-submissions/${submission.id}/decision`, headers: merchantHeaders, payload });
  const replay = await context.app.inject({ method: "POST", url: `/merchant/task-code-submissions/${submission.id}/decision`, headers: merchantHeaders, payload });
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().id, first.json().id);
  assert.equal(context.store.auditEvents.filter((event) => event.action === "task_code_submission.confirmed" && event.entityId === submission.id).length, 1);
  await context.close();
});

test("task code same decision idempotency key with different decision conflicts", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, submission } = await createTaskCodePendingSubmission(context, "decision-key-conflict");
  const first = await context.app.inject({
    method: "POST",
    url: `/merchant/task-code-submissions/${submission.id}/decision`,
    headers: merchantHeaders,
    payload: { merchantId: application.merchantId, decision: "confirm", actorId: "staff-key-conflict", idempotencyKey: "task-code-same-key" },
  });
  const conflictResponse = await context.app.inject({
    method: "POST",
    url: `/merchant/task-code-submissions/${submission.id}/decision`,
    headers: merchantHeaders,
    payload: { merchantId: application.merchantId, decision: "reject", actorId: "staff-key-conflict", idempotencyKey: "task-code-same-key" },
  });
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(conflictResponse.statusCode, 409, conflictResponse.body);
  await context.close();
});

test("task code confirmed submission cannot be rejected later", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, submission } = await createTaskCodePendingSubmission(context, "confirm-then-reject");
  const confirm = await context.app.inject({
    method: "POST",
    url: `/merchant/task-code-submissions/${submission.id}/decision`,
    headers: merchantHeaders,
    payload: { merchantId: application.merchantId, decision: "confirm", actorId: "staff-confirm-first", idempotencyKey: "task-code-confirm-first" },
  });
  const reject = await context.app.inject({
    method: "POST",
    url: `/merchant/task-code-submissions/${submission.id}/decision`,
    headers: merchantHeaders,
    payload: { merchantId: application.merchantId, decision: "reject", actorId: "staff-reject-second", idempotencyKey: "task-code-reject-second" },
  });
  assert.equal(confirm.statusCode, 200, confirm.body);
  assert.equal(reject.statusCode, 409, reject.body);
  assert.equal(context.store.listTaskCodeSubmissions()[0].status, "confirmed");
  await context.close();
});

test("task code rejected submission cannot be confirmed later", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, submission } = await createTaskCodePendingSubmission(context, "reject-then-confirm");
  const reject = await context.app.inject({
    method: "POST",
    url: `/merchant/task-code-submissions/${submission.id}/decision`,
    headers: merchantHeaders,
    payload: { merchantId: application.merchantId, decision: "reject", actorId: "staff-reject-first", idempotencyKey: "task-code-reject-first" },
  });
  const confirm = await context.app.inject({
    method: "POST",
    url: `/merchant/task-code-submissions/${submission.id}/decision`,
    headers: merchantHeaders,
    payload: { merchantId: application.merchantId, decision: "confirm", actorId: "staff-confirm-second", idempotencyKey: "task-code-confirm-second" },
  });
  assert.equal(reject.statusCode, 200, reject.body);
  assert.equal(confirm.statusCode, 409, confirm.body);
  assert.equal(context.store.listTaskCodeSubmissions()[0].status, "rejected");
  await context.close();
});

test("task code competing decisions only allow one success", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, submission } = await createTaskCodePendingSubmission(context, "competing-decision");
  const [confirm, reject] = await Promise.all([
    context.app.inject({
      method: "POST",
      url: `/merchant/task-code-submissions/${submission.id}/decision`,
      headers: merchantHeaders,
      payload: { merchantId: application.merchantId, decision: "confirm", actorId: "staff-a", idempotencyKey: "task-code-compete-confirm" },
    }),
    context.app.inject({
      method: "POST",
      url: `/merchant/task-code-submissions/${submission.id}/decision`,
      headers: merchantHeaders,
      payload: { merchantId: application.merchantId, decision: "reject", actorId: "staff-b", idempotencyKey: "task-code-compete-reject" },
    }),
  ]);
  const statusCodes = [confirm.statusCode, reject.statusCode].sort();
  assert.deepEqual(statusCodes, [200, 409]);
  assert.equal(["confirmed", "rejected"].includes(context.store.listTaskCodeSubmissions()[0].status), true);
  await context.close();
});

test("task code confirm and reject decisions create no redemption rewards or resource transactions", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const confirmed = await createTaskCodePendingSubmission(context, "decision-no-resource-confirm");
  const rejected = await createTaskCodePendingSubmission(context, "decision-no-resource-reject");
  const redemptionCount = context.store.redemptions.length;
  const rewardCount = context.store.listRewardEvents().length;
  const ledgerCount = context.store.listResourceTransactions().length;
  const confirm = await context.app.inject({
    method: "POST",
    url: `/merchant/task-code-submissions/${confirmed.submission.id}/decision`,
    headers: merchantHeaders,
    payload: { merchantId: confirmed.application.merchantId, decision: "confirm", actorId: "staff-no-resource-confirm", idempotencyKey: "task-code-no-resource-confirm" },
  });
  const reject = await context.app.inject({
    method: "POST",
    url: `/merchant/task-code-submissions/${rejected.submission.id}/decision`,
    headers: merchantHeaders,
    payload: { merchantId: rejected.application.merchantId, decision: "reject", actorId: "staff-no-resource-reject", idempotencyKey: "task-code-no-resource-reject" },
  });
  assert.equal(confirm.statusCode, 200, confirm.body);
  assert.equal(reject.statusCode, 200, reject.body);
  assert.equal(context.store.redemptions.length, redemptionCount);
  assert.equal(context.store.listRewardEvents().length, rewardCount);
  assert.equal(context.store.listResourceTransactions().length, ledgerCount);
  await context.close();
});

const finalizedLevelRows = [
  { level: 1, requiredTotalExp: 0, rewardStars: 0, maxEnergy: 0, unlockFlags: ["player_character", "forest_clearing"] },
  { level: 2, requiredTotalExp: 50, rewardStars: 50, maxEnergy: 0, unlockFlags: ["clearing_basic_interactions"] },
  { level: 3, requiredTotalExp: 150, rewardStars: 100, maxEnergy: 120, unlockFlags: ["energy", "knowledge_entry", "clearing_complete"] },
  { level: 4, requiredTotalExp: 330, rewardStars: 0, maxEnergy: 123, unlockFlags: ["treehouse_preparation"] },
  { level: 5, requiredTotalExp: 610, rewardStars: 150, maxEnergy: 126, unlockFlags: ["treehouse_main", "dual_character"] },
  { level: 6, requiredTotalExp: 1010, rewardStars: 0, maxEnergy: 129, unlockFlags: ["time_of_day_life", "weekly_mission_board", "snack_activity", "home_tools"] },
  { level: 7, requiredTotalExp: 1530, rewardStars: 200, maxEnergy: 132, unlockFlags: ["interaction_bubbles", "duo_events", "compost_activity"] },
  { level: 8, requiredTotalExp: 2190, rewardStars: 0, maxEnergy: 135, unlockFlags: ["memory_photos", "weekly_mission_completion_scene"] },
  { level: 9, requiredTotalExp: 3010, rewardStars: 250, maxEnergy: 138, unlockFlags: [] },
  { level: 10, requiredTotalExp: 4010, rewardStars: 500, maxEnergy: 142, unlockFlags: ["chapter_one_complete"] },
] as const;

test("finalized core economy settings levels chests flags and max energy are seeded", async () => {
  const context = await setup();
  assert.deepEqual(context.store.economySettings, {
    vegetarianCarbonGrams: 800,
    carbonGramsPerSeed: 2000,
    seedsPerPlant: 5,
    plantsPerTree: 5,
    redemptionEnergy: 30,
    redemptionExp: 200,
    energyRegenIntervalSeconds: 120,
    energyOverflowMultiplier: 1,
    version: 1,
    updatedAt: context.store.economySettings.updatedAt,
    updatedBy: "system",
  });
  assert.deepEqual(context.store.levelDefinitions.map((level) => ({
    level: level.level,
    requiredTotalExp: level.requiredTotalExp,
    rewardStars: level.rewardStars,
    unlockFlags: level.unlockFlags,
  })), finalizedLevelRows.map(({ level, requiredTotalExp, rewardStars, unlockFlags }) => ({ level, requiredTotalExp, rewardStars, unlockFlags })));
  const maxEnergyByLevel = finalizedLevelRows.map((row, index) => row.maxEnergy - (finalizedLevelRows[index - 1]?.maxEnergy ?? 0));
  assert.deepEqual(context.store.levelDefinitions.map((level) => level.maxEnergyIncrease), maxEnergyByLevel);
  assert.deepEqual(finalizedLevelRows.filter((row) => row.level >= 3).map((row) => row.maxEnergy), [120, 123, 126, 129, 132, 135, 138, 142]);
  await context.close();
});

test("finalized core economy level one and two energy stays locked and does not regenerate", async () => {
  const context = await setup();
  const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  context.store.setUserResourcesForTest("user-demo", { currentLevel: 1, currentExp: 0, currentEnergy: 0, maxEnergy: 0, nextLevelExp: 50, energyLastUpdatedAt: old, unlockFlags: ["player_character", "forest_clearing"] });
  const levelOne = context.store.getUser("user-demo");
  assert.equal(levelOne.resources.maxEnergy, 0);
  assert.equal(levelOne.resources.currentEnergy, 0);
  assert.equal(context.store.listResourceTransactions().filter((tx) => tx.resourceType === "energy").length, 0);
  context.store.setUserResourcesForTest("user-demo", { currentLevel: 2, currentExp: 50, currentEnergy: 0, maxEnergy: 0, nextLevelExp: 150, energyLastUpdatedAt: old, unlockFlags: ["player_character", "forest_clearing", "clearing_basic_interactions"] });
  const levelTwo = context.store.getUser("user-demo");
  assert.equal(levelTwo.resources.maxEnergy, 0);
  assert.equal(levelTwo.resources.currentEnergy, 0);
  assert.equal(context.store.listResourceTransactions().filter((tx) => tx.resourceType === "energy").length, 0);
  await context.close();
});

test("finalized core economy first vegetarian redemption reaches level three keeps fifty exp progress and fills energy", async () => {
  const context = await setup();
  const result = await completeVegetarianRedemption(context, "finalized-first-meal");
  assert.equal(result.rewardSummary.exp, 200);
  assert.equal(result.rewardSummary.energy, 30);
  assert.equal(result.rewardSummary.energyOverflow, 0);
  assert.equal(result.rewardSummary.carbonGrams, 800);
  assert.equal(result.user.resources.currentLevel, 3);
  assert.equal(result.user.resources.currentExp, 200);
  assert.equal(result.user.resources.currentExp - 150, 50);
  assert.equal(result.user.resources.maxEnergy, 120);
  assert.equal(result.user.resources.currentEnergy, 120);
  assert.deepEqual(result.levelSummary.rewards.map((reward: { level: number; stars: number }) => ({ level: reward.level, stars: reward.stars })), [{ level: 2, stars: 50 }, { level: 3, stars: 100 }]);
  const levelStarTransactions = context.store.listResourceTransactions().filter((tx) => tx.sourceType === "level_up" && tx.resourceType === "stars");
  assert.deepEqual(levelStarTransactions.map((tx) => tx.amount), [50, 100]);
  assert.equal(levelStarTransactions.length, 2);
  await context.close();
});

test("finalized core economy energy reward respects hard cap and creates no overflow transaction", async () => {
  const context = await setup();
  context.store.setUserResourcesForTest("user-demo", {
    currentLevel: 3,
    currentExp: 150,
    currentEnergy: 120,
    maxEnergy: 120,
    nextLevelExp: 330,
    unlockFlags: ["player_character", "forest_clearing", "clearing_basic_interactions", "energy", "knowledge_entry", "clearing_complete"],
  });
  const result = context.store.settleActivityReward({ userId: "user-demo", sourceType: "daily_login", sourceId: "finalized-energy-cap", idempotencyKey: "finalized-energy-cap-key", stars: 0, energy: 30, exp: 0 });
  assert.equal(result.user.resources.currentEnergy, 120);
  assert.equal(result.user.resources.energyOverflowPending, 0);
  assert.equal(result.rewardSummary.energyOverflow, 0);
  assert.equal(context.store.listResourceTransactions().filter((tx) => tx.resourceType === "energy_overflow").length, 0);
  await context.close();
});

test("finalized core economy five seeds convert to plant and five plants convert to tree", async () => {
  const context = await setup();
  const prepared = await prepareAcceptedMission(context, "finalized-five-base");
  context.store.setGrowthBalanceForTest("user-demo", { carbonBalanceGrams: 1200, seedCount: 4, plantCount: 4, treeCount: 0 });
  const response = await redeemMission(context, prepared, "finalized-five-base-key");
  assert.equal(response.statusCode, 201, response.body);
  const result = response.json();
  assert.equal(result.growthSummary.carbonBalanceGrams, 0);
  assert.equal(result.growthSummary.seedCount, 0);
  assert.equal(result.growthSummary.plantCount, 0);
  assert.equal(result.growthSummary.treeCount, 1);
  assert.equal(result.growthSummary.generatedSeeds, 1);
  assert.equal(result.growthSummary.generatedPlants, 1);
  assert.equal(result.growthSummary.generatedTrees, 1);
  await context.close();
});

test("finalized core economy growth keeps remainders and crosses multiple thresholds once", async () => {
  const context = await setup();
  const prepared = await prepareAcceptedMission(context, "finalized-remainders");
  context.store.setGrowthBalanceForTest("user-demo", { carbonBalanceGrams: 3900, seedCount: 3, plantCount: 4, treeCount: 0 });
  const response = await redeemMission(context, prepared, "finalized-remainders-key");
  assert.equal(response.statusCode, 201, response.body);
  const result = response.json();
  assert.equal(result.growthSummary.carbonBalanceGrams, 700);
  assert.equal(result.growthSummary.seedCount, 0);
  assert.equal(result.growthSummary.plantCount, 0);
  assert.equal(result.growthSummary.treeCount, 1);
  assert.equal(result.growthSummary.generatedSeeds, 2);
  assert.equal(result.growthSummary.generatedPlants, 1);
  assert.equal(result.growthSummary.generatedTrees, 1);
  await context.close();
});

test("finalized core economy migration clamps legacy energy and does not create ledger or chest rows", () => {
  const dir = mkdtempSync(join(tmpdir(), "looper-finalized-core-migrate-"));
  const dbPath = join(dir, "legacy-finalized.sqlite");
  const db = new DatabaseSync(dbPath);
  configureDatabase(db);
  db.exec(`
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);
INSERT INTO schema_migrations (version, name, applied_at) VALUES
  (1, 'initial_core_economy_schema', datetime('now')),
  (2, 'core_economy_integrity_constraints', datetime('now')),
  (3, 'resource_ledger_growth_integrity', datetime('now')),
  (4, 'level_runtime_integrity', datetime('now')),
  (5, 'admin_economy_settings_management', datetime('now')),
  (6, 'mvp_task_code_thin_slice', datetime('now')),
  (7, 'task_code_submission_decisions', datetime('now'));
CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, created_at TEXT NOT NULL);
INSERT INTO users (id, display_name, created_at) VALUES ('legacy-lv2', 'Legacy Lv2', datetime('now')), ('legacy-lv3', 'Legacy Lv3', datetime('now'));
CREATE TABLE economy_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT 'system');
INSERT INTO economy_settings VALUES ('core', '{"vegetarianCarbonGrams":800,"carbonGramsPerSeed":2000,"seedsPerPlant":10,"plantsPerTree":10,"redemptionEnergy":30,"redemptionExp":100,"energyRegenIntervalSeconds":120,"energyOverflowMultiplier":1.5}', 3, datetime('now'), 'legacy');
CREATE TABLE level_definitions (level INTEGER PRIMARY KEY, required_total_exp INTEGER NOT NULL, reward_stars INTEGER NOT NULL, max_energy_increase INTEGER NOT NULL, unlock_flags_json TEXT NOT NULL);
INSERT INTO level_definitions VALUES (1, 0, 0, 0, '[]'), (2, 500, 50, 10, '["resource_details"]'), (3, 1200, 80, 10, '["growth_history"]');
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
  updated_at TEXT NOT NULL,
  CHECK (max_energy > 0),
  CHECK (current_energy <= CAST(max_energy * 1.5 AS INTEGER))
);
INSERT INTO user_resources VALUES ('legacy-lv2', 999, 80, 100, 120, datetime('now'), 20, 80, 2, 1200, '["resource_details"]', datetime('now'));
INSERT INTO user_resources VALUES ('legacy-lv3', 999, 145, 100, 120, datetime('now'), 20, 180, 3, 2200, '["growth_history"]', datetime('now'));
`);
  migrateDatabase(db);
  const settings = JSON.parse((db.prepare("SELECT value_json FROM economy_settings WHERE key = 'core'").get() as { value_json: string }).value_json) as Record<string, number>;
  assert.deepEqual(settings, { vegetarianCarbonGrams: 800, carbonGramsPerSeed: 2000, seedsPerPlant: 5, plantsPerTree: 5, redemptionEnergy: 30, redemptionExp: 200, energyRegenIntervalSeconds: 120, energyOverflowMultiplier: 1 });
  const resources = db.prepare("SELECT user_id, current_energy, max_energy, energy_overflow_pending, next_level_exp, unlock_flags_json FROM user_resources ORDER BY user_id").all() as Array<{ user_id: string; current_energy: number; max_energy: number; energy_overflow_pending: number; next_level_exp: number; unlock_flags_json: string }>;
  assert.equal(resources[0].max_energy, 0);
  assert.equal(resources[0].current_energy, 0);
  assert.equal(resources[0].energy_overflow_pending, 0);
  assert.equal(resources[0].next_level_exp, 150);
  assert.deepEqual(JSON.parse(resources[0].unlock_flags_json), ["player_character", "forest_clearing", "clearing_basic_interactions"]);
  assert.equal(resources[1].max_energy, 120);
  assert.equal(resources[1].current_energy, 120);
  assert.equal(resources[1].energy_overflow_pending, 0);
  assert.equal(resources[1].next_level_exp, 330);
  assert.deepEqual(JSON.parse(resources[1].unlock_flags_json), ["player_character", "forest_clearing", "clearing_basic_interactions", "energy", "knowledge_entry", "clearing_complete"]);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM resource_transactions").get() as { count: number }).count, 0);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM level_up_logs").get() as { count: number }).count, 0);
  const versions = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: number }>;
  assert.deepEqual(versions.map((row) => row.version), [1, 2, 3, 4, 5, 6, 7, 8]);
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const finalizedStarDates = {
  nonDesignated: "2026-07-15T04:00:00.000Z",
  monday: "2026-07-13T04:00:00.000Z",
  lunarFirst: "2026-02-17T04:00:00.000Z",
  lunarFifteenth: "2026-03-03T04:00:00.000Z",
  mondayLunarOverlap: "2026-01-19T04:00:00.000Z",
  taipeiMondayFromUtcSunday: "2026-07-12T16:30:00.000Z",
} as const;

async function redeemWithRewardCategory(context: TestContext, suffix: string, rewardCategory: "general" | "star", occurredAt: string, plan?: "sprout" | "grove" | "forest") {
  const prepared = await prepareAcceptedMission(context, `star-${suffix}`);
  if (plan) {
    const planResponse = await context.app.inject({ method: "POST", url: `/merchants/${prepared.application.merchantId}/plan`, headers: adminHeaders, payload: { merchantPlan: plan } });
    assert.equal(planResponse.statusCode, 200, planResponse.body);
  }
  setMerchantRewardCategory(context, prepared.application.merchantId, rewardCategory);
  const response = await redeemMission(context, prepared, `star-${suffix}-key`, occurredAt);
  assert.equal(response.statusCode, 201, response.body);
  return { prepared, result: response.json() };
}

test("finalized star settlement general non-designated grants zero stars but keeps core resources", async () => {
  const context = await setup();
  const { result } = await redeemWithRewardCategory(context, "general-non-designated", "general", finalizedStarDates.nonDesignated);
  assert.equal(result.rewardSummary.stars, 0);
  assert.equal(result.rewardSummary.exp, 200);
  assert.equal(result.rewardSummary.energy, 30);
  assert.equal(result.rewardSummary.carbonGrams, 800);
  assert.equal(context.store.redemptions[0]?.starsGranted, 0);
  await context.close();
});

test("finalized star settlement general Monday grants one hundred stars", async () => {
  const context = await setup();
  const { result } = await redeemWithRewardCategory(context, "general-monday", "general", finalizedStarDates.monday);
  assert.equal(result.rewardSummary.stars, 100);
  assert.equal(result.ruleSnapshot.isMonday, true);
  assert.equal(result.ruleSnapshot.isDesignatedDate, true);
  await context.close();
});

test("finalized star settlement general lunar first grants one hundred stars", async () => {
  const context = await setup();
  const { result } = await redeemWithRewardCategory(context, "general-lunar-first", "general", finalizedStarDates.lunarFirst);
  assert.equal(result.rewardSummary.stars, 100);
  assert.equal(result.ruleSnapshot.lunarDay, 1);
  assert.equal(result.ruleSnapshot.isDesignatedDate, true);
  await context.close();
});

test("finalized star settlement general lunar fifteenth grants one hundred stars", async () => {
  const context = await setup();
  const { result } = await redeemWithRewardCategory(context, "general-lunar-fifteenth", "general", finalizedStarDates.lunarFifteenth);
  assert.equal(result.rewardSummary.stars, 100);
  assert.equal(result.ruleSnapshot.lunarDay, 15);
  assert.equal(result.ruleSnapshot.isDesignatedDate, true);
  await context.close();
});

test("finalized star settlement star non-designated grants two hundred stars", async () => {
  const context = await setup();
  const { result } = await redeemWithRewardCategory(context, "star-non-designated", "star", finalizedStarDates.nonDesignated);
  assert.equal(result.rewardSummary.stars, 200);
  assert.equal(result.ruleSnapshot.isDesignatedDate, false);
  await context.close();
});

test("finalized star settlement star designated grants three hundred fifty stars", async () => {
  const context = await setup();
  const { result } = await redeemWithRewardCategory(context, "star-designated", "star", finalizedStarDates.lunarFirst);
  assert.equal(result.rewardSummary.stars, 350);
  assert.equal(result.ruleSnapshot.isDesignatedDate, true);
  await context.close();
});

test("finalized star settlement Monday lunar overlap does not stack", async () => {
  const context = await setup();
  const { result } = await redeemWithRewardCategory(context, "overlap-no-stack", "star", finalizedStarDates.mondayLunarOverlap);
  assert.equal(result.rewardSummary.stars, 350);
  assert.equal(result.ruleSnapshot.isMonday, true);
  assert.equal(result.ruleSnapshot.lunarDay, 1);
  assert.equal(result.ruleSnapshot.isDesignatedDate, true);
  await context.close();
});

test("finalized star settlement uses merchant timezone for UTC cross-day", async () => {
  const context = await setup();
  const { result } = await redeemWithRewardCategory(context, "timezone-cross-day", "general", finalizedStarDates.taipeiMondayFromUtcSunday);
  assert.equal(result.rewardSummary.stars, 100);
  assert.equal(result.ruleSnapshot.merchantLocalDate, "2026-07-13");
  assert.equal(result.ruleSnapshot.isMonday, true);
  await context.close();
});

test("finalized star settlement snapshot saves actual rules and crossed levels", async () => {
  const context = await setup();
  const { result } = await redeemWithRewardCategory(context, "snapshot-cross-level", "general", finalizedStarDates.monday);
  const event = context.store.listRewardEvents()[0];
  assert.equal(event.ruleVersion, "mvp-v1.0-2026-07-13");
  assert.deepEqual(event.ruleSnapshot, result.ruleSnapshot);
  assert.deepEqual(result.ruleSnapshot, {
    ruleVersion: "mvp-v1.0-2026-07-13",
    occurredAt: finalizedStarDates.monday,
    merchantTimezone: "Asia/Taipei",
    merchantLocalDate: "2026-07-13",
    merchantRewardCategory: "general",
    isMonday: true,
    lunarDay: 29,
    isDesignatedDate: true,
    stars: 100,
    exp: 200,
    energy: 30,
    carbonGrams: 800,
    gramsPerSeed: 2000,
    seedsPerPlant: 5,
    plantsPerTree: 5,
    levelBefore: 1,
    levelAfter: 3,
    levelsCrossed: [2, 3],
    levelRewards: [
      { level: 2, requiredTotalExp: 50, rewardStars: 50, maxEnergy: 0, unlockFlags: ["clearing_basic_interactions"] },
      { level: 3, requiredTotalExp: 150, rewardStars: 100, maxEnergy: 120, unlockFlags: ["energy", "knowledge_entry", "clearing_complete"] },
    ],
  });
  await context.close();
});

test("finalized star settlement idempotency replay keeps original snapshot", async () => {
  const context = await setup();
  const prepared = await prepareAcceptedMission(context, "star-idempotency");
  setMerchantRewardCategory(context, prepared.application.merchantId, "general");
  const first = await redeemMission(context, prepared, "star-idempotency-key", finalizedStarDates.nonDesignated);
  assert.equal(first.statusCode, 201, first.body);
  const second = await redeemMission(context, prepared, "star-idempotency-key", finalizedStarDates.monday);
  assert.equal(second.statusCode, 200, second.body);
  const firstResult = first.json();
  const secondResult = second.json();
  assert.equal(firstResult.rewardSummary.stars, 0);
  assert.equal(secondResult.rewardSummary.stars, 0);
  assert.deepEqual(secondResult.ruleSnapshot, firstResult.ruleSnapshot);
  assert.equal(context.store.redemptions.length, 1);
  assert.equal(context.store.listRewardEvents().length, 1);
  await context.close();
});

test("finalized star settlement sprout grove forest plans do not decide reward category", async () => {
  const context = await setup();
  const { result } = await redeemWithRewardCategory(context, "plan-not-category", "general", finalizedStarDates.nonDesignated, "forest");
  assert.equal(result.rewardSummary.stars, 0);
  const merchant = context.store.getMerchant(result.redemption.merchantId);
  assert.equal(merchant.merchantPlan, "forest");
  assert.equal(merchant.rewardCategory, "general");
  await context.close();
});

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

test("growth ledger records balanced grants and linked conversion pairs", async () => {
  const context = await setup();
  context.store.setGrowthBalanceForTest("user-demo", { carbonBalanceGrams: 1600, carbonTotalGrams: 1600, seedCount: 9, plantCount: 9, treeCount: 0 });
  const result = await completeVegetarianRedemption(context, "ledger-pairs");
  const growthTransactions = growthTransactionsForSource(context, result.redemption.id);
  assertLedgerEquations(growthTransactions);
  assert.deepEqual(growthTransactions.map((tx) => [tx.resourceType, tx.transactionKind, tx.conversionType, tx.amount]), [
    ["carbon_total", "grant", "none", 800],
    ["carbon_balance", "grant", "none", 800],
    ["carbon_balance", "convert_debit", "carbon_to_seed", -2000],
    ["seed", "convert_credit", "carbon_to_seed", 1],
    ["seed", "convert_debit", "seed_to_plant", -10],
    ["plant", "convert_credit", "seed_to_plant", 1],
    ["plant", "convert_debit", "plant_to_tree", -10],
    ["tree", "convert_credit", "plant_to_tree", 1],
  ]);
  assertConversionPair(growthTransactions, "carbon_to_seed", "carbon_balance", -2000, "seed", 1);
  assertConversionPair(growthTransactions, "seed_to_plant", "seed", -10, "plant", 1);
  assertConversionPair(growthTransactions, "plant_to_tree", "plant", -10, "tree", 1);
  const logs = context.store.listPlantGrowthLogs().filter((log) => log.sourceId === result.redemption.id);
  assert.deepEqual(logs.map((log) => [log.eventType, log.quantity, log.beforeCount, log.afterCount]), [
    ["seed_generated", 1, 9, 10],
    ["seeds_combined_to_plant", 1, 9, 10],
    ["plants_combined_to_tree", 1, 0, 1],
  ]);
  for (const log of logs) {
    assert.notEqual(log.conversionId, "");
    assert.ok(growthTransactions.some((tx) => tx.conversionId === log.conversionId));
  }
  await context.close();
});

test("growth balances can be rebuilt from new ledger rows and mismatches are detected", async () => {
  const context = await setup();
  await completeVegetarianRedemption(context, "rebuild-a");
  await completeVegetarianRedemption(context, "rebuild-b");
  await completeVegetarianRedemption(context, "rebuild-c");
  assertLedgerEquations(context.store.listResourceTransactions().filter((tx) => tx.transactionKind !== "legacy"));
  const reconciliation = context.store.reconcileGrowthBalance("user-demo");
  assert.equal(reconciliation.matches, true);
  assert.deepEqual(reconciliation.rebuilt, {
    carbonTotalGrams: 2400,
    carbonBalanceGrams: 400,
    seedCount: 1,
    plantCount: 0,
    treeCount: 0,
  });
  context.store.setGrowthBalanceForTest("user-demo", { carbonBalanceGrams: 401 });
  const mismatch = context.store.reconcileGrowthBalance("user-demo");
  assert.equal(mismatch.matches, false);
  assert.equal(mismatch.stored.carbonBalanceGrams, 401);
  assert.equal(mismatch.rebuilt.carbonBalanceGrams, 400);
  await context.close();
});

test("idempotent redemption replay does not create extra conversion ledger rows", async () => {
  const context = await setup();
  await completeVegetarianRedemption(context, "conversion-replay-a");
  await completeVegetarianRedemption(context, "conversion-replay-b");
  const prepared = await prepareAcceptedMission(context, "conversion-replay");
  const requestKey = "conversion-replay-key";
  const first = await redeemMission(context, prepared, requestKey);
  const firstBody = first.json();
  const conversionCount = context.store.listResourceTransactions().filter((tx) => tx.sourceId === firstBody.redemption.id && tx.transactionKind.startsWith("convert")).length;
  const second = await redeemMission(context, prepared, requestKey);
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(second.statusCode, 200, second.body);
  assert.equal(second.json().replayed, true);
  assert.equal(context.store.listResourceTransactions().filter((tx) => tx.sourceId === firstBody.redemption.id && tx.transactionKind.startsWith("convert")).length, conversionCount);
  assert.equal(context.store.listRewardEvents().length, 3);
  assert.equal(context.store.reconcileGrowthBalance("user-demo").matches, true);
  await context.close();
});

test("large growth conversions settle according to the configured ratios", async () => {
  const cases: Array<{
    name: string;
    initial: Parameters<TestContext["store"]["setGrowthBalanceForTest"]>[1];
    expected: { carbonTotalGrams: number; carbonBalanceGrams: number; generatedSeeds: number; generatedPlants: number; generatedTrees: number; seedCount: number; plantCount: number; treeCount: number };
    conversions: Array<[ResourceTx["conversionType"], ResourceTx["resourceType"], number, ResourceTx["resourceType"], number]>;
  }> = [
    { name: "no-conversion", initial: {}, expected: { carbonTotalGrams: 800, carbonBalanceGrams: 800, generatedSeeds: 0, generatedPlants: 0, generatedTrees: 0, seedCount: 0, plantCount: 0, treeCount: 0 }, conversions: [] },
    { name: "one-seed", initial: { carbonTotalGrams: 1600, carbonBalanceGrams: 1600 }, expected: { carbonTotalGrams: 2400, carbonBalanceGrams: 400, generatedSeeds: 1, generatedPlants: 0, generatedTrees: 0, seedCount: 1, plantCount: 0, treeCount: 0 }, conversions: [["carbon_to_seed", "carbon_balance", -2000, "seed", 1]] },
    { name: "ten-seeds", initial: { carbonTotalGrams: 19600, carbonBalanceGrams: 19600 }, expected: { carbonTotalGrams: 20400, carbonBalanceGrams: 400, generatedSeeds: 10, generatedPlants: 1, generatedTrees: 0, seedCount: 0, plantCount: 1, treeCount: 0 }, conversions: [["carbon_to_seed", "carbon_balance", -20000, "seed", 10], ["seed_to_plant", "seed", -10, "plant", 1]] },
    { name: "seed-to-plant", initial: { carbonTotalGrams: 1600, carbonBalanceGrams: 1600, seedCount: 9 }, expected: { carbonTotalGrams: 2400, carbonBalanceGrams: 400, generatedSeeds: 1, generatedPlants: 1, generatedTrees: 0, seedCount: 0, plantCount: 1, treeCount: 0 }, conversions: [["carbon_to_seed", "carbon_balance", -2000, "seed", 1], ["seed_to_plant", "seed", -10, "plant", 1]] },
    { name: "plant-to-tree", initial: { carbonTotalGrams: 1600, carbonBalanceGrams: 1600, seedCount: 9, plantCount: 9 }, expected: { carbonTotalGrams: 2400, carbonBalanceGrams: 400, generatedSeeds: 1, generatedPlants: 1, generatedTrees: 1, seedCount: 0, plantCount: 0, treeCount: 1 }, conversions: [["carbon_to_seed", "carbon_balance", -2000, "seed", 1], ["seed_to_plant", "seed", -10, "plant", 1], ["plant_to_tree", "plant", -10, "tree", 1]] },
    { name: "bulk-chain", initial: { carbonTotalGrams: 59600, carbonBalanceGrams: 59600, seedCount: 29, plantCount: 29 }, expected: { carbonTotalGrams: 60400, carbonBalanceGrams: 400, generatedSeeds: 30, generatedPlants: 5, generatedTrees: 3, seedCount: 9, plantCount: 4, treeCount: 3 }, conversions: [["carbon_to_seed", "carbon_balance", -60000, "seed", 30], ["seed_to_plant", "seed", -50, "plant", 5], ["plant_to_tree", "plant", -30, "tree", 3]] },
  ];

  for (const item of cases) {
    const context = await setup();
    context.store.setGrowthBalanceForTest("user-demo", item.initial);
    const result = await completeVegetarianRedemption(context, item.name);
    assert.deepEqual(result.growthSummary, item.expected, item.name);
    const growthTransactions = growthTransactionsForSource(context, result.redemption.id);
    assertLedgerEquations(growthTransactions);
    for (const [conversionType, debitResource, debitAmount, creditResource, creditAmount] of item.conversions) {
      assertConversionPair(growthTransactions, conversionType, debitResource, debitAmount, creditResource, creditAmount);
    }
    await context.close();
  }
});

test("growth settlement rolls back atomically at every injected failure point", async () => {
  const cases: Array<{ point: GrowthFailurePoint; initial: Parameters<TestContext["store"]["setGrowthBalanceForTest"]>[1] }> = [
    { point: "after_carbon_grant", initial: {} },
    { point: "after_carbon_debit", initial: { carbonTotalGrams: 1600, carbonBalanceGrams: 1600 } },
    { point: "after_seed_credit", initial: { carbonTotalGrams: 1600, carbonBalanceGrams: 1600 } },
    { point: "after_seed_debit", initial: { carbonTotalGrams: 1600, carbonBalanceGrams: 1600, seedCount: 9 } },
    { point: "after_plant_credit", initial: { carbonTotalGrams: 1600, carbonBalanceGrams: 1600, seedCount: 9 } },
    { point: "after_plant_debit", initial: { carbonTotalGrams: 1600, carbonBalanceGrams: 1600, seedCount: 9, plantCount: 9 } },
    { point: "after_tree_credit", initial: { carbonTotalGrams: 1600, carbonBalanceGrams: 1600, seedCount: 9, plantCount: 9 } },
    { point: "before_growth_balance_update", initial: {} },
    { point: "after_growth_balance_update", initial: {} },
  ];

  for (const item of cases) {
    const context = await setup();
    context.store.setGrowthBalanceForTest("user-demo", item.initial);
    const before = (await context.app.inject({ method: "GET", url: "/users/user-demo/state" })).json();
    const prepared = await prepareAcceptedMission(context, item.point);
    context.store.failNextGrowthSettlementAt = item.point;
    const failed = await redeemMission(context, prepared, `failure-${item.point}`);
    assert.equal(failed.statusCode, 500, item.point);
    assert.equal(context.store.redemptions.length, 0, item.point);
    assert.equal(context.store.listRewardEvents().length, 0, item.point);
    assert.equal(context.store.listResourceTransactions().length, 0, item.point);
    const afterFailure = (await context.app.inject({ method: "GET", url: "/users/user-demo/state" })).json();
    assert.deepEqual(afterFailure.resources, before.resources, item.point);
    assert.deepEqual(afterFailure.growth, before.growth, item.point);
    assert.equal(afterFailure.enrollments[0].status, "awaiting_verification", item.point);
    const retry = await redeemMission(context, prepared, `failure-${item.point}`);
    assert.equal(retry.statusCode, 201, item.point);
    assert.ok(context.store.listResourceTransactions().length > 0, item.point);
    await context.close();
  }
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

test("runtime economy settings come from the database for settlement growth and regeneration", async () => {
  const context = await setup();
  updateEconomySettings(context, {
    vegetarianCarbonGrams: 500,
    carbonGramsPerSeed: 1000,
    seedsPerPlant: 2,
    plantsPerTree: 2,
    redemptionEnergy: 7,
    redemptionExp: 42,
    energyRegenIntervalSeconds: 60,
    energyOverflowMultiplier: 1.2,
  });
  context.store.setGrowthBalanceForTest("user-demo", { carbonTotalGrams: 500, carbonBalanceGrams: 500, seedCount: 1, plantCount: 1 });
  const result = await completeVegetarianRedemption(context, "db-economy");
  assert.equal(result.rewardSummary.energy, 7);
  assert.equal(result.rewardSummary.exp, 42);
  assert.equal(result.rewardSummary.carbonGrams, 500);
  assert.equal(result.growthSummary.generatedSeeds, 1);
  assert.equal(result.growthSummary.generatedPlants, 1);
  assert.equal(result.growthSummary.generatedTrees, 1);
  assert.equal(result.growthSummary.carbonBalanceGrams, 0);
  assert.equal(result.user.resources.currentEnergy, 7);
  assert.equal(result.user.resources.currentExp, 42);

  const old = new Date(Date.now() - 120 * 1000).toISOString();
  context.store.setUserResourcesForTest("user-demo", { currentEnergy: 10, maxEnergy: 100, energyLastUpdatedAt: old });
  const user = (await context.app.inject({ method: "GET", url: "/users/user-demo/state" })).json();
  assert.equal(user.resources.currentEnergy, 12);
  assert.equal(user.resources.energyRegenIntervalSeconds, 60);
  await context.close();
});

test("database level definitions drive thresholds multi-level rewards and refill", async () => {
  const context = await setup();
  replaceLevelDefinitions(context, [
    { level: 1, requiredTotalExp: 0, rewardStars: 0, maxEnergyIncrease: 0, unlockFlags: [] },
    { level: 2, requiredTotalExp: 50, rewardStars: 5, maxEnergyIncrease: 3, unlockFlags: ["db-lv2"] },
    { level: 3, requiredTotalExp: 90, rewardStars: 7, maxEnergyIncrease: 4, unlockFlags: ["db-lv3"] },
  ]);
  const response = await context.app.inject({ method: "POST", url: "/admin/reward-events", headers: adminHeaders, payload: { userId: "user-demo", sourceType: "event_checkin", sourceId: "db-levels", idempotencyKey: "db-levels-key", stars: 0, energy: 0, exp: 95 } });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.equal(body.levelSummary.currentLevel, 3);
  assert.equal(body.levelSummary.levelsGained, 2);
  assert.equal(body.user.resources.currentExp, 95);
  assert.equal(body.user.resources.starBalance, 12);
  assert.equal(body.user.resources.maxEnergy, 107);
  assert.equal(body.user.resources.currentEnergy, 107);
  assert.equal(body.user.resources.nextLevelExp, null);
  assert.equal(body.user.resources.isMaxLevel, true);
  assert.deepEqual(body.levelSummary.rewards.map((reward: { level: number; stars: number; maxEnergyIncrease: number }) => [reward.level, reward.stars, reward.maxEnergyIncrease]), [[2, 5, 3], [3, 7, 4]]);
  const levelStarTransactions = context.store.listResourceTransactions().filter((tx) => tx.sourceType === "level_up" && tx.resourceType === "stars");
  assert.deepEqual(levelStarTransactions.map((tx) => tx.amount), [5, 7]);
  assertLedgerEquations(levelStarTransactions);
  assert.equal(countRows(context, "level_up_logs"), 2);
  const refill = context.store.db.prepare("SELECT event_type, amount, energy_before, energy_after FROM energy_logs WHERE event_type = 'level_up_refill'").get() as { event_type: string; amount: number; energy_before: number; energy_after: number };
  assert.equal(refill.event_type, "level_up_refill");
  assert.equal(refill.amount, 107);
  assert.equal(refill.energy_before, 0);
  assert.equal(refill.energy_after, 107);
  await context.close();
});

test("exact threshold and overflow EXP keep cumulative EXP semantics", async () => {
  const context = await setup();
  context.store.setUserResourcesForTest("user-demo", { currentExp: 400 });
  const exact = await context.app.inject({ method: "POST", url: "/admin/reward-events", headers: adminHeaders, payload: { userId: "user-demo", sourceType: "event_checkin", sourceId: "exact-level", idempotencyKey: "exact-level-key", stars: 0, energy: 0, exp: 100 } });
  assert.equal(exact.statusCode, 200, exact.body);
  assert.equal(exact.json().user.resources.currentExp, 500);
  assert.equal(exact.json().user.resources.currentLevel, 2);
  const overflow = await context.app.inject({ method: "POST", url: "/admin/reward-events", headers: adminHeaders, payload: { userId: "user-demo", sourceType: "event_checkin", sourceId: "overflow-level", idempotencyKey: "overflow-level-key", stars: 0, energy: 0, exp: 701 } });
  assert.equal(overflow.statusCode, 200, overflow.body);
  assert.equal(overflow.json().user.resources.currentExp, 1201);
  assert.equal(overflow.json().user.resources.currentLevel, 3);
  await context.close();
});

test("max level returns null nextLevelExp and still accumulates EXP", async () => {
  const context = await setup();
  const first = await context.app.inject({ method: "POST", url: "/admin/reward-events", headers: adminHeaders, payload: { userId: "user-demo", sourceType: "event_checkin", sourceId: "max-level", idempotencyKey: "max-level-key", stars: 0, energy: 0, exp: 2300 } });
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().user.resources.currentLevel, 4);
  assert.equal(first.json().user.resources.currentExp, 2300);
  assert.equal(first.json().user.resources.nextLevelExp, null);
  assert.equal(first.json().user.resources.isMaxLevel, true);
  const levelLogsAfterFirst = countRows(context, "level_up_logs");
  const second = await context.app.inject({ method: "POST", url: "/admin/reward-events", headers: adminHeaders, payload: { userId: "user-demo", sourceType: "event_checkin", sourceId: "max-level-more-exp", idempotencyKey: "max-level-more-exp-key", stars: 0, energy: 0, exp: 100 } });
  assert.equal(second.statusCode, 200, second.body);
  assert.equal(second.json().user.resources.currentLevel, 4);
  assert.equal(second.json().user.resources.currentExp, 2400);
  assert.equal(second.json().user.resources.nextLevelExp, null);
  assert.equal(second.json().user.resources.isMaxLevel, true);
  assert.equal(countRows(context, "level_up_logs"), levelLogsAfterFirst);
  await context.close();
});

test("level reward replay does not duplicate level ledgers or logs", async () => {
  const context = await setup();
  const request = { method: "POST" as const, url: "/admin/reward-events", headers: adminHeaders, payload: { userId: "user-demo", sourceType: "event_checkin", sourceId: "level-replay", idempotencyKey: "level-replay-key", stars: 0, energy: 0, exp: 2300 } };
  const first = await context.app.inject(request);
  const second = await context.app.inject(request);
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(second.statusCode, 200, second.body);
  assert.equal(second.json().replayed, true);
  assert.equal(countRows(context, "level_up_logs"), 3);
  assert.deepEqual(context.store.listResourceTransactions().filter((tx) => tx.sourceType === "level_up" && tx.resourceType === "stars").map((tx) => tx.amount), [50, 80, 120]);
  await context.close();
});

test("level settlement rollback clears level logs star ledgers and user resource updates", async () => {
  const cases: LevelFailurePoint[] = ["after_first_level_log", "after_level_reward_star_ledger", "after_user_resources_update"];
  for (const point of cases) {
    const context = await setup();
    const before = (await context.app.inject({ method: "GET", url: "/users/user-demo/state" })).json();
    context.store.failNextLevelSettlementAt = point;
    const failed = await context.app.inject({ method: "POST", url: "/admin/reward-events", headers: adminHeaders, payload: { userId: "user-demo", sourceType: "event_checkin", sourceId: `rollback-${point}`, idempotencyKey: `rollback-${point}-key`, stars: 0, energy: 0, exp: 2300 } });
    assert.equal(failed.statusCode, 500, point);
    assert.equal(context.store.listRewardEvents().length, 0, point);
    assert.equal(context.store.listResourceTransactions().length, 0, point);
    assert.equal(countRows(context, "level_up_logs"), 0, point);
    const afterFailure = (await context.app.inject({ method: "GET", url: "/users/user-demo/state" })).json();
    assert.deepEqual(afterFailure.resources, before.resources, point);
    const retry = await context.app.inject({ method: "POST", url: "/admin/reward-events", headers: adminHeaders, payload: { userId: "user-demo", sourceType: "event_checkin", sourceId: `rollback-${point}`, idempotencyKey: `rollback-${point}-key`, stars: 0, energy: 0, exp: 2300 } });
    assert.equal(retry.statusCode, 200, point);
    assert.equal(retry.json().user.resources.currentLevel, 4, point);
    await context.close();
  }
});

test("invalid runtime economy settings and level definitions are rejected", async () => {
  const economyContext = await setup();
  economyContext.store.db.prepare("UPDATE economy_settings SET value_json = ? WHERE key = 'core'").run(JSON.stringify({ ...economyContext.store.economySettings, carbonGramsPerSeed: undefined }));
  assert.throws(() => economyContext.store.economySettings, /carbonGramsPerSeed/);
  await economyContext.close();

  const levelContext = await setup();
  levelContext.store.db.prepare("UPDATE level_definitions SET required_total_exp = 400 WHERE level = 3").run();
  assert.throws(() => levelContext.store.levelDefinitions, /thresholds/);
  await levelContext.close();

  const missingContext = await setup();
  missingContext.store.db.prepare("DELETE FROM level_definitions WHERE level = 1").run();
  assert.throws(() => missingContext.store.levelDefinitions, /LV1|continuous/);
  await missingContext.close();
});

test("admin economy settings update validates role version audit and no-op", async () => {
  const context = await setup();
  const denied = await context.app.inject({ method: "PUT", url: "/admin/economy-settings", payload: economyPayload(context, { redemptionExp: 120 }) });
  assert.equal(denied.statusCode, 403);

  const current = context.store.economySettings;
  const updated = await context.app.inject({ method: "PUT", url: "/admin/economy-settings", headers: adminHeaders, payload: economyPayload(context, { redemptionExp: 120, vegetarianCarbonGrams: 900 }) });
  assert.equal(updated.statusCode, 200, updated.body);
  const body = updated.json();
  assert.equal(body.changed, true);
  assert.equal(body.settings.version, current.version + 1);
  assert.equal(body.settings.updatedBy, "admin-test");
  assert.equal(body.settings.redemptionExp, 120);
  assert.equal(body.settings.vegetarianCarbonGrams, 900);
  const audit = context.store.auditEvents.find((event) => event.action === "economy.settings_updated");
  assert.ok(audit);
  assert.equal(audit.actorId, "admin-test");
  assert.equal(audit.metadata.previousVersion, current.version);
  assert.equal(audit.metadata.newVersion, current.version + 1);
  assert.deepEqual((audit.metadata.changedFields as unknown as Record<string, { before: number; after: number }>).redemptionExp, { before: 100, after: 120 });

  const auditCount = context.store.auditEvents.length;
  const noChange = await context.app.inject({ method: "PUT", url: "/admin/economy-settings", headers: adminHeaders, payload: economyPayload(context) });
  assert.equal(noChange.statusCode, 200, noChange.body);
  assert.equal(noChange.json().changed, false);
  assert.equal(noChange.json().settings.version, current.version + 1);
  assert.equal(context.store.auditEvents.length, auditCount);
  await context.close();
});

test("admin economy settings rejects invalid values and stale expectedVersion", async () => {
  const context = await setup();
  const invalid = await context.app.inject({ method: "PUT", url: "/admin/economy-settings", headers: adminHeaders, payload: economyPayload(context, { energyOverflowMultiplier: 0.5 }) });
  assert.equal(invalid.statusCode, 400, invalid.body);
  const stalePayload = { ...economyPayload(context, { redemptionEnergy: 40 }), expectedVersion: context.store.economySettings.version + 99 };
  const stale = await context.app.inject({ method: "PUT", url: "/admin/economy-settings", headers: adminHeaders, payload: stalePayload });
  assert.equal(stale.statusCode, 409, stale.body);
  await context.close();
});

test("updated economy settings persist after restart and new settlements use new values", async () => {
  const context = await setup();
  const before = await completeVegetarianRedemption(context, "settings-before");
  assert.equal(before.rewardSummary.exp, 100);
  assert.equal(before.rewardSummary.carbonGrams, 800);
  const firstRewardEvent = context.store.listRewardEvents()[0];

  const update = await context.app.inject({ method: "PUT", url: "/admin/economy-settings", headers: adminHeaders, payload: economyPayload(context, { redemptionExp: 135, vegetarianCarbonGrams: 950, energyRegenIntervalSeconds: 30 }) });
  assert.equal(update.statusCode, 200, update.body);
  const after = await completeVegetarianRedemption(context, "settings-after");
  assert.equal(after.rewardSummary.exp, 135);
  assert.equal(after.rewardSummary.carbonGrams, 950);
  assert.equal(before.redemption.expGranted, 100);
  assert.equal(before.redemption.carbonGrams, 800);
  assert.equal(firstRewardEvent.rewardPayload.exp, 100);
  assert.equal(firstRewardEvent.rewardPayload.carbonGrams, 800);

  const old = new Date(Date.now() - 60 * 1000).toISOString();
  context.store.setUserResourcesForTest("user-demo", { currentEnergy: 10, maxEnergy: 100, energyLastUpdatedAt: old });
  const regenerated = (await context.app.inject({ method: "GET", url: "/users/user-demo/state" })).json();
  assert.equal(regenerated.resources.currentEnergy, 12);
  assert.equal(regenerated.resources.energyRegenIntervalSeconds, 30);

  await context.app.close();
  context.store.close();
  const reopenedStore = new InMemoryStore(context.dbPath);
  assert.equal(reopenedStore.economySettings.redemptionExp, 135);
  assert.equal(reopenedStore.economySettings.vegetarianCarbonGrams, 950);
  assert.equal(reopenedStore.economySettings.energyRegenIntervalSeconds, 30);
  assert.equal(reopenedStore.economySettings.version, 2);
  reopenedStore.close();
  rmSync(context.dir, { recursive: true, force: true });
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
  assert.deepEqual(versions.map((item) => item.version), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(versions[2].name, "resource_ledger_growth_integrity");
  assert.equal(versions[3].name, "level_runtime_integrity");
  assert.equal(versions[4].name, "admin_economy_settings_management");
  assert.equal(versions[5].name, "mvp_task_code_thin_slice");
  assert.equal(versions[6].name, "task_code_submission_decisions");
  assert.equal(versions[7].name, "finalized_core_economy_rules");
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
  assert.deepEqual(versions.map((item) => item.version), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(legacy.energy_regen_interval_seconds, 120);
  assert.equal(custom.energy_regen_interval_seconds, 300);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number }).count, 2);
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test("migration v3 preserves old resource ledger rows as legacy and adds conversion metadata", () => {
  const dir = mkdtempSync(join(tmpdir(), "looper-migrate-ledger-"));
  const dbPath = join(dir, "legacy-ledger.sqlite");
  const db = new DatabaseSync(dbPath);
  configureDatabase(db);
  db.exec(`
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT 'legacy', applied_at TEXT NOT NULL);
INSERT INTO schema_migrations (version, name, applied_at) VALUES (1, 'initial_core_economy_schema', datetime('now')), (2, 'core_economy_integrity_constraints', datetime('now'));
CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, created_at TEXT NOT NULL);
INSERT INTO users (id, display_name, created_at) VALUES ('legacy-user', 'Legacy', datetime('now'));
CREATE TABLE resource_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);
INSERT INTO resource_transactions VALUES ('legacy-tx-1', 'legacy-user', 'carbon_balance', 800, 1600, 400, 'vegetarian_purchase', 'legacy-redemption', 'legacy-key', datetime('now'), '{}');
CREATE TABLE plant_growth_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  before_count INTEGER NOT NULL,
  after_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO plant_growth_logs VALUES ('legacy-log-1', 'legacy-user', 'vegetarian_purchase', 'legacy-redemption', 'seed_generated', 1, 0, 1, datetime('now'));
`);
  migrateDatabase(db);
  const versions = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: number }>;
  assert.deepEqual(versions.map((item) => item.version), [1, 2, 3, 4, 5, 6, 7, 8]);
  const tx = db.prepare("SELECT amount, balance_before, balance_after, transaction_kind, conversion_id, conversion_type FROM resource_transactions WHERE id = 'legacy-tx-1'").get() as { amount: number; balance_before: number; balance_after: number; transaction_kind: string; conversion_id: string; conversion_type: string };
  assert.equal(tx.amount, 800);
  assert.equal(tx.balance_before, 1600);
  assert.equal(tx.balance_after, 400);
  assert.equal(tx.transaction_kind, "legacy");
  assert.equal(tx.conversion_id, "");
  assert.equal(tx.conversion_type, "none");
  const log = db.prepare("SELECT conversion_id FROM plant_growth_logs WHERE id = 'legacy-log-1'").get() as { conversion_id: string };
  assert.equal(log.conversion_id, "");
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
  const createdAt = new Date().toISOString();
  assert.throws(() => store.db.prepare(`INSERT INTO resource_transactions
    (id, user_id, resource_type, amount, balance_before, balance_after, transaction_kind, conversion_id, conversion_type, source_type, source_id, idempotency_key, created_at, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run("bad-equation", "user-demo", "stars", 10, 0, 9, "grant", "", "none", "admin_adjustment", "bad-equation-source", "bad-equation-key", createdAt, "{}"), /constraint/i);
  assert.throws(() => store.db.prepare(`INSERT INTO resource_transactions
    (id, user_id, resource_type, amount, balance_before, balance_after, transaction_kind, conversion_id, conversion_type, source_type, source_id, idempotency_key, created_at, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run("bad-conversion", "user-demo", "seed", -1, 1, 0, "convert_debit", "", "seed_to_plant", "admin_adjustment", "bad-conversion-source", "bad-conversion-key", createdAt, "{}"), /constraint/i);
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
