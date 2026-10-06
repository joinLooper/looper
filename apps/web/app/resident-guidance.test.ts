import assert from "node:assert/strict";
import test from "node:test";
import {
  RESIDENT_GUIDANCE_STEPS,
  hasCompletedResidentGuidance,
  markResidentGuidanceFinished,
  residentGuidanceStorageKey,
  residentWelcomeTitle,
  shouldAutoStartResidentGuidance,
} from "./resident-guidance";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

test("guidance contains the approved six-step resident narrative", () => {
  assert.equal(RESIDENT_GUIDANCE_STEPS.length, 6);
  assert.deepEqual(
    RESIDENT_GUIDANCE_STEPS.map((step) => step.title),
    [
      "歡迎來到 Looper",
      "這裡是你的家",
      "每次行動，都會留下成長",
      "先從今天的小任務開始",
      "城市生活機能正在準備",
      "開始你的居民生活",
    ],
  );
  assert.deepEqual(
    RESIDENT_GUIDANCE_STEPS.map((step) => step.primaryAction),
    ["開始看看", "下一步", "下一步", "去看看", "知道了", "開始探索"],
  );
});

test("auto start waits for authenticated canonical state to finish loading", () => {
  const ready = {
    previewMode: true,
    sessionState: "authenticated",
    connection: "connected",
    residentId: "resident-a",
    completed: false,
  };
  assert.equal(shouldAutoStartResidentGuidance(ready), true);
  assert.equal(
    shouldAutoStartResidentGuidance({ ...ready, sessionState: "unauthenticated" }),
    false,
  );
  assert.equal(
    shouldAutoStartResidentGuidance({ ...ready, connection: "loading" }),
    false,
  );
  assert.equal(
    shouldAutoStartResidentGuidance({ ...ready, residentId: "" }),
    false,
  );
  assert.equal(
    shouldAutoStartResidentGuidance({ ...ready, completed: true }),
    false,
  );
  assert.equal(
    shouldAutoStartResidentGuidance({ ...ready, previewMode: false }),
    false,
  );
});

test("completed guidance remains resident scoped after refresh", () => {
  const storage = memoryStorage();
  assert.equal(hasCompletedResidentGuidance(storage, "resident-a"), false);
  markResidentGuidanceFinished(storage, "resident-a", "completed");
  assert.equal(hasCompletedResidentGuidance(storage, "resident-a"), true);
  assert.equal(hasCompletedResidentGuidance(storage, "resident-b"), false);
});

test("skipping also completes only the current resident guidance", () => {
  const storage = memoryStorage();
  markResidentGuidanceFinished(storage, "resident-b", "skipped");
  assert.equal(hasCompletedResidentGuidance(storage, "resident-b"), true);
  assert.equal(hasCompletedResidentGuidance(storage, "resident-a"), false);
});

test("resident key uses canonical ID and never display name", () => {
  const keyA = residentGuidanceStorageKey("canonical-a");
  const keyB = residentGuidanceStorageKey("canonical-b");
  assert.notEqual(keyA, keyB);
  assert.match(keyA, /^looper\.web\.residentGuidance\.v1\./);
  assert.throws(() => residentGuidanceStorageKey("  "));
});

test("welcome title safely handles missing and padded display names", () => {
  assert.equal(residentWelcomeTitle(undefined), "歡迎來到 Looper");
  assert.equal(residentWelcomeTitle("   "), "歡迎來到 Looper");
  assert.equal(residentWelcomeTitle("  小綠  "), "歡迎來到 Looper，小綠");
});

test("guidance copy does not expose forbidden implementation language", () => {
  const copy = JSON.stringify(RESIDENT_GUIDANCE_STEPS);
  for (const forbidden of [
    "API",
    "Session",
    "settlement",
    "transaction",
    "Tester",
    "user-demo",
    "測試帳號",
    "開發模式",
  ]) {
    assert.equal(copy.includes(forbidden), false, `unexpected copy: ${forbidden}`);
  }
});
