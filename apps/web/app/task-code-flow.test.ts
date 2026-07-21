import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { normalizeTaskCode, getOrCreateSubmissionKey, settledDisplay, shouldPollSubmission, validateTaskCode } from "./task-code-flow";

test("player task code flow creates one submission key and reuses it for retry", () => {
  let count = 0;
  const createId = () => `id-${++count}`;
  const first = getOrCreateSubmissionKey(undefined, createId);
  const retry = getOrCreateSubmissionKey(first, createId);
  assert.equal(first, "task-code-ui:id-1");
  assert.equal(retry, first);
  assert.equal(count, 1);
});

test("player task code flow polls pending without reposting", () => {
  assert.equal(shouldPollSubmission("pending"), true);
  assert.equal(shouldPollSubmission("settled"), false);
  assert.equal(shouldPollSubmission("rejected"), false);
  assert.equal(shouldPollSubmission("expired"), false);
});

test("player task code flow validates blank non-four-digit and normalizes input", () => {
  assert.equal(validateTaskCode(""), "請輸入店家提供的4碼任務碼。");
  assert.equal(validateTaskCode("12"), "任務碼必須是4碼數字。");
  assert.equal(normalizeTaskCode("a12-345"), "1234");
  assert.equal(validateTaskCode("1234"), undefined);
});

test("player task code flow displays settled result from backend response", () => {
  const display = settledDisplay({
    submissionId: "sub-1",
    status: "settled",
    merchantId: "merchant-1",
    missionId: "mission-1",
    submittedAt: "2026-07-13T00:00:00.000Z",
    confirmationExpiresAt: "2026-07-13T00:05:00.000Z",
    expiredAt: null,
    baseReward: { stars: 0, exp: 200, energy: 30, carbonGrams: 800 },
    growthResult: { generatedSeeds: 0, generatedPlants: 0, generatedTrees: 0, seedCount: 0, plantCount: 0, treeCount: 0, carbonTotalGrams: 800, carbonBalanceGrams: 800 },
    levelBefore: 1,
    levelAfter: 3,
    levelsCrossed: [2, 3],
    chestStars: 150,
    resources: {
      starBalance: 150,
      currentEnergy: 120,
      maxEnergy: 120,
      energyRegenIntervalSeconds: 120,
      energyLastUpdatedAt: "2026-07-13T00:00:00.000Z",
      energyOverflowPending: 0,
      currentExp: 200,
      currentLevel: 3,
      nextLevelExp: 330,
      isMaxLevel: false,
      unlockFlags: ["energy"],
    },
  });
  assert.deepEqual({ stars: display.stars, exp: display.exp, energy: display.energy, carbonGrams: display.carbonGrams, chestStars: display.chestStars, levelBefore: display.levelBefore, levelAfter: display.levelAfter }, {
    stars: 0,
    exp: 200,
    energy: 30,
    carbonGrams: 800,
    chestStars: 150,
    levelBefore: 1,
    levelAfter: 3,
  });
});

test("player task code UI does not expose QR camera diamond hash or secret", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.equal(/QR|相機|鏡頭|💎|codeHash|code_hash|secret/i.test(source), false);
});
