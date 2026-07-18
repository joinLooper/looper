import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { configureDatabase, migrateDatabase, MIGRATIONS, TASK_CODE_SCOPE_SNAPSHOT_VERSION } from "./database.js";
import { InMemoryStore } from "./store.js";
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLE_PERMISSIONS,
  isTimestampInReportingMonth,
  parseReportingMonth,
  type PlatformOperatorRole,
  type PlatformOperatorStatus,
} from "@looper/types";

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

async function setup(options?: { taskCodeSecret?: string; merchantAppUrl?: string; adminAppUrl?: string; production?: boolean; now?: () => string }) {
  const dir = mkdtempSync(join(tmpdir(), "looper-api-"));
  const dbPath = join(dir, "test.sqlite");
  let currentTime = options?.now ?? (() => new Date().toISOString());
  const store = new InMemoryStore(dbPath, { taskCodeSecret: options?.taskCodeSecret, now: () => currentTime() });
  const app = await buildApp(store, {
    merchantAppUrl: options?.merchantAppUrl ?? "https://merchant.test",
    adminAppUrl: options?.adminAppUrl ?? "https://admin.test",
    production: options?.production,
  });
  await app.ready();
  return {
    app,
    store,
    dir,
    dbPath,
    setNowProvider(provider: () => string) { currentTime = provider; },
    async close() { await app.close(); store.close(); rmSync(dir, { recursive: true, force: true }); },
  };
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
const finalizedStarDates = {
  nonDesignated: "2026-07-15T04:00:00.000Z",
  monday: "2026-07-13T04:00:00.000Z",
  lunarFirst: "2026-02-17T04:00:00.000Z",
  lunarFifteenth: "2026-03-03T04:00:00.000Z",
  mondayLunarOverlap: "2026-01-19T04:00:00.000Z",
  taipeiMondayFromUtcSunday: "2026-07-12T16:30:00.000Z",
} as const;

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

async function createTaskCodeConfirmedSubmission(context: TestContext, suffix: string, confirmedAt: string) {
  const created = await createTaskCodePendingSubmission(context, suffix);
  const decisionKey = `task-code-settlement-${suffix}-decision`;
  context.store.db.prepare(`UPDATE task_code_submissions
    SET status = 'confirmed', confirmed_at = ?, decided_by = ?, decision_idempotency_key = ?
    WHERE id = ?`).run(confirmedAt, `staff-${suffix}`, decisionKey, created.submission.id);
  context.setNowProvider(() => confirmedAt);
  return { ...created, decisionKey };
}

function confirmTaskCodeSubmission(context: TestContext, submissionId: string, merchantId: string, idempotencyKey: string, actorId = "staff-settlement") {
  return context.app.inject({
    method: "POST",
    url: `/merchant/task-code-submissions/${submissionId}/decision`,
    headers: merchantHeaders,
    payload: { merchantId, decision: "confirm", actorId, idempotencyKey },
  });
}

function rejectTaskCodeSubmission(context: TestContext, submissionId: string, merchantId: string, idempotencyKey: string) {
  return context.app.inject({
    method: "POST",
    url: `/merchant/task-code-submissions/${submissionId}/decision`,
    headers: merchantHeaders,
    payload: { merchantId, decision: "reject", actorId: "staff-reject-settlement", idempotencyKey },
  });
}

test("canonical reporting timestamps migration v1 through v17 is continuous on an empty database", () => {
  assert.deepEqual(MIGRATIONS.map((migration) => migration.version), Array.from({ length: 17 }, (_, index) => index + 1));
  assert.equal(new Set(MIGRATIONS.map((migration) => migration.version)).size, 17);
  assert.equal(MIGRATIONS.at(-1)?.name, "canonical_reporting_timestamps");

  const store = new InMemoryStore(":memory:");
  try {
    const applied = store.db.prepare("SELECT version, name FROM schema_migrations ORDER BY version").all() as Array<{ version: number; name: string }>;
    assert.equal(applied.length, 17);
    const latest = applied.at(-1);
    assert.ok(latest);
    assert.deepEqual({ ...latest }, { version: 17, name: "canonical_reporting_timestamps" });
    const columnNames = (store.db.prepare("PRAGMA table_info(task_code_submissions)").all() as Array<{ name: string }>).map((column) => column.name);
    assert.equal(columnNames.includes("expired_at"), true);

    const expectedIndexes = [
      "idx_task_code_submissions_settled_reporting",
      "idx_task_code_submissions_merchant_settled_reporting",
      "idx_task_code_submissions_expired_reporting",
    ];
    const indexes = store.db.prepare(`SELECT name, sql FROM sqlite_master
      WHERE type = 'index' AND name IN (?, ?, ?) ORDER BY name`).all(...expectedIndexes) as Array<{ name: string; sql: string }>;
    assert.deepEqual(indexes.map((index) => index.name).sort(), expectedIndexes.sort());
    assert.match(indexes.find((index) => index.name === "idx_task_code_submissions_settled_reporting")?.sql ?? "", /settled_at DESC, id DESC[\s\S]*status = 'settled'/);
    assert.match(indexes.find((index) => index.name === "idx_task_code_submissions_merchant_settled_reporting")?.sql ?? "", /merchant_id, settled_at DESC, id DESC[\s\S]*status = 'settled'/);
    assert.match(indexes.find((index) => index.name === "idx_task_code_submissions_expired_reporting")?.sql ?? "", /expired_at DESC, id DESC[\s\S]*status = 'expired'/);
  } finally {
    store.close();
  }
});

test("canonical reporting timestamps migration leaves legacy timestamps untouched", () => {
  const db = new DatabaseSync(":memory:");
  configureDatabase(db);
  try {
    db.exec(`CREATE TABLE task_code_submissions (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      status TEXT NOT NULL,
      confirmed_at TEXT,
      rejected_at TEXT,
      settled_at TEXT
    );`);
    db.prepare(`INSERT INTO task_code_submissions
      (id, merchant_id, status, confirmed_at, rejected_at, settled_at)
      VALUES ('legacy-expired', 'merchant-1', 'expired', NULL, NULL, NULL),
             ('legacy-settled', 'merchant-1', 'settled', '2026-06-30T15:59:59.000Z', NULL, '2026-06-30T16:00:01.000Z')`).run();

    const migration = MIGRATIONS.find((item) => item.version === 17);
    assert.ok(migration);
    migration.up(db);

    const expired = db.prepare("SELECT expired_at FROM task_code_submissions WHERE id = 'legacy-expired'").get() as { expired_at: string | null };
    assert.equal(expired.expired_at, null);
    const settled = db.prepare("SELECT confirmed_at, settled_at FROM task_code_submissions WHERE id = 'legacy-settled'").get() as { confirmed_at: string; settled_at: string };
    assert.deepEqual({ ...settled }, {
      confirmed_at: "2026-06-30T15:59:59.000Z",
      settled_at: "2026-06-30T16:00:01.000Z",
    });
  } finally {
    db.close();
  }
});

test("canonical reporting timestamps records one expiredAt and exposes it through all existing read models", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  try {
    const fixture = await createAdminTaskCodeTransactionFixture(context, "canonical-expired-read");
    const confirmationExpiresAt = "2026-07-31T15:00:00.000Z";
    const expiredAt = "2026-07-31T15:00:05.000Z";
    context.store.db.prepare("UPDATE task_code_submissions SET confirmation_expires_at = ? WHERE id = ?").run(confirmationExpiresAt, fixture.submission.id);
    context.setNowProvider(() => expiredAt);

    const pending = await context.app.inject({
      method: "GET",
      url: `/merchant/task-code-submissions?merchantId=${fixture.merchant.id}&status=pending`,
      headers: { cookie: fixture.session.cookie },
    });
    assert.equal(pending.statusCode, 200, pending.body);
    assert.deepEqual(pending.json(), []);

    const stored = context.store.db.prepare(`SELECT status, confirmation_expires_at, expired_at
      FROM task_code_submissions WHERE id = ?`).get(fixture.submission.id) as { status: string; confirmation_expires_at: string; expired_at: string };
    assert.deepEqual({ ...stored }, { status: "expired", confirmation_expires_at: confirmationExpiresAt, expired_at: expiredAt });
    assert.notEqual(stored.confirmation_expires_at, stored.expired_at);

    const admin = await context.app.inject({ method: "GET", url: "/admin/task-code-submissions?status=expired", headers: adminHeaders });
    assert.equal(admin.statusCode, 200, admin.body);
    const adminItem = admin.json().items.find((item: { submissionId: string }) => item.submissionId === fixture.submission.id);
    assert.equal(adminItem.expiredAt, expiredAt);
    assert.equal(adminItem.decidedAt, null);

    const merchant = await context.app.inject({
      method: "GET",
      url: "/merchant/task-code-submissions/history?status=expired",
      headers: { cookie: fixture.session.cookie },
    });
    assert.equal(merchant.statusCode, 200, merchant.body);
    const merchantItem = merchant.json().items.find((item: { submissionId: string }) => item.submissionId === fixture.submission.id);
    assert.equal(merchantItem.expiredAt, expiredAt);
    assert.equal(merchantItem.decidedAt, null);

    const player = await context.app.inject({ method: "GET", url: `/task-code-submissions/${fixture.submission.id}?userId=user-demo` });
    assert.equal(player.statusCode, 200, player.body);
    assert.equal(player.json().expiredAt, expiredAt);

    context.setNowProvider(() => "2026-08-01T00:00:00.000Z");
    await context.app.inject({ method: "GET", url: "/admin/task-code-submissions?status=expired", headers: adminHeaders });
    const replayed = context.store.db.prepare("SELECT expired_at FROM task_code_submissions WHERE id = ?").get(fixture.submission.id) as { expired_at: string };
    assert.equal(replayed.expired_at, expiredAt);
  } finally {
    await context.close();
  }
});

test("canonical reporting timestamps decision expiry records expiredAt before rejecting the decision", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  try {
    const fixture = await createAdminTaskCodeTransactionFixture(context, "canonical-expired-decision");
    const expiredAt = "2026-07-31T15:30:00.000Z";
    context.store.db.prepare("UPDATE task_code_submissions SET confirmation_expires_at = ? WHERE id = ?").run("2026-07-31T15:29:59.000Z", fixture.submission.id);
    context.setNowProvider(() => expiredAt);

    const response = await context.app.inject({
      method: "POST",
      url: `/merchant/task-code-submissions/${fixture.submission.id}/decision`,
      headers: { cookie: fixture.session.cookie, origin: "https://merchant.test" },
      payload: { merchantId: fixture.merchant.id, decision: "confirm", idempotencyKey: "canonical-expired-decision-key" },
    });
    assert.equal(response.statusCode, 409, response.body);
    const stored = context.store.db.prepare("SELECT status, expired_at, confirmed_at, settled_at FROM task_code_submissions WHERE id = ?").get(fixture.submission.id) as Record<string, string | null>;
    assert.deepEqual({ ...stored }, { status: "expired", expired_at: expiredAt, confirmed_at: null, settled_at: null });
  } finally {
    await context.close();
  }
});

test("canonical reporting timestamps allow legacy expiredAt null in admin merchant and player APIs", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  try {
    const fixture = await createAdminTaskCodeTransactionFixture(context, "canonical-legacy-expired");
    context.store.db.prepare("UPDATE task_code_submissions SET status = 'expired', expired_at = NULL WHERE id = ?").run(fixture.submission.id);

    const admin = await context.app.inject({ method: "GET", url: "/admin/task-code-submissions?status=expired", headers: adminHeaders });
    assert.equal(admin.statusCode, 200, admin.body);
    assert.equal(admin.json().items.find((item: { submissionId: string }) => item.submissionId === fixture.submission.id).expiredAt, null);

    const merchant = await context.app.inject({ method: "GET", url: "/merchant/task-code-submissions/history?status=expired", headers: { cookie: fixture.session.cookie } });
    assert.equal(merchant.statusCode, 200, merchant.body);
    assert.equal(merchant.json().items.find((item: { submissionId: string }) => item.submissionId === fixture.submission.id).expiredAt, null);

    const player = await context.app.inject({ method: "GET", url: `/task-code-submissions/${fixture.submission.id}?userId=user-demo` });
    assert.equal(player.statusCode, 200, player.body);
    assert.equal(player.json().expiredAt, null);
  } finally {
    await context.close();
  }
});

test("canonical reporting timestamps use independent confirmed and settlement clocks across a Taiwan month boundary", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  try {
    const fixture = await createAdminTaskCodeTransactionFixture(context, "canonical-cross-month");
    context.store.db.prepare("UPDATE task_code_submissions SET confirmation_expires_at = ? WHERE id = ?").run("2026-08-01T00:00:00.000Z", fixture.submission.id);
    const clockValues = [
      "2026-07-31T15:59:58.000Z",
      "2026-07-31T15:59:59.999Z",
      "2026-07-31T16:00:00.001Z",
    ];
    context.setNowProvider(() => clockValues.shift() ?? "2026-07-31T16:00:00.001Z");

    const first = await decideAdminTaskCodeTransactionFixture(context, fixture, "confirm", "canonical-cross-month");
    const firstBody = first.json();
    assert.equal(firstBody.confirmedAt, "2026-07-31T15:59:59.999Z");
    assert.equal(firstBody.settledAt, "2026-07-31T16:00:00.001Z");
    assert.notEqual(firstBody.confirmedAt, firstBody.settledAt);

    const july = parseReportingMonth("2026-07");
    const august = parseReportingMonth("2026-08");
    assert.equal(isTimestampInReportingMonth(firstBody.confirmedAt, july), true);
    assert.equal(isTimestampInReportingMonth(firstBody.settledAt, july), false);
    assert.equal(isTimestampInReportingMonth(firstBody.settledAt, august), true);

    const event = context.store.listRewardEvents().find((item) => item.id === firstBody.rewardEventId);
    assert.ok(event?.ruleSnapshot);
    assert.equal(event.ruleSnapshot.occurredAt, firstBody.settledAt);
    assert.equal(event.ruleSnapshot.merchantLocalDate, "2026-08-01");
    const originalSnapshot = structuredClone(event.ruleSnapshot);
    const originalCounts = {
      submissions: countRows(context, "task_code_submissions"),
      redemptions: countRows(context, "redemptions"),
      rewards: countRows(context, "reward_events"),
      ledger: countRows(context, "resource_transactions"),
    };

    context.setNowProvider(() => "2026-08-02T00:00:00.000Z");
    const replay = await decideAdminTaskCodeTransactionFixture(context, fixture, "confirm", "canonical-cross-month");
    assert.equal(replay.json().settledAt, firstBody.settledAt);
    assert.deepEqual(context.store.listRewardEvents().find((item) => item.id === firstBody.rewardEventId)?.ruleSnapshot, originalSnapshot);
    assert.deepEqual({
      submissions: countRows(context, "task_code_submissions"),
      redemptions: countRows(context, "redemptions"),
      rewards: countRows(context, "reward_events"),
      ledger: countRows(context, "resource_transactions"),
    }, originalCounts);
  } finally {
    await context.close();
  }
});

test("canonical reporting timestamps roll back confirmation settlement links and ledger together", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  try {
    const fixture = await createAdminTaskCodeTransactionFixture(context, "canonical-rollback");
    context.store.db.prepare("UPDATE task_code_submissions SET confirmation_expires_at = ? WHERE id = ?").run("2026-08-01T00:00:00.000Z", fixture.submission.id);
    const clockValues = [
      "2026-07-31T15:59:58.000Z",
      "2026-07-31T15:59:59.999Z",
      "2026-07-31T16:00:00.001Z",
    ];
    context.setNowProvider(() => clockValues.shift() ?? "2026-07-31T16:00:00.001Z");
    context.store.failNextGrowthSettlementAt = "after_carbon_grant";

    const response = await context.app.inject({
      method: "POST",
      url: `/merchant/task-code-submissions/${fixture.submission.id}/decision`,
      headers: { cookie: fixture.session.cookie, origin: "https://merchant.test" },
      payload: { merchantId: fixture.merchant.id, decision: "confirm", idempotencyKey: "canonical-rollback-decision" },
    });
    assert.equal(response.statusCode, 500, response.body);
    const stored = context.store.db.prepare(`SELECT status, confirmed_at, expired_at, settled_at,
      decided_by, decision_idempotency_key, redemption_id, reward_event_id
      FROM task_code_submissions WHERE id = ?`).get(fixture.submission.id) as Record<string, string | null>;
    assert.deepEqual({ ...stored }, {
      status: "pending",
      confirmed_at: null,
      expired_at: null,
      settled_at: null,
      decided_by: null,
      decision_idempotency_key: null,
      redemption_id: null,
      reward_event_id: null,
    });
    assert.equal(countRows(context, "redemptions"), 0);
    assert.equal(countRows(context, "reward_events"), 0);
    assert.equal(countRows(context, "resource_transactions"), 0);
    assert.equal(countRows(context, "level_up_logs"), 0);
    const decisionAudits = context.store.db.prepare(`SELECT COUNT(*) AS count FROM audit_events
      WHERE entity_id = ? AND action IN ('task_code_submission.confirmed', 'task_code_submission.settled')`).get(fixture.submission.id) as { count: number };
    assert.equal(decisionAudits.count, 0);
  } finally {
    await context.close();
  }
});

test("task code reporting scope snapshot migration v1 through v18 is continuous and does not backfill legacy rows", () => {
  assert.deepEqual(MIGRATIONS.map((migration) => migration.version), Array.from({ length: 18 }, (_, index) => index + 1));
  assert.equal(new Set(MIGRATIONS.map((migration) => migration.version)).size, 18);
  assert.equal(MIGRATIONS.at(-1)?.name, "task_code_reporting_scope_snapshots");

  const store = new InMemoryStore(":memory:");
  try {
    const applied = store.db.prepare("SELECT version, name FROM schema_migrations ORDER BY version").all() as Array<{ version: number; name: string }>;
    assert.equal(applied.length, 18);
    const latest = applied.at(-1);
    assert.ok(latest);
    assert.deepEqual({ ...latest }, { version: 18, name: "task_code_reporting_scope_snapshots" });
    const table = store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'task_code_submission_scope_snapshots'").get();
    assert.ok(table);

    const columns = (store.db.prepare("PRAGMA table_info(task_code_submission_scope_snapshots)").all() as Array<{ name: string }>).map((column) => column.name);
    assert.deepEqual(columns, [
      "submission_id",
      "snapshot_version",
      "captured_at",
      "reporting_timezone",
      "brand_id",
      "brand_display_name",
      "merchant_id",
      "branch_code",
      "branch_display_name",
    ]);
    const serializedColumns = columns.join(" ").toLowerCase();
    for (const forbidden of ["code_hash", "secret", "token", "idempotency", "staff", "amount", "reward_category", "merchant_timezone"]) {
      assert.equal(serializedColumns.includes(forbidden), false, forbidden);
    }

    const indexes = store.db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index'
      AND name IN ('idx_task_code_scope_snapshots_brand_submission', 'idx_task_code_scope_snapshots_merchant_submission')
      ORDER BY name`).all() as Array<{ name: string }>;
    assert.deepEqual(indexes.map((index) => index.name), [
      "idx_task_code_scope_snapshots_brand_submission",
      "idx_task_code_scope_snapshots_merchant_submission",
    ]);
    const triggers = store.db.prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger'
      AND name IN ('trg_task_code_scope_snapshots_immutable_update', 'trg_task_code_scope_snapshots_immutable_delete')
      ORDER BY name`).all() as Array<{ name: string }>;
    assert.deepEqual(triggers.map((trigger) => trigger.name), [
      "trg_task_code_scope_snapshots_immutable_delete",
      "trg_task_code_scope_snapshots_immutable_update",
    ]);
  } finally {
    store.close();
  }

  const legacyDb = new DatabaseSync(":memory:");
  configureDatabase(legacyDb);
  try {
    legacyDb.exec("CREATE TABLE task_code_submissions (id TEXT PRIMARY KEY);");
    legacyDb.prepare("INSERT INTO task_code_submissions (id) VALUES ('legacy-submission')").run();
    const migration = MIGRATIONS.find((item) => item.version === 18);
    assert.ok(migration);
    migration.up(legacyDb);
    const snapshots = legacyDb.prepare("SELECT COUNT(*) AS count FROM task_code_submission_scope_snapshots").get() as { count: number };
    assert.equal(snapshots.count, 0);
  } finally {
    legacyDb.close();
  }
});

test("task code reporting scope snapshot atomically captures the canonical brand and branch", async () => {
  const capturedAt = "2026-07-17T12:00:00.000Z";
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret", now: () => capturedAt });
  try {
    const before = {
      redemptions: countRows(context, "redemptions"),
      rewards: countRows(context, "reward_events"),
      ledger: countRows(context, "resource_transactions"),
    };
    const fixture = await createAdminTaskCodeTransactionFixture(context, "scope-canonical");
    const merchant = fixture.merchant;
    const snapshot = context.store.db.prepare("SELECT * FROM task_code_submission_scope_snapshots WHERE submission_id = ?").get(fixture.submission.id) as Record<string, string>;

    assert.deepEqual({ ...snapshot }, {
      submission_id: fixture.submission.id,
      snapshot_version: TASK_CODE_SCOPE_SNAPSHOT_VERSION,
      captured_at: fixture.submission.submittedAt,
      reporting_timezone: "Asia/Taipei",
      brand_id: merchant.brandId,
      brand_display_name: merchant.brandDisplayName,
      merchant_id: merchant.id,
      branch_code: merchant.branchCode,
      branch_display_name: merchant.storeName,
    });
    assert.equal(snapshot.captured_at, capturedAt);
    assert.equal(fixture.submission.status, "pending");
    assert.deepEqual({
      redemptions: countRows(context, "redemptions"),
      rewards: countRows(context, "reward_events"),
      ledger: countRows(context, "resource_transactions"),
    }, before);
  } finally {
    await context.close();
  }
});

test("task code reporting scope snapshot is idempotent and competing submissions keep one pair", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  try {
    const fixture = await createAdminTaskCodeTransactionFixture(context, "scope-idempotent");
    const replay = await context.app.inject({
      method: "POST",
      url: "/task-code-submissions",
      payload: {
        userId: "user-demo",
        missionId: fixture.mission.id,
        merchantId: fixture.merchant.id,
        code: fixture.taskCode,
        idempotencyKey: "admin-task-code-query-submit-scope-idempotent",
      },
    });
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(replay.json().id, fixture.submission.id);
    const replaySnapshots = context.store.db.prepare("SELECT COUNT(*) AS count FROM task_code_submission_scope_snapshots WHERE submission_id = ?").get(fixture.submission.id) as { count: number };
    assert.equal(replaySnapshots.count, 1);

    const raceFixture = await createAdminTaskCodeTransactionFixture(context, "scope-race");
    const racePayload = {
      userId: "user-demo",
      missionId: raceFixture.mission.id,
      merchantId: raceFixture.merchant.id,
      code: raceFixture.taskCode,
      idempotencyKey: "task-code-scope-race-key",
    };
    const [first, second] = await Promise.all([
      context.app.inject({ method: "POST", url: "/task-code-submissions", payload: racePayload }),
      context.app.inject({ method: "POST", url: "/task-code-submissions", payload: racePayload }),
    ]);
    assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 201]);
    const pair = context.store.db.prepare(`SELECT
        COUNT(DISTINCT submission.id) AS submissions,
        COUNT(snapshot.submission_id) AS snapshots
      FROM task_code_submissions submission
      LEFT JOIN task_code_submission_scope_snapshots snapshot ON snapshot.submission_id = submission.id
      WHERE submission.idempotency_key = ?`).get(racePayload.idempotencyKey) as { submissions: number; snapshots: number };
    assert.deepEqual({ ...pair }, { submissions: 1, snapshots: 1 });
  } finally {
    await context.close();
  }
});

test("task code reporting scope snapshot insert failure rolls back the pending submission", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  try {
    const fixture = await createAdminTaskCodeTransactionFixture(context, "scope-rollback");
    const snapshotsBefore = countRows(context, "task_code_submission_scope_snapshots");
    context.store.db.exec(`CREATE TRIGGER fail_task_code_scope_snapshot_insert
      BEFORE INSERT ON task_code_submission_scope_snapshots
      BEGIN
        SELECT RAISE(ABORT, 'simulated scope snapshot failure');
      END;`);
    const idempotencyKey = "task-code-scope-rollback-key";
    const response = await context.app.inject({
      method: "POST",
      url: "/task-code-submissions",
      payload: { userId: "user-demo", missionId: fixture.mission.id, merchantId: fixture.merchant.id, code: fixture.taskCode, idempotencyKey },
    });
    assert.equal(response.statusCode, 500, response.body);
    const submissions = context.store.db.prepare("SELECT COUNT(*) AS count FROM task_code_submissions WHERE idempotency_key = ?").get(idempotencyKey) as { count: number };
    assert.equal(submissions.count, 0);
    assert.equal(countRows(context, "task_code_submission_scope_snapshots"), snapshotsBefore);
    assert.equal(countRows(context, "redemptions"), 0);
    assert.equal(countRows(context, "reward_events"), 0);
    assert.equal(countRows(context, "resource_transactions"), 0);
  } finally {
    await context.close();
  }
});

test("task code reporting scope snapshot remains unchanged after master data renames and rejects mutation", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  try {
    const fixture = await createAdminTaskCodeTransactionFixture(context, "scope-immutable");
    const before = context.store.db.prepare("SELECT * FROM task_code_submission_scope_snapshots WHERE submission_id = ?").get(fixture.submission.id) as Record<string, string>;
    context.store.db.prepare("UPDATE merchant_brands SET display_name = ?, updated_at = ? WHERE id = ?").run("改名後品牌", new Date().toISOString(), before.brand_id);
    context.store.db.prepare("UPDATE merchants SET store_name = ?, branch_code = ? WHERE id = ?").run("改名後分店", "renamed-branch", before.merchant_id);
    const afterRename = context.store.db.prepare("SELECT * FROM task_code_submission_scope_snapshots WHERE submission_id = ?").get(fixture.submission.id) as Record<string, string>;
    assert.deepEqual({ ...afterRename }, { ...before });

    assert.throws(
      () => context.store.db.prepare("UPDATE task_code_submission_scope_snapshots SET brand_display_name = '不可變更' WHERE submission_id = ?").run(fixture.submission.id),
      /immutable/,
    );
    assert.throws(
      () => context.store.db.prepare("DELETE FROM task_code_submission_scope_snapshots WHERE submission_id = ?").run(fixture.submission.id),
      /immutable/,
    );
    const afterMutationAttempts = context.store.db.prepare("SELECT * FROM task_code_submission_scope_snapshots WHERE submission_id = ?").get(fixture.submission.id) as Record<string, string>;
    assert.deepEqual({ ...afterMutationAttempts }, { ...before });
  } finally {
    await context.close();
  }
});

test("task code reporting scope snapshot does not backfill a legacy submission during idempotency replay", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  try {
    const fixture = await createAdminTaskCodeTransactionFixture(context, "scope-legacy-replay");
    const legacyId = "legacy-task-code-submission-no-scope";
    const legacyKey = "legacy-task-code-scope-replay-key";
    const submittedAt = "2026-07-01T00:00:00.000Z";
    context.store.db.prepare(`INSERT INTO task_code_submissions
      (id, task_code_window_id, merchant_id, mission_id, user_id, status, submitted_at, confirmation_expires_at, idempotency_key)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`).run(
      legacyId,
      fixture.submission.taskCodeWindowId,
      fixture.merchant.id,
      fixture.mission.id,
      "user-demo",
      submittedAt,
      "2026-07-01T00:05:00.000Z",
      legacyKey,
    );

    const replay = await context.app.inject({
      method: "POST",
      url: "/task-code-submissions",
      payload: {
        userId: "user-demo",
        missionId: fixture.mission.id,
        merchantId: fixture.merchant.id,
        code: fixture.taskCode,
        idempotencyKey: legacyKey,
      },
    });
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(replay.json().id, legacyId);
    const legacySubmissions = context.store.db.prepare("SELECT COUNT(*) AS count FROM task_code_submissions WHERE idempotency_key = ?").get(legacyKey) as { count: number };
    const legacySnapshots = context.store.db.prepare("SELECT COUNT(*) AS count FROM task_code_submission_scope_snapshots WHERE submission_id = ?").get(legacyId) as { count: number };
    assert.equal(legacySubmissions.count, 1);
    assert.equal(legacySnapshots.count, 0);
  } finally {
    await context.close();
  }
});

