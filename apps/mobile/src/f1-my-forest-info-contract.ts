/**
 * F1-MY-FOREST-INFO-REBUILD-02
 * Central-approved routing/data contract; candidate artwork is NOT approved.
 * The Forest central planting sprite, previous PR63 "sprout-info" stage pictures,
 * and new milestone artwork are distinct identities.
 */
export const F1_MY_FOREST_HANDOFF = Object.freeze({
  batch: "F1-MY-FOREST-INFO-REBUILD-02",
  zipFile: "F1_MY_FOREST_INFO_REBUILD_02_CANDIDATE.zip",
  expectedZipSha256: "501b2697740e276d8b90e78ed698d8b39cd34e90fd4c1dd4731a365f9d073204",
  originalBytesVerified: false,
  artworkStatus: "VISUAL_CANDIDATE",
  artReviewed: false,
  readyForIntegration: false,
  missingSourceAction: "ART_PENDING",
  scene: "forest_clearing",
  sourceCanvas: Object.freeze({width:941,height:1672}),
  fixedGroupId: "f1_my_forest_static_character_info_group",
  dimBackgroundId: "f1_forest_clearing_base_dim",
  mainForestSproutHotspot: "sprout-hotspot",
  pageTestId: "my-forest-info-panel",
  closeTestId: "close-sheet",
  qaOnly: true,
  writesLedger: false,
  allowedReturn: "SAME_FOREST_INSTANCE",
} as const);

export const MY_FOREST_CANDIDATE_ASSETS = Object.freeze({
  dimBackground: Object.freeze({
    assetId:"f1_forest_clearing_base_dim",
    filename:"f1_forest_clearing_base_dim.png",
    role:"INFO_BACKGROUND_ONLY",
  }),
  staticGroup:Object.freeze({
    assetId:"f1_my_forest_static_character_info_group",
    role:"SINGLE_FIXED_IMAGE_GROUP",
    includes:["土撥鼠","土撥鼠樹樁","我的森林木牌","固定資訊框",
      "固定花葉、陰影及裝飾","下方固定說明板"] as const,
  }),
  stages:[
    {stage:1,kind:"default",filename:"f1_my_forest_stage_01.png",assetId:"f1_my_forest_stage_01"},
    {stage:2,kind:"bright",filename:"f1_my_forest_stage_02_bright.png",assetId:"f1_my_forest_stage_02_bright"},
    {stage:2,kind:"dim",filename:"f1_my_forest_stage_02_dim.png",assetId:"f1_my_forest_stage_02_dim"},
    {stage:3,kind:"bright",filename:"f1_my_forest_stage_03_bright.png",assetId:"f1_my_forest_stage_03_bright"},
    {stage:3,kind:"dim",filename:"f1_my_forest_stage_03_dim.png",assetId:"f1_my_forest_stage_03_dim"},
    {stage:4,kind:"bright",filename:"f1_my_forest_stage_04_bright.png",assetId:"f1_my_forest_stage_04_bright"},
    {stage:4,kind:"dim",filename:"f1_my_forest_stage_04_dim.png",assetId:"f1_my_forest_stage_04_dim"},
    {stage:5,kind:"bright",filename:"f1_my_forest_stage_05_bright.png",assetId:"f1_my_forest_stage_05_bright"},
    {stage:5,kind:"dim",filename:"f1_my_forest_stage_05_dim.png",assetId:"f1_my_forest_stage_05_dim"},
  ],
} as const);

/** Uniform cover projection for the 941x1672 original canvas. Do not
 * stretch the dim Forest or fixed-group image independently.
 */
export function myForestInfoCover(viewportWidth:number,viewportHeight:number){
  const {width,height}=F1_MY_FOREST_HANDOFF.sourceCanvas;
  const w=Math.max(1,viewportWidth),h=Math.max(1,viewportHeight);
  const scale=Math.max(w/width,h/height);
  return {
    scale,
    imageWidth:width*scale,imageHeight:height*scale,
    left:(w-width*scale)/2,top:(h-height*scale)/2,
  };
}

export const MY_FOREST_STAGE_NUMBERS = [1,2,3,4,5] as const;
export type MyForestStage = typeof MY_FOREST_STAGE_NUMBERS[number];
export type UnlockableStage = 2|3|4|5;
export type StageArtState = "default"|"bright"|"dim"|"pending";
export type QaStageOverride = Readonly<Partial<Record<UnlockableStage,"bright"|"dim">>>;

/** The backend-owned resource ledger must supply unlock flags directly.
 * Nothing in the UI calculates thresholds, unlock flags or carbon credits.
 */
export interface MyForestLedgerSnapshot {
  source: "FORMAL_RESOURCE_LEDGER";
  plantedCount: number|null;
  accumulatedCarbonKg: number|null;
  nextPlantProgress: {currentKg:number|null;targetKg:number|null}|null;
  stageUnlocked: Readonly<Partial<Record<UnlockableStage,boolean|null>>>;
  stageNames: Readonly<Partial<Record<MyForestStage,string|null>>>;
  stageValues: Readonly<Partial<Record<MyForestStage,string|null>>>;
  footerDescription: string|null;
}

export const MY_FOREST_EMPTY_LEDGER: MyForestLedgerSnapshot|null = null;

/** The art cannot claim a milestone is achieved while the formal ledger has
 * no value. Stage01 always has its single default image.
 * QA overrides are ephemeral visual tests only; never copied to the ledger.
 */
export function myForestStageState(stage:MyForestStage,
  ledger:MyForestLedgerSnapshot|null,
  qaOverride:QaStageOverride|null=null,
  qaMode=false):StageArtState {
  if(stage===1)return "default";
  if(qaMode && qaOverride){
    const test=qaOverride[stage];
    if(test==="bright"||test==="dim")return test;
  }
  if(ledger?.source!=="FORMAL_RESOURCE_LEDGER")return "pending";
  const unlocked=ledger.stageUnlocked[stage];
  return unlocked===true?"bright":unlocked===false?"dim":"pending";
}

export function myForestStageAsset(stage:MyForestStage,state:StageArtState) {
  if(stage===1) return state==="default" ? MY_FOREST_CANDIDATE_ASSETS.stages[0] : null;
  if(state!=="bright" && state!=="dim")return null;
  return MY_FOREST_CANDIDATE_ASSETS.stages.find(x=>x.stage===stage && x.kind===state)??null;
}

/** The UI only reads snapshot-provided fields; missing values stay null.
 * Crucially, neither level, EXP, care, nor QA stage selection can produce them.
 */
export function myForestValues(ledger:MyForestLedgerSnapshot|null) {
  if(ledger?.source!=="FORMAL_RESOURCE_LEDGER"){
    return {plantedCount:null,accumulatedCarbonKg:null,nextPlantProgress:null,
      stageNames:null,stageValues:null,footerDescription:null};
  }
  return {
    plantedCount:ledger.plantedCount,
    accumulatedCarbonKg:ledger.accumulatedCarbonKg,
    nextPlantProgress:ledger.nextPlantProgress,
    stageNames:ledger.stageNames,
    stageValues:ledger.stageValues,
    footerDescription:ledger.footerDescription,
  };
}

/** Asset ingestion checks must inspect pixel content for embedded
 * labels/numbers before approving anything as Final.
 */
export function myForestArtGate(
  bytesVerified:boolean, humanArtApproved:boolean, embeddedDynamicTextClean:boolean
) {
  return bytesVerified && humanArtApproved && embeddedDynamicTextClean
    ? "ELIGIBLE_FOR_FUTURE_INTEGRATION"
    : "BLOCKED_ART_REVIEW";
}
