import assert from "node:assert/strict";
import test from "node:test";
import { buildResidentGrowthView } from "./resident-content";

const baseGrowth = {
  carbonTotalGrams: 0,
  carbonBalanceGrams: 0,
  seedCount: 0,
  plantCount: 0,
  treeCount: 0,
  version: 1,
  updatedAt: "2026-07-25T00:00:00.000Z",
};

test("resident growth uses canonical carbon and inventory fields", () => {
  assert.deepEqual(
    buildResidentGrowthView({
      ...baseGrowth,
      carbonTotalGrams: 3450,
      carbonBalanceGrams: 450,
      seedCount: 2,
    }),
    {
      stage: "seed",
      stageIcon: "🌱",
      stageLabel: "第一株新芽正在等待成長",
      carbonTotalKg: 3.45,
      carbonBalanceKg: 0.45,
      seedCount: 2,
      plantCount: 0,
      treeCount: 0,
    },
  );
});

test("resident growth stage follows persisted plant and tree counts", () => {
  assert.equal(
    buildResidentGrowthView({ ...baseGrowth, plantCount: 1 }).stage,
    "plant",
  );
  assert.equal(
    buildResidentGrowthView({
      ...baseGrowth,
      plantCount: 2,
      treeCount: 1,
    }).stage,
    "tree",
  );
});