test("task code thin slice migration creates tables", () => {
  const dir = mkdtempSync(join(tmpdir(), "looper-task-code-migrate-"));
  const dbPath = join(dir, "task-code.sqlite");
  const store = new InMemoryStore(dbPath);
  const tables = store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('task_code_windows', 'task_code_submissions') ORDER BY name").all() as Array<{ name: string }>;
  assert.deepEqual(tables.map((item) => item.name), ["task_code_submissions", "task_code_windows"]);
  assert.ok(store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_task_code_windows_one_active_per_merchant'").get());
  const versions = store.db.prepare("SELECT version, name FROM schema_migrations ORDER BY version").all() as Array<{ version: number; name: string }>;
  assert.equal(versions.at(-1)?.version, 10);
  assert.equal(versions.at(-1)?.name, "task_code_submission_settlement_links");
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

function applyLegacyMigrationVersions(db: DatabaseSync, throughVersion: number): void {
  db.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const insert = db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, '2026-07-01T00:00:00.000Z')");
  for (let version = 1; version <= throughVersion; version += 1) {
    insert.run(version, `legacy-${version}`);
  }
}

function createPreBrandBranchDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "looper-merchant-brand-legacy-"));
  const dbPath = join(dir, "legacy.sqlite");
  const db = new DatabaseSync(dbPath);
  configureDatabase(db);
  applyLegacyMigrationVersions(db, 11);
  db.exec(`
CREATE TABLE merchant_applications (
  id TEXT PRIMARY KEY,
  store_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_line_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT NOT NULL,
  store_category TEXT NOT NULL,
  other_store_category TEXT NOT NULL,
  vegetarian_offering_json TEXT NOT NULL,
  other_meal_type TEXT NOT NULL,
  business_hours_json TEXT NOT NULL,
  status TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT,
  review_note TEXT,
  merchant_id TEXT UNIQUE
);

CREATE TABLE merchants (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE,
  store_name TEXT NOT NULL,
  address TEXT NOT NULL,
  store_category TEXT NOT NULL,
  other_store_category TEXT NOT NULL,
  vegetarian_offering_json TEXT NOT NULL,
  other_meal_type TEXT NOT NULL,
  business_hours_json TEXT NOT NULL,
  status TEXT NOT NULL,
  can_redeem INTEGER NOT NULL,
  merchant_plan TEXT NOT NULL,
  reward_star_amount INTEGER NOT NULL,
  reward_category TEXT NOT NULL DEFAULT 'general',
  timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  created_at TEXT NOT NULL
);

CREATE TABLE missions (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  mission_type TEXT NOT NULL DEFAULT 'vegetarian_meal',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE redemptions (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  stars_granted INTEGER NOT NULL,
  energy_granted INTEGER NOT NULL,
  exp_granted INTEGER NOT NULL,
  carbon_grams INTEGER NOT NULL,
  reward_event_id TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE reward_events (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  merchant_id TEXT,
  mission_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  logical_request_json TEXT NOT NULL,
  reward_payload_json TEXT NOT NULL,
  growth_summary_json TEXT NOT NULL,
  level_summary_json TEXT NOT NULL,
  rule_version TEXT,
  rule_snapshot_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE task_code_windows (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  code_length INTEGER NOT NULL,
  valid_from TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE task_code_submissions (
  id TEXT PRIMARY KEY,
  task_code_window_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  confirmation_expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  rejected_at TEXT,
  settled_at TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  decided_by TEXT,
  decision_idempotency_key TEXT UNIQUE,
  redemption_id TEXT UNIQUE,
  reward_event_id TEXT UNIQUE
);

CREATE TABLE resource_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  transaction_kind TEXT NOT NULL,
  conversion_id TEXT NOT NULL,
  conversion_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);
`);

  return {
    db,
    close() {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function insertLegacyMerchant(db: DatabaseSync, index: number) {
  const applicationId = `merchant-application-legacy-${index}`;
  const merchantId = `merchant-legacy-${index}`;
  const missionId = `mission-legacy-${index}`;
  const now = `2026-07-${String(index).padStart(2, "0")}T00:00:00.000Z`;
  const meals = JSON.stringify(["火鍋"]);
  const hours = JSON.stringify(businessHours);
  db.prepare(
    `INSERT INTO merchant_applications
      (id, store_name, contact_name, contact_line_id, phone, email, address, store_category, other_store_category, vegetarian_offering_json, other_meal_type, business_hours_json, status, submitted_at, reviewed_at, review_note, merchant_id)
     VALUES (?, ?, '林店長', 'forest.manager', '0912345678', ?, ?, '餐廳', '', ?, '', ?, 'approved', ?, ?, '', ?)`,
  ).run(applicationId, `舊店家 ${index}`, `legacy-${index}@example.com`, `台北市森林路 ${index} 號`, meals, hours, now, now, merchantId);
  db.prepare(
    `INSERT INTO merchants
      (id, application_id, store_name, address, store_category, other_store_category, vegetarian_offering_json, other_meal_type, business_hours_json, status, can_redeem, merchant_plan, reward_star_amount, reward_category, timezone, created_at)
     VALUES (?, ?, ?, ?, '餐廳', '', ?, '', ?, 'active', 1, 'sprout', 50, 'general', 'Asia/Taipei', ?)`,
  ).run(merchantId, applicationId, `舊店家 ${index}`, `台北市森林路 ${index} 號`, meals, hours, now);
  db.prepare(
    `INSERT INTO missions (id, merchant_id, mission_type, title, description, created_at)
     VALUES (?, ?, 'vegetarian_meal', '吃一餐蔬食', '完成蔬食任務', ?)`,
  ).run(missionId, merchantId, now);
  return { applicationId, merchantId, missionId };
}

function insertLegacyMerchantHistory(db: DatabaseSync, ids: { merchantId: string; missionId: string }): void {
  const now = "2026-07-15T00:00:00.000Z";
  db.prepare(
    `INSERT INTO redemptions
      (id, idempotency_key, user_id, mission_id, merchant_id, stars_granted, energy_granted, exp_granted, carbon_grams, reward_event_id, created_at)
     VALUES ('redemption-legacy-1', 'redeem-key-legacy-1', 'user-demo', ?, ?, 0, 30, 200, 800, 'reward-event-legacy-1', ?)`,
  ).run(ids.missionId, ids.merchantId, now);
  db.prepare(
    `INSERT INTO reward_events
      (id, source_type, source_id, user_id, merchant_id, mission_id, idempotency_key, logical_request_json, reward_payload_json, growth_summary_json, level_summary_json, rule_version, rule_snapshot_json, created_at)
     VALUES ('reward-event-legacy-1', 'redemption', 'redemption-legacy-1', 'user-demo', ?, ?, 'reward-key-legacy-1', '{}', '{}', '{}', '{}', NULL, NULL, ?)`,
  ).run(ids.merchantId, ids.missionId, now);
  db.prepare(
    `INSERT INTO task_code_windows
      (id, merchant_id, code_hash, code_length, valid_from, valid_until, status, created_at)
     VALUES ('task-code-window-legacy-1', ?, 'hash', 4, ?, '2026-07-15T02:00:00.000Z', 'active', ?)`,
  ).run(ids.merchantId, now, now);
  db.prepare(
    `INSERT INTO task_code_submissions
      (id, task_code_window_id, merchant_id, mission_id, user_id, status, submitted_at, confirmation_expires_at, idempotency_key)
     VALUES ('task-code-submission-legacy-1', 'task-code-window-legacy-1', ?, ?, 'user-demo', 'pending', ?, '2026-07-15T00:05:00.000Z', 'submission-key-legacy-1')`,
  ).run(ids.merchantId, ids.missionId, now);
  db.prepare(
    `INSERT INTO resource_transactions
      (id, user_id, resource_type, amount, balance_before, balance_after, transaction_kind, conversion_id, conversion_type, source_type, source_id, idempotency_key, created_at, metadata_json)
     VALUES ('resource-transaction-legacy-1', 'user-demo', 'exp', 200, 0, 200, 'grant', 'reward-event-legacy-1', 'reward_event', 'redemption', 'redemption-legacy-1', 'resource-key-legacy-1', ?, '{}')`,
  ).run(now);
}

function countLegacyRows(db: DatabaseSync, table: string): number {
  return Number((db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number }).total);
}

function insertTestAccount(db: DatabaseSync, accountId: string): void {
  db.prepare("INSERT OR IGNORE INTO accounts (id, display_name, status, created_at, updated_at, creation_idempotency_key) VALUES (?, ?, 'active', datetime('now'), datetime('now'), NULL)").run(accountId, accountId);
}

function createPreAccountIdentityDatabase() {
  const dir = mkdtempSync(join(tmpdir(), "looper-account-identity-legacy-"));
  const dbPath = join(dir, "legacy.sqlite");
  const db = new DatabaseSync(dbPath);
  configureDatabase(db);
  applyLegacyMigrationVersions(db, 13);
  db.exec(`
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE user_resources (
  user_id TEXT PRIMARY KEY,
  star_balance INTEGER NOT NULL
);

CREATE TABLE reward_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  merchant_id TEXT,
  mission_id TEXT
);

CREATE TABLE redemptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL
);

CREATE TABLE resource_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_id TEXT NOT NULL
);

CREATE TABLE player_event_queue (
  queue_order INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  source_reward_event_id TEXT NOT NULL,
  status TEXT NOT NULL,
  resolved_at TEXT,
  resolution_idempotency_key TEXT
);
`);
  return {
    db,
    close() {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function insertLegacyUserIdentityData(db: DatabaseSync, userId: string, displayName: string): void {
  db.prepare("INSERT INTO users (id, display_name, created_at) VALUES (?, ?, datetime('now'))").run(userId, displayName);
  db.prepare("INSERT INTO user_resources (user_id, star_balance) VALUES (?, 10)").run(userId);
  db.prepare("INSERT INTO reward_events (id, user_id, merchant_id, mission_id) VALUES (?, ?, 'merchant-legacy', 'mission-legacy')").run(`reward-${userId}`, userId);
  db.prepare("INSERT INTO redemptions (id, user_id, merchant_id) VALUES (?, ?, 'merchant-legacy')").run(`redemption-${userId}`, userId);
  db.prepare("INSERT INTO resource_transactions (id, user_id, source_id) VALUES (?, ?, ?)").run(`resource-${userId}`, userId, `reward-${userId}`);
  db.prepare("INSERT INTO player_event_queue (id, user_id, source_reward_event_id, status) VALUES (?, ?, ?, 'pending')").run(`event-${userId}`, userId, `reward-${userId}`);
}

test("merchant brand branch empty database creates schema", async () => {
  const context = await setup();
  try {
    const migration = MIGRATIONS.at(-1);
    assert.equal(migration?.version, 12);
    assert.equal(migration?.name, "merchant_brand_branch_model");
    assert.equal(countRows(context, "merchant_brands"), 0);
    const merchantColumns = context.store.db.prepare("PRAGMA table_info(merchants)").all() as Array<{ name: string }>;
    assert.ok(merchantColumns.some((column) => column.name === "brand_id"));
    assert.ok(merchantColumns.some((column) => column.name === "branch_code"));
    const indexes = context.store.db.prepare("PRAGMA index_list(merchant_operator_memberships)").all() as Array<{ name: string }>;
    assert.ok(indexes.some((index) => index.name === "idx_memberships_brand_scope_unique"));
    assert.ok(indexes.some((index) => index.name === "idx_memberships_branch_scope_unique"));
  } finally {
    await context.close();
  }
});

test("merchant brand branch migrates one legacy merchant without changing merchant id", () => {
  const legacy = createPreBrandBranchDatabase();
  try {
    const ids = insertLegacyMerchant(legacy.db, 1);
    migrateDatabase(legacy.db);
    assert.equal(countLegacyRows(legacy.db, "merchant_brands"), 1);
    const merchant = legacy.db.prepare("SELECT id, brand_id, branch_code FROM merchants WHERE id = ?").get(ids.merchantId) as { id: string; brand_id: string; branch_code: string };
    assert.equal(merchant.id, ids.merchantId);
    assert.equal(merchant.brand_id, `merchant-brand-${ids.merchantId}`);
    assert.equal(merchant.branch_code, "main");
  } finally {
    legacy.close();
  }
});

test("merchant brand branch migrates multiple legacy merchants without collisions", () => {
  const legacy = createPreBrandBranchDatabase();
  try {
    const first = insertLegacyMerchant(legacy.db, 1);
    const second = insertLegacyMerchant(legacy.db, 2);
    migrateDatabase(legacy.db);
    assert.equal(countLegacyRows(legacy.db, "merchant_brands"), 2);
    const merchants = legacy.db.prepare("SELECT id, brand_id, branch_code FROM merchants ORDER BY id").all() as Array<{ id: string; brand_id: string; branch_code: string }>;
    assert.deepEqual(merchants.map((merchant) => merchant.id).sort(), [first.merchantId, second.merchantId].sort());
    assert.equal(new Set(merchants.map((merchant) => merchant.brand_id)).size, 2);
    assert.ok(merchants.every((merchant) => merchant.branch_code === "main"));
  } finally {
    legacy.close();
  }
});

test("merchant brand branch application approval atomically creates brand and branch", async () => {
  const context = await setup();
  try {
    const submitted = await context.app.inject({ method: "POST", url: "/merchant-applications", payload: payload("atomic-brand@example.com") });
    assert.equal(submitted.statusCode, 201, submitted.body);
    const application = submitted.json();
    context.store.failNextMerchantMissionWrite = true;
    const failingReview = await context.app.inject({ method: "POST", url: `/merchant-applications/${application.id}/review`, headers: adminHeaders, payload: { decision: "approve", reviewerId: "admin-demo" } });
    assert.equal(failingReview.statusCode, 500);
    assert.equal(countRows(context, "merchant_brands"), 0);
    assert.equal(countRows(context, "merchants"), 0);
    assert.equal(countRows(context, "missions"), 0);

    const review = await context.app.inject({ method: "POST", url: `/merchant-applications/${application.id}/review`, headers: adminHeaders, payload: { decision: "approve", reviewerId: "admin-demo" } });
    assert.equal(review.statusCode, 200, review.body);
    const approved = review.json();
    const merchant = context.store.getMerchant(approved.merchantId);
    assert.ok(merchant);
    assert.equal(merchant.branchCode, "main");
    assert.equal(merchant.brandDisplayName, merchant.storeName);
    assert.equal(countRows(context, "merchant_brands"), 1);
    assert.equal(countRows(context, "merchants"), 1);
    assert.equal(countRows(context, "missions"), 1);
  } finally {
    await context.close();
  }
});

test("merchant brand branch repeated application review does not duplicate brand or branch", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "duplicate-brand@example.com");
    const duplicate = await context.app.inject({ method: "POST", url: `/merchant-applications/${application.id}/review`, headers: adminHeaders, payload: { decision: "approve", reviewerId: "admin-demo" } });
    assert.equal(duplicate.statusCode, 409);
    assert.equal(countRows(context, "merchant_brands"), 1);
    assert.equal(countRows(context, "merchants"), 1);
    assert.equal(countRows(context, "missions"), 1);
  } finally {
    await context.close();
  }
});

test("merchant brand branch merchants endpoint returns compatible brand fields", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "merchant-list-brand@example.com");
    const response = await context.app.inject({ method: "GET", url: "/merchants" });
    assert.equal(response.statusCode, 200, response.body);
    const merchants = response.json() as Array<{ id: string; brandId: string; brandDisplayName: string; branchCode: string; storeName: string }>;
    const merchant = merchants.find((candidate) => candidate.id === application.merchantId);
    assert.ok(merchant);
    assert.equal(merchant.brandDisplayName, merchant.storeName);
    assert.equal(merchant.branchCode, "main");
    assert.match(merchant.brandId, /^merchant-brand-/);
  } finally {
    await context.close();
  }
});

test("merchant brand branch blocks duplicate brand-level membership", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "membership-brand@example.com");
    const merchant = context.store.getMerchant(application.merchantId);
    assert.ok(merchant);
    insertTestAccount(context.store.db, "operator-demo");
    const insert = context.store.db.prepare(
      `INSERT INTO merchant_operator_memberships
        (id, account_id, brand_id, merchant_id, role, status, created_at, updated_at)
       VALUES (?, 'operator-demo', ?, NULL, 'brand_manager', 'active', datetime('now'), datetime('now'))`,
    );
    insert.run("membership-brand-1", merchant.brandId);
    assert.throws(() => insert.run("membership-brand-2", merchant.brandId), /constraint|UNIQUE/i);
  } finally {
    await context.close();
  }
});

test("merchant brand branch blocks duplicate branch-level membership", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "membership-branch@example.com");
    const merchant = context.store.getMerchant(application.merchantId);
    assert.ok(merchant);
    insertTestAccount(context.store.db, "operator-demo");
    const insert = context.store.db.prepare(
      `INSERT INTO merchant_operator_memberships
        (id, account_id, brand_id, merchant_id, role, status, created_at, updated_at)
       VALUES (?, 'operator-demo', ?, ?, 'branch_staff', 'active', datetime('now'), datetime('now'))`,
    );
    insert.run("membership-branch-1", merchant.brandId, merchant.id);
    assert.throws(() => insert.run("membership-branch-2", merchant.brandId, merchant.id), /constraint|UNIQUE/i);
  } finally {
    await context.close();
  }
});

test("merchant brand branch enforces membership role scope", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "membership-scope@example.com");
    const merchant = context.store.getMerchant(application.merchantId);
    assert.ok(merchant);
    insertTestAccount(context.store.db, "operator-demo");
    assert.throws(
      () =>
        context.store.db
          .prepare(
            `INSERT INTO merchant_operator_memberships
              (id, account_id, brand_id, merchant_id, role, status, created_at, updated_at)
             VALUES ('membership-scope-1', 'operator-demo', ?, ?, 'brand_owner', 'active', datetime('now'), datetime('now'))`,
          )
          .run(merchant.brandId, merchant.id),
      /constraint|CHECK/i,
    );
    assert.throws(
      () =>
        context.store.db
          .prepare(
            `INSERT INTO merchant_operator_memberships
              (id, account_id, brand_id, merchant_id, role, status, created_at, updated_at)
             VALUES ('membership-scope-2', 'operator-demo', ?, NULL, 'branch_manager', 'active', datetime('now'), datetime('now'))`,
          )
          .run(merchant.brandId),
      /constraint|CHECK/i,
    );
  } finally {
    await context.close();
  }
});

test("merchant brand branch rejects cross-brand branch membership", async () => {
  const context = await setup();
  try {
    const first = await onboardMerchant(context.app, "membership-cross-a@example.com");
    const second = await onboardMerchant(context.app, "membership-cross-b@example.com");
    const firstMerchant = context.store.getMerchant(first.application.merchantId);
    const secondMerchant = context.store.getMerchant(second.application.merchantId);
    assert.ok(firstMerchant);
    assert.ok(secondMerchant);
    insertTestAccount(context.store.db, "operator-demo");
    assert.throws(
      () =>
        context.store.db
          .prepare(
            `INSERT INTO merchant_operator_memberships
              (id, account_id, brand_id, merchant_id, role, status, created_at, updated_at)
             VALUES ('membership-cross-1', 'operator-demo', ?, ?, 'branch_manager', 'active', datetime('now'), datetime('now'))`,
          )
          .run(firstMerchant.brandId, secondMerchant.id),
      /membership merchant must belong to brand|constraint/i,
    );
  } finally {
    await context.close();
  }
});

test("merchant brand branch migration preserves historical merchant references", () => {
  const legacy = createPreBrandBranchDatabase();
  try {
    const ids = insertLegacyMerchant(legacy.db, 1);
    insertLegacyMerchantHistory(legacy.db, ids);
    migrateDatabase(legacy.db);
    assert.equal((legacy.db.prepare("SELECT merchant_id FROM redemptions WHERE id = 'redemption-legacy-1'").get() as { merchant_id: string }).merchant_id, ids.merchantId);
    assert.equal((legacy.db.prepare("SELECT merchant_id FROM reward_events WHERE id = 'reward-event-legacy-1'").get() as { merchant_id: string }).merchant_id, ids.merchantId);
    assert.equal((legacy.db.prepare("SELECT merchant_id FROM task_code_windows WHERE id = 'task-code-window-legacy-1'").get() as { merchant_id: string }).merchant_id, ids.merchantId);
    assert.equal((legacy.db.prepare("SELECT merchant_id FROM task_code_submissions WHERE id = 'task-code-submission-legacy-1'").get() as { merchant_id: string }).merchant_id, ids.merchantId);
    assert.equal((legacy.db.prepare("SELECT merchant_id FROM missions WHERE id = ?").get(ids.missionId) as { merchant_id: string }).merchant_id, ids.merchantId);
    assert.equal(countLegacyRows(legacy.db, "redemptions"), 1);
    assert.equal(countLegacyRows(legacy.db, "reward_events"), 1);
    assert.equal(countLegacyRows(legacy.db, "resource_transactions"), 1);
  } finally {
    legacy.close();
  }
});

function branchPayload(overrides: Partial<{
  branchCode: string;
  storeName: string;
  address: string;
  rewardCategory: "general" | "star";
  timezone: string;
  actorId: string;
}> = {}) {
  return {
    branchCode: "taipei-branch",
    storeName: "森林蔬食台北分店",
    address: "台北市分店路 2 號",
    rewardCategory: "star" as const,
    timezone: "Asia/Taipei",
    actorId: "admin-demo",
    ...overrides,
  };
}

async function createAdminBranch(context: TestContext, brandId: string, overrides: Parameters<typeof branchPayload>[0] = {}) {
  return context.app.inject({
    method: "POST",
    url: `/admin/merchant-brands/${brandId}/branches`,
    headers: adminHeaders,
    payload: branchPayload(overrides),
  });
}

function membershipPayload(accountId: string, brandId: string, overrides: Partial<{
  merchantId: string | null;
  role: "brand_owner" | "brand_manager" | "branch_manager" | "branch_staff";
  actorId: string;
}> = {}) {
  return {
    accountId,
    brandId,
    role: "brand_manager" as const,
    actorId: "admin-demo",
    ...overrides,
  };
}

function createAdminMembership(context: TestContext, body: ReturnType<typeof membershipPayload>, headers: Record<string, string> = adminHeaders) {
  return context.app.inject({ method: "POST", url: "/admin/merchant-operator-memberships", headers, payload: body });
}

async function prepareMerchantInvitationAccount(context: TestContext, suffix: string) {
  const { application } = await onboardMerchant(context.app, `merchant-auth-${suffix}@example.com`);
  const merchant = context.store.getMerchant(application.merchantId);
  const accountId = `merchant-auth-${suffix}`;
  insertTestAccount(context.store.db, accountId);
  const membership = await createAdminMembership(context, membershipPayload(accountId, merchant.brandId, { role: "brand_manager" }));
  assert.equal(membership.statusCode, 201, membership.body);
  return { accountId, merchant };
}

function createAccountInvitation(context: TestContext, accountId: string, key: string, headers: Record<string, string> = adminHeaders) {
  return context.app.inject({ method: "POST", url: "/admin/account-invitations", headers, payload: { accountId, idempotencyKey: key, actorId: "admin-demo" } });
}

function redeemInvitation(context: TestContext, token: string) {
  return context.app.inject({ method: "POST", url: "/auth/invitations/redeem", payload: { token } });
}

function cookieHeader(response: Awaited<ReturnType<typeof redeemInvitation>>): string {
  return String(response.headers["set-cookie"]).split(";")[0];
}

async function createMerchantAuthSession(context: TestContext, accountId: string, key: string) {
  const invitation = (await createAccountInvitation(context, accountId, `${key}-invite`)).json();
  const redeemed = await redeemInvitation(context, invitation.invitationToken);
  assert.equal(redeemed.statusCode, 200, redeemed.body);
  return { cookie: cookieHeader(redeemed), account: redeemed.json().account };
}

function insertPlatformOperatorMembership(
  context: TestContext,
  accountId: string,
  role: PlatformOperatorRole,
  status: PlatformOperatorStatus = "active",
): string {
  const membershipId = `platform-membership-${accountId}`;
  const now = new Date().toISOString();
  context.store.db.prepare(`INSERT INTO platform_operator_memberships
    (id, account_id, role, status, created_at, updated_at, granted_by_account_id)
    VALUES (?, ?, ?, ?, ?, ?, NULL)`).run(membershipId, accountId, role, status, now, now);
  return membershipId;
}

function createCanonicalAccountSession(context: TestContext, accountId: string, suffix: string) {
  const token = `platform-session-${suffix}-${"x".repeat(48)}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invitationId = `platform-invitation-${suffix}`;
  const sessionId = `platform-session-id-${suffix}`;
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  context.store.db.prepare(`INSERT INTO account_invitations
    (id, account_id, token_hash, status, expires_at, redeemed_at, revoked_at, created_by_actor_id, creation_idempotency_key, created_at, updated_at)
    VALUES (?, ?, ?, 'redeemed', ?, ?, NULL, 'test-bootstrap', ?, ?, ?)`).run(
    invitationId, accountId, createHash("sha256").update(`invitation-${suffix}`).digest("hex"), expiresAt, now, `platform-invitation-key-${suffix}`, now, now,
  );
  context.store.db.prepare(`INSERT INTO account_sessions
    (id, account_id, token_hash, expires_at, revoked_at, created_from_invitation_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`).run(sessionId, accountId, tokenHash, expiresAt, invitationId, now, now);
  return { cookie: `looper_session=${token}`, sessionId, token };
}

async function createAdminTaskCodeTransactionFixture(context: TestContext, suffix: string) {
  const { application, mission } = await onboardMerchant(context.app, `admin-task-code-query-${suffix}@example.com`);
  const merchant = context.store.getMerchant(application.merchantId);
  const accountId = `admin-task-code-query-${suffix}`;
  insertTestAccount(context.store.db, accountId);
  const membership = await createAdminMembership(context, membershipPayload(accountId, merchant.brandId, { merchantId: merchant.id, role: "branch_staff" }));
  assert.equal(membership.statusCode, 201, membership.body);
  const session = await createMerchantAuthSession(context, accountId, `admin-task-code-query-${suffix}`);
  const current = await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${merchant.id}`, headers: { cookie: session.cookie } });
  assert.equal(current.statusCode, 200, current.body);
  const accepted = await context.app.inject({ method: "POST", url: `/missions/${mission.id}/accept`, payload: { userId: "user-demo" } });
  assert.equal(accepted.statusCode, 201, accepted.body);
  const taskCode = current.json().code as string;
  const submitted = await context.app.inject({
    method: "POST",
    url: "/task-code-submissions",
    payload: { userId: "user-demo", missionId: mission.id, merchantId: merchant.id, code: taskCode, idempotencyKey: `admin-task-code-query-submit-${suffix}` },
  });
  assert.equal(submitted.statusCode, 201, submitted.body);
  return { merchant, mission, accountId, session, taskCode, submission: submitted.json() };
}

async function decideAdminTaskCodeTransactionFixture(
  context: TestContext,
  fixture: Awaited<ReturnType<typeof createAdminTaskCodeTransactionFixture>>,
  decision: "confirm" | "reject",
  suffix: string,
) {
  const response = await context.app.inject({
    method: "POST",
    url: `/merchant/task-code-submissions/${fixture.submission.id}/decision`,
    headers: { cookie: fixture.session.cookie, origin: "https://merchant.test" },
    payload: { merchantId: fixture.merchant.id, decision, idempotencyKey: `admin-task-code-query-decision-${suffix}` },
  });
  assert.equal(response.statusCode, 200, response.body);
  return response;
}

