import type { EconomySettings, GrowthSummary, LevelDefinition, LevelSummary, MerchantPlanDefinition, RewardSummary } from "@looper/types";

export const DEFAULT_ECONOMY_SETTINGS: EconomySettings = {
  vegetarianCarbonGrams: 800,
  carbonGramsPerSeed: 2000,
  seedsPerPlant: 10,
  plantsPerTree: 10,
  redemptionEnergy: 30,
  redemptionExp: 100,
  energyRegenIntervalSeconds: 20 * 60,
  energyOverflowMultiplier: 1.5,
};

export const MERCHANT_PLAN_DEFINITIONS: MerchantPlanDefinition[] = [
  { plan: "sprout", label: "小店方案", rewardStarAmount: 400 },
  { plan: "grove", label: "中店方案", rewardStarAmount: 500 },
  { plan: "forest", label: "大店方案", rewardStarAmount: 600 },
];

export const LEVEL_DEFINITIONS: LevelDefinition[] = [
  { level: 1, requiredTotalExp: 0, rewardStars: 0, maxEnergyIncrease: 0, unlockFlags: [] },
  { level: 2, requiredTotalExp: 500, rewardStars: 50, maxEnergyIncrease: 10, unlockFlags: ["resource_details"] },
  { level: 3, requiredTotalExp: 1200, rewardStars: 80, maxEnergyIncrease: 10, unlockFlags: ["growth_history"] },
  { level: 4, requiredTotalExp: 2200, rewardStars: 120, maxEnergyIncrease: 15, unlockFlags: ["market_events"] },
];

export function nextLevelExp(currentLevel: number): number {
  const next = LEVEL_DEFINITIONS.find((item) => item.level === currentLevel + 1);
  return next?.requiredTotalExp ?? LEVEL_DEFINITIONS[LEVEL_DEFINITIONS.length - 1].requiredTotalExp;
}

export function formatKg(grams: number): string {
  return (grams / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 1 });
}

export function applyGrowth(input: {
  carbonTotalGrams: number;
  carbonBalanceGrams: number;
  seedCount: number;
  plantCount: number;
  treeCount: number;
  carbonDeltaGrams: number;
  settings?: EconomySettings;
}): GrowthSummary {
  const settings = input.settings ?? DEFAULT_ECONOMY_SETTINGS;
  let carbonTotalGrams = input.carbonTotalGrams + input.carbonDeltaGrams;
  let carbonBalanceGrams = input.carbonBalanceGrams + input.carbonDeltaGrams;
  let seedCount = input.seedCount;
  let plantCount = input.plantCount;
  let treeCount = input.treeCount;

  const generatedSeeds = Math.floor(carbonBalanceGrams / settings.carbonGramsPerSeed);
  carbonBalanceGrams %= settings.carbonGramsPerSeed;
  seedCount += generatedSeeds;

  const generatedPlants = Math.floor(seedCount / settings.seedsPerPlant);
  seedCount %= settings.seedsPerPlant;
  plantCount += generatedPlants;

  const generatedTrees = Math.floor(plantCount / settings.plantsPerTree);
  plantCount %= settings.plantsPerTree;
  treeCount += generatedTrees;

  return {
    generatedSeeds,
    generatedPlants,
    generatedTrees,
    seedCount,
    plantCount,
    treeCount,
    carbonTotalGrams,
    carbonBalanceGrams,
  };
}

export function applyLevelProgress(input: {
  currentLevel: number;
  currentExp: number;
  currentMaxEnergy: number;
  expDelta: number;
}): LevelSummary & { currentExp: number; maxEnergy: number; levelRewardStars: number; unlockFlags: string[] } {
  const previousLevel = input.currentLevel;
  const currentExp = input.currentExp + input.expDelta;
  let currentLevel = input.currentLevel;
  let maxEnergy = input.currentMaxEnergy;
  let levelRewardStars = 0;
  const rewards: LevelSummary["rewards"] = [];
  const unlockFlags = new Set<string>();

  for (const definition of LEVEL_DEFINITIONS) {
    if (definition.level <= currentLevel) continue;
    if (currentExp < definition.requiredTotalExp) break;
    currentLevel = definition.level;
    maxEnergy += definition.maxEnergyIncrease;
    levelRewardStars += definition.rewardStars;
    definition.unlockFlags.forEach((flag) => unlockFlags.add(flag));
    rewards.push({
      level: definition.level,
      stars: definition.rewardStars,
      maxEnergyIncrease: definition.maxEnergyIncrease,
      unlockFlags: definition.unlockFlags,
    });
  }

  return {
    previousLevel,
    currentLevel,
    levelsGained: currentLevel - previousLevel,
    rewards,
    currentExp,
    maxEnergy,
    levelRewardStars,
    unlockFlags: [...unlockFlags],
  };
}

export function buildRewardSummary(stars: number, energy: number, energyOverflow: number, exp: number, carbonGrams: number): RewardSummary {
  return { stars, energy, energyOverflow, exp, carbonGrams };
}
