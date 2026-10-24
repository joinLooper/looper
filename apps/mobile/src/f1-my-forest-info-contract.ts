/**
 * F1-MY-FOREST-INFO-REBUILD-02
 * Central-approved routing/data contract; candidate artwork is NOT approved.
 * The Forest central planting sprite, previous PR63 "sprout-info" stage pictures,
 * and new milestone artwork are distinct identities.
 */
/**
 * User-approved whole-screen VISUAL COMPOSITION (2026-10-24) — not permission
 * to promote unreviewed extracted PNGs, sample ledger numbers or PR #66's R6
 * alternate layout. Keep the actual approved screenshot intact in Library.
 * The existing Asset Master remains the only Asset ID identity source.
 */
export const F1_MY_FOREST_APPROVED_SCREEN_COMPOSITION = Object.freeze({
  sceneId:"forest_clearing",
  visualStateId:"V-HUD-CARBONDETAIL",
  sourceCanvas:Object.freeze({width:941,height:1672}),
  referenceFilename:"V-HUD-CARBONDETAIL_APPROVED_VISUAL_REFERENCE_20261024.png",
  libraryPath:"/Looper/VisualReview/F1-MyForest-Info/V-HUD-CARBONDETAIL_APPROVED_VISUAL_REFERENCE_20261024.png",
  sha256:"b324e4cc37d52d04ecc730532f027fb990b8cc96e970e5f97916992f14652081",
  approval:"USER_APPROVED_FULL_SCREEN_COMPOSITION_ONLY",
  layoutLocked:true,
  protectedLayout:Object.freeze([
    "full-bleed dark forest with upper-right X close button",
    "marmot with sprout on head positioned on left stump",
    "wood My Forest sign top-right with its existing two lines",
    "one growing central sapling within the landscape",
    "large THREE-COLUMN pale wood information panel in original location",
    "SEPARATE brown explanatory wood plank underneath the information panel",
    "five milestone saplings on dark bottom ground/wood rail BELOW the plank",
    "original character, wood, light, proportions, depth, and spacing",
  ]),
  // 3 trees / 6.8 kg / 0.8 / 2.0 are visual examples, NOT ledger facts.
  exampleNumbersNotLedger:true,
  doesNotGrantAssetReady:true,
} as const);

/** Asset-level approval only; exact independently delivered PNG bytes.
 * Candidate IDs mirror the handoff package; Visual Asset Register remains
 * the ONLY registry of formal IDs. Never promote candidate by naming alone.
 * The user accepted the NEW pot artwork, not the older icon in the layout.
 */
export const F1_MY_FOREST_POT_TREE_SOURCE_AUTHORITY=Object.freeze({
  batch:"F1-MY-FOREST-POT-TREE-STANDARDIZE-01",
  archiveSha256:"86598f41bc3e0b2351c60db09d93cd572d0bd6993c145946c22de6595ae93989",
  sceneId:"forest_clearing",
  visualStateId:"V-HUD-CARBONDETAIL",
  pot:Object.freeze({
    candidateAssetId:"f1_my_forest_pot_icon",
    sourceFilename:"f1_my_forest_pot_icon_final.png",
    sha256:"d8ee877b6720f2892e8ff6803dcb47b05c4f06d1de0e7a1d61cc4fa21f0abf3b",
    visualApproved:true,
    unit:"盆",
    ledgerField:"potCount",
  }),
  tree:Object.freeze({
    candidateAssetId:"f1_my_forest_tree_icon",
    sourceFilename:"f1_my_forest_tree_icon_final.png",
    sha256:"fc5ce9453e5a556c577bd3342f1e6e24350728b91f65af91d4225274bfb4f4ee",
    visualApproved:false,
    unit:"棵",
    ledgerField:"treeCount",
  }),
  placementApproved:false,
  formalAssetIdentityVerified:false,
  runtimeIntegrated:false,
  iphoneVisualQaPassed:false,
  bottomFiveCycleOnly:true,
  noSeparateSproutCounterInInfoPanel:true,
} as const);

export const F1_MY_FOREST_HANDOFF = Object.freeze({
  batch: "F1-MY-FOREST-INFO-REBUILD-02",
  zipFile: "F1_MY_FOREST_INFO_REBUILD_02_APP_FORMAT_CANDIDATE_V2.zip",
  expectedZipSha256: "100f42e471164131e27188575475f2571964de6db57c2c72488a65ae7d1f78ea",
  priorCandidateZipSha256: "501b2697740e276d8b90e78ed698d8b39cd34e90fd4c1dd4731a365f9d073204",
  expectedContainedFileCount: 17,
  formatQaReportedByHandoff: "PASSED",
  // The actual uploaded ZIP was audited 2026-10-24; format is still PARTIAL.
  sourceArchiveSha256Verified: true,
  sourceArchiveFileCountAndCrcVerified: true,
  sourcePngFullDecodeVerified: true,
  sourcePngAllRgbaVerified: false, // dim background is RGB, despite manifest RGBA
  sourceManifestConsistent: false, // CRC report PENDING, no fixed-group placement
  formatQaIndependentlyVerified: false,
  originalBytesVerified: true, // source ZIP SHA and all embedded PNG hashes verified
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
  existingFormalEventRefs: ["OB103","EV-CARBON-DETAIL"] as const,
  registersNewSystemEvent: false,
  qaOnly: true,
  writesLedger: false,
  allowedReturn: "SAME_FOREST_INSTANCE",
} as const);

/** Explicit second safety gate: merely supplying PNGs never promotes
 * candidate artwork into the player-facing page.
 */
export const F1_MY_FOREST_RUNTIME_ART_APPROVED =
  F1_MY_FOREST_HANDOFF.originalBytesVerified &&
  F1_MY_FOREST_HANDOFF.artReviewed &&
  F1_MY_FOREST_HANDOFF.readyForIntegration;

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
  progressFill:Object.freeze({
    assetId:"f1_my_forest_progress_fill",
    filename:"f1_my_forest_progress_fill.png",
    role:"LEDGER_PROGRESS_FILL_CANDIDATE_ONLY",
    displayedWithoutFormalLedger:false,
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
  /** Current 0–4 sprouts in this five-slot cycle, NOT historical credits. */
  plantedCount: number|null;
  /** Current whole pots (0–4) and trees after official conversions. */
  potCount?: number|null;
  treeCount?: number|null;
  /** Stage01 has one default asset; its illumination needs a separate UI flag. */
  stage01Lit?: boolean|null;
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

/**
 * The five bottom seedlings are one REPEATING progress cycle (0–4 stable
 * sprouts). Stage01 has one default sprite but it is dark when count=0.
 * A brief fifth-lamp transition at 10kg must use a real settlement event,
 * never invent five residual sprouts in a settled ledger snapshot.
 * Returns null while the account's actual growth projection is unavailable.
 */
export function myForestStageLit(stage:MyForestStage,
  ledger:MyForestLedgerSnapshot|null):boolean|null {
  if(ledger?.source!=="FORMAL_RESOURCE_LEDGER")return null;
  if(stage===1)return ledger.stage01Lit??null;
  return ledger.stageUnlocked[stage]??null;
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
    return {plantedCount:null,potCount:null,treeCount:null,stage01Lit:null,
      accumulatedCarbonKg:null,nextPlantProgress:null,
      stageNames:null,stageValues:null,footerDescription:null};
  }
  return {
    plantedCount:ledger.plantedCount,
    potCount:ledger.potCount??null,
    treeCount:ledger.treeCount??null,
    stage01Lit:ledger.stage01Lit??null,
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