async function submitAdditionalAdminTaskCodeTransactions(
  context: TestContext,
  fixture: Awaited<ReturnType<typeof createAdminTaskCodeTransactionFixture>>,
  count: number,
  suffix: string,
) {
  const submissions = [fixture.submission];
  for (let index = 1; index < count; index += 1) {
    const response = await context.app.inject({
      method: "POST",
      url: "/task-code-submissions",
      payload: {
        userId: "user-demo",
        missionId: fixture.mission.id,
        merchantId: fixture.merchant.id,
        code: fixture.taskCode,
        idempotencyKey: `admin-task-code-query-${suffix}-${index}`,
      },
    });
    assert.equal(response.statusCode, 201, response.body);
    submissions.push(response.json());
  }
  return submissions;
}

async function createMerchantHistoryBrand(context: TestContext, suffix: string) {
  const { application, mission: mainMission } = await onboardMerchant(context.app, `merchant-history-${suffix}@example.com`);
  const mainMerchant = context.store.getMerchant(application.merchantId);
  const branchResponse = await createAdminBranch(context, mainMerchant.brandId, {
    branchCode: `history-${suffix}`.slice(0, 32),
    storeName: `核銷紀錄 ${suffix} 分店`,
    rewardCategory: "general",
  });
  assert.equal(branchResponse.statusCode, 201, branchResponse.body);
  const branchMerchant = context.store.getMerchant(branchResponse.json().merchantId);
  const branchMissionId = `mission-history-${suffix}`;
  context.store.db.prepare(`INSERT INTO missions (id, merchant_id, mission_type, title, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(branchMissionId, branchMerchant.id, `history_${suffix}`, `分店任務 ${suffix}`, "核銷紀錄測試任務", new Date().toISOString());
  const branchMission = context.store.getMission(branchMissionId);

  const seederAccountId = `history-seeder-${suffix}`;
  insertTestAccount(context.store.db, seederAccountId);
  const membership = await createAdminMembership(context, membershipPayload(seederAccountId, mainMerchant.brandId, { role: "brand_manager" }));
  assert.equal(membership.statusCode, 201, membership.body);
  const seederSession = await createMerchantAuthSession(context, seederAccountId, `history-seeder-${suffix}`);
  return {
    brandId: mainMerchant.brandId,
    main: { merchant: mainMerchant, mission: mainMission },
    branch: { merchant: branchMerchant, mission: branchMission },
    seeder: { accountId: seederAccountId, session: seederSession },
  };
}

async function createMerchantHistoryAccount(
  context: TestContext,
  fixture: Awaited<ReturnType<typeof createMerchantHistoryBrand>>,
  role: "brand_owner" | "brand_manager" | "branch_manager" | "branch_staff",
  suffix: string,
  merchantId = fixture.main.merchant.id,
) {
  const accountId = `history-${role}-${suffix}`;
  insertTestAccount(context.store.db, accountId);
  const branchRole = role === "branch_manager" || role === "branch_staff";
  const membership = await createAdminMembership(context, membershipPayload(accountId, fixture.brandId, { role, ...(branchRole ? { merchantId } : {}) }));
  assert.equal(membership.statusCode, 201, membership.body);
  const session = await createMerchantAuthSession(context, accountId, `history-${role}-${suffix}`);
  return { accountId, membershipId: membership.json().membershipId as string, session };
}

async function createMerchantHistorySubmission(
  context: TestContext,
  fixture: Awaited<ReturnType<typeof createMerchantHistoryBrand>>,
  target: typeof fixture.main,
  status: "pending" | "settled" | "rejected" | "expired",
  suffix: string,
  userId = `history-player-${suffix}`,
) {
  const user = context.store.db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) context.store.createPlayerProfile(userId, `核銷玩家 ${suffix}`);
  const enrollment = context.store.db.prepare("SELECT status FROM mission_enrollments WHERE user_id = ? AND mission_id = ?").get(userId, target.mission.id);
  if (!enrollment) {
    const accepted = await context.app.inject({ method: "POST", url: `/missions/${target.mission.id}/accept`, payload: { userId } });
    assert.equal(accepted.statusCode, 201, accepted.body);
  }
  const current = await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${target.merchant.id}`, headers: { cookie: fixture.seeder.session.cookie } });
  assert.equal(current.statusCode, 200, current.body);
  const submitted = await context.app.inject({
    method: "POST",
    url: "/task-code-submissions",
    payload: { userId, missionId: target.mission.id, merchantId: target.merchant.id, code: current.json().code, idempotencyKey: `history-submit-${suffix}` },
  });
  assert.equal(submitted.statusCode, 201, submitted.body);
  if (status === "pending") return submitted.json();
  if (status === "expired") {
    context.store.db.prepare("UPDATE task_code_submissions SET confirmation_expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), submitted.json().id);
    const canonicalExpiry = await context.app.inject({ method: "GET", url: `/merchant/task-code-submissions?merchantId=${target.merchant.id}&status=pending`, headers: { cookie: fixture.seeder.session.cookie } });
    assert.equal(canonicalExpiry.statusCode, 200, canonicalExpiry.body);
    assert.equal((context.store.db.prepare("SELECT status FROM task_code_submissions WHERE id = ?").get(submitted.json().id) as { status: string }).status, "expired");
    return submitted.json();
  }
  const decision = await context.app.inject({
    method: "POST",
    url: `/merchant/task-code-submissions/${submitted.json().id}/decision`,
    headers: { cookie: fixture.seeder.session.cookie, origin: "https://merchant.test" },
    payload: { merchantId: target.merchant.id, decision: status === "settled" ? "confirm" : "reject", idempotencyKey: `history-decision-${suffix}` },
  });
  assert.equal(decision.statusCode, 200, decision.body);
  return submitted.json();
}

test("admin task code transaction query returns canonical settled links and stored reward summary without side effects", async () => {
  const context = await setup();
  try {
    const fixture = await createAdminTaskCodeTransactionFixture(context, "settled");
    await decideAdminTaskCodeTransactionFixture(context, fixture, "confirm", "settled");
    const submissionRow = context.store.db.prepare("SELECT redemption_id, reward_event_id FROM task_code_submissions WHERE id = ?").get(fixture.submission.id) as { redemption_id: string; reward_event_id: string };
    const rewardRow = context.store.db.prepare("SELECT reward_payload_json, level_summary_json, rule_version FROM reward_events WHERE id = ?").get(submissionRow.reward_event_id) as { reward_payload_json: string; level_summary_json: string; rule_version: string };
    const storedReward = JSON.parse(rewardRow.reward_payload_json) as { stars: number; exp: number; energy: number; carbonGrams: number };
    const storedLevel = JSON.parse(rewardRow.level_summary_json) as { previousLevel: number; currentLevel: number; rewards: Array<{ stars: number }> };
    const before = {
      rewards: countRows(context, "reward_events"),
      ledger: countRows(context, "resource_transactions"),
      redemptions: countRows(context, "redemptions"),
      audits: countRows(context, "audit_events"),
    };

    const response = await context.app.inject({ method: "GET", url: "/admin/task-code-submissions?status=settled", headers: adminHeaders });
    assert.equal(response.statusCode, 200, response.body);
    const page = response.json();
    assert.equal(page.items.length, 1);
    assert.equal(page.nextCursor, null);
    const item = page.items[0];
    assert.equal(item.submissionId, fixture.submission.id);
    assert.equal(item.userId, "user-demo");
    assert.equal(item.missionId, fixture.mission.id);
    assert.equal(item.missionTitle, fixture.mission.title);
    assert.equal(item.brandId, fixture.merchant.brandId);
    assert.equal(item.brandDisplayName, fixture.merchant.brandDisplayName);
    assert.equal(item.merchantId, fixture.merchant.id);
    assert.equal(item.merchantStoreName, fixture.merchant.storeName);
    assert.equal(item.merchantBranchCode, fixture.merchant.branchCode);
    assert.equal(item.redemptionId, submissionRow.redemption_id);
    assert.equal(item.rewardEventId, submissionRow.reward_event_id);
    assert.equal(item.confirmedAt, item.decidedAt);
    assert.equal(item.decidedBy, fixture.accountId);
    assert.ok(item.settledAt);
    assert.deepEqual(item.settlementSummary, {
      baseStars: storedReward.stars,
      exp: storedReward.exp,
      energy: storedReward.energy,
      carbonGrams: storedReward.carbonGrams,
      chestStars: storedLevel.rewards.reduce((sum, reward) => sum + reward.stars, 0),
      levelBefore: storedLevel.previousLevel,
      levelAfter: storedLevel.currentLevel,
      ruleVersion: rewardRow.rule_version,
    });
    assert.deepEqual({
      rewards: countRows(context, "reward_events"),
      ledger: countRows(context, "resource_transactions"),
      redemptions: countRows(context, "redemptions"),
      audits: countRows(context, "audit_events"),
    }, before);

    const forbiddenKeys = new Set(["code", "codeHash", "taskCodeSecret", "invitationToken", "sessionToken", "tokenHash", "idempotencyKey", "decisionIdempotencyKey"]);
    const inspectKeys = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(inspectKeys);
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        assert.equal(forbiddenKeys.has(key), false, `sensitive key returned: ${key}`);
        inspectKeys(child);
      }
    };
    inspectKeys(page);

    for (const headers of [{ "x-looper-role": "user" }, merchantHeaders, {}]) {
      const denied = await context.app.inject({ method: "GET", url: "/admin/task-code-submissions", headers });
      assert.equal(denied.statusCode, 403, denied.body);
    }
  } finally {
    await context.close();
  }
});

test("admin task code transaction query filters pending rejected and expired without settlement data", async () => {
  const context = await setup();
  try {
    const pending = await createAdminTaskCodeTransactionFixture(context, "pending");
    const rejected = await createAdminTaskCodeTransactionFixture(context, "rejected");
    await decideAdminTaskCodeTransactionFixture(context, rejected, "reject", "rejected");
    const expired = await createAdminTaskCodeTransactionFixture(context, "expired");
    context.store.db.prepare("UPDATE task_code_submissions SET confirmation_expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), expired.submission.id);

    for (const [status, submissionId] of [["pending", pending.submission.id], ["rejected", rejected.submission.id], ["expired", expired.submission.id]] as const) {
      const response = await context.app.inject({ method: "GET", url: `/admin/task-code-submissions?status=${status}`, headers: adminHeaders });
      assert.equal(response.statusCode, 200, response.body);
      const items = response.json().items;
      assert.equal(items.length, 1);
      assert.equal(items[0].submissionId, submissionId);
      assert.equal(items[0].status, status);
      assert.equal(items[0].redemptionId, null);
      assert.equal(items[0].rewardEventId, null);
      assert.equal(items[0].settlementSummary, null);
    }
  } finally {
    await context.close();
  }
});

test("admin task code transaction query applies brand merchant and mission filters through canonical joins", async () => {
  const context = await setup();
  try {
    const first = await createAdminTaskCodeTransactionFixture(context, "filters-first");
    const second = await createAdminTaskCodeTransactionFixture(context, "filters-second");
    const cases = [
      [`brandId=${first.merchant.brandId}`, first.submission.id],
      [`merchantId=${first.merchant.id}`, first.submission.id],
      [`missionId=${first.mission.id}`, first.submission.id],
      [`brandId=${first.merchant.brandId}&merchantId=${first.merchant.id}&missionId=${first.mission.id}`, first.submission.id],
      [`brandId=${second.merchant.brandId}&merchantId=${second.merchant.id}`, second.submission.id],
    ];
    for (const [query, expectedId] of cases) {
      const response = await context.app.inject({ method: "GET", url: `/admin/task-code-submissions?${query}`, headers: adminHeaders });
      assert.equal(response.statusCode, 200, response.body);
      assert.deepEqual(response.json().items.map((item: { submissionId: string }) => item.submissionId), [expectedId]);
    }
    const mismatch = await context.app.inject({ method: "GET", url: `/admin/task-code-submissions?brandId=${first.merchant.brandId}&merchantId=${second.merchant.id}`, headers: adminHeaders });
    const missing = await context.app.inject({ method: "GET", url: "/admin/task-code-submissions?brandId=missing-brand&merchantId=missing-merchant", headers: adminHeaders });
    assert.deepEqual(mismatch.json().items, []);
    assert.deepEqual(missing.json().items, []);
  } finally {
    await context.close();
  }
});

test("admin task code transaction query paginates identical timestamps stably without gaps or duplicates", async () => {
  const context = await setup();
  try {
    const fixture = await createAdminTaskCodeTransactionFixture(context, "pagination");
    const submissions = await submitAdditionalAdminTaskCodeTransactions(context, fixture, 5, "pagination");
    const sameCreatedAt = "2026-07-17T00:00:00.000Z";
    context.store.db.prepare("UPDATE task_code_submissions SET submitted_at = ? WHERE merchant_id = ?").run(sameCreatedAt, fixture.merchant.id);
    const expected = submissions.map((submission) => submission.id as string).sort().reverse();
    const collected: string[] = [];
    let cursor: string | null = null;
    do {
      const url: string = `/admin/task-code-submissions?merchantId=${fixture.merchant.id}&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const response = await context.app.inject({ method: "GET", url, headers: adminHeaders });
      assert.equal(response.statusCode, 200, response.body);
      const page = response.json() as { items: Array<{ submissionId: string; createdAt: string }>; nextCursor: string | null };
      collected.push(...page.items.map((item: { submissionId: string; createdAt: string }) => {
        assert.equal(item.createdAt, sameCreatedAt);
        return item.submissionId;
      }));
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(collected, expected);
    assert.equal(new Set(collected).size, submissions.length);
  } finally {
    await context.close();
  }
});

test("admin task code transaction query enforces default maximum and invalid query parameters", async () => {
  const context = await setup();
  try {
    const fixture = await createAdminTaskCodeTransactionFixture(context, "limits");
    await submitAdditionalAdminTaskCodeTransactions(context, fixture, 21, "limits");
    const defaultPage = await context.app.inject({ method: "GET", url: `/admin/task-code-submissions?merchantId=${fixture.merchant.id}`, headers: adminHeaders });
    assert.equal(defaultPage.statusCode, 200, defaultPage.body);
    assert.equal(defaultPage.json().items.length, 20);
    assert.equal(typeof defaultPage.json().nextCursor, "string");
    const maximum = await context.app.inject({ method: "GET", url: `/admin/task-code-submissions?merchantId=${fixture.merchant.id}&limit=100`, headers: adminHeaders });
    assert.equal(maximum.statusCode, 200, maximum.body);
    assert.equal(maximum.json().items.length, 21);
    assert.equal(maximum.json().nextCursor, null);
    for (const query of ["status=unknown", "limit=0", "limit=101", "limit=1.5", "cursor=not-a-valid-cursor"]) {
      const invalid = await context.app.inject({ method: "GET", url: `/admin/task-code-submissions?${query}`, headers: adminHeaders });
      assert.equal(invalid.statusCode, 400, `${query}: ${invalid.body}`);
    }
  } finally {
    await context.close();
  }
});

test("merchant task code history requires a real active session and ignores spoofed auth headers", async () => {
  const context = await setup();
  try {
    const fixture = await createMerchantHistoryBrand(context, "auth");
    const subject = await createMerchantHistoryAccount(context, fixture, "branch_staff", "auth");
    const missing = await context.app.inject({ method: "GET", url: "/merchant/task-code-submissions/history" });
    const spoofed = await context.app.inject({ method: "GET", url: "/merchant/task-code-submissions/history", headers: { "x-looper-role": "merchant", "x-looper-account-id": subject.accountId } });
    assert.equal(missing.statusCode, 401, missing.body);
    assert.equal(spoofed.statusCode, 401, spoofed.body);

    const sessionId = subject.session.account.sessionId;
    context.store.db.prepare("UPDATE account_sessions SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), sessionId);
    assert.equal((await context.app.inject({ method: "GET", url: "/merchant/task-code-submissions/history", headers: { cookie: subject.session.cookie } })).statusCode, 401);
    context.store.db.prepare("UPDATE account_sessions SET expires_at = ?, revoked_at = ? WHERE id = ?").run(new Date(Date.now() + 60_000).toISOString(), new Date().toISOString(), sessionId);
    assert.equal((await context.app.inject({ method: "GET", url: "/merchant/task-code-submissions/history", headers: { cookie: subject.session.cookie } })).statusCode, 401);
    context.store.db.prepare("UPDATE account_sessions SET revoked_at = NULL WHERE id = ?").run(sessionId);
    context.store.db.prepare("UPDATE accounts SET status = 'suspended' WHERE id = ?").run(subject.accountId);
    assert.equal((await context.app.inject({ method: "GET", url: "/merchant/task-code-submissions/history", headers: { cookie: subject.session.cookie } })).statusCode, 401);
  } finally {
    await context.close();
  }
});

test("merchant task code history limits branch staff and managers without changing the pending endpoint", async () => {
  const context = await setup();
  try {
    const fixture = await createMerchantHistoryBrand(context, "branch-scope");
    const mainSettled = await createMerchantHistorySubmission(context, fixture, fixture.main, "settled", "branch-main-settled");
    await createMerchantHistorySubmission(context, fixture, fixture.branch, "settled", "branch-other-settled");
    const subjects = [];
    for (const role of ["branch_staff", "branch_manager"] as const) {
      const subject = await createMerchantHistoryAccount(context, fixture, role, `scope-${role}`);
      subjects.push(subject);
      const allAuthorized = await context.app.inject({ method: "GET", url: "/merchant/task-code-submissions/history", headers: { cookie: subject.session.cookie } });
      assert.equal(allAuthorized.statusCode, 200, allAuthorized.body);
      assert.deepEqual(allAuthorized.json().items.map((item: { submissionId: string }) => item.submissionId), [mainSettled.id]);
      const own = await context.app.inject({ method: "GET", url: `/merchant/task-code-submissions/history?merchantId=${fixture.main.merchant.id}`, headers: { cookie: subject.session.cookie } });
      const other = await context.app.inject({ method: "GET", url: `/merchant/task-code-submissions/history?merchantId=${fixture.branch.merchant.id}`, headers: { cookie: subject.session.cookie } });
      assert.equal(own.statusCode, 200, own.body);
      assert.equal(other.statusCode, 403, other.body);
      assert.equal(JSON.stringify(other.json()).includes(fixture.main.merchant.id), false);
      assert.equal(JSON.stringify(other.json()).includes(fixture.branch.merchant.id), false);
    }

    const pending = await createMerchantHistorySubmission(context, fixture, fixture.main, "pending", "branch-pending");
    const pendingResponse = await context.app.inject({ method: "GET", url: `/merchant/task-code-submissions?merchantId=${fixture.main.merchant.id}&status=pending`, headers: { cookie: subjects[0].session.cookie } });
    assert.equal(pendingResponse.statusCode, 200, pendingResponse.body);
    assert.ok(pendingResponse.json().some((item: { id: string }) => item.id === pending.id));
    const history = await context.app.inject({ method: "GET", url: "/merchant/task-code-submissions/history", headers: { cookie: subjects[0].session.cookie } });
    assert.equal(history.json().items.some((item: { submissionId: string }) => item.submissionId === pending.id), false);
  } finally {
    await context.close();
  }
});

test("merchant task code history gives brand roles all active branches and terminal stored results only", async () => {
  const context = await setup();
  try {
    const fixture = await createMerchantHistoryBrand(context, "brand-scope");
    const settled = await createMerchantHistorySubmission(context, fixture, fixture.main, "settled", "brand-settled");
    const rejected = await createMerchantHistorySubmission(context, fixture, fixture.branch, "rejected", "brand-rejected");
    const expired = await createMerchantHistorySubmission(context, fixture, fixture.branch, "expired", "brand-expired");
    const pending = await createMerchantHistorySubmission(context, fixture, fixture.main, "pending", "brand-pending");
    const roleSessions: Record<string, string> = {};
    for (const role of ["brand_manager", "brand_owner"] as const) {
      const subject = await createMerchantHistoryAccount(context, fixture, role, `scope-${role}`);
      roleSessions[role] = subject.session.cookie;
      const response = await context.app.inject({ method: "GET", url: "/merchant/task-code-submissions/history", headers: { cookie: subject.session.cookie } });
      assert.equal(response.statusCode, 200, response.body);
      const ids = response.json().items.map((item: { submissionId: string }) => item.submissionId).sort();
      assert.deepEqual(ids, [settled.id, rejected.id, expired.id].sort());
      assert.equal(ids.includes(pending.id), false);
      assert.deepEqual([...new Set(response.json().items.map((item: { merchantId: string }) => item.merchantId))].sort(), [fixture.main.merchant.id, fixture.branch.merchant.id].sort());
    }

    const rejectedFilter = await context.app.inject({ method: "GET", url: "/merchant/task-code-submissions/history?status=rejected", headers: { cookie: roleSessions.brand_manager } });
    assert.deepEqual(rejectedFilter.json().items.map((item: { submissionId: string }) => item.submissionId), [rejected.id]);
    const missionFilter = await context.app.inject({ method: "GET", url: `/merchant/task-code-submissions/history?missionId=${fixture.branch.mission.id}`, headers: { cookie: roleSessions.brand_manager } });
    assert.deepEqual(missionFilter.json().items.map((item: { submissionId: string }) => item.submissionId).sort(), [rejected.id, expired.id].sort());
    for (const invalidStatus of ["pending", "confirmed"]) {
      const invalid = await context.app.inject({ method: "GET", url: `/merchant/task-code-submissions/history?status=${invalidStatus}`, headers: { cookie: roleSessions.brand_manager } });
      assert.equal(invalid.statusCode, 400, invalid.body);
    }

    const response = await context.app.inject({ method: "GET", url: "/merchant/task-code-submissions/history", headers: { cookie: roleSessions.brand_manager } });
    const settledItem = response.json().items.find((item: { submissionId: string }) => item.submissionId === settled.id);
    const submissionRow = context.store.db.prepare("SELECT reward_event_id FROM task_code_submissions WHERE id = ?").get(settled.id) as { reward_event_id: string };
    const rewardRow = context.store.db.prepare("SELECT reward_payload_json, rule_version FROM reward_events WHERE id = ?").get(submissionRow.reward_event_id) as { reward_payload_json: string; rule_version: string };
    const storedReward = JSON.parse(rewardRow.reward_payload_json) as { stars: number; exp: number; energy: number; carbonGrams: number };
    assert.deepEqual(settledItem.settlementSummary, { baseStars: storedReward.stars, exp: storedReward.exp, energy: storedReward.energy, carbonGrams: storedReward.carbonGrams, ruleVersion: rewardRow.rule_version });
    assert.equal(settledItem.playerDisplayName, "核銷玩家 brand-settled");
    for (const item of response.json().items.filter((entry: { status: string }) => entry.status !== "settled")) {
      assert.equal(item.redemptionId, null);
      assert.equal(item.rewardEventId, null);
      assert.equal(item.settlementSummary, null);
    }
    const forbiddenKeys = new Set(["code", "codeHash", "taskCodeSecret", "invitationToken", "sessionToken", "tokenHash", "decisionIdempotencyKey", "idempotencyKey", "ruleSnapshot", "ruleSnapshotJson", "chestStars", "levelBefore", "levelAfter", "resources", "growthSummary", "levelSummary", "unlockFlags", "confirmedAt"]);
    const inspect = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(inspect);
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        assert.equal(forbiddenKeys.has(key), false, `forbidden history key: ${key}`);
        inspect(child);
      }
    };
    inspect(response.json());
  } finally {
    await context.close();
  }
});

test("merchant task code history merges valid memberships across brands", async () => {
  const context = await setup();
  try {
    const first = await createMerchantHistoryBrand(context, "multi-a");
    const second = await createMerchantHistoryBrand(context, "multi-b");
    const firstSubmission = await createMerchantHistorySubmission(context, first, first.main, "settled", "multi-a-settled");
    const secondSubmission = await createMerchantHistorySubmission(context, second, second.main, "rejected", "multi-b-rejected");
    const accountId = "history-multi-brand-account";
    insertTestAccount(context.store.db, accountId);
    assert.equal((await createAdminMembership(context, membershipPayload(accountId, first.brandId, { role: "brand_manager" }))).statusCode, 201);
    assert.equal((await createAdminMembership(context, membershipPayload(accountId, second.brandId, { role: "brand_owner" }))).statusCode, 201);
    const session = await createMerchantAuthSession(context, accountId, "history-multi-brand");
    const response = await context.app.inject({ method: "GET", url: "/merchant/task-code-submissions/history", headers: { cookie: session.cookie } });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().items.map((item: { submissionId: string }) => item.submissionId).sort(), [firstSubmission.id, secondSubmission.id].sort());
  } finally {
    await context.close();
  }
});

test("merchant task code history excludes inactive membership suspended brand and suspended branch", async () => {
  const context = await setup();
  try {
    const fixture = await createMerchantHistoryBrand(context, "inactive");
    await createMerchantHistorySubmission(context, fixture, fixture.main, "settled", "inactive-settled");
    const inactive = await createMerchantHistoryAccount(context, fixture, "branch_staff", "inactive-membership");
    context.store.db.prepare("UPDATE merchant_operator_memberships SET status = 'left' WHERE id = ?").run(inactive.membershipId);
    const inactiveResponse = await context.app.inject({ method: "GET", url: "/merchant/task-code-submissions/history", headers: { cookie: inactive.session.cookie } });
    assert.equal(inactiveResponse.statusCode, 403, inactiveResponse.body);

    const brand = await createMerchantHistoryAccount(context, fixture, "brand_manager", "suspended-brand");
    context.store.db.prepare("UPDATE merchant_brands SET status = 'suspended' WHERE id = ?").run(fixture.brandId);
    const brandResponse = await context.app.inject({ method: "GET", url: "/merchant/task-code-submissions/history", headers: { cookie: brand.session.cookie } });
    assert.equal(brandResponse.statusCode, 403, brandResponse.body);
    context.store.db.prepare("UPDATE merchant_brands SET status = 'active' WHERE id = ?").run(fixture.brandId);

    const branch = await createMerchantHistoryAccount(context, fixture, "branch_manager", "suspended-branch");
    context.store.db.prepare("UPDATE merchants SET status = 'suspended' WHERE id = ?").run(fixture.main.merchant.id);
    const branchResponse = await context.app.inject({ method: "GET", url: "/merchant/task-code-submissions/history", headers: { cookie: branch.session.cookie } });
    assert.equal(branchResponse.statusCode, 403, branchResponse.body);
  } finally {
    await context.close();
  }
});

test("merchant task code history paginates stably validates input and has no write side effects", async () => {
  const context = await setup();
  try {
    const fixture = await createMerchantHistoryBrand(context, "pagination");
    const subject = await createMerchantHistoryAccount(context, fixture, "brand_manager", "pagination");
    const settledIds: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const submission = await createMerchantHistorySubmission(context, fixture, fixture.main, "settled", `pagination-settled-${index}`);
      settledIds.push(submission.id);
    }
    for (let index = 0; index < 21; index += 1) {
      await createMerchantHistorySubmission(context, fixture, fixture.branch, "rejected", `pagination-rejected-${index}`, "history-limit-player");
    }
    const sameSubmittedAt = "2026-07-17T00:00:00.000Z";
    context.store.db.prepare("UPDATE task_code_submissions SET submitted_at = ? WHERE merchant_id = ? AND status = 'settled'").run(sameSubmittedAt, fixture.main.merchant.id);
    const before = {
      rewards: countRows(context, "reward_events"),
      ledger: countRows(context, "resource_transactions"),
      redemptions: countRows(context, "redemptions"),
      audits: countRows(context, "audit_events"),
      submissions: JSON.stringify(context.store.db.prepare("SELECT id, status, redemption_id, reward_event_id FROM task_code_submissions ORDER BY id").all()),
    };

    const collected: string[] = [];
    let cursor: string | null = null;
    do {
      const url: string = `/merchant/task-code-submissions/history?status=settled&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const response = await context.app.inject({ method: "GET", url, headers: { cookie: subject.session.cookie } });
      assert.equal(response.statusCode, 200, response.body);
      const page = response.json() as { items: Array<{ submissionId: string; submittedAt: string }>; nextCursor: string | null };
      collected.push(...page.items.map((item) => {
        assert.equal(item.submittedAt, sameSubmittedAt);
        return item.submissionId;
      }));
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(collected, settledIds.sort().reverse());
    assert.equal(new Set(collected).size, settledIds.length);

    const defaultLimit = await context.app.inject({ method: "GET", url: "/merchant/task-code-submissions/history?status=rejected", headers: { cookie: subject.session.cookie } });
    assert.equal(defaultLimit.json().items.length, 20);
    assert.equal(typeof defaultLimit.json().nextCursor, "string");
    const maximum = await context.app.inject({ method: "GET", url: "/merchant/task-code-submissions/history?status=rejected&limit=100", headers: { cookie: subject.session.cookie } });
    assert.equal(maximum.json().items.length, 21);
    assert.equal(maximum.json().nextCursor, null);
    for (const query of ["limit=0", "limit=101", "limit=1.5", "cursor=invalid-cursor", "status=pending", "status=confirmed"]) {
      const invalid = await context.app.inject({ method: "GET", url: `/merchant/task-code-submissions/history?${query}`, headers: { cookie: subject.session.cookie } });
      assert.equal(invalid.statusCode, 400, `${query}: ${invalid.body}`);
    }
    const missingMerchant = await context.app.inject({ method: "GET", url: "/merchant/task-code-submissions/history?merchantId=missing-merchant", headers: { cookie: subject.session.cookie } });
    assert.equal(missingMerchant.statusCode, 404, missingMerchant.body);
    assert.equal(/SELECT|SQL|stack|authorizedMerchantIds/i.test(missingMerchant.body), false);

    assert.deepEqual({
      rewards: countRows(context, "reward_events"),
      ledger: countRows(context, "resource_transactions"),
      redemptions: countRows(context, "redemptions"),
      audits: countRows(context, "audit_events"),
      submissions: JSON.stringify(context.store.db.prepare("SELECT id, status, redemption_id, reward_event_id FROM task_code_submissions ORDER BY id").all()),
    }, before);
  } finally {
    await context.close();
  }
});

test("legacy reporting eligibility exposes immutable submitted scope without changing current display joins", async () => {
  const context = await setup();
  try {
    const fixture = await createAdminTaskCodeTransactionFixture(context, "eligibility-scope");
    const originalScope = {
      brandId: fixture.merchant.brandId,
      brandDisplayName: fixture.merchant.brandDisplayName,
      merchantId: fixture.merchant.id,
      branchCode: fixture.merchant.branchCode,
      branchDisplayName: fixture.merchant.storeName,
    };
    context.store.db.prepare("UPDATE merchant_brands SET display_name = ? WHERE id = ?").run("目前品牌名稱", fixture.merchant.brandId);
    context.store.db.prepare("UPDATE merchants SET store_name = ?, branch_code = ? WHERE id = ?").run("目前分店名稱", "current-branch", fixture.merchant.id);
    const before = {
      submissions: countRows(context, "task_code_submissions"),
      snapshots: countRows(context, "task_code_submission_scope_snapshots"),
      rewards: countRows(context, "reward_events"),
      ledger: countRows(context, "resource_transactions"),
      redemptions: countRows(context, "redemptions"),
      audits: countRows(context, "audit_events"),
    };

    const response = await context.app.inject({ method: "GET", url: `/admin/task-code-submissions?status=pending&missionId=${fixture.mission.id}`, headers: adminHeaders });
    assert.equal(response.statusCode, 200, response.body);
    const item = response.json().items.find((candidate: { submissionId: string }) => candidate.submissionId === fixture.submission.id);
    assert.ok(item);
    assert.equal(item.brandDisplayName, "目前品牌名稱");
    assert.equal(item.merchantStoreName, "目前分店名稱");
    assert.equal(item.merchantBranchCode, "current-branch");
    assert.deepEqual(item.reportingScope, {
      snapshotVersion: TASK_CODE_SCOPE_SNAPSHOT_VERSION,
      capturedAt: fixture.submission.submittedAt,
      reportingTimezone: "Asia/Taipei",
      ...originalScope,
    });
    assert.equal(item.displayScopeSource, "snapshot");
    assert.deepEqual(item.reportingEligibility, {
      eligibleForSubmittedFlow: true,
      eligibleForTerminalFlow: null,
      eligibleForSettlement: null,
      issueCodes: [],
    });
    assert.deepEqual({
      submissions: countRows(context, "task_code_submissions"),
      snapshots: countRows(context, "task_code_submission_scope_snapshots"),
      rewards: countRows(context, "reward_events"),
      ledger: countRows(context, "resource_transactions"),
      redemptions: countRows(context, "redemptions"),
      audits: countRows(context, "audit_events"),
    }, before);

    for (const headers of [{ "x-looper-role": "user" }, merchantHeaders, {}]) {
      const denied = await context.app.inject({ method: "GET", url: "/admin/task-code-submissions", headers });
      assert.equal(denied.statusCode, 403, denied.body);
    }
  } finally {
    await context.close();
  }
});

test("legacy reporting eligibility gates settled rows by saved links payload version and rule snapshot", async () => {
  const context = await setup();
  try {
    const fixture = await createAdminTaskCodeTransactionFixture(context, "eligibility-settled");
    await decideAdminTaskCodeTransactionFixture(context, fixture, "confirm", "eligibility-settled");
    const original = context.store.db.prepare("SELECT settled_at, redemption_id, reward_event_id FROM task_code_submissions WHERE id = ?").get(fixture.submission.id) as { settled_at: string; redemption_id: string; reward_event_id: string };
    const queryItem = async () => {
      const response = await context.app.inject({ method: "GET", url: `/admin/task-code-submissions?status=settled&missionId=${fixture.mission.id}`, headers: adminHeaders });
      assert.equal(response.statusCode, 200, response.body);
      const item = response.json().items.find((candidate: { submissionId: string }) => candidate.submissionId === fixture.submission.id);
      assert.ok(item);
      return item;
    };

    const complete = await queryItem();
    assert.deepEqual(complete.reportingEligibility, {
      eligibleForSubmittedFlow: true,
      eligibleForTerminalFlow: true,
      eligibleForSettlement: true,
      issueCodes: [],
    });
    assert.ok(complete.settlementSummary);
    assert.equal("ruleSnapshot" in complete, false);
    assert.equal("ruleSnapshotJson" in complete, false);

    context.store.db.prepare("UPDATE merchants SET reward_category = 'general' WHERE id = ?").run(fixture.merchant.id);
    const afterCurrentRuleChange = await queryItem();
    assert.deepEqual(afterCurrentRuleChange.reportingEligibility, complete.reportingEligibility);
    assert.deepEqual(afterCurrentRuleChange.settlementSummary, complete.settlementSummary);

    context.store.db.prepare("UPDATE task_code_submissions SET settled_at = NULL WHERE id = ?").run(fixture.submission.id);
    const missingSettledAt = await queryItem();
    assert.equal(missingSettledAt.reportingEligibility.eligibleForTerminalFlow, false);
    assert.equal(missingSettledAt.reportingEligibility.eligibleForSettlement, false);
    assert.ok(missingSettledAt.reportingEligibility.issueCodes.includes("missing_settled_at"));

    context.store.db.prepare("UPDATE task_code_submissions SET settled_at = ?, redemption_id = NULL WHERE id = ?").run(original.settled_at, fixture.submission.id);
    const missingRedemption = await queryItem();
    assert.equal(missingRedemption.reportingEligibility.eligibleForSettlement, false);
    assert.ok(missingRedemption.reportingEligibility.issueCodes.includes("missing_redemption_link"));

    context.store.db.prepare("UPDATE task_code_submissions SET redemption_id = ?, reward_event_id = NULL WHERE id = ?").run(original.redemption_id, fixture.submission.id);
    const missingReward = await queryItem();
    assert.equal(missingReward.reportingEligibility.eligibleForSettlement, false);
    assert.ok(missingReward.reportingEligibility.issueCodes.includes("missing_reward_event_link"));

    context.store.db.prepare("UPDATE task_code_submissions SET reward_event_id = ? WHERE id = ?").run(original.reward_event_id, fixture.submission.id);
    context.store.db.prepare("UPDATE reward_events SET rule_snapshot_json = NULL WHERE id = ?").run(original.reward_event_id);
    const missingSnapshot = await queryItem();
    assert.equal(missingSnapshot.reportingEligibility.eligibleForTerminalFlow, true);
    assert.equal(missingSnapshot.reportingEligibility.eligibleForSettlement, false);
    assert.ok(missingSnapshot.reportingEligibility.issueCodes.includes("missing_reward_rule_snapshot"));
    assert.ok(missingSnapshot.settlementSummary);
  } finally {
    await context.close();
  }
});

test("legacy reporting eligibility keeps legacy terminal rows visible and merchant response privacy trimmed", async () => {
  const context = await setup();
  try {
    const fixture = await createAdminTaskCodeTransactionFixture(context, "eligibility-legacy");
    await decideAdminTaskCodeTransactionFixture(context, fixture, "reject", "eligibility-legacy");
    const source = context.store.db.prepare("SELECT * FROM task_code_submissions WHERE id = ?").get(fixture.submission.id) as {
      task_code_window_id: string;
      merchant_id: string;
      mission_id: string;
      user_id: string;
      submitted_at: string;
      confirmation_expires_at: string;
      rejected_at: string;
      decided_by: string;
    };
    const legacyRejectedId = "submission-legacy-reporting-rejected";
    const legacyExpiredId = "submission-legacy-reporting-expired";
    context.store.db.prepare(`INSERT INTO task_code_submissions
      (id, task_code_window_id, merchant_id, mission_id, user_id, status, submitted_at, confirmation_expires_at, rejected_at, idempotency_key, decided_by, decision_idempotency_key)
      VALUES (?, ?, ?, ?, ?, 'rejected', ?, ?, ?, ?, ?, ?)`).run(
        legacyRejectedId, source.task_code_window_id, source.merchant_id, source.mission_id, source.user_id,
        source.submitted_at, source.confirmation_expires_at, source.rejected_at, "legacy-reporting-rejected-key", source.decided_by, "legacy-reporting-rejected-decision",
      );
    context.store.db.prepare(`INSERT INTO task_code_submissions
      (id, task_code_window_id, merchant_id, mission_id, user_id, status, submitted_at, confirmation_expires_at, expired_at, idempotency_key)
      VALUES (?, ?, ?, ?, ?, 'expired', ?, ?, NULL, ?)`).run(
        legacyExpiredId, source.task_code_window_id, source.merchant_id, source.mission_id, source.user_id,
        source.submitted_at, source.confirmation_expires_at, "legacy-reporting-expired-key",
      );
    const before = {
      submissions: countRows(context, "task_code_submissions"),
      snapshots: countRows(context, "task_code_submission_scope_snapshots"),
      rewards: countRows(context, "reward_events"),
      ledger: countRows(context, "resource_transactions"),
      redemptions: countRows(context, "redemptions"),
      audits: countRows(context, "audit_events"),
    };

    const rejectedResponse = await context.app.inject({ method: "GET", url: `/admin/task-code-submissions?status=rejected&missionId=${fixture.mission.id}`, headers: adminHeaders });
    assert.equal(rejectedResponse.statusCode, 200, rejectedResponse.body);
    const legacyRejected = rejectedResponse.json().items.find((item: { submissionId: string }) => item.submissionId === legacyRejectedId);
    assert.ok(legacyRejected);
    assert.equal(legacyRejected.reportingScope, null);
    assert.equal(legacyRejected.displayScopeSource, "current_fallback");
    assert.equal(legacyRejected.reportingEligibility.eligibleForSubmittedFlow, false);
    assert.equal(legacyRejected.reportingEligibility.eligibleForTerminalFlow, false);
    assert.equal(legacyRejected.reportingEligibility.eligibleForSettlement, null);
    assert.deepEqual(legacyRejected.reportingEligibility.issueCodes, ["legacy_missing_scope_snapshot"]);

    const expiredResponse = await context.app.inject({ method: "GET", url: `/admin/task-code-submissions?status=expired&missionId=${fixture.mission.id}`, headers: adminHeaders });
    assert.equal(expiredResponse.statusCode, 200, expiredResponse.body);
    const legacyExpired = expiredResponse.json().items.find((item: { submissionId: string }) => item.submissionId === legacyExpiredId);
    assert.ok(legacyExpired);
    assert.equal(legacyExpired.confirmationExpiresAt, source.confirmation_expires_at);
    assert.equal(legacyExpired.expiredAt, null);
    assert.equal(legacyExpired.reportingEligibility.eligibleForTerminalFlow, false);
    assert.deepEqual(legacyExpired.reportingEligibility.issueCodes, ["legacy_missing_scope_snapshot", "missing_expired_at"]);

    const missingSession = await context.app.inject({ method: "GET", url: "/merchant/task-code-submissions/history" });
    assert.equal(missingSession.statusCode, 401, missingSession.body);
    const merchantResponse = await context.app.inject({ method: "GET", url: `/merchant/task-code-submissions/history?merchantId=${fixture.merchant.id}`, headers: { cookie: fixture.session.cookie } });
    assert.equal(merchantResponse.statusCode, 200, merchantResponse.body);
    const merchantLegacy = merchantResponse.json().items.find((item: { submissionId: string }) => item.submissionId === legacyRejectedId);
    assert.ok(merchantLegacy);
    assert.equal(merchantLegacy.reportingScope, null);
    assert.equal(merchantLegacy.displayScopeSource, "current_fallback");
    assert.deepEqual(Object.keys(merchantLegacy.reportingEligibility).sort(), ["eligibleForSettlement", "eligibleForSubmittedFlow", "eligibleForTerminalFlow", "issueCodes"]);

    const forbiddenKeys = new Set(["code", "codeHash", "secret", "taskCodeSecret", "invitationToken", "sessionToken", "token", "tokenHash", "idempotencyKey", "decisionIdempotencyKey", "ruleSnapshot", "ruleSnapshotJson", "rewardPayload", "rewardPayloadJson"]);
    const inspectKeys = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(inspectKeys);
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        assert.equal(forbiddenKeys.has(key), false, `sensitive reporting key returned: ${key}`);
        inspectKeys(child);
      }
    };
    inspectKeys(rejectedResponse.json());
    inspectKeys(expiredResponse.json());
    inspectKeys(merchantResponse.json());
    assert.deepEqual({
      submissions: countRows(context, "task_code_submissions"),
      snapshots: countRows(context, "task_code_submission_scope_snapshots"),
      rewards: countRows(context, "reward_events"),
      ledger: countRows(context, "resource_transactions"),
      redemptions: countRows(context, "redemptions"),
      audits: countRows(context, "audit_events"),
    }, before);
  } finally {
    await context.close();
  }
});

