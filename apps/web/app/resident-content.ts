import type { UserGrowthBalance } from "@looper/types";

export type ResidentGrowthStage = "seed" | "plant" | "tree";

export interface ResidentGrowthView {
  stage: ResidentGrowthStage;
  stageIcon: "🌱" | "🪴" | "🌳";
  stageLabel: string;
  carbonTotalKg: number;
  carbonBalanceKg: number;
  seedCount: number;
  plantCount: number;
  treeCount: number;
}

export function buildResidentGrowthView(
  growth: UserGrowthBalance,
): ResidentGrowthView {
  const stage: ResidentGrowthStage =
    growth.treeCount > 0
      ? "tree"
      : growth.plantCount > 0
        ? "plant"
        : "seed";

  return {
    stage,
    stageIcon: stage === "tree" ? "🌳" : stage === "plant" ? "🪴" : "🌱",
    stageLabel:
      stage === "tree"
        ? "森林已長出樹木"
        : stage === "plant"
          ? "植物正在成長"
          : "第一株新芽正在等待成長",
    carbonTotalKg: growth.carbonTotalGrams / 1000,
    carbonBalanceKg: growth.carbonBalanceGrams / 1000,
    seedCount: growth.seedCount,
    plantCount: growth.plantCount,
    treeCount: growth.treeCount,
  };
}

export const EMPTY_RESIDENT_GROWTH: ResidentGrowthView = {
  stage: "seed",
  stageIcon: "🌱",
  stageLabel: "第一株新芽正在等待成長",
  carbonTotalKg: 0,
  carbonBalanceKg: 0,
  seedCount: 0,
  plantCount: 0,
  treeCount: 0,
};
