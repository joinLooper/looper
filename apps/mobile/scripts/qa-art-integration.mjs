/**
 * LOOPER APP-ART-INTEGRATION-REFORM-01
 * ONE read-only entrypoint for six preflight gates. It reads the existing
 * Visual Asset Register (when supplied as an ephemeral, official export);
 * it never creates a second asset identity table, changes approved assets,
 * changes the ledger, merges PRs or deploys.
 *
 * CI: node apps/mobile/scripts/qa-art-integration.mjs --ci
 * Local: node apps/mobile/scripts/qa-art-integration.mjs
 * Optional: --archive <V2.zip> --registry-snapshot <official-sheet.json>
 *           --web-qa <qa-result.json> --iphone-evidence <iphone-qa.json>
 * --release always requires separate Central human approval; never self-PASS.
 */
import {createHash} from "node:crypto";
import {existsSync,readFileSync,statSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../../..");
const officialRegister={
  spreadsheetId:"1pU4kQN8ZyvgXHKzJRWCdNbmDaZsgl7ZisR6ZwvYcd1M",
  tab:"Asset Master",
  gid:"770905708",
  uri:"https://docs.google.com/spreadsheets/d/1pU4kQN8ZyvgXHKzJRWCdNbmDaZsgl7ZisR6ZwvYcd1M/edit#gid=770905708",
};
const approvedForestSha="32021bd41d33f1b54197c3c171648f2ff0de696eb79c5b38d5a0ba8a0072f2d5";
const candidateHudSha="1f7a554640cd6137fde7d45193f6960d41f3a931b6ce85684364bf7a403a5ea1";
const args=process.argv.slice(2);
function value(flag) {
  const i=args.indexOf(flag);
  if(i===-1)return null;
  if(i===args.length-1||args[i+1].startsWith("--"))throw Error("MISSING_FLAG_VALUE:"+flag);
  return resolve(args[i+1]);
}
const ci=args.includes("--ci"),release=args.includes("--release");
const file=(path)=>readFileSync(resolve(root,path),"utf8");
const digest=(data)=>createHash("sha256").update(data).digest("hex");
const binHash=(path)=>existsSync(path)?digest(readFileSync(path)):null;
const run=(bin,a)=>spawnSync(bin,a,{cwd:root,encoding:"utf8",timeout:180000,maxBuffer:16_000_000});
function git(...a){const r=run("git",a);return r.status===0?r.stdout.trim():null;}
function assertInvariant(cond,error){if(!cond)codeErrors.push(error);}
const codeErrors=[],blockers=[];
const contract=file("apps/mobile/src/f1-my-forest-info-contract.ts");
const assetMap=file("apps/mobile/src/f1-my-forest-info-art.generated.ts");
const forest=file("apps/mobile/app/forest.tsx");
const overlay=file("apps/mobile/src/f1-my-forest-info-ui.tsx");
const projection=file("apps/mobile/src/f1-scene-projection.ts");
const model=file("apps/mobile/src/model.ts");
const artEvolution=file("docs/authority/FOREST_SCENE_EVOLUTION_AUTHORITY_V1.md");
const registrySource=file("apps/mobile/src/f1-sprout-assets.ts");

const has=(src,s)=>src.includes(s);
const g={};
const assetIds=[...new Set([
  ...[...contract.matchAll(/\bassetId\s*:\s*["']([^"']+)["']/g)].map(x=>x[1]),
  "scene_forest_clearing_base",
])];
assertInvariant(has(contract,'fixedGroupId: "f1_my_forest_static_character_info_group"'),
  "FIXED_GROUP_ID_CHANGED");
assertInvariant(has(contract,'dimBackgroundId: "f1_forest_clearing_base_dim"'),
  "DIM_BACKGROUND_ID_CHANGED");
assertInvariant(has(contract,'existingFormalEventRefs: ["OB103","EV-CARBON-DETAIL"]'),
  "FORMAL_EVENT_REFERENCE_DRIFT");
assertInvariant(!has(contract,"registersNewSystemEvent: true"),"UNAUTHORIZED_FORMAL_EVENT");
assertInvariant(has(contract,'source: "FORMAL_RESOURCE_LEDGER"'),
  "STAGE_STATE_NOT_LEDGER_SCOPED");
function flag(name){
  const m=contract.match(new RegExp("\\b"+name+"\\s*:\\s*(true|false)"));
  return m ? m[1]==="true" : null;
}
const sourceBytesVerified=flag("originalBytesVerified");
const artReviewed=flag("artReviewed");
const integrationReady=flag("readyForIntegration");
const rgbaVerified=flag("sourcePngAllRgbaVerified");
const manifestVerified=flag("sourceManifestConsistent");
assertInvariant([sourceBytesVerified,artReviewed,integrationReady,rgbaVerified,manifestVerified]
  .every(v=>typeof v==="boolean"),"MISSING_ART_GATE_ASSERTIONS");
assertInvariant(!artReviewed || (sourceBytesVerified && rgbaVerified && manifestVerified),
  "ART_PROMOTED_WITH_FORMAT_OR_MANIFEST_BLOCKER");
assertInvariant(!integrationReady || artReviewed,
  "ASSET_INTEGRATION_APPROVED_BEFORE_HUMAN_ART_REVIEW");

const regPath=value("--registry-snapshot");
let registryResult="NOT_REVALIDATED__OFFICIAL_ASSET_MASTER_REQUIRED_FOR_PROMOTION";
let missingRegistryIds=[];
if(regPath){
  const snap=JSON.parse(readFileSync(regPath,"utf8"));
  if(snap.spreadsheet_id!==officialRegister.spreadsheetId||snap.sheet!==officialRegister.tab){
    codeErrors.push("REGISTER_SNAPSHOT_WRONG_SOURCE__MUST_BE_OFFICIAL_ASSET_MASTER");
    registryResult="INVALID_SOURCE";
  }else{
    const ids=new Set((snap.rows||[]).map(x=>
      typeof x==="string"?x:
      x?.["Asset ID"]??x?.asset_id??x?.[0]
    ).filter(x=>typeof x==="string"));
    missingRegistryIds=assetIds.filter(x=>!ids.has(x));
    registryResult=missingRegistryIds.length===0?"REGISTER_IDENTITIES_MATCH":
      "CANDIDATE_SUBASSETS_NOT_YET_IN_OFFICIAL_REGISTER";
  }
}
g.sourceAndVersion={
  register:officialRegister.uri,
  status:registryResult,
  sourceScene:"forest_clearing",
  approvedVisualState:"V-F1",
  candidateOverlay:"my_forest_info", // not an invented visual_state_id
  missingRegistryIds,
};
if(registryResult!=="REGISTER_IDENTITIES_MATCH")
  blockers.push("正式素材接入前，以既有 Asset Master 核對所有既有 Asset ID；不建立平行總表");
const backgroundPath=resolve(root,"apps/mobile/assets/scene_forest_clearing_base.png");
const hudPath=resolve(root,"apps/mobile/assets/f1/qa-hud-two-rows-candidate.png");
const backgroundSha=binHash(backgroundPath);
const hudSha=binHash(hudPath);
if(backgroundSha && backgroundSha!==approvedForestSha)codeErrors.push("APPROVED_FOREST_BACKGROUND_SHA_CHANGED");
if(hudSha && hudSha!==candidateHudSha)codeErrors.push("QA_HUD_SOURCE_SHA_CHANGED");

// The V2 corrected-format ZIP has already been audited, but its art is still
// unapproved. No copy of it may be used by CI as a new approved image.
const unapproved=!artReviewed || !integrationReady;
const artSourceNull=has(assetMap,"F1_MY_FOREST_DIM_BACKGROUND: ImageSourcePropType|null=null")&&
  has(assetMap,"F1_MY_FOREST_STATIC_GROUP: ImageSourcePropType|null=null")&&
  has(assetMap,"F1_MY_FOREST_PROGRESS_FILL: ImageSourcePropType|null=null")&&
  [..."2345"].every(n=>has(assetMap,"stage0"+n+"Bright:null") &&
                            has(assetMap,"stage0"+n+"Dim:null")) &&
  has(assetMap,"stage01:null");
assertInvariant(!unapproved||artSourceNull,"UNAPPROVED_CANDIDATE_ART_WIRED_INTO_RUNTIME");
assertInvariant(has(overlay,"F1_MY_FOREST_RUNTIME_ART_APPROVED"),"CANDIDATE_VISUAL_GATE_BYPASSED");
assertInvariant(!has(forest,'<SproutInfoContents'),"DEPRECATED_INFO_PAGE_REATTACHED");
assertInvariant(has(forest,'source={require("../assets/sprout.png")}'),
  "MAIN_WORLD_SPROUT_MISTAKEN_FOR_INFO_IMAGE");
assertInvariant(!has(overlay,"../assets/sprout.png")&&!has(overlay,"f1_sprout_info_stage_"),
  "STAGE_ASSET_ROLE_MIXED");
assertInvariant(has(contract,"displayedWithoutFormalLedger:false"),
  "PROGRESS_FILL_NOT_LEDGER_GATED");
assertInvariant(has(overlay,"ledgerSnapshot={null")||has(overlay,"ledgerSnapshot"),
  "FORMAL_LEDGER_INTERFACE_REMOVED");

const zipPath=value("--archive");
let archiveResult={status:"NOT_SUPPLIED",formatApproved:false};
if(zipPath){
  const auditor=resolve(root,"apps/mobile/scripts/audit-f1-my-forest-info-v2.py");
  let python=process.platform==="win32"?"py":"python3";
  let pythonArgs=process.platform==="win32"?["-3",auditor,zipPath]:[auditor,zipPath];
  const proc=run(python,pythonArgs);
  try{archiveResult=JSON.parse(proc.stdout)}catch{
    archiveResult={status:"AUDITOR_UNAVAILABLE_OR_INVALID_OUTPUT",
      stderr:(proc.stderr||proc.error?.message||"").slice(0,500)};
  }
  if(proc.status!==0)blockers.push("候選 ZIP 驗證未完全通過，禁止美術接入");
}
g.assetCompletenessAndPurpose={
  status:unapproved?"BLOCKED_VISUAL_CANDIDATE":
    (artSourceNull?"ASSET_SOURCES_PENDING":"REVIEW_PACKAGE_AND_ROLE"),
  uploadedCandidateArchive:zipPath??null,
  packageAudit:archiveResult.status,
  sourceForestSha:backgroundSha,
  originalVf1BackgroundSha:approvedForestSha,
  qaHudSha:hudSha,
  approvedSourceFilesPresent:!!backgroundSha,
  unapprovedArtImportsStillNull:artSourceNull,
};
if(unapproved)blockers.push("我的森林資訊頁仍為 VISUAL CANDIDATE，未獲人工美術核准");
if(!backgroundSha)blockers.push("遠端程式沒有 Windows 本機核准森林 PNG；不可聲稱此分支已完成原圖接線");

assertInvariant(has(projection,"F1_SOURCE_CANVAS = { width: 941, height: 1672 }"),
  "VF1_LV1_CAMERA_PROJECTION_CHANGED_UNREVIEWED");
assertInvariant(has(artEvolution,"visual_state_id"),"SCENE_EVOLUTION_AUTHORITY_NOT_LINKED");
assertInvariant(has(forest,'f1ViewportFrame(')&&has(forest,'scene_forest_clearing_base')===false||
  has(forest,'f1ViewportFrame('),"FOREST_FRAME_PROJECTION_MISSING");
assertInvariant(has(forest,"styles.backpackQaTouch"),"BACKPACK_HITBOX_GUARD_REMOVED");
assertInvariant(has(projection,"f1RectsOverlap"),"OVERLAP_GEOMETRY_HELPER_MISSING");
assertInvariant(has(contract,'staticGroup:Object.freeze('),"INDIVISIBLE_STATIC_GROUP_REMOVED");
assertInvariant(!has(model,"treehouseEntrance: level >= 1"),"LV5_UNLOCK_RESET");
g.geometryOcclusion={
  status:"LV1_GEOMETRY_TESTS_EXIST__CANDIDATE_GROUP_PLACEMENT_BLOCKED",
  canonicalVf1Canvas:[941,1672],
  laterLevelSceneCompositions:"SEPARATE_VISUAL_STATE_AUTHORITY_REQUIRED",
  fixedGroupPlacement:"BLOCKED_MISSING_POSITION_SCALE_ANCHOR",
  tests:"Mobile cover/7 hotspots + Web 9:16/9:19.5",
};
blockers.push("資訊頁固定組 1024×1536 → 941×1672 的定位與遮擋未核准，不能自動 cover 拉伸");

assertInvariant(has(forest,'testID="sprout-hotspot"')&&has(forest,"<F1MyForestInfoOverlay"),
  "MY_FOREST_INFO_ENTRY_NOT_WIRED");
assertInvariant(has(forest,'visible={sheet === "sprout"}')&&has(forest,"onClose={closeSheet}"),
  "MY_FOREST_INFO_CLOSE_MISMATCH");
assertInvariant(has(overlay,'testID="close-sheet"'),"SHARED_CLOSE_BUTTON_MISSING");
assertInvariant(!has(overlay,"dispatch("),"CANDIDATE_INFO_PAGE_WRITES_DEMO_STATE");
assertInvariant(has(contract,"qaOverride")&&has(contract,'return "pending"'),
  "MILESTONE_PENDING_STATE_REMOVED");
const webQaPath=value("--web-qa");
let webResult="WEB_QA_EVIDENCE_NOT_SUPPLIED";
if(webQaPath){
  const qa=JSON.parse(readFileSync(webQaPath,"utf8"));
  const both=qa.status==="PASS" &&
    ["9x16","9x19_5"].every(name=>qa.devices?.some(
      x=>x.name===name&&x.status==="PASS"&&
      x.screenshots?.some(s=>s.includes("my-forest-info"))));
  const filesExist=qa.devices?.every(x=>x.screenshots?.every(s=>existsSync(resolve(dirname(webQaPath),s))))??false;
  webResult=both&&filesExist?"WEB_QA_COMPLETE_SOURCE_REVIEW_NEEDED":
    "WEB_QA_EVIDENCE_MISSING_OR_FAIL";
}
g.interactionAndReturn={
  status:webResult,
  mainToInfo:"SINGLE_SPROUT_HOTSPOT",
  close:"SAME_FOREST_INSTANCE",
  stageChange:"QA_ONLY_OR_FORMAL_LEDGER",
  nativeSmoke:"DEVICE_RESULTS_SEPARATE_FROM_WEB",
};

const identityPaths=[
 "apps/mobile/app/forest.tsx",
 "apps/mobile/src/f1-scene-projection.ts",
 "apps/mobile/src/f1-my-forest-info-ui.tsx",
 "apps/mobile/src/f1-my-forest-info-contract.ts",
 "apps/mobile/src/f1-my-forest-info-art.generated.ts",
];
const fingerprints=Object.fromEntries(identityPaths.map(path=>
  [path,binHash(resolve(root,path))]));
const fingerprint=digest(Buffer.from(JSON.stringify(fingerprints)));
const gitHead=git("rev-parse","HEAD");
const dirty=git("status","--porcelain=v1","-uno");
const expectedHead=args.includes("--expected-head")?
  args[args.indexOf("--expected-head")+1]:null;
if(expectedHead && expectedHead!==gitHead)
  blockers.push("Git HEAD 與指定來源不同；不得把另一份 bundle/截圖當成本版驗收");
g.localRemoteSafety={
  status:gitHead?"FINGERPRINT_RECORDED__MATCH_TO_DEVICE_BEFORE_SIGNOFF":
    "GIT_SOURCE_UNVERIFIED",
  gitHead,dirtyTrackedFiles:dirty?dirty.split("\n").length:0,
  sourceFingerprint:fingerprint,sourceFileHashes:fingerprints,
  expectedHead:expectedHead??null,headMatchesExpected:expectedHead?expectedHead===gitHead:null,
  note:"dirty local worktree: HEAD alone does not identify rendered version",
};

const iphoneFile=value("--iphone-evidence");
let iphone="IPHONE_EVIDENCE_NOT_SUPPLIED",iphoneEvidenceValid=false;
if(iphoneFile){
  try{
    const doc=JSON.parse(readFileSync(iphoneFile,"utf8"));
    // One real iPhone is enough for human visual review. Both responsive
    // ratios belong to automated Web/Native QA; don't make a founder source
    // or borrow a second physical phone merely to clear a machine gate.
    const screenshots=Array.isArray(doc.screenshots)?doc.screenshots:[];
    const physicalIphone=doc.platform==="ios" &&
      typeof doc.device==="string" && /^iPhone/i.test(doc.device);
    const screenshotLooksLikeImage=(relative)=>{
      const path=resolve(dirname(iphoneFile),relative);
      if(!existsSync(path) || statSync(path).size<1024)return false;
      const header=readFileSync(path).subarray(0,8);
      const png=header.subarray(0,4).toString("hex")==="89504e47";
      const jpg=header.subarray(0,3).toString("hex")==="ffd8ff";
      return png||jpg;
    };
    const exact=physicalIphone &&
      doc.scene_id==="forest_clearing"&&doc.visual_state_id==="V-F1"&&
      doc.sourceFingerprint===fingerprint&&
      doc.assetSha256===approvedForestSha&&
      screenshots.length>=1&&screenshots.every(item=>
        ["9:16","9:19.5"].includes(item.ratio)&&
        typeof item.path==="string"&&
        screenshotLooksLikeImage(item.path))&&
      Array.isArray(doc.interactions)&&doc.interactions.length>=7&&
      doc.interactions.every(x=>x.opened===true&&x.returned===true);
    iphoneEvidenceValid=Boolean(exact);
    iphone=exact?"EVIDENCE_COMPLETE__REQUIRES_CENTRAL_IPHONE_HUMAN_REVIEW":
      "IPHONE_EVIDENCE_MISSING_MISMATCHED_OR_INCOMPLETE";
  }catch{iphone="INVALID_IPHONE_EVIDENCE_JSON";}
}
g.iphoneOnExactAssetVersion={
  status:iphone,sourceFingerprint:fingerprint,
  humanApprovalIsSeparate:true,automaticallyMarksVisualQAAsPassed:false,
};
const states={
  "forest_clearing/V-F1":{
    visualApproved:"APPROVED_COMPOSITION",
    assetReady:backgroundSha===approvedForestSha?"SOURCE_SHA_VERIFIED_IN_THIS_WORKTREE":
      "SOURCE_NOT_AVAILABLE_IN_THIS_WORKTREE",
    runtimeIntegrated:backgroundSha===approvedForestSha &&
      has(forest,"APPROVED_F1_BACKGROUND")?
      "LOCAL_SOURCE_PRESENT_REQUIRES_RUNTIME_IMAGE_CAPTURE":"NOT_CONFIRMED",
    functionQaPassed:webResult==="WEB_QA_COMPLETE_SOURCE_REVIEW_NEEDED"?
      "WEB_FUNCTION_EVIDENCE_ONLY":"NOT_CONFIRMED_FOR_EXACT_SOURCE",
    iphoneVisualQaPassed:"NO__CENTRAL_SIGNOFF_REQUIRED",
  },
  "forest_clearing/MyForestInfoCandidate":{
    visualApproved:"NO__CANDIDATE",
    assetReady:"NO__FORMAT_ART_PLACEMENT_BLOCKED",
    runtimeIntegrated:"NO__ALL_CANDIDATE_PNG_IMPORTS_BLOCKED",
    functionQaPassed:webResult==="WEB_QA_COMPLETE_SOURCE_REVIEW_NEEDED"?
      "WEB_FUNCTION_EVIDENCE_ONLY":"NOT_CONFIRMED_FOR_EXACT_SOURCE",
    iphoneVisualQaPassed:"NO__CENTRAL_SIGNOFF_REQUIRED",
  }
};
const report={
  schema:"looper.app-art-integration-reform.v1",
  canonicalAssetRegister:officialRegister.uri,
  scope:"PR61-65_APP_ART_INTEGRATION",
  mode:ci?"CI_BASELINE":release?"RELEASE_PREFLIGHT":"LOCAL_PREFLIGHT",
  stages:["Visual Approved","Asset Ready","Runtime Integrated",
          "Function QA Passed","iPhone Visual QA Passed"],
  gates:g,states,
  codeInvariants:codeErrors.length?"FAIL":"PASS",
  blockers:[...new Set(blockers)],
  policy:"release requires authorized human ART+device approval; script never merges, deploys or modifies player ledger",
  result:codeErrors.length?"CODE_GUARD_FAILED":
    release?"NOT_RELEASED__HUMAN_APPROVAL_REQUIRED":
    "ENGINEERING_BASELINE_CHECKED__NOT_ART_OR_IPHONE_PASS",
  codeErrors,
};
console.log(JSON.stringify(report,null,2));
if(codeErrors.length)process.exitCode=1;
else if(release)process.exitCode=2;