test("live monthly task code report enforces the current Taiwan month boundaries cutoff and empty contract", async () => {
  const cutoffAt = "2026-07-18T04:00:00.000Z";
  const context = await setup({ now: () => cutoffAt });
  try {
    const empty = await context.app.inject({ method: "GET", url: "/admin/reports/task-code/monthly-live?reportMonth=2026-07&brandId=missing-brand", headers: adminHeaders });
    assert.equal(empty.statusCode, 200, empty.body);
    assert.deepEqual(empty.json(), {
      reportMonth: "2026-07",
      timezone: "Asia/Taipei",
      startAtInclusive: "2026-06-30T16:00:00.000Z",
      endAtExclusive: "2026-07-31T16:00:00.000Z",
      generatedAt: cutoffAt,
      cutoffAt,
      mode: "live",
      status: "open",
      calculationVersion: "task-code-monthly-live-v1",
      scope: { kind: "brand", brandIds: ["missing-brand"], merchantIds: [] },
      summary: {
        submittedCount: 0,
        openPendingAtCutoff: 0,
        settledCount: 0,
        rejectedCount: 0,
        expiredCount: 0,
        gross: { baseStars: 0, exp: 0, energy: 0, carbonGrams: 0 },
      },
      dataQuality: {
        excludedSubmittedCount: 0,
        excludedTerminalCount: 0,
        excludedSettlementCount: 0,
        issueCounts: {
          legacy_missing_scope_snapshot: 0,
          missing_submitted_at: 0,
          missing_settled_at: 0,
          missing_rejected_at: 0,
          missing_expired_at: 0,
          missing_redemption_link: 0,
          missing_reward_event_link: 0,
          missing_reward_payload: 0,
          missing_reward_rule_version: 0,
          missing_reward_rule_snapshot: 0,
        },
      },
    });

    for (const reportMonth of ["2026-06", "2026-08"]) {
      const response = await context.app.inject({ method: "GET", url: `/admin/reports/task-code/monthly-live?reportMonth=${reportMonth}`, headers: adminHeaders });
      assert.equal(response.statusCode, 409, response.body);
      assert.equal(response.json().code, "REPORT_MONTH_NOT_LIVE");
    }
    for (const query of ["", "?reportMonth=2026-7", "?reportMonth=2026-13"]) {
      const response = await context.app.inject({ method: "GET", url: `/admin/reports/task-code/monthly-live${query}`, headers: adminHeaders });
      assert.equal(response.statusCode, 400, response.body);
    }

    const fixture = await createAdminTaskCodeTransactionFixture(context, "monthly-boundaries");
    const submissions = await submitAdditionalAdminTaskCodeTransactions(context, fixture, 4, "monthly-boundaries");
    const boundaryTimes = [
      "2026-06-30T16:00:00.000Z",
      cutoffAt,
      "2026-07-18T04:00:00.001Z",
      "2026-07-31T16:00:00.000Z",
    ];
    for (let index = 0; index < submissions.length; index += 1) {
      context.store.db.prepare("UPDATE task_code_submissions SET submitted_at = ? WHERE id = ?").run(boundaryTimes[index], submissions[index].id);
    }

    const atCutoff = await context.app.inject({ method: "GET", url: `/admin/reports/task-code/monthly-live?reportMonth=2026-07&merchantId=${fixture.merchant.id}`, headers: adminHeaders });
    assert.equal(atCutoff.statusCode, 200, atCutoff.body);
    assert.equal(atCutoff.json().summary.submittedCount, 2);
    assert.equal(atCutoff.json().summary.openPendingAtCutoff, 2);

    const endOfMonthCutoff = "2026-07-31T15:59:59.999Z";
    context.setNowProvider(() => endOfMonthCutoff);
    const atMonthEnd = await context.app.inject({ method: "GET", url: `/admin/reports/task-code/monthly-live?reportMonth=2026-07&merchantId=${fixture.merchant.id}`, headers: adminHeaders });
    assert.equal(atMonthEnd.statusCode, 200, atMonthEnd.body);
    assert.equal(atMonthEnd.json().summary.submittedCount, 3);
    assert.equal(atMonthEnd.json().summary.openPendingAtCutoff, 3);
    assert.equal(atMonthEnd.json().cutoffAt, endOfMonthCutoff);
  } finally {
    await context.close();
  }
});

test("live monthly task code report uses canonical event clocks saved gross snapshot scope and quality gates", async () => {
  let now = "2026-07-18T04:00:00.000Z";
  const context = await setup({ now: () => now });
  try {
    const fixture = await createMerchantHistoryBrand(context, "monthly-aggregation");

    now = "2026-07-10T02:00:00.000Z";
    const settled = await createMerchantHistorySubmission(context, fixture, fixture.main, "settled", "monthly-settled");
    context.store.db.prepare("UPDATE task_code_submissions SET submitted_at = ? WHERE id = ?").run("2026-06-29T02:00:00.000Z", settled.id);

    now = "2026-07-11T02:00:00.000Z";
    const rejected = await createMerchantHistorySubmission(context, fixture, fixture.main, "rejected", "monthly-rejected");
    context.store.db.prepare("UPDATE task_code_submissions SET submitted_at = ? WHERE id = ?").run("2026-06-29T03:00:00.000Z", rejected.id);

    now = "2026-07-12T02:00:00.000Z";
    const expired = await createMerchantHistorySubmission(context, fixture, fixture.main, "pending", "monthly-expired");
    context.store.db.prepare("UPDATE task_code_submissions SET status = 'expired', submitted_at = ?, expired_at = ? WHERE id = ?").run(
      "2026-06-29T04:00:00.000Z",
      now,
      expired.id,
    );

    now = "2026-07-13T02:00:00.000Z";
    const currentPending = await createMerchantHistorySubmission(context, fixture, fixture.branch, "pending", "monthly-current-pending");

    now = "2026-06-15T02:00:00.000Z";
    const priorPending = await createMerchantHistorySubmission(context, fixture, fixture.main, "pending", "monthly-prior-pending");

    now = "2026-07-14T02:00:00.000Z";
    const futureTerminal = await createMerchantHistorySubmission(context, fixture, fixture.main, "settled", "monthly-future-terminal");
    context.store.db.prepare("UPDATE task_code_submissions SET settled_at = ? WHERE id = ?").run("2026-07-20T02:00:00.000Z", futureTerminal.id);

    now = "2026-07-14T03:00:00.000Z";
    const incomplete = await createMerchantHistorySubmission(context, fixture, fixture.branch, "settled", "monthly-incomplete");
    const incompleteReward = context.store.db.prepare("SELECT reward_event_id FROM task_code_submissions WHERE id = ?").get(incomplete.id) as { reward_event_id: string };
    context.store.db.prepare("UPDATE reward_events SET rule_snapshot_json = NULL WHERE id = ?").run(incompleteReward.reward_event_id);

    now = "2026-07-15T02:00:00.000Z";
    const expiryOutsideMonth = await createMerchantHistorySubmission(context, fixture, fixture.main, "pending", "monthly-expiry-outside");
    context.store.db.prepare("UPDATE task_code_submissions SET status = 'expired', expired_at = ?, confirmation_expires_at = ? WHERE id = ?").run(
      "2026-06-29T05:00:00.000Z",
      "2026-07-15T01:59:00.000Z",
      expiryOutsideMonth.id,
    );

    const rejectedSource = context.store.db.prepare("SELECT * FROM task_code_submissions WHERE id = ?").get(rejected.id) as {
      task_code_window_id: string; merchant_id: string; mission_id: string; user_id: string;
    };
    context.store.db.prepare(`INSERT INTO task_code_submissions
      (id, task_code_window_id, merchant_id, mission_id, user_id, status, submitted_at, confirmation_expires_at, rejected_at, idempotency_key, decided_by, decision_idempotency_key)
      VALUES ('submission-monthly-legacy', ?, ?, ?, ?, 'rejected', ?, ?, ?, 'monthly-legacy-submit', 'legacy-actor', 'monthly-legacy-decision')`).run(
        rejectedSource.task_code_window_id,
        rejectedSource.merchant_id,
        rejectedSource.mission_id,
        rejectedSource.user_id,
        "2026-07-15T03:00:00.000Z",
        "2026-07-15T03:05:00.000Z",
        "2026-07-15T03:01:00.000Z",
      );
    context.store.db.prepare("UPDATE task_code_submissions SET status = 'pending', expired_at = NULL WHERE id IN (?, ?)").run(currentPending.id, priorPending.id);

    now = "2026-07-18T04:00:00.000Z";
    const settledLinks = context.store.db.prepare("SELECT reward_event_id FROM task_code_submissions WHERE id = ?").get(settled.id) as { reward_event_id: string };
    const storedRewardRow = context.store.db.prepare("SELECT reward_payload_json, level_summary_json FROM reward_events WHERE id = ?").get(settledLinks.reward_event_id) as { reward_payload_json: string; level_summary_json: string };
    const storedReward = JSON.parse(storedRewardRow.reward_payload_json) as { stars: number; exp: number; energy: number; carbonGrams: number };
    const storedLevel = JSON.parse(storedRewardRow.level_summary_json) as { rewards: Array<{ stars: number; maxEnergyIncrease: number }> };

    const platform = await context.app.inject({ method: "GET", url: "/admin/reports/task-code/monthly-live?reportMonth=2026-07", headers: adminHeaders });
    assert.equal(platform.statusCode, 200, platform.body);
    assert.deepEqual(platform.json().summary, {
      submittedCount: 4,
      openPendingAtCutoff: 3,
      settledCount: 1,
      rejectedCount: 1,
      expiredCount: 1,
      gross: { baseStars: storedReward.stars, exp: storedReward.exp, energy: storedReward.energy, carbonGrams: storedReward.carbonGrams },
    });
    assert.equal(platform.json().dataQuality.excludedSubmittedCount, 1);
    assert.equal(platform.json().dataQuality.excludedTerminalCount, 1);
    assert.equal(platform.json().dataQuality.excludedSettlementCount, 1);
    assert.equal(platform.json().dataQuality.issueCounts.legacy_missing_scope_snapshot, 1);
    assert.equal(platform.json().dataQuality.issueCounts.missing_reward_rule_snapshot, 1);
    assert.ok(storedLevel.rewards.reduce((sum, reward) => sum + reward.stars, 0) > 0);
    assert.ok(storedLevel.rewards.reduce((sum, reward) => sum + reward.maxEnergyIncrease, 0) > 0);
    assert.equal(platform.json().summary.gross.baseStars, storedReward.stars);
    assert.equal(platform.json().summary.gross.energy, storedReward.energy);

    const brand = await context.app.inject({ method: "GET", url: `/admin/reports/task-code/monthly-live?reportMonth=2026-07&brandId=${fixture.brandId}`, headers: adminHeaders });
    assert.equal(brand.statusCode, 200, brand.body);
    assert.equal(brand.json().summary.submittedCount, 4);
    assert.equal(brand.json().dataQuality.excludedSubmittedCount, 0);
    assert.equal(brand.json().dataQuality.excludedTerminalCount, 0);
    assert.equal(brand.json().dataQuality.excludedSettlementCount, 1);
    assert.equal(brand.json().dataQuality.issueCounts.legacy_missing_scope_snapshot, 0);

    const main = await context.app.inject({ method: "GET", url: `/admin/reports/task-code/monthly-live?reportMonth=2026-07&merchantId=${fixture.main.merchant.id}`, headers: adminHeaders });
    const branch = await context.app.inject({ method: "GET", url: `/admin/reports/task-code/monthly-live?reportMonth=2026-07&brandId=${fixture.brandId}&merchantId=${fixture.branch.merchant.id}`, headers: adminHeaders });
    assert.equal(main.statusCode, 200, main.body);
    assert.equal(branch.statusCode, 200, branch.body);
    assert.equal(main.json().summary.settledCount, 1);
    assert.equal(branch.json().summary.settledCount, 0);
    assert.equal(branch.json().dataQuality.excludedSettlementCount, 1);

    const economy = context.store.db.prepare("SELECT value_json FROM economy_settings WHERE key = 'core'").get() as { value_json: string };
    const changedEconomy = { ...JSON.parse(economy.value_json), redemptionExp: 99999, redemptionEnergy: 99999 };
    context.store.db.prepare("UPDATE economy_settings SET value_json = ? WHERE key = 'core'").run(JSON.stringify(changedEconomy));
    context.store.db.prepare("UPDATE merchant_brands SET display_name = '目前月份品牌' WHERE id = ?").run(fixture.brandId);
    context.store.db.prepare("UPDATE merchants SET store_name = '目前月份分店', timezone = 'Pacific/Honolulu', reward_category = 'general' WHERE id = ?").run(fixture.main.merchant.id);
    const afterCurrentRules = await context.app.inject({ method: "GET", url: `/admin/reports/task-code/monthly-live?reportMonth=2026-07&brandId=${fixture.brandId}`, headers: adminHeaders });
    assert.equal(afterCurrentRules.statusCode, 200, afterCurrentRules.body);
    assert.deepEqual(afterCurrentRules.json().summary, brand.json().summary);
    assert.equal(afterCurrentRules.json().timezone, "Asia/Taipei");
  } finally {
    await context.close();
  }
});

