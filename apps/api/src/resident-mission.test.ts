import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildApp } from "./app.js";
import { migrateDatabase } from "./database.js";
import { InMemoryStore } from "./store.js";

const playerOrigin = "https://player.test";
const sessionTtl = 7 * 24 * 60 * 60;

async function setup(initialNow = "2026-08-16T03:00:00.000Z") {
  const dir = mkdtempSync(join(tmpdir(), "looper-resident-mission-"));
  const dbPath = join(dir, "test.sqlite");
  let now = initialNow;
  const store = new InMemoryStore(dbPath, { now: () => now });
  const app = await buildApp(store, { playerAppUrl: playerOrigin, playerIdentityVerifier: null });
  await app.ready();
  const session = (subject: string, displayName = subject) => {
    const authentication = store.createPlayerSession({ provider: "line", providerSubject: subject, displayName }, sessionTtl);
    return {
      userId: authentication.context.userId,
      cookie: `looper_player_session=${authentication.sessionToken}`,
    };
  };
  return {
    app,
    store,
    dbPath,
    session,
    setNow(value: string) { now = value; },
    async close() {
      await app.close();
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function missionMutationHeaders(cookie: string) {
  return { cookie, origin: playerOrigin };
}

function count(store: InMemoryStore, table: string, where = "", parameters: Array<string | number | bigint | Uint8Array | null> = []): number {
  const row = store.db.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get(...parameters) as { count: number };
  return Number(row.count);
}

test("resident mission runtime exposes frozen Today slots and isolates A/B instances", async () => {
  const context = await setup();
  try {
    const residentA = context.session("resident-a", "Resident A");
    const residentB = context.session("resident-b", "Resident B");
    const runtimeA = await context.app.inject({ method: "GET", url: "/player/missions/runtime", headers: { cookie: residentA.cookie } });
    const runtimeB = await context.app.inject({ method: "GET", url: "/player/missions/runtime", headers: { cookie: residentB.cookie } });
    assert.equal(runtimeA.statusCode, 200, runtimeA.body);
    assert.equal(runtimeB.statusCode, 200, runtimeB.body);
    assert.equal(runtimeA.json().businessDate, "2026-08-16");
    assert.equal(runtimeA.json().today.length, 2);
    assert.deepEqual(runtimeA.json().today[0], {
      id: "resident-daily-arrival",
      name: "今日來訪",
      period: "today",
      kind: "non_merchant",
      status: "completed",
      truth: "authenticated_player_session",
      claimable: false,
      claimed: false,
      reward: { stars: 0, exp: 0, energy: 0, carbonGrams: 0 },
    });
    const coreTreeA = runtimeA.json().today[1];
    assert.deepEqual({
      id: coreTreeA.id,
      name: coreTreeA.name,
      state: coreTreeA.state,
      completionState: coreTreeA.completionState,
      claimable: coreTreeA.claimable,
      claimed: coreTreeA.claimed,
      reward: coreTreeA.reward,
    }, {
      id: "resident-daily-core-tree-check",
      name: "看看今天的森林",
      state: "AVAILABLE",
      completionState: "PENDING",
      claimable: false,
      claimed: false,
      reward: { stars: 10, exp: 0, energy: 0, carbonGrams: 0 },
    });
    assert.notEqual(coreTreeA.instanceId, runtimeB.json().today[1].instanceId);
    assert.equal(count(context.store, "resident_mission_instances"), 2);
  } finally {
    await context.close();
  }
});

test("Core Tree completion is backend dated, duplicate-safe, reward-free, and resident isolated", async () => {
  const context = await setup();
  try {
    const residentA = context.session("completion-a");
    const residentB = context.session("completion-b");
    const request = { method: "POST" as const, url: "/player/world/core-tree/interactions/open", headers: missionMutationHeaders(residentA.cookie), payload: {} };
    const first = await context.app.inject(request);
    const duplicate = await context.app.inject(request);
    assert.equal(first.statusCode, 201, first.body);
    assert.equal(duplicate.statusCode, 200, duplicate.body);
    assert.equal(first.json().replayed, false);
    assert.equal(duplicate.json().replayed, true);
    assert.equal(first.json().missionInstance.id, duplicate.json().missionInstance.id);
    assert.equal(first.json().missionInstance.completionState, "COMPLETED");
    assert.equal(first.json().missionInstance.claimState, "CLAIMABLE");
    assert.equal(first.json().missionInstance.businessDate, "2026-08-16");
    assert.equal(count(context.store, "resident_mission_instances", "WHERE user_id = ?", [residentA.userId]), 1);
    assert.equal(context.store.listRewardEvents().length, 0);
    assert.equal(context.store.listResourceTransactions().length, 0);
    assert.deepEqual(context.store.getUser(residentA.userId).growth, context.store.getUser(residentB.userId).growth);

    const isolated = await context.app.inject({ method: "GET", url: "/player/missions/runtime", headers: { cookie: residentB.cookie } });
    assert.equal(isolated.json().today[1].completionState, "PENDING");
    const crossClaim = await context.app.inject({
      method: "POST",
      url: `/player/missions/instances/${first.json().missionInstance.id}/claim`,
      headers: missionMutationHeaders(residentB.cookie),
      payload: { idempotencyKey: "cross-resident-claim" },
    });
    assert.equal(crossClaim.statusCode, 404, crossClaim.body);
    assert.equal(context.store.getUser(residentB.userId).resources.starBalance, 0);
  } finally {
    await context.close();
  }
});

test("claim atomically grants exactly 10 Stars and enforces replay, conflict, persistence, and unique source", async () => {
  const context = await setup();
  try {
    const firstDevice = context.session("claim-resident", "Claim Resident");
    const secondDevice = context.session("claim-resident", "Claim Resident");
    assert.equal(firstDevice.userId, secondDevice.userId);
    const completed = await context.app.inject({
      method: "POST",
      url: "/player/world/core-tree/interactions/open",
      headers: missionMutationHeaders(firstDevice.cookie),
      payload: {},
    });
    const instanceId = completed.json().missionInstance.id as string;
    const claimUrl = `/player/missions/instances/${instanceId}/claim`;
    const payload = { idempotencyKey: "claim-core-tree-20260816" };
    const claimed = await context.app.inject({ method: "POST", url: claimUrl, headers: missionMutationHeaders(firstDevice.cookie), payload });
    assert.equal(claimed.statusCode, 201, claimed.body);
    assert.deepEqual(claimed.json().rewardResult, {
      starsGranted: 10,
      expGranted: 0,
      energyGranted: 0,
      carbonGrams: 0,
      rewardEventId: claimed.json().rewardResult.rewardEventId,
    });
    assert.equal(claimed.json().claimed, true);
    assert.equal(claimed.json().missionInstance.state, "CLAIMED");
    assert.equal(claimed.json().authoritativeStarsBalance, 10);
    assert.deepEqual(claimed.json().playerBalances, { stars: 10, energy: 0, exp: 0, carbonGrams: 0 });

    const replay = await context.app.inject({ method: "POST", url: claimUrl, headers: missionMutationHeaders(secondDevice.cookie), payload });
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(replay.json().replayed, true);
    assert.equal(replay.json().rewardResult.rewardEventId, claimed.json().rewardResult.rewardEventId);
    assert.equal(replay.json().authoritativeStarsBalance, 10);

    const sameKeyDifferentPayload = await context.app.inject({
      method: "POST",
      url: "/player/missions/instances/not-the-original-instance/claim",
      headers: missionMutationHeaders(secondDevice.cookie),
      payload,
    });
    assert.equal(sameKeyDifferentPayload.statusCode, 409, sameKeyDifferentPayload.body);
    const newKeyAfterClaimed = await context.app.inject({
      method: "POST",
      url: claimUrl,
      headers: missionMutationHeaders(secondDevice.cookie),
      payload: { idempotencyKey: "claim-core-tree-second-key" },
    });
    assert.equal(newKeyAfterClaimed.statusCode, 409, newKeyAfterClaimed.body);

    const runtimeAfterRelogin = await context.app.inject({ method: "GET", url: "/player/missions/runtime", headers: { cookie: secondDevice.cookie } });
    assert.equal(runtimeAfterRelogin.json().today[1].claimed, true);
    assert.equal(runtimeAfterRelogin.json().today[1].claimedAt, claimed.json().missionInstance.claimedAt);
    assert.equal(context.store.getUser(firstDevice.userId).resources.starBalance, 10);
    assert.equal(count(context.store, "reward_events", "WHERE user_id = ? AND source_type = 'task_completion' AND source_id = ?", [firstDevice.userId, instanceId]), 1);
    assert.equal(count(context.store, "resource_transactions", "WHERE user_id = ? AND resource_type = 'stars' AND source_id = ? AND amount = 10", [firstDevice.userId, instanceId]), 1);
    const authority = context.store.db.prepare("SELECT logical_request_json FROM reward_events WHERE source_id = ?").get(instanceId) as { logical_request_json: string };
    assert.equal(JSON.parse(authority.logical_request_json).authoritySource, "non_merchant_mission_claim");
    const starsLedger = context.store.listResourceTransactions().find((transaction) => transaction.sourceId === instanceId && transaction.resourceType === "stars");
    assert.equal(starsLedger?.metadata.authoritySource, "non_merchant_mission_claim");
    assert.equal(count(context.store, "plant_growth_logs", "WHERE user_id = ? AND source_id = ?", [firstDevice.userId, instanceId]), 0);
    assert.equal(context.store.getUser(firstDevice.userId).resources.currentExp, 0);
    assert.equal(context.store.getUser(firstDevice.userId).resources.currentEnergy, 0);
    assert.deepEqual(context.store.getUser(firstDevice.userId).growth, {
      carbonTotalGrams: 0,
      carbonBalanceGrams: 0,
      seedCount: 0,
      plantCount: 0,
      treeCount: 0,
      version: 1,
      updatedAt: context.store.getUser(firstDevice.userId).growth.updatedAt,
    });
  } finally {
    await context.close();
  }
});

test("simultaneous multi-device claims create one reward only", async () => {
  const context = await setup();
  try {
    const deviceA = context.session("concurrent-resident");
    const deviceB = context.session("concurrent-resident");
    const completed = await context.app.inject({ method: "POST", url: "/player/world/core-tree/interactions/open", headers: missionMutationHeaders(deviceA.cookie), payload: {} });
    const instanceId = completed.json().missionInstance.id as string;
    const url = `/player/missions/instances/${instanceId}/claim`;
    const [first, second] = await Promise.all([
      context.app.inject({ method: "POST", url, headers: missionMutationHeaders(deviceA.cookie), payload: { idempotencyKey: "concurrent-device-key-a" } }),
      context.app.inject({ method: "POST", url, headers: missionMutationHeaders(deviceB.cookie), payload: { idempotencyKey: "concurrent-device-key-b" } }),
    ]);
    assert.deepEqual([first.statusCode, second.statusCode].sort(), [201, 409]);
    assert.equal(context.store.getUser(deviceA.userId).resources.starBalance, 10);
    assert.equal(count(context.store, "reward_events", "WHERE user_id = ? AND source_id = ?", [deviceA.userId, instanceId]), 1);
    assert.equal(count(context.store, "resource_transactions", "WHERE user_id = ? AND resource_type = 'stars' AND source_id = ?", [deviceA.userId, instanceId]), 1);
  } finally {
    await context.close();
  }
});

test("claim failure rolls back pending state, ledger, Stars, and request before a clean retry", async () => {
  const context = await setup();
  try {
    const resident = context.session("rollback-resident");
    const completed = await context.app.inject({ method: "POST", url: "/player/world/core-tree/interactions/open", headers: missionMutationHeaders(resident.cookie), payload: {} });
    const instanceId = completed.json().missionInstance.id as string;
    const request = {
      method: "POST" as const,
      url: `/player/missions/instances/${instanceId}/claim`,
      headers: missionMutationHeaders(resident.cookie),
      payload: { idempotencyKey: "rollback-mission-claim" },
    };
    context.store.failNextResidentMissionClaimFinalize = true;
    const failed = await context.app.inject(request);
    assert.equal(failed.statusCode, 500, failed.body);
    const afterFailure = await context.app.inject({ method: "GET", url: "/player/missions/runtime", headers: { cookie: resident.cookie } });
    assert.equal(afterFailure.json().today[1].state, "CLAIMABLE");
    assert.equal(afterFailure.json().today[1].claimable, true);
    assert.equal(context.store.getUser(resident.userId).resources.starBalance, 0);
    assert.equal(count(context.store, "resident_mission_claim_requests"), 0);
    assert.equal(count(context.store, "reward_events", "WHERE source_id = ?", [instanceId]), 0);
    assert.equal(count(context.store, "resource_transactions", "WHERE source_id = ?", [instanceId]), 0);

    const retry = await context.app.inject(request);
    assert.equal(retry.statusCode, 201, retry.body);
    assert.equal(retry.json().authoritativeStarsBalance, 10);
  } finally {
    await context.close();
  }
});

test("Asia/Taipei midnight creates a new instance and preserves prior-day history", async () => {
  const context = await setup("2026-08-16T15:59:59.000Z");
  try {
    const resident = context.session("date-boundary-resident");
    const before = await context.app.inject({ method: "POST", url: "/player/world/core-tree/interactions/open", headers: missionMutationHeaders(resident.cookie), payload: {} });
    assert.equal(before.json().missionInstance.businessDate, "2026-08-16");
    const priorId = before.json().missionInstance.id as string;

    context.setNow("2026-08-16T16:00:00.000Z");
    const after = await context.app.inject({ method: "GET", url: "/player/missions/runtime", headers: { cookie: resident.cookie } });
    assert.equal(after.json().businessDate, "2026-08-17");
    assert.notEqual(after.json().today[1].instanceId, priorId);
    assert.equal(after.json().today[1].completionState, "PENDING");
    const prior = context.store.db.prepare("SELECT business_date, completion_state, claim_state FROM resident_mission_instances WHERE id = ?").get(priorId) as Record<string, unknown>;
    assert.deepEqual({ ...prior }, { business_date: "2026-08-16", completion_state: "COMPLETED", claim_state: "CLAIMABLE" });
    assert.equal(count(context.store, "resident_mission_instances", "WHERE user_id = ?", [resident.userId]), 2);

    const staleClaim = await context.app.inject({
      method: "POST",
      url: `/player/missions/instances/${priorId}/claim`,
      headers: missionMutationHeaders(resident.cookie),
      payload: { idempotencyKey: "stale-business-date-claim" },
    });
    assert.equal(staleClaim.statusCode, 409, staleClaim.body);
  } finally {
    await context.close();
  }
});

test("migration v26 upgrades v25 idempotently while preserving player state and foreign keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "looper-resident-mission-migration-"));
  const dbPath = join(dir, "migration.sqlite");
  const store = new InMemoryStore(dbPath);
  try {
    store.db.prepare("UPDATE user_resources SET star_balance = 37 WHERE user_id = 'user-demo'").run();
    store.db.exec("DROP TABLE resident_mission_claim_requests; DROP TABLE resident_mission_instances;");
    store.db.prepare("DELETE FROM schema_migrations WHERE version = 26").run();
    migrateDatabase(store.db);
    migrateDatabase(store.db);
    assert.equal(store.getUser("user-demo").resources.starBalance, 37);
    assert.equal(count(store, "schema_migrations", "WHERE version = 26"), 1);
    assert.equal(count(store, "resident_mission_instances"), 0);
    assert.throws(() => store.db.prepare(`INSERT INTO resident_mission_instances
      (id, user_id, mission_id, business_date, state, completion_state, completion_truth, completed_at, claim_state, claimed_at, reward_event_id, created_at, updated_at)
      VALUES ('bad-fk', 'missing-user', 'resident-daily-core-tree-check', '2026-08-16', 'AVAILABLE', 'PENDING', 'core_tree_world_interaction_opened', NULL, 'NOT_CLAIMABLE', NULL, NULL, '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:00.000Z')`).run(), /FOREIGN KEY/);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
