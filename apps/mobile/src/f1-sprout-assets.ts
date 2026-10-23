/**
 * APP-MERGE-F1-SPROUT-INFO-01 | asset source of truth
 *
 * Transfer source is the event-planning handoff. INFO-only originals have not arrived.
 * IMPORTANT: 2026-10-23 Main Forest ZIP reused these FIVE filenames for
 * MAIN_SCENE_SPROUT_STATES candidates and EXPLICITLY excludes info-page art.
 * Filenames are not identity; NEVER map the Main ZIP pictures into these IDs.
 * These originals were not attached
 * to this Git workspace. Keep exactly these asset IDs, filenames and ordering.
 * Never substitute visually similar images or use any stage sprite in the Forest
 * central planting slot. The stage is an *information-view* illustration only.
 */
export const F1_FOREST_BACKGROUND = {
  assetId: "scene_forest_clearing_base",
  filename: "陽光瀑布森林秘境.png",
  sceneId: "forest_clearing",
  visualStateId: "V-F1",
  target: "forest_background",
  bundleStatus: "SOURCE_PENDING" as const,
} as const;

export const F1_SPROUT_STAGE_GROUP = "f1_sprout_info_states" as const;
export const F1_SPROUT_INFO_STAGES = [
  {
    stage: 1,
    assetId: "f1_sprout_info_stage_01",
    filename: "可愛種子萌芽土丘圖示.png",
    target: "sprout_info_only",
    bundleStatus: "SOURCE_PENDING",
  },
  {
    stage: 2,
    assetId: "f1_sprout_info_stage_02",
    filename: "透明背景的雙葉幼苗土丘圖示.png",
    target: "sprout_info_only",
    bundleStatus: "SOURCE_PENDING",
  },
  {
    stage: 3,
    assetId: "f1_sprout_info_stage_03",
    filename: "卡通風格三葉幼苗土堆.png",
    target: "sprout_info_only",
    bundleStatus: "SOURCE_PENDING",
  },
  {
    stage: 4,
    assetId: "f1_sprout_info_stage_04",
    filename: "透明背景上的立體嫩芽土丘.png",
    target: "sprout_info_only",
    bundleStatus: "SOURCE_PENDING",
  },
  {
    stage: 5,
    assetId: "f1_sprout_info_stage_05",
    filename: "陽光下的四葉幼苗土丘.png",
    target: "sprout_info_only",
    bundleStatus: "SOURCE_PENDING",
  },
] as const;

export type SproutStage = 1 | 2 | 3 | 4 | 5;
export function isSproutStage(value: number): value is SproutStage {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}
export function stageByIndex(value: number) {
  return isSproutStage(value) ? F1_SPROUT_INFO_STAGES[value - 1] : null;
}
/** Non-transactional QA inspection selection. The real stage must come from
 * the official verified carbon projection, never from local care/EXP/level. */
export function qaSelectSproutStage(value: number): SproutStage | null {
  return isSproutStage(value) ? value : null;
}
export const F1_SPROUT_INFO_ROUTE = {
  from: "F1-SPROUT",
  open: "F1-SPROUT-OBSERVE",
  detail: "F1-HUD-CO2-DETAIL",
  back: "V-F1",
  systemEvents: ["OB103", "EV-CARBON-DETAIL"] as const,
  qaOnlyStateSwitching: true,
  writesLedger: false,
} as const;