test("live monthly task code report shares one aggregation across admin and all merchant roles without leaking scope", async () => {
  const cutoffAt = "2026-07-18T04:00:00.000Z";
  const context = await setup({ now: () => cutoffAt });
  try {
    const fixture = await createMerchantHistoryBrand(context, "monthly-roles");
    const mainSettled = await createMerchantHistorySubmission(context, fixture, fixture.main, "settled", "monthly-role-main");
    const branchIncomplete = await createMerchantHistorySubmission(context, fixture, fixture.branch, "settled", "monthly-role-branch");
    const branchReward = context.store.db.prepare("SELECT reward_event_id FROM task_code_submissions WHERE id = ?").get(branchIncomplete.id) as { reward_event_id: string };
    context.store.db.prepare("UPDATE reward_events SET rule_snapshot_json = NULL WHERE id = ?").run(branchReward.reward_event_id);
    assert.ok(mainSettled.id);

    const brandOwner = await createMerchantHistoryAccount(context, fixture, "brand_owner", "monthly-role-owner");
    const brandManager = await createMerchantHistoryAccount(context, fixture, "brand_manager", "monthly-role-manager");
    const branchManager = await createMerchantHistoryAccount(context, fixture, "branch_manager", "monthly-role-branch-manager", fixture.main.merchant.id);
    const branchStaff = await createMerchantHistoryAccount(context, fixture, "branch_staff", "monthly-role-branch-staff", fixture.branch.merchant.id);
    const secondBrand = await createMerchantHistoryBrand(context, "monthly-other-brand");
    const inactiveMembership = await createMerchantHistoryAccount(context, fixture, "branch_staff", "monthly-inactive-membership", fixture.main.merchant.id);
    context.store.db.prepare("UPDATE merchant_operator_memberships SET status = 'suspended' WHERE id = ?").run(inactiveMembership.membershipId);

    const before = {
      submissions: JSON.stringify(context.store.db.prepare("SELECT * FROM task_code_submissions ORDER BY id").all()),
      snapshots: JSON.stringify(context.store.db.prepare("SELECT * FROM task_code_submission_scope_snapshots ORDER BY submission_id").all()),
      rewards: countRows(context, "reward_events"),
      ledger: countRows(context, "resource_transactions"),
      redemptions: countRows(context, "redemptions"),
      audits: countRows(context, "audit_events"),
    };

    const adminBrand = await context.app.inject({ method: "GET", url: `/admin/reports/task-code/monthly-live?reportMonth=2026-07&brandId=${fixture.brandId}`, headers: adminHeaders });
    const ownerReport = await context.app.inject({ method: "GET", url: "/merchant/reports/task-code/monthly-live?reportMonth=2026-07", headers: { cookie: brandOwner.session.cookie } });
    const managerReport = await context.app.inject({ method: "GET", url: "/merchant/reports/task-code/monthly-live?reportMonth=2026-07", headers: { cookie: brandManager.session.cookie } });
    for (const response of [adminBrand, ownerReport, managerReport]) assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(ownerReport.json().summary, adminBrand.json().summary);
    assert.deepEqual(ownerReport.json().dataQuality, adminBrand.json().dataQuality);
    assert.deepEqual(managerReport.json().summary, ownerReport.json().summary);
    assert.equal(ownerReport.json().scope.kind, "authorized");
    assert.deepEqual(ownerReport.json().scope.brandIds, [fixture.brandId]);
    assert.deepEqual(ownerReport.json().scope.merchantIds, []);

    const adminMain = await context.app.inject({ method: "GET", url: `/admin/reports/task-code/monthly-live?reportMonth=2026-07&merchantId=${fixture.main.merchant.id}`, headers: adminHeaders });
    const branchManagerReport = await context.app.inject({ method: "GET", url: "/merchant/reports/task-code/monthly-live?reportMonth=2026-07", headers: { cookie: branchManager.session.cookie } });
    const selectedMain = await context.app.inject({ method: "GET", url: `/merchant/reports/task-code/monthly-live?reportMonth=2026-07&merchantId=${fixture.main.merchant.id}`, headers: { cookie: branchManager.session.cookie } });
    for (const response of [adminMain, branchManagerReport, selectedMain]) assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(branchManagerReport.json().summary, adminMain.json().summary);
    assert.deepEqual(selectedMain.json().summary, adminMain.json().summary);
    assert.equal(branchManagerReport.json().dataQuality.excludedSettlementCount, 0);

    const adminBranch = await context.app.inject({ method: "GET", url: `/admin/reports/task-code/monthly-live?reportMonth=2026-07&merchantId=${fixture.branch.merchant.id}`, headers: adminHeaders });
    const branchStaffReport = await context.app.inject({ method: "GET", url: "/merchant/reports/task-code/monthly-live?reportMonth=2026-07", headers: { cookie: branchStaff.session.cookie } });
    assert.equal(adminBranch.statusCode, 200, adminBranch.body);
    assert.equal(branchStaffReport.statusCode, 200, branchStaffReport.body);
    assert.deepEqual(branchStaffReport.json().summary, adminBranch.json().summary);
    assert.deepEqual(branchStaffReport.json().dataQuality, adminBranch.json().dataQuality);
    assert.equal(branchStaffReport.json().dataQuality.excludedSettlementCount, 1);

    const noSession = await context.app.inject({ method: "GET", url: "/merchant/reports/task-code/monthly-live?reportMonth=2026-07" });
    const spoofed = await context.app.inject({ method: "GET", url: "/merchant/reports/task-code/monthly-live?reportMonth=2026-07", headers: merchantHeaders });
    assert.equal(noSession.statusCode, 401, noSession.body);
    assert.equal(spoofed.statusCode, 401, spoofed.body);
    const wrongBranch = await context.app.inject({ method: "GET", url: `/merchant/reports/task-code/monthly-live?reportMonth=2026-07&merchantId=${fixture.branch.merchant.id}`, headers: { cookie: branchManager.session.cookie } });
    const wrongBrand = await context.app.inject({ method: "GET", url: `/merchant/reports/task-code/monthly-live?reportMonth=2026-07&merchantId=${secondBrand.main.merchant.id}`, headers: { cookie: branchManager.session.cookie } });
    assert.equal(wrongBranch.statusCode, 403, wrongBranch.body);
    assert.equal(wrongBrand.statusCode, 403, wrongBrand.body);

    const noMembership = await context.app.inject({ method: "GET", url: "/merchant/reports/task-code/monthly-live?reportMonth=2026-07", headers: { cookie: inactiveMembership.session.cookie } });
    assert.equal(noMembership.statusCode, 403, noMembership.body);

    for (const headers of [{ "x-looper-role": "user" }, merchantHeaders, {}]) {
      const denied = await context.app.inject({ method: "GET", url: "/admin/reports/task-code/monthly-live?reportMonth=2026-07", headers });
      assert.equal(denied.statusCode, 403, denied.body);
    }

    const forbiddenKeys = new Set(["code", "codeHash", "secret", "taskCodeSecret", "token", "tokenHash", "idempotencyKey", "ruleSnapshot", "ruleSnapshotJson", "rewardPayload", "rewardPayloadJson", "chestStars", "levelBefore", "levelAfter", "resources"]);
    const inspectKeys = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(inspectKeys);
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        assert.equal(forbiddenKeys.has(key), false, `sensitive monthly report key returned: ${key}`);
        inspectKeys(child);
      }
    };
    inspectKeys(ownerReport.json());
    inspectKeys(branchManagerReport.json());
    inspectKeys(branchStaffReport.json());

    assert.deepEqual({
      submissions: JSON.stringify(context.store.db.prepare("SELECT * FROM task_code_submissions ORDER BY id").all()),
      snapshots: JSON.stringify(context.store.db.prepare("SELECT * FROM task_code_submission_scope_snapshots ORDER BY submission_id").all()),
      rewards: countRows(context, "reward_events"),
      ledger: countRows(context, "resource_transactions"),
      redemptions: countRows(context, "redemptions"),
      audits: countRows(context, "audit_events"),
    }, before);
  } finally {
    await context.close();
  }
});

test("admin merchant branch creation allows admin to create branch for active brand", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "branch-active@example.com");
    const main = context.store.getMerchant(application.merchantId);
    const response = await createAdminBranch(context, main.brandId);
    assert.equal(response.statusCode, 201, response.body);
    const branch = response.json();
    assert.match(branch.merchantId, /^merchant-/);
    assert.equal(branch.brandId, main.brandId);
    assert.equal(branch.branchCode, "taipei-branch");
    assert.equal(branch.brandDisplayName, main.brandDisplayName);
  } finally {
    await context.close();
  }
});

test("admin merchant branch creation rejects user and merchant roles", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "branch-role@example.com");
    const main = context.store.getMerchant(application.merchantId);
    const user = await context.app.inject({ method: "POST", url: `/admin/merchant-brands/${main.brandId}/branches`, headers: { "x-looper-role": "user" }, payload: branchPayload() });
    const merchant = await context.app.inject({ method: "POST", url: `/admin/merchant-brands/${main.brandId}/branches`, headers: merchantHeaders, payload: branchPayload({ branchCode: "merchant-role" }) });
    assert.equal(user.statusCode, 403, user.body);
    assert.equal(merchant.statusCode, 403, merchant.body);
  } finally {
    await context.close();
  }
});

test("admin merchant branch creation returns 404 for missing brand", async () => {
  const context = await setup();
  try {
    const response = await createAdminBranch(context, "merchant-brand-missing");
    assert.equal(response.statusCode, 404, response.body);
  } finally {
    await context.close();
  }
});

test("admin merchant branch creation rejects suspended brand", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "branch-suspended@example.com");
    const main = context.store.getMerchant(application.merchantId);
    context.store.db.prepare("UPDATE merchant_brands SET status = 'suspended' WHERE id = ?").run(main.brandId);
    const response = await createAdminBranch(context, main.brandId);
    assert.equal(response.statusCode, 409, response.body);
  } finally {
    await context.close();
  }
});

test("admin merchant branch creation normalizes and validates branch code", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "branch-code@example.com");
    const main = context.store.getMerchant(application.merchantId);
    const normalized = await createAdminBranch(context, main.brandId, { branchCode: "  North-01  " });
    assert.equal(normalized.statusCode, 201, normalized.body);
    assert.equal(normalized.json().branchCode, "north-01");
    const invalid = await createAdminBranch(context, main.brandId, { branchCode: "North_02" });
    assert.equal(invalid.statusCode, 400, invalid.body);
  } finally {
    await context.close();
  }
});

test("admin merchant branch creation blocks duplicate branch code within brand", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "branch-duplicate@example.com");
    const main = context.store.getMerchant(application.merchantId);
    const first = await createAdminBranch(context, main.brandId, { branchCode: "same-code" });
    const second = await createAdminBranch(context, main.brandId, { branchCode: "same-code", address: "台北市其他路 9 號" });
    assert.equal(first.statusCode, 201, first.body);
    assert.equal(second.statusCode, 409, second.body);
    const rows = context.store.db.prepare("SELECT COUNT(*) AS count FROM merchants WHERE brand_id = ? AND branch_code = 'same-code'").get(main.brandId) as { count: number };
    assert.equal(rows.count, 1);
  } finally {
    await context.close();
  }
});

test("admin merchant branch creation allows same branch code across brands", async () => {
  const context = await setup();
  try {
    const first = await onboardMerchant(context.app, "branch-cross-brand-a@example.com");
    const second = await onboardMerchant(context.app, "branch-cross-brand-b@example.com");
    const firstMain = context.store.getMerchant(first.application.merchantId);
    const secondMain = context.store.getMerchant(second.application.merchantId);
    const firstBranch = await createAdminBranch(context, firstMain.brandId, { branchCode: "shared-code" });
    const secondBranch = await createAdminBranch(context, secondMain.brandId, { branchCode: "shared-code" });
    assert.equal(firstBranch.statusCode, 201, firstBranch.body);
    assert.equal(secondBranch.statusCode, 201, secondBranch.body);
  } finally {
    await context.close();
  }
});

test("admin merchant branch creation replays identical canonical payload", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "branch-replay@example.com");
    const main = context.store.getMerchant(application.merchantId);
    const first = await createAdminBranch(context, main.brandId, { branchCode: "replay-code" });
    const second = await createAdminBranch(context, main.brandId, { branchCode: "  REPLAY-CODE  " });
    assert.equal(first.statusCode, 201, first.body);
    assert.equal(second.statusCode, 200, second.body);
    assert.equal(first.json().merchantId, second.json().merchantId);
    const rows = context.store.db.prepare("SELECT COUNT(*) AS count FROM merchants WHERE brand_id = ? AND branch_code = 'replay-code'").get(main.brandId) as { count: number };
    assert.equal(rows.count, 1);
  } finally {
    await context.close();
  }
});

test("admin merchant branch creation conflicts when same code has different payload", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "branch-conflict@example.com");
    const main = context.store.getMerchant(application.merchantId);
    const first = await createAdminBranch(context, main.brandId, { branchCode: "payload-code" });
    const second = await createAdminBranch(context, main.brandId, { branchCode: "payload-code", rewardCategory: "general" });
    assert.equal(first.statusCode, 201, first.body);
    assert.equal(second.statusCode, 409, second.body);
  } finally {
    await context.close();
  }
});

test("admin merchant branch creation racing requests create at most one branch", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "branch-race@example.com");
    const main = context.store.getMerchant(application.merchantId);
    const [first, second] = await Promise.all([
      createAdminBranch(context, main.brandId, { branchCode: "race-code" }),
      createAdminBranch(context, main.brandId, { branchCode: "race-code" }),
    ]);
    assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 201]);
    assert.equal(first.json().merchantId, second.json().merchantId);
    const rows = context.store.db.prepare("SELECT COUNT(*) AS count FROM merchants WHERE brand_id = ? AND branch_code = 'race-code'").get(main.brandId) as { count: number };
    assert.equal(rows.count, 1);
  } finally {
    await context.close();
  }
});

test("admin merchant branch creation inherits compatible merchant plan fields", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "branch-plan@example.com", "forest");
    const main = context.store.getMerchant(application.merchantId);
    const response = await createAdminBranch(context, main.brandId, { branchCode: "plan-code" });
    assert.equal(response.statusCode, 201, response.body);
    const branch = context.store.getMerchant(response.json().merchantId);
    assert.equal(branch.merchantPlan, main.merchantPlan);
    assert.equal(branch.rewardStarAmount, main.rewardStarAmount);
    assert.equal(response.json().merchantPlan, main.merchantPlan);
  } finally {
    await context.close();
  }
});

test("admin merchant branch creation uses request reward category and timezone", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "branch-reward-timezone@example.com");
    const main = context.store.getMerchant(application.merchantId);
    const response = await createAdminBranch(context, main.brandId, { branchCode: "tokyo-code", rewardCategory: "star", timezone: "Asia/Tokyo" });
    assert.equal(response.statusCode, 201, response.body);
    const branch = response.json();
    assert.equal(branch.rewardCategory, "star");
    assert.equal(branch.timezone, "Asia/Tokyo");
  } finally {
    await context.close();
  }
});

test("admin merchant branch creation writes audit event without sensitive data", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "branch-audit@example.com");
    const main = context.store.getMerchant(application.merchantId);
    const response = await createAdminBranch(context, main.brandId, { branchCode: "audit-code" });
    assert.equal(response.statusCode, 201, response.body);
    const audit = context.store.auditEvents.find((event) => event.action === "merchant.branch_created" && event.entityId === response.json().merchantId);
    assert.ok(audit);
    assert.equal(audit.actorRole, "admin");
    assert.equal(audit.actorId, "admin-demo");
    assert.equal(audit.metadata.brandId, main.brandId);
    assert.equal(audit.metadata.branchCode, "audit-code");
    assert.equal(audit.metadata.rewardCategory, "star");
    assert.equal("codeHash" in audit.metadata, false);
    assert.equal("secret" in audit.metadata, false);
  } finally {
    await context.close();
  }
});

test("admin merchant branch creation does not create mission task code reward event or ledger", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "branch-no-side-effects@example.com");
    const main = context.store.getMerchant(application.merchantId);
    const before = {
      missions: countRows(context, "missions"),
      taskCodeWindows: countRows(context, "task_code_windows"),
      taskCodeSubmissions: countRows(context, "task_code_submissions"),
      rewardEvents: countRows(context, "reward_events"),
      resourceTransactions: countRows(context, "resource_transactions"),
      redemptions: countRows(context, "redemptions"),
    };
    const response = await createAdminBranch(context, main.brandId, { branchCode: "no-side-effects" });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(countRows(context, "missions"), before.missions);
    assert.equal(countRows(context, "task_code_windows"), before.taskCodeWindows);
    assert.equal(countRows(context, "task_code_submissions"), before.taskCodeSubmissions);
    assert.equal(countRows(context, "reward_events"), before.rewardEvents);
    assert.equal(countRows(context, "resource_transactions"), before.resourceTransactions);
    assert.equal(countRows(context, "redemptions"), before.redemptions);
  } finally {
    await context.close();
  }
});

test("admin merchant branch creation preserves existing brand branch and merchant ids", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "branch-preserve@example.com");
    const mainBefore = context.store.getMerchant(application.merchantId);
    const response = await createAdminBranch(context, mainBefore.brandId, { branchCode: "preserve-code" });
    assert.equal(response.statusCode, 201, response.body);
    const mainAfter = context.store.getMerchant(application.merchantId);
    assert.equal(mainAfter.id, mainBefore.id);
    assert.equal(mainAfter.brandId, mainBefore.brandId);
    assert.equal(mainAfter.branchCode, "main");
    assert.notEqual(response.json().merchantId, mainBefore.id);
  } finally {
    await context.close();
  }
});

test("admin merchant membership creation supports all four formal roles using accounts", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "membership-api-scopes@example.com");
    const main = context.store.getMerchant(application.merchantId);
    const cases = [
      { accountId: "membership-role-owner", role: "brand_owner" as const, merchantId: null },
      { accountId: "membership-role-brand-manager", role: "brand_manager" as const },
      { accountId: "membership-role-branch-manager", role: "branch_manager" as const, merchantId: main.id },
      { accountId: "membership-role-branch-staff", role: "branch_staff" as const, merchantId: main.id },
    ];
    for (const item of cases) {
      insertTestAccount(context.store.db, item.accountId);
      const response = await createAdminMembership(context, membershipPayload(item.accountId, main.brandId, { role: item.role, ...(item.merchantId !== undefined ? { merchantId: item.merchantId } : {}) }));
      assert.equal(response.statusCode, 201, `${item.role}: ${response.body}`);
      const membership = response.json();
      assert.match(membership.membershipId, /^membership-/);
      assert.equal(membership.accountId, item.accountId);
      assert.equal(membership.brandId, main.brandId);
      assert.equal(membership.role, item.role);
      assert.equal(membership.status, "active");
      assert.equal(membership.merchantId, item.merchantId ?? null);
      assert.equal(membership.branchCode, item.merchantId ? "main" : null);
      assert.equal(membership.storeName, item.merchantId ? main.storeName : null);
    }
  } finally {
    await context.close();
  }
});

test("admin merchant membership endpoints reject user and merchant roles", async () => {
  const context = await setup();
  try {
    const body = membershipPayload("user-demo", "brand-demo");
    const userCreate = await createAdminMembership(context, body, { "x-looper-role": "user" });
    const merchantCreate = await createAdminMembership(context, body, merchantHeaders);
    const userQuery = await context.app.inject({ method: "GET", url: "/admin/merchant-operator-memberships?brandId=brand-demo", headers: { "x-looper-role": "user" } });
    const merchantQuery = await context.app.inject({ method: "GET", url: "/admin/merchant-operator-memberships?brandId=brand-demo", headers: merchantHeaders });
    assert.equal(userCreate.statusCode, 403, userCreate.body);
    assert.equal(merchantCreate.statusCode, 403, merchantCreate.body);
    assert.equal(userQuery.statusCode, 403, userQuery.body);
    assert.equal(merchantQuery.statusCode, 403, merchantQuery.body);
  } finally {
    await context.close();
  }
});

test("admin merchant membership creation validates role scope and branch ownership", async () => {
  const context = await setup();
  try {
    const first = await onboardMerchant(context.app, "membership-api-scope-a@example.com");
    const second = await onboardMerchant(context.app, "membership-api-scope-b@example.com");
    const firstMerchant = context.store.getMerchant(first.application.merchantId);
    const secondMerchant = context.store.getMerchant(second.application.merchantId);
    insertTestAccount(context.store.db, "membership-api-scope-account");

    const brandWithBranch = await createAdminMembership(context, membershipPayload("membership-api-scope-account", firstMerchant.brandId, { merchantId: firstMerchant.id }));
    const branchWithoutBranch = await createAdminMembership(context, membershipPayload("membership-api-scope-account", firstMerchant.brandId, { role: "branch_manager" }));
    const crossBrand = await createAdminMembership(context, membershipPayload("membership-api-scope-account", firstMerchant.brandId, { merchantId: secondMerchant.id, role: "branch_staff" }));
    assert.equal(brandWithBranch.statusCode, 400, brandWithBranch.body);
    assert.equal(branchWithoutBranch.statusCode, 400, branchWithoutBranch.body);
    assert.equal(crossBrand.statusCode, 409, crossBrand.body);
    assert.equal(countRows(context, "merchant_operator_memberships"), 0);
  } finally {
    await context.close();
  }
});

test("admin merchant membership creation validates canonical account brand and branch state", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "membership-api-state@example.com");
    const main = context.store.getMerchant(application.merchantId);
    insertTestAccount(context.store.db, "membership-api-state-account");

    const missingAccount = await createAdminMembership(context, membershipPayload("missing-account", main.brandId));
    const missingBrand = await createAdminMembership(context, membershipPayload("membership-api-state-account", "missing-brand"));
    const missingBranch = await createAdminMembership(context, membershipPayload("membership-api-state-account", main.brandId, { merchantId: "missing-branch", role: "branch_staff" }));
    assert.equal(missingAccount.statusCode, 404, missingAccount.body);
    assert.equal(missingBrand.statusCode, 404, missingBrand.body);
    assert.equal(missingBranch.statusCode, 404, missingBranch.body);

    context.store.db.prepare("UPDATE accounts SET status = 'suspended' WHERE id = ?").run("membership-api-state-account");
    const suspendedAccount = await createAdminMembership(context, membershipPayload("membership-api-state-account", main.brandId));
    assert.equal(suspendedAccount.statusCode, 409, suspendedAccount.body);
    context.store.db.prepare("UPDATE accounts SET status = 'closed' WHERE id = ?").run("membership-api-state-account");
    const closedAccount = await createAdminMembership(context, membershipPayload("membership-api-state-account", main.brandId));
    assert.equal(closedAccount.statusCode, 409, closedAccount.body);
    context.store.db.prepare("UPDATE accounts SET status = 'active' WHERE id = ?").run("membership-api-state-account");
    context.store.db.prepare("UPDATE merchant_brands SET status = 'suspended' WHERE id = ?").run(main.brandId);
    const suspendedBrand = await createAdminMembership(context, membershipPayload("membership-api-state-account", main.brandId));
    assert.equal(suspendedBrand.statusCode, 409, suspendedBrand.body);
  } finally {
    await context.close();
  }
});

test("admin merchant membership creation replays identical active membership", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "membership-api-replay@example.com");
    const main = context.store.getMerchant(application.merchantId);
    insertTestAccount(context.store.db, "membership-api-replay-account");
    const body = membershipPayload("membership-api-replay-account", main.brandId, { role: "brand_owner" });
    const first = await createAdminMembership(context, body);
    const second = await createAdminMembership(context, body);
    assert.equal(first.statusCode, 201, first.body);
    assert.equal(second.statusCode, 200, second.body);
    assert.equal(first.json().membershipId, second.json().membershipId);
    assert.equal(countRows(context, "merchant_operator_memberships"), 1);
    const audits = context.store.auditEvents.filter((event) => event.action === "merchant.membership_created");
    assert.equal(audits.length, 1);
    assert.deepEqual(audits[0].metadata, {
      membershipId: first.json().membershipId,
      accountId: "membership-api-replay-account",
      brandId: main.brandId,
      merchantId: null,
      role: "brand_owner",
      status: "active",
      actorId: "admin-demo",
      createdAt: first.json().createdAt,
    });
  } finally {
    await context.close();
  }
});

test("admin merchant membership creation does not reactivate suspended or left membership", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "membership-api-inactive@example.com");
    const main = context.store.getMerchant(application.merchantId);
    insertTestAccount(context.store.db, "membership-api-inactive-account");
    insertTestAccount(context.store.db, "membership-api-suspended-account");
    const body = membershipPayload("membership-api-inactive-account", main.brandId);
    const suspendedBody = membershipPayload("membership-api-suspended-account", main.brandId);
    const first = await createAdminMembership(context, body);
    const suspended = await createAdminMembership(context, suspendedBody);
    assert.equal(first.statusCode, 201, first.body);
    assert.equal(suspended.statusCode, 201, suspended.body);
    context.store.db.prepare("UPDATE merchant_operator_memberships SET status = 'left' WHERE id = ?").run(first.json().membershipId);
    context.store.db.prepare("UPDATE merchant_operator_memberships SET status = 'suspended' WHERE id = ?").run(suspended.json().membershipId);
    const retry = await createAdminMembership(context, body);
    const suspendedRetry = await createAdminMembership(context, suspendedBody);
    assert.equal(retry.statusCode, 409, retry.body);
    assert.equal(suspendedRetry.statusCode, 409, suspendedRetry.body);
    assert.equal((context.store.db.prepare("SELECT status FROM merchant_operator_memberships WHERE id = ?").get(first.json().membershipId) as { status: string }).status, "left");
    assert.equal((context.store.db.prepare("SELECT status FROM merchant_operator_memberships WHERE id = ?").get(suspended.json().membershipId) as { status: string }).status, "suspended");
  } finally {
    await context.close();
  }
});

test("admin merchant membership rejects a different role in the same brand or branch scope", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "membership-api-single-role@example.com");
    const main = context.store.getMerchant(application.merchantId);
    insertTestAccount(context.store.db, "membership-single-brand");
    insertTestAccount(context.store.db, "membership-single-branch");
    assert.equal((await createAdminMembership(context, membershipPayload("membership-single-brand", main.brandId, { role: "brand_owner" }))).statusCode, 201);
    const brandReplacement = await createAdminMembership(context, membershipPayload("membership-single-brand", main.brandId, { role: "brand_manager" }));
    assert.equal(brandReplacement.statusCode, 409, brandReplacement.body);
    assert.equal((await createAdminMembership(context, membershipPayload("membership-single-branch", main.brandId, { merchantId: main.id, role: "branch_manager" }))).statusCode, 201);
    const branchReplacement = await createAdminMembership(context, membershipPayload("membership-single-branch", main.brandId, { merchantId: main.id, role: "branch_staff" }));
    assert.equal(branchReplacement.statusCode, 409, branchReplacement.body);
    assert.equal(context.store.listMerchantOperatorMemberships({ brandId: main.brandId }).length, 2);
  } finally {
    await context.close();
  }
});

