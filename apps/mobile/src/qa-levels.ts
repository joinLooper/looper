/** QA snapshots only. Thresholds checked against apps/api/src/economy.ts by tests.
 * Stars and carbon are synthetic independent balances, never inferred from level.
 * Missing scene art is reported, never generated or claimed to be implemented. */
export const QA_LEVELS = [1, 3, 5, 10] as const;
export type QaLevel = (typeof QA_LEVELS)[number];
export function qaGateEnabled(dev: boolean, optIn?: string) { return dev || optIn === "1"; }
export const QA_LEVEL_GATE_ENABLED = qaGateEnabled(
  typeof __DEV__ !== "undefined" && __DEV__, process.env.EXPO_PUBLIC_ENABLE_QA_LEVELS,
);
export function isQaLevel(value: number): value is QaLevel {
  return QA_LEVELS.some(level => level === value);
}
const thresholds = {
  1: { exp: 0, nextExp: 50, energy: 0 },
  3: { exp: 150, nextExp: 330, energy: 120 },
  5: { exp: 610, nextExp: 1010, energy: 126 },
  10: { exp: 4010, nextExp: null, energy: 142 },
} as const;
export function qaWorld(level: QaLevel) {
  return {
    level, ...thresholds[level], stars: 6, carbonGrams: 0,
    knowledge: level >= 3, energyUnlocked: level >= 3,
    rabbit: level >= 5, treehouse: level >= 5,
    memoryUnlocked: level >= 8, chapterComplete: level === 10,
    title: level === 1 ? "初始森林" : level === 3 ? "活力與知識" : level === 5 ? "樹屋與第二居民" : "第一章完成門檻",
    gaps: [
      "角色正式圖像未接入：目前仍為 ART_PENDING。",
      "共用森林與初期嫩芽圖；CO₂e 為獨立測試值 0，不以等級推算成長。",
      ...(level >= 3 ? ["Lv3 森林完成階段與樹屋微光圖層尚未接入。"] : []),
      ...(level >= 5 ? ["樹屋只接入口與角色位置，內部、小舖及生活結構尚未接入。"] : []),
      ...(level === 10 ? ["章節完成與回憶門檻已預置；回憶內容、完成痕跡與 Lv6–9 生活功能未接入，不虛構事件。"] : []),
    ],
  };
}
