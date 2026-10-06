import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveReducedMotionPreference } from "@looper/types";
import { buildApp } from "./app.js";
import { migrateDatabase } from "./database.js";
import { InMemoryStore } from "./store.js";

const playerOrigin = "https://player.test";
const sessionTtl = 7 * 24 * 60 * 60;

async function setup(initialNow = "2026-08-17T03:00:00.000Z") {
  const dir = mkdtempSync(join(tmpdir(), "looper-presentation-preference-"));
  let now = initialNow;
  const store = new InMemoryStore(join(dir, "test.sqlite"), { now: () => now });
  const app = await buildApp(store, { playerAppUrl: playerOrigin, playerIdentityVerifier: null });
  await app.ready();
  const session = (subject: string) => {
    const authentication = store.createPlayerSession({ provider: "line", providerSubject: subject, displayName: subject }, sessionTtl);
    return {
      userId: authentication.context.userId,
      cookie: `looper_player_session=${authentication.sessionToken}`,
    };
  };
  return {
    app,
    store,
    session,
    setNow(value: string) { now = value; },
    async close() {
      await app.close();
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function mutationHeaders(cookie: string) {
  return { cookie, origin: playerOrigin };
}

function rows(store: InMemoryStore, table: string): unknown[] {
  return store.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
}

function gameTruthSnapshot(store: InMemoryStore) {
  return {
    resources: rows(store, "user_resources"),
    growth: rows(store, "user_growth_balances"),
    rewards: rows(store, "reward_events"),
    transactions: rows(store, "resource_transactions"),
    residentMissions: rows(store, "resident_mission_instances"),
    residentMissionClaims: rows(store, "resident_mission_claim_requests"),
    knowledge: rows(store, "knowledge_card_attempts"),
    merchantMissions: rows(store, "mission_enrollments"),
  };
}

test("null preference uses system fallback while explicit account values win", () => {
  assert.equal(resolveReducedMotionPreference(null, false), false);
  assert.equal(resolveReducedMotionPreference(null, true), true);
  assert.equal(resolveReducedMotionPreference(false, true), false);
  assert.equal(resolveReducedMotionPreference(true, false), true);
});

test("presentation preference API is authenticated, nullable by default, and accepts only the canonical boolean payload", async () => {
  const context = await setup();
  try {
    const resident = context.session("strict-payload");
    const initial = await context.app.inject({ method: "GET", url: "/player/preferences/presentation", headers: { cookie: resident.cookie } });
    assert.equal(initial.statusCode, 200, initial.body);
    assert.deepEqual(initial.json(), { reducedMotion: null, updatedAt: null });

    const unauthenticated = await context.app.inject({ method: "GET", url: "/player/preferences/presentation" });
    assert.equal(unauthenticated.statusCode, 401);
    const identifierInjection = await context.app.inject({
      method: "POST",
      url: "/player/preferences/presentation",
      headers: mutationHeaders(resident.cookie),
      payload: { reducedMotion: true, userId: resident.userId },
    });
    assert.equal(identifierInjection.statusCode, 400);
    const invalidValue = await context.app.inject({
      method: "POST",
      url: "/player/preferences/presentation",
      headers: mutationHeaders(resident.cookie),
      payload: { reducedMotion: "true" },
    });
    assert.equal(invalidValue.statusCode, 400);
    const wrongOrigin = await context.app.inject({
      method: "POST",
      url: "/player/preferences/presentation",
      headers: { cookie: resident.cookie, origin: "https://attacker.test" },
      payload: { reducedMotion: true },
    });
    assert.equal(wrongOrigin.statusCode, 403);
    assert.deepEqual(context.store.getPlayerPresentationPreference(resident.userId), { reducedMotion: null, updatedAt: null });
  } finally {
    await context.close();
  }
});

test("explicit ON and OFF survive reload, logout/relogin, and synchronize across same-resident devices with last successful write wins", async () => {
  const context = await setup();
  try {
    const deviceA = context.session("durable-resident");
    const deviceB = context.session("durable-resident");
    assert.equal(deviceB.userId, deviceA.userId);

    const enabled = await context.app.inject({
      method: "POST",
      url: "/player/preferences/presentation",
      headers: mutationHeaders(deviceA.cookie),
      payload: { reducedMotion: true },
    });
    assert.equal(enabled.statusCode, 200, enabled.body);
    assert.deepEqual(enabled.json(), { reducedMotion: true, updatedAt: "2026-08-17T03:00:00.000Z" });
    const deviceBReload = await context.app.inject({ method: "GET", url: "/player/preferences/presentation", headers: { cookie: deviceB.cookie } });
    assert.deepEqual(deviceBReload.json(), enabled.json());

    context.setNow("2026-08-17T03:01:00.000Z");
    const disabled = await context.app.inject({
      method: "POST",
      url: "/player/preferences/presentation",
      headers: mutationHeaders(deviceB.cookie),
      payload: { reducedMotion: false },
    });
    assert.deepEqual(disabled.json(), { reducedMotion: false, updatedAt: "2026-08-17T03:01:00.000Z" });
    const deviceAReload = await context.app.inject({ method: "GET", url: "/player/preferences/presentation", headers: { cookie: deviceA.cookie } });
    assert.deepEqual(deviceAReload.json(), disabled.json());

    const logout = await context.app.inject({ method: "DELETE", url: "/auth/player/session", headers: mutationHeaders(deviceA.cookie) });
    assert.equal(logout.statusCode, 200, logout.body);
    assert.equal((await context.app.inject({ method: "GET", url: "/player/preferences/presentation", headers: { cookie: deviceA.cookie } })).statusCode, 401);
    const relogin = context.session("durable-resident");
    assert.equal(relogin.userId, deviceA.userId);
    const restored = await context.app.inject({ method: "GET", url: "/player/preferences/presentation", headers: { cookie: relogin.cookie } });
    assert.deepEqual(restored.json(), disabled.json());
  } finally {
    await context.close();
  }
});

test("resident A and B preferences remain isolated", async () => {
  const context = await setup();
  try {
    const residentA = context.session("resident-a");
    const residentB = context.session("resident-b");
    await context.app.inject({ method: "POST", url: "/player/preferences/presentation", headers: mutationHeaders(residentA.cookie), payload: { reducedMotion: true } });
    await context.app.inject({ method: "POST", url: "/player/preferences/presentation", headers: mutationHeaders(residentB.cookie), payload: { reducedMotion: false } });
    assert.equal(context.store.getPlayerPresentationPreference(residentA.userId).reducedMotion, true);
    assert.equal(context.store.getPlayerPresentationPreference(residentB.userId).reducedMotion, false);
  } finally {
    await context.close();
  }
});

test("failed preference mutation rolls back and cannot change mission, reward, knowledge, CO2e, EXP, Energy, or growth truth", async () => {
  const context = await setup();
  try {
    const resident = context.session("rollback-resident");
    context.store.setUserResourcesForTest(resident.userId, { currentLevel: 3, currentExp: 150, nextLevelExp: 330, maxEnergy: 100, currentEnergy: 0 });
    const mission = context.store.completeCoreTreeMission(resident.userId).missionInstance;
    context.store.claimResidentMission(resident.userId, mission.id, "preference-truth-claim");
    context.store.answerKnowledgeCard(resident.userId, "sustainable-takeaway-container-v1", {
      selectedOptionId: "reusable-container",
      cardVersion: "v1",
      idempotencyKey: "preference-truth-knowledge",
    });
    context.store.updatePlayerPresentationPreference(resident.userId, { reducedMotion: false });
    const before = gameTruthSnapshot(context.store);

    context.store.failNextPresentationPreferenceWrite = true;
    const failed = await context.app.inject({
      method: "POST",
      url: "/player/preferences/presentation",
      headers: mutationHeaders(resident.cookie),
      payload: { reducedMotion: true },
    });
    assert.equal(failed.statusCode, 500, failed.body);
    assert.equal(context.store.getPlayerPresentationPreference(resident.userId).reducedMotion, false);
    assert.deepEqual(gameTruthSnapshot(context.store), before);

    context.setNow("2026-08-17T03:02:00.000Z");
    context.store.updatePlayerPresentationPreference(resident.userId, { reducedMotion: true });
    context.store.updatePlayerPresentationPreference(resident.userId, { reducedMotion: false });
    assert.deepEqual(gameTruthSnapshot(context.store), before);
  } finally {
    await context.close();
  }
});

test("migration v26 to v27 preserves resident state and foreign keys without false backfill", async () => {
  const context = await setup();
  try {
    const resident = context.session("migration-resident");
    context.store.setUserResourcesForTest(resident.userId, { currentLevel: 3, currentExp: 150, nextLevelExp: 330, maxEnergy: 100, currentEnergy: 0 });
    const mission = context.store.completeCoreTreeMission(resident.userId).missionInstance;
    context.store.claimResidentMission(resident.userId, mission.id, "migration-preserve-claim");
    context.store.answerKnowledgeCard(resident.userId, "sustainable-takeaway-container-v1", {
      selectedOptionId: "reusable-container",
      cardVersion: "v1",
      idempotencyKey: "migration-preserve-knowledge",
    });
    const before = gameTruthSnapshot(context.store);

    context.store.db.exec(`
      ALTER TABLE users DROP COLUMN reduced_motion_updated_at;
      ALTER TABLE users DROP COLUMN reduced_motion;
      DELETE FROM schema_migrations WHERE version = 27;
    `);
    assert.equal((context.store.db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }).version, 26);
    migrateDatabase(context.store.db);

    assert.deepEqual(context.store.getPlayerPresentationPreference(resident.userId), { reducedMotion: null, updatedAt: null });
    assert.deepEqual(gameTruthSnapshot(context.store), before);
    assert.deepEqual(context.store.db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.deepEqual(
      { ...(context.store.db.prepare("SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT 1").get() as object) },
      { version: 27, name: "reduced_motion_durable_persistence" },
    );
    migrateDatabase(context.store.db);
    assert.equal((context.store.db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 27").get() as { count: number }).count, 1);
  } finally {
    await context.close();
  }
});