test("admin merchant membership rejects brand and branch scope overlap in both directions", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "membership-api-overlap@example.com");
    const main = context.store.getMerchant(application.merchantId);
    insertTestAccount(context.store.db, "membership-overlap-brand-first");
    insertTestAccount(context.store.db, "membership-overlap-branch-first");
    assert.equal((await createAdminMembership(context, membershipPayload("membership-overlap-brand-first", main.brandId, { role: "brand_manager" }))).statusCode, 201);
    const branchAfterBrand = await createAdminMembership(context, membershipPayload("membership-overlap-brand-first", main.brandId, { merchantId: main.id, role: "branch_staff" }));
    assert.equal(branchAfterBrand.statusCode, 409, branchAfterBrand.body);
    assert.equal((await createAdminMembership(context, membershipPayload("membership-overlap-branch-first", main.brandId, { merchantId: main.id, role: "branch_manager" }))).statusCode, 201);
    const brandAfterBranch = await createAdminMembership(context, membershipPayload("membership-overlap-branch-first", main.brandId, { role: "brand_owner" }));
    assert.equal(brandAfterBranch.statusCode, 409, brandAfterBranch.body);
  } finally {
    await context.close();
  }
});

test("admin merchant membership allows different brands and different branches", async () => {
  const context = await setup();
  try {
    const first = await onboardMerchant(context.app, "membership-api-allowed-a@example.com");
    const second = await onboardMerchant(context.app, "membership-api-allowed-b@example.com");
    const firstMain = context.store.getMerchant(first.application.merchantId);
    const secondMain = context.store.getMerchant(second.application.merchantId);
    insertTestAccount(context.store.db, "membership-different-brands");
    insertTestAccount(context.store.db, "membership-different-branches");
    assert.equal((await createAdminMembership(context, membershipPayload("membership-different-brands", firstMain.brandId, { role: "brand_owner" }))).statusCode, 201);
    assert.equal((await createAdminMembership(context, membershipPayload("membership-different-brands", secondMain.brandId, { role: "brand_manager" }))).statusCode, 201);

    const branchResponse = await createAdminBranch(context, firstMain.brandId, { branchCode: "membership-second-branch" });
    assert.equal(branchResponse.statusCode, 201, branchResponse.body);
    const secondBranchId = branchResponse.json().merchantId;
    assert.equal((await createAdminMembership(context, membershipPayload("membership-different-branches", firstMain.brandId, { merchantId: firstMain.id, role: "branch_manager" }))).statusCode, 201);
    assert.equal((await createAdminMembership(context, membershipPayload("membership-different-branches", firstMain.brandId, { merchantId: secondBranchId, role: "branch_staff" }))).statusCode, 201);
  } finally {
    await context.close();
  }
});

test("admin merchant membership racing identical creates keep one row and one audit", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "membership-api-race@example.com");
    const main = context.store.getMerchant(application.merchantId);
    insertTestAccount(context.store.db, "membership-race-account");
    const body = membershipPayload("membership-race-account", main.brandId, { merchantId: main.id, role: "branch_staff" });
    const [first, second] = await Promise.all([createAdminMembership(context, body), createAdminMembership(context, body)]);
    assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 201]);
    assert.equal(first.json().membershipId, second.json().membershipId);
    assert.equal(context.store.listMerchantOperatorMemberships({ accountId: "membership-race-account", brandId: main.brandId }).length, 1);
    assert.equal(context.store.auditEvents.filter((event) => event.action === "merchant.membership_created" && event.metadata.accountId === "membership-race-account").length, 1);
  } finally {
    await context.close();
  }
});

test("admin merchant membership migration v15 installs database scope protection", async () => {
  const context = await setup();
  try {
    assert.equal(MIGRATIONS.find((migration) => migration.version === 15)?.name, "merchant_membership_scope_exclusivity");
    const brandIndex = context.store.db.prepare("PRAGMA index_info(idx_memberships_brand_scope_unique)").all() as Array<{ name: string }>;
    const branchIndex = context.store.db.prepare("PRAGMA index_info(idx_memberships_branch_scope_unique)").all() as Array<{ name: string }>;
    assert.deepEqual(brandIndex.map((column) => column.name), ["account_id", "brand_id"]);
    assert.deepEqual(branchIndex.map((column) => column.name), ["account_id", "brand_id", "merchant_id"]);

    const { application } = await onboardMerchant(context.app, "membership-api-db-protection@example.com");
    const main = context.store.getMerchant(application.merchantId);
    insertTestAccount(context.store.db, "membership-db-account");
    const now = new Date().toISOString();
    context.store.db.prepare(`INSERT INTO merchant_operator_memberships
      (id, account_id, brand_id, merchant_id, role, status, created_at, updated_at)
      VALUES ('membership-db-brand', 'membership-db-account', ?, NULL, 'brand_owner', 'active', ?, ?)`).run(main.brandId, now, now);
    assert.throws(() => context.store.db.prepare(`INSERT INTO merchant_operator_memberships
      (id, account_id, brand_id, merchant_id, role, status, created_at, updated_at)
      VALUES ('membership-db-brand-duplicate', 'membership-db-account', ?, NULL, 'brand_manager', 'active', ?, ?)`).run(main.brandId, now, now), /constraint|UNIQUE/i);
    assert.throws(() => context.store.db.prepare(`INSERT INTO merchant_operator_memberships
      (id, account_id, brand_id, merchant_id, role, status, created_at, updated_at)
      VALUES ('membership-db-branch-overlap', 'membership-db-account', ?, ?, 'branch_staff', 'active', ?, ?)`).run(main.brandId, main.id, now, now), /overlap|constraint/i);

    const second = await onboardMerchant(context.app, "membership-api-db-update@example.com");
    const secondMain = context.store.getMerchant(second.application.merchantId);
    context.store.db.prepare(`INSERT INTO merchant_operator_memberships
      (id, account_id, brand_id, merchant_id, role, status, created_at, updated_at)
      VALUES ('membership-db-update', 'membership-db-account', ?, ?, 'branch_manager', 'active', ?, ?)`).run(secondMain.brandId, secondMain.id, now, now);
    assert.throws(() => context.store.db.prepare("UPDATE merchant_operator_memberships SET brand_id = ?, merchant_id = ? WHERE id = 'membership-db-update'").run(main.brandId, main.id), /overlap|constraint/i);
  } finally {
    await context.close();
  }
});

test("admin merchant membership migration v15 stops on conflicting existing memberships", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "membership-api-migration-conflict@example.com");
    const main = context.store.getMerchant(application.merchantId);
    insertTestAccount(context.store.db, "membership-migration-conflict");
    context.store.db.exec(`
      DELETE FROM schema_migrations WHERE version = 15;
      DROP INDEX idx_memberships_brand_scope_unique;
      CREATE UNIQUE INDEX idx_memberships_brand_scope_unique
        ON merchant_operator_memberships(account_id, brand_id, role)
        WHERE merchant_id IS NULL;
    `);
    const now = new Date().toISOString();
    const insert = context.store.db.prepare(`INSERT INTO merchant_operator_memberships
      (id, account_id, brand_id, merchant_id, role, status, created_at, updated_at)
      VALUES (?, 'membership-migration-conflict', ?, NULL, ?, 'active', ?, ?)`);
    insert.run("membership-migration-owner", main.brandId, "brand_owner", now, now);
    insert.run("membership-migration-manager", main.brandId, "brand_manager", now, now);
    assert.throws(() => migrateDatabase(context.store.db), /duplicate brand scope/);
    assert.equal((context.store.db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 15").get() as { count: number }).count, 0);
    assert.equal((context.store.db.prepare("SELECT COUNT(*) AS count FROM merchant_operator_memberships WHERE account_id = 'membership-migration-conflict'").get() as { count: number }).count, 2);
  } finally {
    await context.close();
  }
});

test("admin merchant membership migration v15 stops on brand and branch overlap", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "membership-api-migration-overlap@example.com");
    const main = context.store.getMerchant(application.merchantId);
    insertTestAccount(context.store.db, "membership-migration-overlap");
    context.store.db.exec(`
      DELETE FROM schema_migrations WHERE version = 15;
      DROP TRIGGER trg_memberships_scope_exclusivity_insert;
      DROP TRIGGER trg_memberships_scope_exclusivity_update;
    `);
    const now = new Date().toISOString();
    context.store.db.prepare(`INSERT INTO merchant_operator_memberships
      (id, account_id, brand_id, merchant_id, role, status, created_at, updated_at)
      VALUES ('membership-migration-overlap-brand', 'membership-migration-overlap', ?, NULL, 'brand_manager', 'active', ?, ?)`).run(main.brandId, now, now);
    context.store.db.prepare(`INSERT INTO merchant_operator_memberships
      (id, account_id, brand_id, merchant_id, role, status, created_at, updated_at)
      VALUES ('membership-migration-overlap-branch', 'membership-migration-overlap', ?, ?, 'branch_staff', 'active', ?, ?)`).run(main.brandId, main.id, now, now);
    assert.throws(() => migrateDatabase(context.store.db), /brand and branch scopes overlap/);
    assert.equal((context.store.db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 15").get() as { count: number }).count, 0);
  } finally {
    await context.close();
  }
});

test("admin merchant membership creation has no unrelated side effects", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "membership-api-side-effects@example.com");
    const main = context.store.getMerchant(application.merchantId);
    insertTestAccount(context.store.db, "membership-side-effects-account");
    const before = {
      accounts: countRows(context, "accounts"),
      merchants: countRows(context, "merchants"),
      missions: countRows(context, "missions"),
      taskCodeWindows: countRows(context, "task_code_windows"),
      taskCodeSubmissions: countRows(context, "task_code_submissions"),
      rewardEvents: countRows(context, "reward_events"),
      redemptions: countRows(context, "redemptions"),
      ledger: countRows(context, "resource_transactions"),
    };
    const response = await createAdminMembership(context, membershipPayload("membership-side-effects-account", main.brandId, { role: "brand_owner" }));
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(countRows(context, "accounts"), before.accounts);
    assert.equal(countRows(context, "merchants"), before.merchants);
    assert.equal(countRows(context, "missions"), before.missions);
    assert.equal(countRows(context, "task_code_windows"), before.taskCodeWindows);
    assert.equal(countRows(context, "task_code_submissions"), before.taskCodeSubmissions);
    assert.equal(countRows(context, "reward_events"), before.rewardEvents);
    assert.equal(countRows(context, "redemptions"), before.redemptions);
    assert.equal(countRows(context, "resource_transactions"), before.ledger);
  } finally {
    await context.close();
  }
});

test("admin merchant membership query filters canonical account and merchant scope", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "membership-api-query@example.com");
    const main = context.store.getMerchant(application.merchantId);
    insertTestAccount(context.store.db, "membership-api-query-a");
    insertTestAccount(context.store.db, "membership-api-query-b");
    await createAdminMembership(context, membershipPayload("membership-api-query-a", main.brandId, { merchantId: main.id, role: "branch_manager" }));
    await createAdminMembership(context, membershipPayload("membership-api-query-b", main.brandId, { role: "brand_manager" }));

    const filtered = await context.app.inject({ method: "GET", url: `/admin/merchant-operator-memberships?accountId=membership-api-query-a&brandId=${main.brandId}&merchantId=${main.id}&role=branch_manager&status=active&limit=10`, headers: adminHeaders });
    assert.equal(filtered.statusCode, 200, filtered.body);
    const memberships = filtered.json();
    assert.equal(memberships.length, 1);
    assert.equal(memberships[0].accountId, "membership-api-query-a");
    assert.equal(memberships[0].accountDisplayName, "membership-api-query-a");
    assert.equal(memberships[0].merchantId, main.id);
    assert.equal(memberships[0].role, "branch_manager");

    const brandOnly = await context.app.inject({ method: "GET", url: `/admin/merchant-operator-memberships?brandId=${main.brandId}&accountId=membership-api-query-b`, headers: adminHeaders });
    assert.equal(brandOnly.statusCode, 200, brandOnly.body);
    assert.equal(brandOnly.json()[0].merchantId, null);
    assert.equal(brandOnly.json()[0].branchCode, null);
    assert.equal(brandOnly.json()[0].storeName, null);
    const missingBrandFilter = await context.app.inject({ method: "GET", url: "/admin/merchant-operator-memberships", headers: adminHeaders });
    assert.equal(missingBrandFilter.statusCode, 400, missingBrandFilter.body);
  } finally {
    await context.close();
  }
});

test("admin merchant membership audit and create are atomic", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "membership-api-atomic@example.com");
    const main = context.store.getMerchant(application.merchantId);
    insertTestAccount(context.store.db, "membership-api-atomic-account");
    const beforeMemberships = countRows(context, "merchant_operator_memberships");
    const beforeAudits = countRows(context, "audit_events");
    context.store.failNextMembershipAuditWrite = true;
    const response = await createAdminMembership(context, membershipPayload("membership-api-atomic-account", main.brandId));
    assert.equal(response.statusCode, 500, response.body);
    assert.equal(countRows(context, "merchant_operator_memberships"), beforeMemberships);
    assert.equal(countRows(context, "audit_events"), beforeAudits);
  } finally {
    await context.close();
  }
});

test("canonical account identity empty database creates accounts schema", async () => {
  const context = await setup();
  try {
    assert.equal(MIGRATIONS.find((migration) => migration.version === 14)?.name, "canonical_account_identities");
    const columns = context.store.db.prepare("PRAGMA table_info(accounts)").all() as Array<{ name: string }>;
    assert.ok(columns.some((column) => column.name === "creation_idempotency_key"));
    const userColumns = context.store.db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string; notnull: number }>;
    assert.ok(userColumns.some((column) => column.name === "account_id" && column.notnull === 1));
  } finally {
    await context.close();
  }
});

test("canonical account identity migrates legacy users to unique accounts", () => {
  const legacy = createPreAccountIdentityDatabase();
  try {
    insertLegacyUserIdentityData(legacy.db, "legacy-a", "Legacy A");
    insertLegacyUserIdentityData(legacy.db, "legacy-b", "Legacy B");
    migrateDatabase(legacy.db);
    const users = legacy.db.prepare("SELECT id, account_id FROM users ORDER BY id").all() as Array<{ id: string; account_id: string }>;
    assert.deepEqual(users.map((user) => [user.id, user.account_id]), [["legacy-a", "legacy-a"], ["legacy-b", "legacy-b"]]);
    assert.equal(countLegacyRows(legacy.db, "accounts"), 2);
  } finally {
    legacy.close();
  }
});

test("canonical account identity preserves user ids and historical references", () => {
  const legacy = createPreAccountIdentityDatabase();
  try {
    insertLegacyUserIdentityData(legacy.db, "legacy-history", "Legacy History");
    migrateDatabase(legacy.db);
    assert.equal((legacy.db.prepare("SELECT id FROM users WHERE id = 'legacy-history'").get() as { id: string }).id, "legacy-history");
    assert.equal((legacy.db.prepare("SELECT user_id FROM user_resources WHERE user_id = 'legacy-history'").get() as { user_id: string }).user_id, "legacy-history");
    assert.equal((legacy.db.prepare("SELECT user_id FROM reward_events WHERE id = 'reward-legacy-history'").get() as { user_id: string }).user_id, "legacy-history");
    assert.equal((legacy.db.prepare("SELECT user_id FROM redemptions WHERE id = 'redemption-legacy-history'").get() as { user_id: string }).user_id, "legacy-history");
    assert.equal((legacy.db.prepare("SELECT user_id FROM resource_transactions WHERE id = 'resource-legacy-history'").get() as { user_id: string }).user_id, "legacy-history");
    assert.equal((legacy.db.prepare("SELECT user_id FROM player_event_queue WHERE id = 'event-legacy-history'").get() as { user_id: string }).user_id, "legacy-history");
  } finally {
    legacy.close();
  }
});

test("canonical account identity migration replay does not duplicate accounts", () => {
  const legacy = createPreAccountIdentityDatabase();
  try {
    insertLegacyUserIdentityData(legacy.db, "legacy-replay", "Legacy Replay");
    migrateDatabase(legacy.db);
    migrateDatabase(legacy.db);
    assert.equal(countLegacyRows(legacy.db, "accounts"), 1);
    assert.equal((legacy.db.prepare("SELECT account_id FROM users WHERE id = 'legacy-replay'").get() as { account_id: string }).account_id, "legacy-replay");
  } finally {
    legacy.close();
  }
});

test("canonical account identity creates player profile atomically with account", async () => {
  const context = await setup();
  try {
    const player = context.store.createPlayerProfile("player-new", "New Player");
    assert.equal(player.id, "player-new");
    const account = context.store.listAccounts({ accountId: "player-new" })[0];
    assert.equal(account.accountId, "player-new");
    assert.equal(account.hasPlayerProfile, true);
    assert.equal(account.playerUserId, "player-new");
  } finally {
    await context.close();
  }
});

test("canonical account identity rolls back player profile when account flow fails", async () => {
  const context = await setup();
  try {
    context.store.failNextPlayerProfileWrite = true;
    assert.throws(() => context.store.createPlayerProfile("player-rollback", "Rollback Player"), /Simulated player profile failure/);
    assert.equal(context.store.listAccounts({ accountId: "player-rollback" }).length, 0);
    assert.equal((context.store.db.prepare("SELECT COUNT(*) AS count FROM users WHERE id = 'player-rollback'").get() as { count: number }).count, 0);
  } finally {
    await context.close();
  }
});

test("canonical account identity membership foreign key points to accounts", async () => {
  const context = await setup();
  try {
    const foreignKeys = context.store.db.prepare("PRAGMA foreign_key_list(merchant_operator_memberships)").all() as Array<{ from: string; table: string; to: string }>;
    assert.ok(foreignKeys.some((key) => key.from === "account_id" && key.table === "accounts" && key.to === "id"));
  } finally {
    await context.close();
  }
});

test("canonical account identity preserves membership constraints and cross-brand protection", async () => {
  const context = await setup();
  try {
    const first = await onboardMerchant(context.app, "account-membership-a@example.com");
    const second = await onboardMerchant(context.app, "account-membership-b@example.com");
    const firstMerchant = context.store.getMerchant(first.application.merchantId);
    const secondMerchant = context.store.getMerchant(second.application.merchantId);
    insertTestAccount(context.store.db, "account-membership-demo");
    context.store.db.prepare(`INSERT INTO merchant_operator_memberships
      (id, account_id, brand_id, merchant_id, role, status, created_at, updated_at)
      VALUES ('account-membership-1', 'account-membership-demo', ?, NULL, 'brand_manager', 'active', datetime('now'), datetime('now'))`).run(firstMerchant.brandId);
    assert.throws(() => context.store.db.prepare(`INSERT INTO merchant_operator_memberships
      (id, account_id, brand_id, merchant_id, role, status, created_at, updated_at)
      VALUES ('account-membership-2', 'account-membership-demo', ?, NULL, 'brand_manager', 'active', datetime('now'), datetime('now'))`).run(firstMerchant.brandId), /constraint|UNIQUE/i);
    assert.throws(() => context.store.db.prepare(`INSERT INTO merchant_operator_memberships
      (id, account_id, brand_id, merchant_id, role, status, created_at, updated_at)
      VALUES ('account-membership-3', 'account-membership-demo', ?, ?, 'brand_owner', 'active', datetime('now'), datetime('now'))`).run(firstMerchant.brandId, firstMerchant.id), /constraint|CHECK/i);
    assert.throws(() => context.store.db.prepare(`INSERT INTO merchant_operator_memberships
      (id, account_id, brand_id, merchant_id, role, status, created_at, updated_at)
      VALUES ('account-membership-4', 'account-membership-demo', ?, ?, 'branch_staff', 'active', datetime('now'), datetime('now'))`).run(firstMerchant.brandId, secondMerchant.id), /membership merchant must belong to brand|constraint/i);
  } finally {
    await context.close();
  }
});

test("canonical account identity admin can create account", async () => {
  const context = await setup();
  try {
    const response = await context.app.inject({ method: "POST", url: "/admin/accounts", headers: adminHeaders, payload: { displayName: "平台操作人", idempotencyKey: "account-create-key-1", actorId: "admin-demo" } });
    assert.equal(response.statusCode, 201, response.body);
    const account = response.json();
    assert.match(account.accountId, /^account-/);
    assert.equal(account.displayName, "平台操作人");
    assert.equal(account.status, "active");
    assert.equal(account.hasPlayerProfile, false);
  } finally {
    await context.close();
  }
});

test("canonical account identity user and merchant cannot create accounts", async () => {
  const context = await setup();
  try {
    const payload = { displayName: "Blocked", idempotencyKey: "account-blocked-key", actorId: "admin-demo" };
    const user = await context.app.inject({ method: "POST", url: "/admin/accounts", headers: { "x-looper-role": "user" }, payload });
    const merchant = await context.app.inject({ method: "POST", url: "/admin/accounts", headers: merchantHeaders, payload });
    assert.equal(user.statusCode, 403, user.body);
    assert.equal(merchant.statusCode, 403, merchant.body);
  } finally {
    await context.close();
  }
});

test("canonical account identity replays same idempotency key without duplicate account", async () => {
  const context = await setup();
  try {
    const payload = { displayName: "重送操作人", idempotencyKey: "account-replay-key", actorId: "admin-demo" };
    const first = await context.app.inject({ method: "POST", url: "/admin/accounts", headers: adminHeaders, payload });
    const second = await context.app.inject({ method: "POST", url: "/admin/accounts", headers: adminHeaders, payload });
    assert.equal(first.statusCode, 201, first.body);
    assert.equal(second.statusCode, 200, second.body);
    assert.equal(first.json().accountId, second.json().accountId);
    assert.equal(context.store.listAccounts({ displayNameQuery: "重送操作人" }).length, 1);
  } finally {
    await context.close();
  }
});

test("canonical account identity rejects same idempotency key with different payload", async () => {
  const context = await setup();
  try {
    const first = await context.app.inject({ method: "POST", url: "/admin/accounts", headers: adminHeaders, payload: { displayName: "原始操作人", idempotencyKey: "account-conflict-key", actorId: "admin-demo" } });
    const second = await context.app.inject({ method: "POST", url: "/admin/accounts", headers: adminHeaders, payload: { displayName: "不同操作人", idempotencyKey: "account-conflict-key", actorId: "admin-demo" } });
    assert.equal(first.statusCode, 201, first.body);
    assert.equal(second.statusCode, 409, second.body);
  } finally {
    await context.close();
  }
});

test("canonical account identity admin can query accounts by filters", async () => {
  const context = await setup();
  try {
    await context.app.inject({ method: "POST", url: "/admin/accounts", headers: adminHeaders, payload: { displayName: "Alpha Operator", idempotencyKey: "account-query-alpha", actorId: "admin-demo" } });
    const beta = await context.app.inject({ method: "POST", url: "/admin/accounts", headers: adminHeaders, payload: { displayName: "Beta Operator", idempotencyKey: "account-query-beta", actorId: "admin-demo" } });
    context.store.db.prepare("UPDATE accounts SET status = 'suspended' WHERE id = ?").run(beta.json().accountId);
    const filtered = await context.app.inject({ method: "GET", url: "/admin/accounts?status=suspended&displayNameQuery=Beta&limit=10", headers: adminHeaders });
    assert.equal(filtered.statusCode, 200, filtered.body);
    const accounts = filtered.json();
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0].displayName, "Beta Operator");
    assert.equal(accounts[0].status, "suspended");
  } finally {
    await context.close();
  }
});

test("canonical account identity query reports player profile linkage", async () => {
  const context = await setup();
  try {
    const response = await context.app.inject({ method: "GET", url: "/admin/accounts?accountId=user-demo", headers: adminHeaders });
    assert.equal(response.statusCode, 200, response.body);
    const account = response.json()[0];
    assert.equal(account.accountId, "user-demo");
    assert.equal(account.hasPlayerProfile, true);
    assert.equal(account.playerUserId, "user-demo");
  } finally {
    await context.close();
  }
});

test("canonical account identity account creation does not create resources rewards redemptions or memberships", async () => {
  const context = await setup();
  try {
    const before = {
      users: countRows(context, "users"),
      resources: countRows(context, "user_resources"),
      growth: countRows(context, "user_growth_balances"),
      rewards: countRows(context, "reward_events"),
      redemptions: countRows(context, "redemptions"),
      ledger: countRows(context, "resource_transactions"),
      memberships: countRows(context, "merchant_operator_memberships"),
    };
    const response = await context.app.inject({ method: "POST", url: "/admin/accounts", headers: adminHeaders, payload: { displayName: "No Side Effects", idempotencyKey: "account-no-side-effects", actorId: "admin-demo" } });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(countRows(context, "users"), before.users);
    assert.equal(countRows(context, "user_resources"), before.resources);
    assert.equal(countRows(context, "user_growth_balances"), before.growth);
    assert.equal(countRows(context, "reward_events"), before.rewards);
    assert.equal(countRows(context, "redemptions"), before.redemptions);
    assert.equal(countRows(context, "resource_transactions"), before.ledger);
    assert.equal(countRows(context, "merchant_operator_memberships"), before.memberships);
  } finally {
    await context.close();
  }
});

test("canonical account identity account audit is in same transaction", async () => {
  const context = await setup();
  try {
    const beforeAccounts = countRows(context, "accounts");
    const beforeAudit = countRows(context, "audit_events");
    context.store.failNextAccountAuditWrite = true;
    const response = await context.app.inject({ method: "POST", url: "/admin/accounts", headers: adminHeaders, payload: { displayName: "Audit Rollback", idempotencyKey: "account-audit-rollback", actorId: "admin-demo" } });
    assert.equal(response.statusCode, 500, response.body);
    assert.equal(countRows(context, "accounts"), beforeAccounts);
    assert.equal(countRows(context, "audit_events"), beforeAudit);
  } finally {
    await context.close();
  }
});

test("merchant invitation auth migration v16 creates hash-only invitation and session schema", async () => {
  const context = await setup();
  try {
    assert.equal(MIGRATIONS.at(-1)?.version, 16);
    assert.equal(MIGRATIONS.at(-1)?.name, "merchant_invitation_sessions");
    const invitationColumns = context.store.db.prepare("PRAGMA table_info(account_invitations)").all() as Array<{ name: string }>;
    const sessionColumns = context.store.db.prepare("PRAGMA table_info(account_sessions)").all() as Array<{ name: string }>;
    assert.ok(invitationColumns.some((column) => column.name === "token_hash"));
    assert.ok(sessionColumns.some((column) => column.name === "token_hash"));
    assert.equal(invitationColumns.some((column) => column.name === "token" || column.name === "password"), false);
    assert.equal(sessionColumns.some((column) => column.name === "token" || column.name === "password"), false);
  } finally { await context.close(); }
});

test("merchant invitation auth admin creates invitation and stores only token hash", async () => {
  const context = await setup();
  try {
    const prepared = await prepareMerchantInvitationAccount(context, "create");
    const response = await createAccountInvitation(context, prepared.accountId, "merchant-auth-create-key");
    assert.equal(response.statusCode, 201, response.body);
    const invitation = response.json();
    assert.equal(invitation.accountId, prepared.accountId);
    assert.ok(invitation.invitationToken.length >= 43);
    assert.equal(invitation.invitationUrl, `https://merchant.test/invite?token=${invitation.invitationToken}`);
    assert.equal("tokenHash" in invitation, false);
    const row = context.store.db.prepare("SELECT token_hash FROM account_invitations WHERE id = ?").get(invitation.invitationId) as { token_hash: string };
    assert.equal(row.token_hash.length, 64);
    assert.notEqual(row.token_hash, invitation.invitationToken);
    assert.equal(JSON.stringify(row).includes(invitation.invitationToken), false);
    const user = await createAccountInvitation(context, prepared.accountId, "merchant-auth-role-user", { "x-looper-role": "user" });
    const merchant = await createAccountInvitation(context, prepared.accountId, "merchant-auth-role-merchant", merchantHeaders);
    assert.equal(user.statusCode, 403, user.body);
    assert.equal(merchant.statusCode, 403, merchant.body);
  } finally { await context.close(); }
});

