import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { PlayerEventQueueItem } from "@looper/types";
import { getOrCreateResolutionState, playerEventCard, reconcileResolutionState, shouldRenderPlayerEventCard } from "./player-event-flow";

function event(overrides: Partial<PlayerEventQueueItem>): PlayerEventQueueItem {
  return {
    queueOrder: 1,
    id: "event-1",
    userId: "user-demo",
    sourceRewardEventId: "reward-event-1",
    eventKey: "reward-event:reward-event-1:level:2",
    eventType: "level_up",
    eventLevel: 2,
    eventName: "level_up_lv2",
    payload: {
      level: 2,
      totalExpRequired: 50,
      chestStars: 50,
      maxEnergy: 0,
      unlockFlags: ["clearing_basic_interactions"],
      levelBefore: 1,
      levelAfter: 3,
      sourceRewardEventId: "reward-event-1",
    },
    status: "pending",
    createdAt: "2026-07-14T00:00:00.000Z",
    ...overrides,
  };
}

test("player event flow hides card when no event exists", () => {
  assert.equal(shouldRenderPlayerEventCard(null), false);
});

test("player event flow shows level two payload values without formulas", () => {
  const card = playerEventCard(event({}));
  assert.equal(card.title, "升級到 Lv.2");
  assert.deepEqual(card.details, ["寶箱⭐ +50", "能量上限 0", "解鎖新功能 × 1", "Lv.1 → Lv.3"]);
});

test("player event flow completed level two keeps key and moves with backend next level three", () => {
  let count = 0;
  const state = getOrCreateResolutionState(null, "event-lv2", "completed", () => `id-${++count}`);
  assert.equal(state.idempotencyKey, "player-event:id-1");
  const next = event({ id: "event-lv3", eventLevel: 3, eventName: "level_up_lv3", payload: { level: 3, chestStars: 100, maxEnergy: 120, unlockFlags: ["energy", "knowledge_entry", "clearing_complete"], levelBefore: 1, levelAfter: 3 } });
  assert.equal(reconcileResolutionState(state, next), null);
  assert.equal(playerEventCard(next).title, "升級到 Lv.3");
});

test("player event flow skipped level two also moves with backend next level three", () => {
  const state = getOrCreateResolutionState(null, "event-lv2", "skipped", () => "skip-1");
  const next = event({ id: "event-lv3", eventLevel: 3, eventName: "level_up_lv3", payload: { level: 3, chestStars: 100, maxEnergy: 120, unlockFlags: ["energy", "knowledge_entry", "clearing_complete"], levelBefore: 1, levelAfter: 3 } });
  assert.equal(state.outcome, "skipped");
  assert.equal(reconcileResolutionState(state, next), null);
  assert.deepEqual(playerEventCard(next).details, ["寶箱⭐ +100", "能量上限 120", "解鎖新功能 × 3", "Lv.1 → Lv.3"]);
});

test("player event flow level three can be followed by first meal home scene", () => {
  const home = event({ id: "event-home", eventType: "home_scene", eventLevel: undefined, sceneId: "forest_clearing", eventName: "first_meal_lv3_arrival", payload: { requiredLevel: 3, sceneId: "forest_clearing", eventName: "first_meal_lv3_arrival", requiredUnlockFlags: ["energy"], sourceRewardEventId: "reward-event-1" } });
  const card = playerEventCard(home);
  assert.equal(card.title, "森林落腳處已準備好了");
  assert.equal(card.primaryAction, "進入森林落腳處");
});

test("player event flow home scene completed ends when backend has no next event", () => {
  const state = getOrCreateResolutionState(null, "event-home", "completed", () => "home-complete");
  assert.equal(reconcileResolutionState(state, null), null);
});

test("player event flow home scene skipped ends when backend has no next event", () => {
  const state = getOrCreateResolutionState(null, "event-home", "skipped", () => "home-skip");
  assert.equal(reconcileResolutionState(state, null), null);
});

test("player event flow double click reuses the same resolve state", () => {
  let count = 0;
  const first = getOrCreateResolutionState(null, "event-1", "completed", () => `id-${++count}`);
  const second = getOrCreateResolutionState(first, "event-1", "completed", () => `id-${++count}`);
  assert.deepEqual(second, first);
  assert.equal(count, 1);
});

test("player event flow network retry keeps idempotency key", () => {
  const current = { eventId: "event-1", outcome: "completed" as const, idempotencyKey: "player-event:stable" };
  const retry = getOrCreateResolutionState(current, "event-1", "completed", () => "new");
  assert.equal(retry.idempotencyKey, "player-event:stable");
});

test("player event flow refresh with same event keeps local resolution key", () => {
  const current = { eventId: "event-1", outcome: "completed" as const, idempotencyKey: "player-event:stable" };
  assert.deepEqual(reconcileResolutionState(current, event({ id: "event-1" })), current);
});

test("player event flow clears local key when backend event changed", () => {
  const current = { eventId: "event-old", outcome: "completed" as const, idempotencyKey: "player-event:old" };
  assert.equal(reconcileResolutionState(current, event({ id: "event-new" })), null);
});

test("player event flow uses backend next after conflict", () => {
  const current = { eventId: "event-old", outcome: "completed" as const, idempotencyKey: "player-event:old" };
  const backendNext = event({ id: "event-lv3", eventLevel: 3, eventName: "level_up_lv3", payload: { level: 3, chestStars: 100, maxEnergy: 120, unlockFlags: ["energy", "knowledge_entry", "clearing_complete"], levelBefore: 1, levelAfter: 3 } });
  assert.equal(reconcileResolutionState(current, backendNext), null);
  assert.equal(playerEventCard(backendNext).title, "升級到 Lv.3");
});

test("player event flow does not define level chest energy formulas", () => {
  const source = readFileSync(new URL("./player-event-flow.ts", import.meta.url), "utf8");
  assert.equal(/requiredTotalExp\s*[+\-*/]|chestStars\s*[+\-*/]|maxEnergy\s*[+\-*/]|LEVEL_DEFINITIONS|rewardStars/i.test(source), false);
});
