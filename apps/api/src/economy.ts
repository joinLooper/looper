import type { EconomySettings, GrowthSummary, LevelDefinition, LevelSummary, MerchantPlanDefinition, MerchantRewardCategory, RewardSummary } from "@looper/types";

export const FINALIZED_SETTLEMENT_RULE_VERSION = "mvp-v1.0-2026-07-13";
export const DEFAULT_MERCHANT_TIMEZONE = "Asia/Taipei";

export const DEFAULT_ECONOMY_SETTINGS: EconomySettings = {
  vegetarianCarbonGrams: 800,
  carbonGramsPerSeed: 2000,
  seedsPerPlant: 5,
  plantsPerTree: 5,
  redemptionEnergy: 30,
  redemptionExp: 200,
  energyRegenIntervalSeconds: 2 * 60,
  energyOverflowMultiplier: 1,
};

export const MERCHANT_PLAN_DEFINITIONS: MerchantPlanDefinition[] = [
  { plan: "sprout", label: "小店方案", rewardStarAmount: 400 },
  { plan: "grove", label: "中店方案", rewardStarAmount: 500 },
  { plan: "forest", label: "大店方案", rewardStarAmount: 600 },
];

export const LEVEL_DEFINITIONS: LevelDefinition[] = [
  { level: 1, requiredTotalExp: 0, rewardStars: 0, maxEnergyIncrease: 0, unlockFlags: ["player_character", "forest_clearing"] },
  { level: 2, requiredTotalExp: 50, rewardStars: 50, maxEnergyIncrease: 0, unlockFlags: ["clearing_basic_interactions"] },
  { level: 3, requiredTotalExp: 150, rewardStars: 100, maxEnergyIncrease: 120, unlockFlags: ["energy", "knowledge_entry", "clearing_complete"] },
  { level: 4, requiredTotalExp: 330, rewardStars: 0, maxEnergyIncrease: 3, unlockFlags: ["treehouse_preparation"] },
  { level: 5, requiredTotalExp: 610, rewardStars: 150, maxEnergyIncrease: 3, unlockFlags: ["treehouse_main", "dual_character"] },
  { level: 6, requiredTotalExp: 1010, rewardStars: 0, maxEnergyIncrease: 3, unlockFlags: ["time_of_day_life", "weekly_mission_board", "snack_activity", "home_tools"] },
  { level: 7, requiredTotalExp: 1530, rewardStars: 200, maxEnergyIncrease: 3, unlockFlags: ["interaction_bubbles", "duo_events", "compost_activity"] },
  { level: 8, requiredTotalExp: 2190, rewardStars: 0, maxEnergyIncrease: 3, unlockFlags: ["memory_photos", "weekly_mission_completion_scene"] },
  { level: 9, requiredTotalExp: 3010, rewardStars: 250, maxEnergyIncrease: 3, unlockFlags: [] },
  { level: 10, requiredTotalExp: 4010, rewardStars: 500, maxEnergyIncrease: 4, unlockFlags: ["chapter_one_complete"] },
];

export type MerchantRewardDateInfo = {
  occurredAt: string;
  merchantTimezone: string;
  merchantLocalDate: string;
  isMonday: boolean;
  lunarDay: number;
  isDesignatedDate: boolean;
};

export type MerchantStarReward = MerchantRewardDateInfo & {
  merchantRewardCategory: MerchantRewardCategory;
  stars: number;
};

function requireValidDate(input: string | Date): Date {
  const date = typeof input === "string" ? new Date(input) : input;
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid occurredAt");
  return date;
}

function partsFor(locale: string, date: Date, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat(locale, options).formatToParts(date);
}

function part(parts: Intl.DateTimeFormatPart[], type: string): string {
  return parts.find((item) => item.type === type)?.value ?? "";
}

export function getMaxEnergyForLevel(level: number, levelDefinitions: LevelDefinition[] = LEVEL_DEFINITIONS): number {
  return levelDefinitions
    .filter((definition) => definition.level <= level)
    .reduce((sum, definition) => sum + definition.maxEnergyIncrease, 0);
}

export function getMerchantRewardDateInfo(occurredAt: string | Date, timezone = DEFAULT_MERCHANT_TIMEZONE): MerchantRewardDateInfo {
  const date = requireValidDate(occurredAt);
  const localDateParts = partsFor("en-CA", date, { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const merchantLocalDate = `${part(localDateParts, "year")}-${part(localDateParts, "month")}-${part(localDateParts, "day")}`;
  const weekday = part(partsFor("en-US", date, { timeZone: timezone, weekday: "short" }), "weekday");
  const lunarDay = Number(part(partsFor("en-US-u-ca-chinese", date, { timeZone: timezone, day: "numeric" }), "day"));
  if (!Number.isInteger(lunarDay)) throw new Error("Unable to resolve lunar day");
  const isMonday = weekday === "Mon";
  const isDesignatedDate = isMonday || lunarDay === 1 || lunarDay === 15;
  return {
    occurredAt: date.toISOString(),
    merchantTimezone: timezone,
    merchantLocalDate,
    isMonday,
    lunarDay,
    isDesignatedDate,
  };
}

export function calculateMerchantStarReward(input: { rewardCategory: MerchantRewardCategory; occurredAt: string | Date; timezone?: string }): MerchantStarReward {
  const dateInfo = getMerchantRewardDateInfo(input.occurredAt, input.timezone ?? DEFAULT_MERCHANT_TIMEZONE);
  const stars = input.rewardCategory === "star"
    ? (dateInfo.isDesignatedDate ? 350 : 200)
    : (dateInfo.isDesignatedDate ? 100 : 0);
  return {
    ...dateInfo,
    merchantRewardCategory: input.rewardCategory,
    stars,
  };
}

export function currentLevelRequiredExp(currentLevel: number, levelDefinitions: LevelDefinition[]): number {
  const current = levelDefinitions.find((item) => item.level === currentLevel);
  if (!current) throw new Error(`Missing level definition for level ${currentLevel}`);
  return current.requiredTotalExp;
}

export function nextLevelExp(currentLevel: number, levelDefinitions: LevelDefinition[]): number | null {
  const next = levelDefinitions.find((item) => item.level === currentLevel + 1);
  return next?.requiredTotalExp ?? null;
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
  levelDefinitions: LevelDefinition[];
}): LevelSummary & { currentExp: number; maxEnergy: number; levelRewardStars: number; unlockFlags: string[] } {
  const previousLevel = input.currentLevel;
  const currentExp = input.currentExp + input.expDelta;
  let currentLevel = input.currentLevel;
  let maxEnergy = input.currentMaxEnergy;
  let levelRewardStars = 0;
  const rewards: LevelSummary["rewards"] = [];
  const unlockFlags = new Set<string>();

  currentLevelRequiredExp(currentLevel, input.levelDefinitions);
  for (const definition of input.levelDefinitions) {
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