test("merchant invitation auth validates account membership and active brand", async () => {
  const context = await setup();
  try {
    const missing = await createAccountInvitation(context, "missing-auth-account", "merchant-auth-missing-key");
    assert.equal(missing.statusCode, 404, missing.body);
    insertTestAccount(context.store.db, "merchant-auth-no-membership");
    assert.equal((await createAccountInvitation(context, "merchant-auth-no-membership", "merchant-auth-no-membership-key")).statusCode, 409);
    const prepared = await prepareMerchantInvitationAccount(context, "eligibility");
    context.store.db.prepare("UPDATE accounts SET status = 'suspended' WHERE id = ?").run(prepared.accountId);
    assert.equal((await createAccountInvitation(context, prepared.accountId, "merchant-auth-suspended-key")).statusCode, 409);
    context.store.db.prepare("UPDATE accounts SET status = 'closed' WHERE id = ?").run(prepared.accountId);
    assert.equal((await createAccountInvitation(context, prepared.accountId, "merchant-auth-closed-key")).statusCode, 409);
    context.store.db.prepare("UPDATE accounts SET status = 'active' WHERE id = ?").run(prepared.accountId);
    context.store.db.prepare("UPDATE merchant_brands SET status = 'suspended' WHERE id = ?").run(prepared.merchant.brandId);
    assert.equal((await createAccountInvitation(context, prepared.accountId, "merchant-auth-brand-key")).statusCode, 409);
  } finally { await context.close(); }
});

test("merchant invitation auth creation is idempotent and revokes previous pending invitation", async () => {
  const context = await setup();
  try {
    const prepared = await prepareMerchantInvitationAccount(context, "idempotency");
    const first = await createAccountInvitation(context, prepared.accountId, "merchant-auth-idempotent-key");
    const replay = await createAccountInvitation(context, prepared.accountId, "merchant-auth-idempotent-key");
    assert.equal(first.statusCode, 201, first.body);
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(replay.json().invitationId, first.json().invitationId);
    assert.equal("invitationToken" in replay.json(), false);
    const other = await prepareMerchantInvitationAccount(context, "idempotency-other");
    const conflicting = await createAccountInvitation(context, other.accountId, "merchant-auth-idempotent-key");
    assert.equal(conflicting.statusCode, 409, conflicting.body);
    const next = await createAccountInvitation(context, prepared.accountId, "merchant-auth-next-key");
    assert.equal(next.statusCode, 201, next.body);
    const old = context.store.db.prepare("SELECT status, revoked_at FROM account_invitations WHERE id = ?").get(first.json().invitationId) as { status: string; revoked_at: string | null };
    assert.equal(old.status, "revoked");
    assert.ok(old.revoked_at);
  } finally { await context.close(); }
});

test("merchant invitation auth redeems once and sets secure session cookie attributes", async () => {
  const context = await setup();
  try {
    const prepared = await prepareMerchantInvitationAccount(context, "redeem");
    const invitation = (await createAccountInvitation(context, prepared.accountId, "merchant-auth-redeem-key")).json();
    const redeemed = await redeemInvitation(context, invitation.invitationToken);
    assert.equal(redeemed.statusCode, 200, redeemed.body);
    assert.equal(redeemed.json().authenticated, true);
    assert.equal(redeemed.json().account.accountId, prepared.accountId);
    assert.equal("sessionToken" in redeemed.json(), false);
    const setCookie = String(redeemed.headers["set-cookie"]);
    assert.match(setCookie, /^looper_session=[A-Za-z0-9_-]+;/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Path=\//i);
    assert.match(setCookie, /Max-Age=6047\d\d/i);
    const session = await context.app.inject({ method: "GET", url: "/auth/session", headers: { cookie: cookieHeader(redeemed) } });
    assert.equal(session.json().authenticated, true);
    assert.equal(session.json().account.accountId, prepared.accountId);
    assert.equal("tokenHash" in session.json().account, false);
    const second = await redeemInvitation(context, invitation.invitationToken);
    assert.equal(second.statusCode, 409, second.body);
    assert.equal(countRows(context, "account_sessions"), 1);
  } finally { await context.close(); }
});

test("merchant invitation auth rejects expired revoked and redeemed invitations", async () => {
  const context = await setup();
  try {
    const prepared = await prepareMerchantInvitationAccount(context, "invalid-invites");
    const expired = (await createAccountInvitation(context, prepared.accountId, "merchant-auth-expired-key")).json();
    context.store.db.prepare("UPDATE account_invitations SET expires_at = datetime('now', '-1 second') WHERE id = ?").run(expired.invitationId);
    assert.equal((await redeemInvitation(context, expired.invitationToken)).statusCode, 409);
    const revoked = (await createAccountInvitation(context, prepared.accountId, "merchant-auth-revoked-key")).json();
    context.store.db.prepare("UPDATE account_invitations SET status = 'revoked', revoked_at = datetime('now') WHERE id = ?").run(revoked.invitationId);
    assert.equal((await redeemInvitation(context, revoked.invitationToken)).statusCode, 409);
    const redeemedInvite = (await createAccountInvitation(context, prepared.accountId, "merchant-auth-already-key")).json();
    assert.equal((await redeemInvitation(context, redeemedInvite.invitationToken)).statusCode, 200);
    assert.equal((await redeemInvitation(context, redeemedInvite.invitationToken)).statusCode, 409);
  } finally { await context.close(); }
});

test("merchant invitation auth competing redemption creates one session and failure rolls back", async () => {
  const context = await setup();
  try {
    const prepared = await prepareMerchantInvitationAccount(context, "race");
    const invitation = (await createAccountInvitation(context, prepared.accountId, "merchant-auth-race-key")).json();
    const [first, second] = await Promise.all([redeemInvitation(context, invitation.invitationToken), redeemInvitation(context, invitation.invitationToken)]);
    assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 409]);
    assert.equal(countRows(context, "account_sessions"), 1);
    const rollbackInvite = (await createAccountInvitation(context, prepared.accountId, "merchant-auth-rollback-key")).json();
    context.store.failNextSessionWrite = true;
    const failed = await redeemInvitation(context, rollbackInvite.invitationToken);
    assert.equal(failed.statusCode, 500, failed.body);
    assert.equal((context.store.db.prepare("SELECT status FROM account_invitations WHERE id = ?").get(rollbackInvite.invitationId) as { status: string }).status, "pending");
    assert.equal(countRows(context, "account_sessions"), 1);
  } finally { await context.close(); }
});

test("merchant invitation auth session resolver ignores spoofed headers and invalid state", async () => {
  const context = await setup();
  try {
    const spoofed = await context.app.inject({ method: "GET", url: "/auth/session", headers: { "x-looper-account-id": "user-demo", "x-looper-role": "merchant" } });
    assert.deepEqual(spoofed.json(), { authenticated: false });
    const prepared = await prepareMerchantInvitationAccount(context, "resolver");
    const invitation = (await createAccountInvitation(context, prepared.accountId, "merchant-auth-resolver-key")).json();
    const redeemed = await redeemInvitation(context, invitation.invitationToken);
    const cookie = cookieHeader(redeemed);
    const sessionId = redeemed.json().account.sessionId;
    context.store.db.prepare("UPDATE account_sessions SET expires_at = datetime('now', '-1 second') WHERE id = ?").run(sessionId);
    assert.equal((await context.app.inject({ method: "GET", url: "/auth/session", headers: { cookie } })).json().authenticated, false);
    context.store.db.prepare("UPDATE account_sessions SET expires_at = datetime('now', '+1 day'), revoked_at = datetime('now') WHERE id = ?").run(sessionId);
    assert.equal((await context.app.inject({ method: "GET", url: "/auth/session", headers: { cookie } })).json().authenticated, false);
    context.store.db.prepare("UPDATE account_sessions SET revoked_at = NULL WHERE id = ?").run(sessionId);
    context.store.db.prepare("UPDATE accounts SET status = 'suspended' WHERE id = ?").run(prepared.accountId);
    assert.equal((await context.app.inject({ method: "GET", url: "/auth/session", headers: { cookie } })).json().authenticated, false);
  } finally { await context.close(); }
});

test("merchant invitation auth production cookie is Secure", async () => {
  const context = await setup({ production: true, merchantAppUrl: "https://merchant.production.test" });
  try {
    const prepared = await prepareMerchantInvitationAccount(context, "production");
    const invitation = (await createAccountInvitation(context, prepared.accountId, "merchant-auth-production-key")).json();
    const redeemed = await redeemInvitation(context, invitation.invitationToken);
    assert.match(String(redeemed.headers["set-cookie"]), /; Secure/i);
  } finally { await context.close(); }
});

test("merchant invitation auth logout revokes only current session and is idempotent", async () => {
  const context = await setup();
  try {
    const prepared = await prepareMerchantInvitationAccount(context, "logout");
    const firstInvite = (await createAccountInvitation(context, prepared.accountId, "merchant-auth-logout-one")).json();
    const first = await redeemInvitation(context, firstInvite.invitationToken);
    const secondInvite = (await createAccountInvitation(context, prepared.accountId, "merchant-auth-logout-two")).json();
    const second = await redeemInvitation(context, secondInvite.invitationToken);
    const logout = await context.app.inject({ method: "POST", url: "/auth/logout", headers: { cookie: cookieHeader(first) } });
    assert.equal(logout.statusCode, 200, logout.body);
    assert.match(String(logout.headers["set-cookie"]), /looper_session=;.*Max-Age=0/i);
    assert.equal((await context.app.inject({ method: "GET", url: "/auth/session", headers: { cookie: cookieHeader(first) } })).json().authenticated, false);
    assert.equal((await context.app.inject({ method: "GET", url: "/auth/session", headers: { cookie: cookieHeader(second) } })).json().authenticated, true);
    const replay = await context.app.inject({ method: "POST", url: "/auth/logout", headers: { cookie: cookieHeader(first) } });
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(context.store.auditEvents.filter((event) => event.action === "identity.session_logged_out").length, 1);
  } finally { await context.close(); }
});

test("merchant invitation auth invitation redeem and logout audits are transactional", async () => {
  const context = await setup();
  try {
    const prepared = await prepareMerchantInvitationAccount(context, "audit-transaction");
    const beforeInvitations = countRows(context, "account_invitations");
    context.store.failNextInvitationAuditWrite = true;
    const createFailed = await createAccountInvitation(context, prepared.accountId, "merchant-auth-create-audit-fail");
    assert.equal(createFailed.statusCode, 500, createFailed.body);
    assert.equal(countRows(context, "account_invitations"), beforeInvitations);

    const invitation = (await createAccountInvitation(context, prepared.accountId, "merchant-auth-redeem-audit-fail")).json();
    context.store.failNextInvitationRedeemAuditWrite = true;
    const redeemFailed = await redeemInvitation(context, invitation.invitationToken);
    assert.equal(redeemFailed.statusCode, 500, redeemFailed.body);
    assert.equal((context.store.db.prepare("SELECT status FROM account_invitations WHERE id = ?").get(invitation.invitationId) as { status: string }).status, "pending");
    assert.equal(countRows(context, "account_sessions"), 0);

    const redeemed = await redeemInvitation(context, invitation.invitationToken);
    context.store.failNextLogoutAuditWrite = true;
    const logoutFailed = await context.app.inject({ method: "POST", url: "/auth/logout", headers: { cookie: cookieHeader(redeemed) } });
    assert.equal(logoutFailed.statusCode, 500, logoutFailed.body);
    assert.equal((await context.app.inject({ method: "GET", url: "/auth/session", headers: { cookie: cookieHeader(redeemed) } })).json().authenticated, true);
  } finally { await context.close(); }
});

test("merchant invitation auth audits contain no secrets and unrelated state is unchanged", async () => {
  const context = await setup();
  try {
    const prepared = await prepareMerchantInvitationAccount(context, "audit");
    const before = {
      accounts: countRows(context, "accounts"), memberships: countRows(context, "merchant_operator_memberships"), users: countRows(context, "users"),
      resources: countRows(context, "user_resources"), tasks: countRows(context, "task_code_windows"), rewards: countRows(context, "reward_events"),
      redemptions: countRows(context, "redemptions"), ledger: countRows(context, "resource_transactions"), missions: countRows(context, "missions"),
    };
    const invitation = (await createAccountInvitation(context, prepared.accountId, "merchant-auth-audit-key")).json();
    const redeemed = await redeemInvitation(context, invitation.invitationToken);
    await context.app.inject({ method: "POST", url: "/auth/logout", headers: { cookie: cookieHeader(redeemed) } });
    const authAudits = context.store.auditEvents.filter((event) => event.action.startsWith("identity.invitation_") || event.action === "identity.session_logged_out");
    assert.deepEqual(authAudits.map((event) => event.action), ["identity.invitation_created", "identity.invitation_redeemed", "identity.session_logged_out"]);
    const auditJson = JSON.stringify(authAudits);
    assert.equal(auditJson.includes(invitation.invitationToken), false);
    assert.equal(/token_hash|tokenHash|invitationToken|sessionToken/i.test(auditJson), false);
    assert.equal(countRows(context, "accounts"), before.accounts);
    assert.equal(countRows(context, "merchant_operator_memberships"), before.memberships);
    assert.equal(countRows(context, "users"), before.users);
    assert.equal(countRows(context, "user_resources"), before.resources);
    assert.equal(countRows(context, "task_code_windows"), before.tasks);
    assert.equal(countRows(context, "reward_events"), before.rewards);
    assert.equal(countRows(context, "redemptions"), before.redemptions);
    assert.equal(countRows(context, "resource_transactions"), before.ledger);
    assert.equal(countRows(context, "missions"), before.missions);
  } finally { await context.close(); }
});

test("merchant session authorization rejects missing and spoofed sessions on protected endpoints", async () => {
  const context = await setup();
  try {
    const current = await context.app.inject({ method: "GET", url: "/merchant/task-code/current?merchantId=missing", headers: merchantHeaders });
    const pending = await context.app.inject({ method: "GET", url: "/merchant/task-code-submissions?merchantId=missing&status=pending", headers: { "x-looper-account-id": "spoof" } });
    const decision = await context.app.inject({ method: "POST", url: "/merchant/task-code-submissions/missing/decision", headers: { ...merchantHeaders, origin: "https://merchant.test" }, payload: { merchantId: "missing", decision: "reject", actorId: "spoof", idempotencyKey: "merchant-auth-no-session" } });
    assert.equal(current.statusCode, 401, current.body);
    assert.equal(pending.statusCode, 401, pending.body);
    assert.equal(decision.statusCode, 401, decision.body);
  } finally { await context.close(); }
});

test("merchant session authorization brand roles expand all branches and branch roles stay scoped", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "merchant-session-context@example.com");
    const main = context.store.getMerchant(application.merchantId);
    const createdBranch = await createAdminBranch(context, main.brandId, { branchCode: "guard-second" });
    const secondId = createdBranch.json().merchantId;
    for (const role of ["brand_owner", "brand_manager"] as const) {
      const accountId = `merchant-session-${role}`;
      insertTestAccount(context.store.db, accountId);
      assert.equal((await createAdminMembership(context, membershipPayload(accountId, main.brandId, { role }))).statusCode, 201);
      const session = await createMerchantAuthSession(context, accountId, `merchant-session-${role}`);
      const merchantContext = await context.app.inject({ method: "GET", url: "/merchant/context", headers: { cookie: session.cookie } });
      assert.equal(merchantContext.statusCode, 200, merchantContext.body);
      assert.deepEqual(merchantContext.json().branches.map((branch: { merchantId: string }) => branch.merchantId).sort(), [main.id, secondId].sort());
      assert.equal((await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${secondId}`, headers: { cookie: session.cookie } })).statusCode, 200);
    }
    for (const role of ["branch_manager", "branch_staff"] as const) {
      const accountId = `merchant-session-${role}`;
      insertTestAccount(context.store.db, accountId);
      assert.equal((await createAdminMembership(context, membershipPayload(accountId, main.brandId, { role, merchantId: main.id }))).statusCode, 201);
      const session = await createMerchantAuthSession(context, accountId, `merchant-session-${role}`);
      const merchantContext = await context.app.inject({ method: "GET", url: "/merchant/context", headers: { cookie: session.cookie } });
      assert.deepEqual(merchantContext.json().branches.map((branch: { merchantId: string }) => branch.merchantId), [main.id]);
      assert.equal((await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${secondId}`, headers: { cookie: session.cookie } })).statusCode, 403);
      assert.equal((await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${main.id}`, headers: { cookie: session.cookie } })).statusCode, 200);
    }
  } finally { await context.close(); }
});

test("merchant session authorization blocks other brands and inactive authorization state", async () => {
  const context = await setup();
  try {
    const first = await onboardMerchant(context.app, "merchant-session-auth-a@example.com");
    const second = await onboardMerchant(context.app, "merchant-session-auth-b@example.com");
    const firstMerchant = context.store.getMerchant(first.application.merchantId);
    const secondMerchant = context.store.getMerchant(second.application.merchantId);
    insertTestAccount(context.store.db, "merchant-session-inactive");
    await createAdminMembership(context, membershipPayload("merchant-session-inactive", firstMerchant.brandId, { merchantId: firstMerchant.id, role: "branch_staff" }));
    const session = await createMerchantAuthSession(context, "merchant-session-inactive", "merchant-session-inactive");
    assert.equal((await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${secondMerchant.id}`, headers: { cookie: session.cookie } })).statusCode, 403);
    context.store.db.prepare("UPDATE merchant_operator_memberships SET status = 'left' WHERE account_id = ?").run("merchant-session-inactive");
    assert.equal((await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${firstMerchant.id}`, headers: { cookie: session.cookie } })).statusCode, 403);
    context.store.db.prepare("UPDATE merchant_operator_memberships SET status = 'active' WHERE account_id = ?").run("merchant-session-inactive");
    context.store.db.prepare("UPDATE merchant_brands SET status = 'suspended' WHERE id = ?").run(firstMerchant.brandId);
    assert.equal((await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${firstMerchant.id}`, headers: { cookie: session.cookie } })).statusCode, 403);
    context.store.db.prepare("UPDATE merchant_brands SET status = 'active' WHERE id = ?").run(firstMerchant.brandId);
    context.store.db.prepare("UPDATE accounts SET status = 'suspended' WHERE id = ?").run("merchant-session-inactive");
    assert.equal((await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${firstMerchant.id}`, headers: { cookie: session.cookie } })).statusCode, 401);
  } finally { await context.close(); }
});

test("merchant session authorization decision uses session actor and enforces origin without changing settlement", async () => {
  const context = await setup();
  try {
    const prepared = await prepareAcceptedMission(context, "merchant-session-decision");
    const merchant = context.store.getMerchant(prepared.application.merchantId);
    insertTestAccount(context.store.db, "merchant-session-decision-account");
    await createAdminMembership(context, membershipPayload("merchant-session-decision-account", merchant.brandId, { merchantId: merchant.id, role: "branch_staff" }));
    const session = await createMerchantAuthSession(context, "merchant-session-decision-account", "merchant-session-decision");
    const current = (await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${merchant.id}`, headers: { cookie: session.cookie } })).json();
    const submitted = await context.app.inject({ method: "POST", url: "/task-code-submissions", payload: { userId: "user-demo", missionId: prepared.mission.id, merchantId: merchant.id, code: current.code, idempotencyKey: "merchant-session-submit-key" } });
    const submissionId = submitted.json().id;
    const wrongOrigin = await context.app.inject({ method: "POST", url: `/merchant/task-code-submissions/${submissionId}/decision`, headers: { cookie: session.cookie, origin: "https://evil.test" }, payload: { merchantId: merchant.id, decision: "confirm", actorId: "spoof", idempotencyKey: "merchant-session-decision-key" } });
    assert.equal(wrongOrigin.statusCode, 403, wrongOrigin.body);
    const confirmed = await context.app.inject({ method: "POST", url: `/merchant/task-code-submissions/${submissionId}/decision`, headers: { cookie: session.cookie, origin: "https://merchant.test" }, payload: { merchantId: merchant.id, decision: "confirm", actorId: "spoof", idempotencyKey: "merchant-session-decision-key" } });
    assert.equal(confirmed.statusCode, 200, confirmed.body);
    const row = context.store.db.prepare("SELECT decided_by, status FROM task_code_submissions WHERE id = ?").get(submissionId) as { decided_by: string; status: string };
    assert.equal(row.decided_by, "merchant-session-decision-account");
    assert.equal(row.status, "settled");
    const audit = context.store.auditEvents.find((event) => event.entityId === submissionId && event.action === "task_code_submission.confirmed");
    assert.equal(audit?.actorId, "merchant-session-decision-account");
    assert.equal(JSON.stringify(audit).includes("spoof"), false);
    const replay = await context.app.inject({ method: "POST", url: `/merchant/task-code-submissions/${submissionId}/decision`, headers: { cookie: session.cookie, origin: "https://merchant.test" }, payload: { merchantId: merchant.id, decision: "confirm", idempotencyKey: "merchant-session-decision-key" } });
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(countRows(context, "reward_events"), 1);
    assert.equal(countRows(context, "redemptions"), 1);
  } finally { await context.close(); }
});

test("merchant session authorization reject creates no settlement", async () => {
  const context = await setup();
  try {
    const prepared = await prepareAcceptedMission(context, "merchant-session-reject");
    const merchant = context.store.getMerchant(prepared.application.merchantId);
    insertTestAccount(context.store.db, "merchant-session-reject-account");
    await createAdminMembership(context, membershipPayload("merchant-session-reject-account", merchant.brandId, { merchantId: merchant.id, role: "branch_manager" }));
    const session = await createMerchantAuthSession(context, "merchant-session-reject-account", "merchant-session-reject");
    const current = (await context.app.inject({ method: "GET", url: `/merchant/task-code/current?merchantId=${merchant.id}`, headers: { cookie: session.cookie } })).json();
    const submitted = await context.app.inject({ method: "POST", url: "/task-code-submissions", payload: { userId: "user-demo", missionId: prepared.mission.id, merchantId: merchant.id, code: current.code, idempotencyKey: "merchant-session-reject-submit" } });
    const response = await context.app.inject({ method: "POST", url: `/merchant/task-code-submissions/${submitted.json().id}/decision`, headers: { cookie: session.cookie, origin: "https://merchant.test" }, payload: { merchantId: merchant.id, decision: "reject", idempotencyKey: "merchant-session-reject-decision" } });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(countRows(context, "reward_events"), 0);
    assert.equal(countRows(context, "redemptions"), 0);
  } finally { await context.close(); }
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

test("task code settlement pending confirm becomes settled and links settlement", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, submission } = await createTaskCodePendingSubmission(context, "settlement-pending");
  const response = await confirmTaskCodeSubmission(context, submission.id, application.merchantId, "task-code-settlement-pending-key");
  assert.equal(response.statusCode, 200, response.body);
  const decided = response.json();
  assert.equal(decided.status, "settled");
  assert.ok(decided.settledAt);
  assert.ok(decided.redemptionId);
  assert.ok(decided.rewardEventId);
  assert.deepEqual(decided.settlement, { redemptionId: decided.redemptionId, rewardEventId: decided.rewardEventId, settledAt: decided.settledAt });
  await context.close();
});

test("task code settlement creates exactly one redemption and one reward event", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, submission } = await createTaskCodePendingSubmission(context, "settlement-single-event");
  const response = await confirmTaskCodeSubmission(context, submission.id, application.merchantId, "task-code-settlement-single-key");
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(context.store.redemptions.length, 1);
  assert.equal(context.store.listRewardEvents().length, 1);
  assert.equal(context.store.listTaskCodeSubmissions()[0].redemptionId, context.store.redemptions[0].id);
  assert.equal(context.store.listTaskCodeSubmissions()[0].rewardEventId, context.store.listRewardEvents()[0].id);
  await context.close();
});

test("task code settlement general non-designated grants no base stars but keeps formal resources", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const fixed = await createTaskCodeConfirmedSubmission(context, "settlement-general-non-designated", finalizedStarDates.nonDesignated);
  setMerchantRewardCategory(context, fixed.application.merchantId, "general");
  const response = await confirmTaskCodeSubmission(context, fixed.submission.id, fixed.application.merchantId, fixed.decisionKey);
  assert.equal(response.statusCode, 200, response.body);
  const reward = context.store.listRewardEvents()[0].rewardPayload;
  assert.equal(reward.stars, 0);
  assert.equal(reward.exp, 200);
  assert.equal(reward.energy, 30);
  assert.equal(reward.carbonGrams, 800);
  await context.close();
});

test("task code settlement first meal reaches level three with energy refill and exp progress", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const fixed = await createTaskCodeConfirmedSubmission(context, "settlement-first-meal", finalizedStarDates.nonDesignated);
  setMerchantRewardCategory(context, fixed.application.merchantId, "general");
  const response = await confirmTaskCodeSubmission(context, fixed.submission.id, fixed.application.merchantId, fixed.decisionKey);
  assert.equal(response.statusCode, 200, response.body);
  const user = context.store.getUser("user-demo");
  assert.equal(user.resources.currentLevel, 3);
  assert.equal(user.resources.maxEnergy, 120);
  assert.equal(user.resources.currentEnergy, 120);
  assert.equal(user.resources.currentExp, 200);
  assert.equal(user.resources.currentExp - 150, 50);
  await context.close();
});

test("task code settlement level two and three chests are separate from base stars", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const fixed = await createTaskCodeConfirmedSubmission(context, "settlement-chests", finalizedStarDates.nonDesignated);
  setMerchantRewardCategory(context, fixed.application.merchantId, "general");
  const response = await confirmTaskCodeSubmission(context, fixed.submission.id, fixed.application.merchantId, fixed.decisionKey);
  assert.equal(response.statusCode, 200, response.body);
  const event = context.store.listRewardEvents()[0];
  assert.equal(event.rewardPayload.stars, 0);
  assert.deepEqual(event.levelSummary.rewards.map((reward) => ({ level: reward.level, stars: reward.stars })), [{ level: 2, stars: 50 }, { level: 3, stars: 100 }]);
  const levelStarTransactions = context.store.listResourceTransactions().filter((tx) => tx.resourceType === "stars" && tx.sourceType === "level_up");
  assert.deepEqual(levelStarTransactions.map((tx) => tx.amount), [50, 100]);
  assert.equal(levelStarTransactions.reduce((sum, tx) => sum + tx.amount, 0), 150);
  await context.close();
});

test("task code settlement eight hundred grams stays as permanent carbon remainder", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const fixed = await createTaskCodeConfirmedSubmission(context, "settlement-carbon-remainder", finalizedStarDates.nonDesignated);
  setMerchantRewardCategory(context, fixed.application.merchantId, "general");
  const response = await confirmTaskCodeSubmission(context, fixed.submission.id, fixed.application.merchantId, fixed.decisionKey);
  assert.equal(response.statusCode, 200, response.body);
  const growth = context.store.getUser("user-demo").growth;
  assert.equal(growth.carbonTotalGrams, 800);
  assert.equal(growth.carbonBalanceGrams, 800);
  assert.equal(growth.seedCount, 0);
  assert.equal(growth.plantCount, 0);
  assert.equal(growth.treeCount, 0);
  await context.close();
});

test("task code settlement reject creates no settlement or resources", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, submission } = await createTaskCodePendingSubmission(context, "settlement-reject");
  const response = await rejectTaskCodeSubmission(context, submission.id, application.merchantId, "task-code-settlement-reject-key");
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().status, "rejected");
  assert.equal(context.store.redemptions.length, 0);
  assert.equal(context.store.listRewardEvents().length, 0);
  assert.equal(context.store.listResourceTransactions().length, 0);
  await context.close();
});

test("task code settlement expired submission cannot settle", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, submission } = await createTaskCodePendingSubmission(context, "settlement-expired");
  context.store.db.prepare("UPDATE task_code_submissions SET confirmation_expires_at = ? WHERE id = ?").run(new Date(Date.now() - 60 * 1000).toISOString(), submission.id);
  const response = await confirmTaskCodeSubmission(context, submission.id, application.merchantId, "task-code-settlement-expired-key");
  assert.equal(response.statusCode, 409, response.body);
  assert.equal(context.store.listTaskCodeSubmissions()[0].status, "expired");
  assert.equal(context.store.redemptions.length, 0);
  assert.equal(context.store.listRewardEvents().length, 0);
  await context.close();
});

test("task code settlement same confirm replay does not add ledger level logs or chests", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const fixed = await createTaskCodeConfirmedSubmission(context, "settlement-replay-counts", finalizedStarDates.nonDesignated);
  const first = await confirmTaskCodeSubmission(context, fixed.submission.id, fixed.application.merchantId, fixed.decisionKey);
  const ledgerCount = context.store.listResourceTransactions().length;
  const levelLogCount = countRows(context, "level_up_logs");
  const rewardCount = context.store.listRewardEvents().length;
  const redemptionCount = context.store.redemptions.length;
  const second = await confirmTaskCodeSubmission(context, fixed.submission.id, fixed.application.merchantId, fixed.decisionKey);
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(second.statusCode, 200, second.body);
  assert.equal(context.store.listResourceTransactions().length, ledgerCount);
  assert.equal(countRows(context, "level_up_logs"), levelLogCount);
  assert.equal(context.store.listRewardEvents().length, rewardCount);
  assert.equal(context.store.redemptions.length, redemptionCount);
  await context.close();
});

test("task code settlement replay returns same snapshot and settledAt", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const fixed = await createTaskCodeConfirmedSubmission(context, "settlement-replay-snapshot", finalizedStarDates.nonDesignated);
  const first = await confirmTaskCodeSubmission(context, fixed.submission.id, fixed.application.merchantId, fixed.decisionKey);
  const firstEvent = context.store.listRewardEvents()[0];
  const firstSettledAt = first.json().settledAt;
  const second = await confirmTaskCodeSubmission(context, fixed.submission.id, fixed.application.merchantId, fixed.decisionKey);
  assert.equal(second.statusCode, 200, second.body);
  assert.equal(second.json().settledAt, firstSettledAt);
  assert.deepEqual(context.store.listRewardEvents()[0].ruleSnapshot, firstEvent.ruleSnapshot);
  await context.close();
});

test("task code settlement competing confirms only create one settlement", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, submission } = await createTaskCodePendingSubmission(context, "settlement-competing-confirms");
  const [first, second] = await Promise.all([
    confirmTaskCodeSubmission(context, submission.id, application.merchantId, "task-code-settlement-compete-a", "staff-a"),
    confirmTaskCodeSubmission(context, submission.id, application.merchantId, "task-code-settlement-compete-b", "staff-b"),
  ]);
  assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 409]);
  assert.equal(context.store.listTaskCodeSubmissions()[0].status, "settled");
  assert.equal(context.store.redemptions.length, 1);
  assert.equal(context.store.listRewardEvents().length, 1);
  await context.close();
});

test("task code settlement failure rolls back submission and settlement writes", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { application, submission } = await createTaskCodePendingSubmission(context, "settlement-rollback");
  context.store.failNextGrowthSettlementAt = "after_carbon_grant";
  const response = await confirmTaskCodeSubmission(context, submission.id, application.merchantId, "task-code-settlement-rollback-key");
  assert.equal(response.statusCode, 500, response.body);
  assert.equal(context.store.listTaskCodeSubmissions()[0].status, "pending");
  assert.equal(context.store.redemptions.length, 0);
  assert.equal(context.store.listRewardEvents().length, 0);
  assert.equal(context.store.listResourceTransactions().length, 0);
  assert.equal(countRows(context, "level_up_logs"), 0);
  await context.close();
});

test("task code settlement legacy confirmed can recover with original decision key", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const fixed = await createTaskCodeConfirmedSubmission(context, "settlement-confirmed-recovery", finalizedStarDates.nonDesignated);
  const response = await confirmTaskCodeSubmission(context, fixed.submission.id, fixed.application.merchantId, fixed.decisionKey);
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().status, "settled");
  assert.equal(context.store.redemptions.length, 1);
  assert.equal(context.store.listRewardEvents().length, 1);
  await context.close();
});

test("task code settlement player can read own settled result", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const fixed = await createTaskCodeConfirmedSubmission(context, "settlement-player-read", finalizedStarDates.nonDesignated);
  const confirm = await confirmTaskCodeSubmission(context, fixed.submission.id, fixed.application.merchantId, fixed.decisionKey);
  assert.equal(confirm.statusCode, 200, confirm.body);
  const response = await context.app.inject({ method: "GET", url: `/task-code-submissions/${fixed.submission.id}?userId=user-demo` });
  assert.equal(response.statusCode, 200, response.body);
  const result = response.json();
  assert.equal(result.submissionId, fixed.submission.id);
  assert.equal(result.status, "settled");
  assert.deepEqual(result.baseReward, { stars: 0, exp: 200, energy: 30, carbonGrams: 800 });
  assert.deepEqual(result.levelsCrossed, [2, 3]);
  assert.equal(result.levelBefore, 1);
  assert.equal(result.levelAfter, 3);
  assert.equal(result.chestStars, 150);
  assert.equal(result.resources.currentLevel, 3);
  assert.equal(result.resources.currentEnergy, 120);
  assert.equal(result.growthResult.carbonBalanceGrams, 800);
  await context.close();
});

test("task code settlement player pending result includes confirmation expiry", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const created = await createTaskCodePendingSubmission(context, "settlement-player-pending-read");
  const response = await context.app.inject({ method: "GET", url: `/task-code-submissions/${created.submission.id}?userId=user-demo` });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().status, "pending");
  assert.equal(response.json().submittedAt, created.submission.submittedAt);
  assert.equal(response.json().confirmationExpiresAt, created.submission.confirmationExpiresAt);
  await context.close();
});

test("task code settlement player cannot read another player's submission", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const fixed = await createTaskCodeConfirmedSubmission(context, "settlement-player-forbidden", finalizedStarDates.nonDesignated);
  const response = await context.app.inject({ method: "GET", url: `/task-code-submissions/${fixed.submission.id}?userId=other-user` });
  assert.equal(response.statusCode, 403, response.body);
  await context.close();
});

test("task code settlement API result omits task code hash and secret", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const fixed = await createTaskCodeConfirmedSubmission(context, "settlement-no-secret", finalizedStarDates.nonDesignated);
  await confirmTaskCodeSubmission(context, fixed.submission.id, fixed.application.merchantId, fixed.decisionKey);
  const response = await context.app.inject({ method: "GET", url: `/task-code-submissions/${fixed.submission.id}?userId=user-demo` });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.body;
  assert.equal(body.includes("codeHash"), false);
  assert.equal(body.includes("code_hash"), false);
  assert.equal(body.includes("fixed-task-code-secret"), false);
  assert.equal(body.includes(fixed.current.code), false);
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

async function createFirstMealPlayerEvents(context: TestContext, suffix: string) {
  const fixed = await createTaskCodeConfirmedSubmission(context, "player-event-" + suffix, finalizedStarDates.nonDesignated);
  setMerchantRewardCategory(context, fixed.application.merchantId, "general");
  const response = await confirmTaskCodeSubmission(context, fixed.submission.id, fixed.application.merchantId, fixed.decisionKey);
  assert.equal(response.statusCode, 200, response.body);
  return { ...fixed, response, events: context.store.listPlayerEventQueue() };
}

function createSecondUser(context: TestContext, userId: string): void {
  context.store.createPlayerProfile(userId, "Other Player");
}

test("player event queue first meal creates three events", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { events } = await createFirstMealPlayerEvents(context, "three-events");
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event.status), ["pending", "pending", "pending"]);
  await context.close();
});

test("player event queue orders first meal as level two level three then home scene", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { events } = await createFirstMealPlayerEvents(context, "ordered");
  assert.deepEqual(events.map((event) => [event.eventType, event.eventLevel ?? event.eventName]), [
    ["level_up", 2],
    ["level_up", 3],
    ["home_scene", "first_meal_lv3_arrival"],
  ]);
  assert.ok(events[0].queueOrder < events[1].queueOrder && events[1].queueOrder < events[2].queueOrder);
  await context.close();
});

test("player event queue level two payload uses finalized chest energy and unlock flags", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { events } = await createFirstMealPlayerEvents(context, "lv2-payload");
  const payload = events[0].payload;
  assert.equal(payload.level, 2);
  assert.equal(payload.totalExpRequired, 50);
  assert.equal(payload.chestStars, 50);
  assert.equal(payload.maxEnergy, 0);
  assert.deepEqual(payload.unlockFlags, ["clearing_basic_interactions"]);
  await context.close();
});

test("player event queue level three payload uses finalized chest energy and unlock flags", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { events } = await createFirstMealPlayerEvents(context, "lv3-payload");
  const payload = events[1].payload;
  assert.equal(payload.level, 3);
  assert.equal(payload.totalExpRequired, 150);
  assert.equal(payload.chestStars, 100);
  assert.equal(payload.maxEnergy, 120);
  assert.deepEqual(payload.unlockFlags, ["energy", "knowledge_entry", "clearing_complete"]);
  await context.close();
});

test("player event queue home scene points to forest clearing", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { events } = await createFirstMealPlayerEvents(context, "home-scene");
  const home = events[2];
  assert.equal(home.eventType, "home_scene");
  assert.equal(home.sceneId, "forest_clearing");
  assert.equal(home.eventName, "first_meal_lv3_arrival");
  assert.equal(home.payload.requiredLevel, 3);
  assert.deepEqual(home.payload.requiredUnlockFlags, ["energy", "knowledge_entry", "clearing_complete"]);
  await context.close();
});

test("player event queue settlement replay does not duplicate events", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const fixed = await createFirstMealPlayerEvents(context, "replay-no-dup");
  const firstKeys = context.store.listPlayerEventQueue().map((event) => event.eventKey);
  const replay = await confirmTaskCodeSubmission(context, fixed.submission.id, fixed.application.merchantId, fixed.decisionKey);
  assert.equal(replay.statusCode, 200, replay.body);
  assert.deepEqual(context.store.listPlayerEventQueue().map((event) => event.eventKey), firstKeys);
  assert.equal(context.store.listPlayerEventQueue().length, 3);
  await context.close();
});

test("player event queue failure rolls back settlement", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const created = await createTaskCodePendingSubmission(context, "player-event-rollback");
  setMerchantRewardCategory(context, created.application.merchantId, "general");
  context.store.failNextPlayerEventQueueWrite = true;
  const response = await confirmTaskCodeSubmission(context, created.submission.id, created.application.merchantId, "player-event-rollback-decision");
  assert.equal(response.statusCode, 500, response.body);
  assert.equal(context.store.listTaskCodeSubmissions()[0].status, "pending");
  assert.equal(context.store.redemptions.length, 0);
  assert.equal(context.store.listRewardEvents().length, 0);
  assert.equal(context.store.listPlayerEventQueue().length, 0);
  await context.close();
});

test("player event queue get next only returns earliest pending", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { events } = await createFirstMealPlayerEvents(context, "next-earliest");
  const response = await context.app.inject({ method: "GET", url: "/player/events/next?userId=user-demo" });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().event.id, events[0].id);
  await context.close();
});

test("player event queue does not expose another player event through next", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { events } = await createFirstMealPlayerEvents(context, "other-next");
  createSecondUser(context, "other-user");
  const response = await context.app.inject({ method: "GET", url: "/player/events/next?userId=other-user" });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().event, null);
  assert.equal(response.body.includes(events[0].id), false);
  await context.close();
});

test("player event queue cannot resolve later event before earliest", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { events } = await createFirstMealPlayerEvents(context, "resolve-order");
  const response = await context.app.inject({ method: "POST", url: `/player/events/${events[1].id}/resolve`, payload: { userId: "user-demo", outcome: "completed", idempotencyKey: "player-event-resolve-later" } });
  assert.equal(response.statusCode, 409, response.body);
  await context.close();
});

test("player event queue completed event reveals next event", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { events } = await createFirstMealPlayerEvents(context, "completed-next");
  const resolved = await context.app.inject({ method: "POST", url: `/player/events/${events[0].id}/resolve`, payload: { userId: "user-demo", outcome: "completed", idempotencyKey: "player-event-complete-first" } });
  assert.equal(resolved.statusCode, 200, resolved.body);
  const next = await context.app.inject({ method: "GET", url: "/player/events/next?userId=user-demo" });
  assert.equal(next.json().event.id, events[1].id);
  await context.close();
});

test("player event queue skipped event reveals next without changing resources", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { events } = await createFirstMealPlayerEvents(context, "skipped-next");
  const before = context.store.getUser("user-demo").resources;
  const resolved = await context.app.inject({ method: "POST", url: `/player/events/${events[0].id}/resolve`, payload: { userId: "user-demo", outcome: "skipped", idempotencyKey: "player-event-skip-first" } });
  assert.equal(resolved.statusCode, 200, resolved.body);
  const after = context.store.getUser("user-demo").resources;
  assert.deepEqual(after, before);
  const next = await context.app.inject({ method: "GET", url: "/player/events/next?userId=user-demo" });
  assert.equal(next.json().event.id, events[1].id);
  await context.close();
});

test("player event queue resolve replays same key idempotently", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { events } = await createFirstMealPlayerEvents(context, "resolve-replay");
  const payload = { userId: "user-demo", outcome: "completed", idempotencyKey: "player-event-replay-key" };
  const first = await context.app.inject({ method: "POST", url: `/player/events/${events[0].id}/resolve`, payload });
  const second = await context.app.inject({ method: "POST", url: `/player/events/${events[0].id}/resolve`, payload });
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(second.statusCode, 200, second.body);
  assert.equal(second.json().replayed, true);
  assert.equal(second.json().event.id, events[0].id);
  await context.close();
});

test("player event queue resolve rejects different key or outcome after resolution", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { events } = await createFirstMealPlayerEvents(context, "resolve-conflict");
  const first = await context.app.inject({ method: "POST", url: `/player/events/${events[0].id}/resolve`, payload: { userId: "user-demo", outcome: "completed", idempotencyKey: "player-event-conflict-key" } });
  assert.equal(first.statusCode, 200, first.body);
  const differentKey = await context.app.inject({ method: "POST", url: `/player/events/${events[0].id}/resolve`, payload: { userId: "user-demo", outcome: "completed", idempotencyKey: "player-event-conflict-new-key" } });
  const differentOutcome = await context.app.inject({ method: "POST", url: `/player/events/${events[0].id}/resolve`, payload: { userId: "user-demo", outcome: "skipped", idempotencyKey: "player-event-conflict-key" } });
  assert.equal(differentKey.statusCode, 409, differentKey.body);
  assert.equal(differentOutcome.statusCode, 409, differentOutcome.body);
  await context.close();
});

test("player event queue persists after store restart", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { events } = await createFirstMealPlayerEvents(context, "restart");
  await context.app.close();
  context.store.close();
  const reopenedStore = new InMemoryStore(context.dbPath, { taskCodeSecret: "fixed-task-code-secret" });
  try {
    const next = reopenedStore.getNextPlayerEvent("user-demo");
    assert.equal(next.event?.id, events[0].id);
    assert.equal(reopenedStore.listPlayerEventQueue().length, 3);
  } finally {
    reopenedStore.close();
    rmSync(context.dir, { recursive: true, force: true });
  }
});

test("player event queue ordinary settlement without crossed level creates no level up event", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const prepared = await prepareAcceptedMission(context, "player-event-no-cross");
  setMerchantRewardCategory(context, prepared.application.merchantId, "general");
  context.store.setUserResourcesForTest("user-demo", { currentLevel: 3, currentExp: 200, currentEnergy: 80, maxEnergy: 120, nextLevelExp: 330, unlockFlags: ["player_character", "forest_clearing", "clearing_basic_interactions", "energy", "knowledge_entry", "clearing_complete"] });
  updateEconomySettings(context, { redemptionExp: 50 });
  const response = await redeemMission(context, prepared, "player-event-no-cross-key", finalizedStarDates.nonDesignated);
  assert.equal(response.statusCode, 201, response.body);
  assert.equal(context.store.listPlayerEventQueue().length, 0);
  await context.close();
});

test("player event queue resolve does not create resources level logs or chests", async () => {
  const context = await setup({ taskCodeSecret: "fixed-task-code-secret" });
  const { events } = await createFirstMealPlayerEvents(context, "resolve-no-reward");
  const ledgerCount = context.store.listResourceTransactions().length;
  const levelLogCount = countRows(context, "level_up_logs");
  const rewardCount = context.store.listRewardEvents().length;
  const userBefore = context.store.getUser("user-demo");
  const resolved = await context.app.inject({ method: "POST", url: `/player/events/${events[0].id}/resolve`, payload: { userId: "user-demo", outcome: "completed", idempotencyKey: "player-event-no-reward-key" } });
  assert.equal(resolved.statusCode, 200, resolved.body);
  assert.equal(context.store.listResourceTransactions().length, ledgerCount);
  assert.equal(countRows(context, "level_up_logs"), levelLogCount);
  assert.equal(context.store.listRewardEvents().length, rewardCount);
  assert.deepEqual(context.store.getUser("user-demo").resources, userBefore.resources);
  await context.close();
});

test("platform operator rbac migration v1 through v19 is continuous and enforces membership constraints", async () => {
  assert.deepEqual(MIGRATIONS.map((migration) => migration.version), Array.from({ length: 19 }, (_, index) => index + 1));
  assert.equal(new Set(MIGRATIONS.map((migration) => migration.version)).size, 19);
  assert.equal(MIGRATIONS.at(-1)?.version, 19);
  assert.equal(MIGRATIONS.at(-1)?.name, "platform_operator_rbac");

  const context = await setup();
  try {
    const applied = context.store.db.prepare("SELECT version, name FROM schema_migrations ORDER BY version").all() as Array<{ version: number; name: string }>;
    assert.equal(applied.length, 19);
    assert.deepEqual({ ...applied.at(-1) }, { version: 19, name: "platform_operator_rbac" });
    assert.equal(countRows(context, "platform_operator_memberships"), 0);

    const accountStatusIndex = context.store.db.prepare("PRAGMA index_info(idx_platform_operator_memberships_account_status)").all() as Array<{ name: string }>;
    const roleStatusIndex = context.store.db.prepare("PRAGMA index_info(idx_platform_operator_memberships_role_status)").all() as Array<{ name: string }>;
    assert.deepEqual(accountStatusIndex.map((column) => column.name), ["account_id", "status"]);
    assert.deepEqual(roleStatusIndex.map((column) => column.name), ["role", "status"]);

    insertTestAccount(context.store.db, "platform-constraint-one");
    insertPlatformOperatorMembership(context, "platform-constraint-one", "operations_admin");
    assert.throws(() => context.store.db.prepare(`INSERT INTO platform_operator_memberships
      (id, account_id, role, status, created_at, updated_at, granted_by_account_id)
      VALUES ('platform-duplicate-role', 'platform-constraint-one', 'finance_admin', 'active', datetime('now'), datetime('now'), NULL)`).run(), /UNIQUE/);

    insertTestAccount(context.store.db, "platform-invalid-role");
    assert.throws(() => context.store.db.prepare(`INSERT INTO platform_operator_memberships
      (id, account_id, role, status, created_at, updated_at, granted_by_account_id)
      VALUES ('platform-invalid-role-membership', 'platform-invalid-role', 'owner', 'active', datetime('now'), datetime('now'), NULL)`).run(), /CHECK/);
    insertTestAccount(context.store.db, "platform-invalid-status");
    assert.throws(() => context.store.db.prepare(`INSERT INTO platform_operator_memberships
      (id, account_id, role, status, created_at, updated_at, granted_by_account_id)
      VALUES ('platform-invalid-status-membership', 'platform-invalid-status', 'super_admin', 'disabled', datetime('now'), datetime('now'), NULL)`).run(), /CHECK/);
  } finally {
    await context.close();
  }
});

test("platform operator rbac role permissions are finite server mappings", async () => {
  assert.deepEqual(PLATFORM_ROLE_PERMISSIONS.operations_admin, [
    "platform.reporting.read",
    "platform.audit.read",
    "platform.reversal.request",
  ]);
  assert.deepEqual(PLATFORM_ROLE_PERMISSIONS.finance_admin, [
    "platform.reporting.read",
    "platform.audit.read",
    "platform.reversal.review",
    "platform.reversal.apply",
  ]);
  assert.deepEqual(PLATFORM_ROLE_PERMISSIONS.super_admin, PLATFORM_PERMISSIONS);

  const context = await setup();
  try {
    for (const role of ["operations_admin", "finance_admin", "super_admin"] as const) {
      const accountId = `platform-context-${role}`;
      insertTestAccount(context.store.db, accountId);
      const membershipId = insertPlatformOperatorMembership(context, accountId, role);
      const session = createCanonicalAccountSession(context, accountId, role);
      const response = await context.app.inject({
        method: "GET",
        url: "/admin/context",
        headers: {
          cookie: session.cookie,
          "x-looper-role": "admin",
          "x-looper-account-id": "spoofed-account",
          "x-looper-permissions": "platform.identity.manage",
        },
      });
      assert.equal(response.statusCode, 200, response.body);
      assert.deepEqual(response.json(), {
        accountId,
        displayName: accountId,
        accountStatus: "active",
        membershipId,
        role,
        membershipStatus: "active",
        permissions: [...PLATFORM_ROLE_PERMISSIONS[role]],
      });
    }
  } finally {
    await context.close();
  }
});

test("platform operator rbac admin context rejects invalid session account and membership states", async () => {
  const context = await setup();
  try {
    const headerOnly = await context.app.inject({ method: "GET", url: "/admin/context", headers: adminHeaders });
    assert.equal(headerOnly.statusCode, 401, headerOnly.body);

    insertTestAccount(context.store.db, "platform-no-membership");
    const noMembershipSession = createCanonicalAccountSession(context, "platform-no-membership", "no-membership");
    assert.equal((await context.app.inject({ method: "GET", url: "/admin/context", headers: { cookie: noMembershipSession.cookie } })).statusCode, 403);

    for (const status of ["suspended", "left"] as const) {
      const accountId = `platform-membership-${status}`;
      insertTestAccount(context.store.db, accountId);
      insertPlatformOperatorMembership(context, accountId, "operations_admin", status);
      const session = createCanonicalAccountSession(context, accountId, `membership-${status}`);
      assert.equal((await context.app.inject({ method: "GET", url: "/admin/context", headers: { cookie: session.cookie } })).statusCode, 403);
    }

    for (const status of ["suspended", "closed"] as const) {
      const accountId = `platform-account-${status}`;
      insertTestAccount(context.store.db, accountId);
      insertPlatformOperatorMembership(context, accountId, "finance_admin");
      const session = createCanonicalAccountSession(context, accountId, `account-${status}`);
      context.store.db.prepare("UPDATE accounts SET status = ? WHERE id = ?").run(status, accountId);
      assert.equal((await context.app.inject({ method: "GET", url: "/admin/context", headers: { cookie: session.cookie } })).statusCode, 401);
    }

    for (const invalidState of ["expired", "revoked"] as const) {
      const accountId = `platform-session-${invalidState}`;
      insertTestAccount(context.store.db, accountId);
      insertPlatformOperatorMembership(context, accountId, "super_admin");
      const session = createCanonicalAccountSession(context, accountId, `session-${invalidState}`);
      if (invalidState === "expired") {
        context.store.db.prepare("UPDATE account_sessions SET expires_at = ? WHERE id = ?").run("2000-01-01T00:00:00.000Z", session.sessionId);
      } else {
        context.store.db.prepare("UPDATE account_sessions SET revoked_at = ? WHERE id = ?").run(new Date().toISOString(), session.sessionId);
      }
      assert.equal((await context.app.inject({ method: "GET", url: "/admin/context", headers: { cookie: session.cookie } })).statusCode, 401);
    }
  } finally {
    await context.close();
  }
});

test("platform operator rbac context ignores spoofed identity leaks no credentials and performs no writes", async () => {
  const context = await setup();
  try {
    const accountId = "platform-safe-context";
    insertTestAccount(context.store.db, accountId);
    insertPlatformOperatorMembership(context, accountId, "operations_admin");
    const session = createCanonicalAccountSession(context, accountId, "safe-context");
    const beforeChanges = (context.store.db.prepare("SELECT total_changes() AS count").get() as { count: number }).count;
    const response = await context.app.inject({
      method: "GET",
      url: "/admin/context",
      headers: {
        cookie: session.cookie,
        "x-looper-account-id": "other-account",
        "x-account-id": "other-account",
        "x-looper-role": "admin",
        "x-looper-permissions": "platform.identity.manage",
      },
    });
    const afterChanges = (context.store.db.prepare("SELECT total_changes() AS count").get() as { count: number }).count;
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().accountId, accountId);
    assert.deepEqual(response.json().permissions, [...PLATFORM_ROLE_PERMISSIONS.operations_admin]);
    assert.equal(afterChanges, beforeChanges);
    assert.equal(/token|hash|cookie|password|credential/i.test(JSON.stringify(response.json())), false);
    assert.equal("metadata" in response.json(), false);
    assert.equal("memberships" in response.json(), false);

    const querySpoof = await context.app.inject({ method: "GET", url: "/admin/context?accountId=other-account", headers: { cookie: session.cookie } });
    assert.equal(querySpoof.statusCode, 200, querySpoof.body);
    assert.equal(querySpoof.json().accountId, accountId);
  } finally {
    await context.close();
  }
});

test("platform operator rbac merchant membership cannot impersonate platform membership and merchant resolver is unchanged", async () => {
  const context = await setup();
  try {
    const { application } = await onboardMerchant(context.app, "platform-merchant-isolation@example.com");
    const merchant = context.store.getMerchant(application.merchantId);
    const accountId = "platform-merchant-only";
    insertTestAccount(context.store.db, accountId);
    assert.equal((await createAdminMembership(context, membershipPayload(accountId, merchant.brandId, { role: "brand_manager" }))).statusCode, 201);
    const session = createCanonicalAccountSession(context, accountId, "merchant-only");
    const merchantContext = await context.app.inject({ method: "GET", url: "/merchant/context", headers: { cookie: session.cookie } });
    const platformContext = await context.app.inject({ method: "GET", url: "/admin/context", headers: { cookie: session.cookie } });
    assert.equal(merchantContext.statusCode, 200, merchantContext.body);
    assert.equal(platformContext.statusCode, 403, platformContext.body);

    const legacyAdmin = await context.app.inject({ method: "GET", url: "/admin/accounts?limit=1", headers: adminHeaders });
    assert.equal(legacyAdmin.statusCode, 200, legacyAdmin.body);
  } finally {
    await context.close();
  }
});

test("platform operator rbac admin and merchant CORS use explicit credentialed allowlists", async () => {
  const context = await setup({ merchantAppUrl: "https://merchant.cors.test/path", adminAppUrl: "https://admin.cors.test/console" });
  try {
    for (const origin of ["https://merchant.cors.test", "https://admin.cors.test"] as const) {
      const response = await context.app.inject({
        method: "OPTIONS",
        url: "/admin/context",
        headers: { origin, "access-control-request-method": "GET" },
      });
      assert.equal(response.statusCode, 204, response.body);
      assert.equal(response.headers["access-control-allow-origin"], origin);
      assert.equal(response.headers["access-control-allow-credentials"], "true");
      assert.notEqual(response.headers["access-control-allow-origin"], "*");
    }
    const blocked = await context.app.inject({
      method: "OPTIONS",
      url: "/admin/context",
      headers: { origin: "https://evil.test", "access-control-request-method": "GET" },
    });
    assert.equal(blocked.headers["access-control-allow-origin"], undefined);
  } finally {
    await context.close();
  }

  for (const options of [
    { production: true, merchantAppUrl: "https://merchant.production.test" },
    { production: true, adminAppUrl: "https://admin.production.test" },
  ]) {
    const store = new InMemoryStore(":memory:");
    try {
      await assert.rejects(() => buildApp(store, options), /LOOPER_(ADMIN|MERCHANT)_APP_URL is required in production/);
    } finally {
      store.close();
    }
  }
});
