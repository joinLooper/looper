import test from "node:test";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {
  F1_MY_FOREST_HANDOFF,F1_MY_FOREST_RUNTIME_ART_APPROVED,MY_FOREST_CANDIDATE_ASSETS,MY_FOREST_STAGE_NUMBERS,
  MY_FOREST_EMPTY_LEDGER,myForestStageState,myForestStageAsset,
  myForestValues,myForestArtGate,myForestInfoCover,
  type MyForestLedgerSnapshot,
} from "../src/f1-my-forest-info-contract";
import {
  F1_MY_FOREST_DIM_BACKGROUND,F1_MY_FOREST_STATIC_GROUP,
  F1_MY_FOREST_STAGE_ART, F1_MY_FOREST_PROGRESS_FILL,
} from "../src/f1-my-forest-info-art.generated";

const source=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const example: MyForestLedgerSnapshot={
  source:"FORMAL_RESOURCE_LEDGER",
  plantedCount:0,
  accumulatedCarbonKg:0,
  nextPlantProgress:{currentKg:0,targetKg:2},
  stageUnlocked:{2:true,3:false,4:null,5:false},
  stageNames:{1:"已核對階段一"},
  stageValues:{2:"候選測試說明"},
  footerDescription:null,
};

test("candidate handoff identities are isolated from main Forest world art",()=>{
  assert.equal(F1_MY_FOREST_HANDOFF.artworkStatus,"VISUAL_CANDIDATE");
  assert.equal(F1_MY_FOREST_HANDOFF.artReviewed,false);
  assert.equal(F1_MY_FOREST_HANDOFF.readyForIntegration,false);
  assert.equal(F1_MY_FOREST_HANDOFF.zipFile,"F1_MY_FOREST_INFO_REBUILD_02_APP_FORMAT_CANDIDATE_V2.zip");
  assert.equal(F1_MY_FOREST_HANDOFF.expectedZipSha256,"100f42e471164131e27188575475f2571964de6db57c2c72488a65ae7d1f78ea");
  assert.equal(F1_MY_FOREST_HANDOFF.priorCandidateZipSha256,"501b2697740e276d8b90e78ed698d8b39cd34e90fd4c1dd4731a365f9d073204");
  assert.equal(F1_MY_FOREST_HANDOFF.expectedContainedFileCount,17);
  assert.equal(F1_MY_FOREST_HANDOFF.formatQaReportedByHandoff,"PASSED");
  assert.equal(F1_MY_FOREST_HANDOFF.formatQaIndependentlyVerified,false);
  assert.equal(F1_MY_FOREST_HANDOFF.sourceArchiveSha256Verified,true);
  assert.equal(F1_MY_FOREST_HANDOFF.sourceArchiveFileCountAndCrcVerified,true);
  assert.equal(F1_MY_FOREST_HANDOFF.sourcePngFullDecodeVerified,true);
  assert.equal(F1_MY_FOREST_HANDOFF.sourcePngAllRgbaVerified,false);
  assert.equal(F1_MY_FOREST_HANDOFF.sourceManifestConsistent,false);
  assert.equal(F1_MY_FOREST_HANDOFF.originalBytesVerified,true);
  assert.equal(F1_MY_FOREST_RUNTIME_ART_APPROVED,false);
  assert.equal(F1_MY_FOREST_RUNTIME_ART_APPROVED,false);
  assert.equal(F1_MY_FOREST_HANDOFF.sourceCanvas.width,941);
  assert.equal(F1_MY_FOREST_HANDOFF.sourceCanvas.height,1672);
  assert.equal(F1_MY_FOREST_HANDOFF.expectedZipSha256.length,64);
  assert.equal(F1_MY_FOREST_HANDOFF.mainForestSproutHotspot,"sprout-hotspot");
  assert.equal(F1_MY_FOREST_HANDOFF.fixedGroupId,"f1_my_forest_static_character_info_group");
  assert.equal(F1_MY_FOREST_HANDOFF.dimBackgroundId,"f1_forest_clearing_base_dim");
  assert.equal(MY_FOREST_CANDIDATE_ASSETS.stages.length,9);
  assert.deepEqual(MY_FOREST_STAGE_NUMBERS,[1,2,3,4,5]);
  assert.deepEqual(MY_FOREST_CANDIDATE_ASSETS.stages.map(x=>x.kind),
    ["default","bright","dim","bright","dim","bright","dim","bright","dim"]);
  assert.equal(F1_MY_FOREST_DIM_BACKGROUND,null);
  assert.equal(F1_MY_FOREST_STATIC_GROUP,null);
  assert.equal(F1_MY_FOREST_PROGRESS_FILL,null);
  assert.equal(MY_FOREST_CANDIDATE_ASSETS.progressFill.role,"LEDGER_PROGRESS_FILL_CANDIDATE_ONLY");
  assert.equal(MY_FOREST_CANDIDATE_ASSETS.progressFill.displayedWithoutFormalLedger,false);
  assert.deepEqual(Object.values(F1_MY_FOREST_STAGE_ART),Array(9).fill(null));
});

test("Stage01 only has one default state; Stages 02–05 Bright/Dim are exclusive",()=>{
  assert.equal(myForestStageState(1,null),"default");
  assert.equal(myForestStageState(1,example,{2:"dim"},true),"default");
  assert.equal(myForestStageAsset(1,"default")?.filename,"f1_my_forest_stage_01.png");
  assert.equal(myForestStageAsset(1,"bright"),null);
  assert.equal(myForestStageAsset(1,"dim"),null);
  for(const n of [2,3,4,5] as const){
    const bright=myForestStageAsset(n,"bright");
    const dim=myForestStageAsset(n,"dim");
    assert.equal(bright?.filename,`f1_my_forest_stage_0${n}_bright.png`);
    assert.equal(dim?.filename,`f1_my_forest_stage_0${n}_dim.png`);
    assert.notEqual(bright,dim);
    assert.equal(myForestStageAsset(n,"pending"),null);
  }
});

test("real Bright/Dim is determined exclusively from formal ledger flags",()=>{
  assert.deepEqual(MY_FOREST_STAGE_NUMBERS.map(n=>myForestStageState(n,example)),
    ["default","bright","dim","pending","dim"]);
  assert.equal(myForestStageState(2,null),"pending");
  assert.equal(myForestStageState(3,null),"pending");
  assert.equal(myForestStageState(2,null,{2:"bright"},false),"pending");
  assert.equal(myForestStageState(3,example,{3:"bright"},false),"dim");
  assert.equal(myForestStageState(3,example,{3:"bright"},true),"bright");
  assert.equal(myForestStageState(3,example,{3:"dim"},true),"dim");
  // QA controls never mutate the input official snapshot.
  assert.equal(example.stageUnlocked[3],false);
  assert.equal(F1_MY_FOREST_HANDOFF.writesLedger,false);
  assert.equal(F1_MY_FOREST_HANDOFF.allowedReturn,"SAME_FOREST_INSTANCE");
});

test("missing backend metrics preserve nulls; zero is a real ledger value",()=>{
  assert.deepEqual(myForestValues(MY_FOREST_EMPTY_LEDGER),{
    plantedCount:null,accumulatedCarbonKg:null,nextPlantProgress:null,
    stageNames:null,stageValues:null,footerDescription:null,
  });
  const metrics=myForestValues(example);
  assert.equal(metrics.plantedCount,0);
  assert.equal(metrics.accumulatedCarbonKg,0);
  assert.deepEqual(metrics.nextPlantProgress,{currentKg:0,targetKg:2});
  assert.equal(metrics.stageNames?.[1],"已核對階段一");
  assert.equal(metrics.footerDescription,null);
});

test("art gate fails closed until bytes, human art review and dynamic text cleanup pass",()=>{
  assert.equal(myForestArtGate(false,false,false),"BLOCKED_ART_REVIEW");
  assert.equal(myForestArtGate(true,false,true),"BLOCKED_ART_REVIEW");
  assert.equal(myForestArtGate(true,true,false),"BLOCKED_ART_REVIEW");
  assert.equal(myForestArtGate(true,true,true),"ELIGIBLE_FOR_FUTURE_INTEGRATION");
});

test("9:16 and 9:19.5 candidate background/group share uniform aspect cover",()=>{
  for(const [w,h] of [[360,640],[360,780],[390,845],[706,1536]]){
    const f=myForestInfoCover(w,h);
    assert.ok(f.imageWidth>=w-1e-9 && f.imageHeight>=h-1e-9);
    assert.ok(f.left<=0 && f.top<=0);
    assert.ok(Math.abs(f.imageWidth/941-f.imageHeight/1672)<1e-10);
  }
});

test("central sprout opens only new modal; closing retains same Forest instance",()=>{
  const forest=source("../app/forest.tsx");
  const page=source("../src/f1-my-forest-info-ui.tsx");
  assert.match(forest,/testID="sprout-hotspot"/);
  assert.match(forest,/onPress=\{\(\)\s*=>\s*open\("sprout"\)\}/);
  assert.match(forest,/<F1MyForestInfoOverlay/);
  assert.match(forest,/visible=\{sheet === "sprout"\}/);
  assert.match(forest,/onClose=\{closeSheet\}/);
  assert.match(forest,/visible=\{sheet !== null && sheet !== "sprout"\}/);
  assert.match(forest,/ledgerSnapshot=\{null/);
  assert.doesNotMatch(forest,/<SproutInfoContents/);
  assert.doesNotMatch(forest,/record-sprout-care/);
  assert.match(page,/testID="my-forest-info-panel"/);
  assert.match(page,/F1_MY_FOREST_RUNTIME_ART_APPROVED/);
  assert.match(page,/testID="close-sheet"/);
  assert.match(page,/testID="my-forest-static-group-slot"/);
  assert.match(page,/testID="my-forest-qa-controls"/);
  assert.match(page,/testID="my-forest-stage-list"/);
  assert.match(page,/qa-my-forest-bright/);
  assert.match(page,/qa-my-forest-dim/);
  assert.doesNotMatch(page,/\.\.\/assets\/sprout\.png/);
  assert.doesNotMatch(page,/sprout-info-stage-0[1-5]/);
  assert.doesNotMatch(page,/\bdispatch\(/);
  assert.doesNotMatch(page,/axios|XMLHttpRequest|\bfetch\(/);
});

test("exactly one static art group, no duplicate character prop construction",()=>{
  const page=source("../src/f1-my-forest-info-ui.tsx");
  assert.equal((page.match(/F1_MY_FOREST_STATIC_GROUP \?/g)||[]).length,1);
  assert.equal((page.match(/<ForestAction /g)||[]).length,1);
  assert.match(page,/F1_MY_FOREST_DIM_BACKGROUND/);
  assert.match(page,/resizeMode="cover"/);
});

test("V2 format auditor checks bytes, CRC, RGBA decode and manifests without promoting art",()=>{
  const script=source("../scripts/audit-f1-my-forest-info-v2.py");
  assert.match(script,/EXPECTED_SHA\s*=\s*"100f42e471164131e27188575475f2571964de6db57c2c72488a65ae7d1f78ea"/);
  assert.match(script,/EXPECTED_FILES\s*=\s*17/);
  assert.match(script,/archive\.testzip\(\)/);
  assert.match(script,/img\.verify\(\)/);
  assert.match(script,/img\.load\(\)/);
  assert.match(script,/img\.mode\s*!=\s*"RGBA"/);
  assert.match(script,/placement\.json/);
  assert.match(script,/state_manifest\.json/);
  assert.match(script,/manifest\.json/);
  assert.match(script,/sha-256\.txt/);
  assert.match(script,/art_reviewed": False/);
  assert.match(script,/ready_for_integration": False/);
  assert.doesNotMatch(script,/\.extractall\s*\(|\.write_bytes\s*\(/);
});

test("V2 Python inspector parses without running any ZIP import or extraction", (t)=>{
  const uri=new URL("../scripts/audit-f1-my-forest-info-v2.py",import.meta.url);
  const binary=process.platform==="win32"?"py":"python3";
  const args=process.platform==="win32"?["-3"]:[];
  const syntaxCheck="import ast,sys; ast.parse(open(sys.argv[1],encoding='utf-8').read())";
  const result=spawnSync(binary,[...args,"-c",syntaxCheck,fileURLToPath(uri)],
    {encoding:"utf8",timeout:10000});
  if(result.error && (result.error as NodeJS.ErrnoException).code==="ENOENT"){
    t.skip("Python not installed; SHA/PNG V2 audit is deliberately fail-closed until Python available");
    return;
  }
  assert.equal(result.status,0,result.stderr||String(result.error));
});

test("one official Asset Master gate runs automatically but never calls candidate ART/iPhone PASS",()=>{
  const script=fileURLToPath(new URL("../scripts/qa-art-integration.mjs",import.meta.url));
  const r=spawnSync(process.execPath,[script,"--ci"],{encoding:"utf8",timeout:15000});
  assert.equal(r.status,0,r.stderr||r.stdout);
  const report=JSON.parse(r.stdout);
  assert.equal(report.codeInvariants,"PASS");
  assert.equal(report.canonicalAssetRegister,
    "https://docs.google.com/spreadsheets/d/1pU4kQN8ZyvgXHKzJRWCdNbmDaZsgl7ZisR6ZwvYcd1M/edit#gid=770905708");
  assert.equal(report.gates.sourceAndVersion.sourceScene,"forest_clearing");
  assert.equal(report.gates.sourceAndVersion.approvedVisualState,"V-F1");
  assert.equal(report.gates.assetCompletenessAndPurpose.unapprovedArtImportsStillNull,true);
  assert.equal(report.states["forest_clearing/MyForestInfoCandidate"].visualApproved,"NO__CANDIDATE");
  assert.equal(report.states["forest_clearing/MyForestInfoCandidate"].assetReady,"NO__FORMAT_ART_PLACEMENT_BLOCKED");
  assert.equal(report.states["forest_clearing/MyForestInfoCandidate"].iphoneVisualQaPassed,
    "NO__CENTRAL_SIGNOFF_REQUIRED");
  assert.equal(report.gates.iphoneOnExactAssetVersion.automaticallyMarksVisualQAAsPassed,false);
  assert.equal(report.gates.interactionAndReturn.status,"WEB_QA_EVIDENCE_NOT_SUPPLIED");
});

test("a release flag never substitutes human visual and physical iPhone signoff",()=>{
  const script=fileURLToPath(new URL("../scripts/qa-art-integration.mjs",import.meta.url));
  const r=spawnSync(process.execPath,[script,"--release"],{encoding:"utf8",timeout:15000});
  assert.equal(r.status,2,r.stderr||r.stdout);
  const report=JSON.parse(r.stdout);
  assert.equal(report.result,"NOT_RELEASED__HUMAN_APPROVAL_REQUIRED");
});

test("a self-described duplicate/other registry never satisfies the official identity gate",()=>{
  const script=fileURLToPath(new URL("../scripts/qa-art-integration.mjs",import.meta.url));
  const dir=mkdtempSync(join(tmpdir(),"looper-register-source-"));
  const candidate=join(dir,"identity.json");
  try{
    writeFileSync(candidate,JSON.stringify({
      spreadsheet_id:"shadow-copy-not-authority",sheet:"Asset Master",
      rows:[{"Asset ID":"scene_forest_clearing_base"}],
    }));
    const r=spawnSync(process.execPath,[script,"--ci","--registry-snapshot",candidate],
      {encoding:"utf8",timeout:15000});
    assert.equal(r.status,1,r.stderr||r.stdout);
    const report=JSON.parse(r.stdout);
    assert.ok(report.codeErrors.includes("REGISTER_SNAPSHOT_WRONG_SOURCE__MUST_BE_OFFICIAL_ASSET_MASTER"));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("one genuine-format iPhone evidence file is reviewable without a second phone, never auto-approves art",()=>{
  const script=fileURLToPath(new URL("../scripts/qa-art-integration.mjs",import.meta.url));
  const baseline=spawnSync(process.execPath,[script,"--ci"],{encoding:"utf8",timeout:15000});
  assert.equal(baseline.status,0,baseline.stderr||baseline.stdout);
  const baselineReport=JSON.parse(baseline.stdout);
  const dir=mkdtempSync(join(tmpdir(),"looper-iphone-device-proof-"));
  try{
    const file=join(dir,"iphone-actual.png");
    const image=Buffer.alloc(2048);
    Buffer.from("89504e470d0a1a0a","hex").copy(image);
    writeFileSync(file,image);
    const evidence={
      platform:"ios",device:"iPhone 15 Pro",
      scene_id:"forest_clearing",visual_state_id:"V-F1",
      sourceFingerprint:baselineReport.gates.localRemoteSafety.sourceFingerprint,
      assetSha256:"32021bd41d33f1b54197c3c171648f2ff0de696eb79c5b38d5a0ba8a0072f2d5",
      screenshots:[{ratio:"9:19.5",path:"iphone-actual.png"}],
      interactions:Array.from({length:7},(_,i)=>({id:"qa-"+i,opened:true,returned:true})),
    };
    const doc=join(dir,"evidence.json");
    writeFileSync(doc,JSON.stringify(evidence));
    const result=spawnSync(process.execPath,[script,"--iphone-evidence",doc],
      {encoding:"utf8",timeout:15000});
    assert.equal(result.status,0,result.stderr||result.stdout);
    const report=JSON.parse(result.stdout);
    assert.equal(report.gates.iphoneOnExactAssetVersion.status,
      "EVIDENCE_COMPLETE__REQUIRES_CENTRAL_IPHONE_HUMAN_REVIEW");
    assert.equal(report.states["forest_clearing/V-F1"].iphoneVisualQaPassed,
      "NO__CENTRAL_SIGNOFF_REQUIRED");
    evidence.sourceFingerprint="stale-other-commit";
    writeFileSync(doc,JSON.stringify(evidence));
    const stale=spawnSync(process.execPath,[script,"--iphone-evidence",doc],
      {encoding:"utf8",timeout:15000});
    assert.equal(stale.status,0,stale.stderr||stale.stdout);
    assert.equal(JSON.parse(stale.stdout).gates.iphoneOnExactAssetVersion.status,
      "IPHONE_EVIDENCE_MISSING_MISMATCHED_OR_INCOMPLETE");
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("candidate fixed-group uses contain while dimmed forest remains full-bleed cover",()=>{
  const ui=source("../src/f1-my-forest-info-ui.tsx");
  const bg=ui.indexOf("source={F1_MY_FOREST_DIM_BACKGROUND}");
  const fixed=ui.indexOf("source={F1_MY_FOREST_STATIC_GROUP}");
  assert.ok(bg>=0 && fixed>=0, "Both candidate art slots remain explicit");
  assert.ok(ui.slice(bg,bg+130).includes('resizeMode="cover"'),"Forest background must cover the screen");
  assert.ok(ui.slice(fixed,fixed+130).includes('resizeMode="contain"'),"Fixed-group wood sign may not crop");
  assert.ok(!ui.slice(fixed,fixed+130).includes('resizeMode="cover"'));
});

test("single engineering gate selects V2 or newer manifest auditor and never upgrades pending art",()=>{
  const gate=source("../scripts/qa-art-integration.mjs");
  const python=source("../scripts/audit-f1-my-forest-delivery.py");
  for(const fragment of [
    "audit-f1-my-forest-delivery.py","legacyV2Archive",
    "source_hash_match===true","layout_pass===true","BLOCKED_RUNTIME_LAYOUT"
  ])assert.ok(gate.includes(fragment),fragment);
  for(const fragment of [
    "SOURCE_SHA_NOT_PINNED_TO_CENTRAL_HANDOFF",
    "PHONE_BACKGROUND_NOT_FULL_BLEED","DYNAMIC_TEXT_NUMERIC_RECTS_MISSING",
    "STAGE_STATE_CONTRACT_INVALID",'ready_for_integration": False'
  ])assert.ok(python.includes(fragment),fragment);
  assert.ok(!python.includes(".extractall("),"Audit must never unpack into Runtime");
});

test("manifest-aware archive audit parses without importing images or changing source files",t=>{
  const file=fileURLToPath(new URL("../scripts/audit-f1-my-forest-delivery.py",import.meta.url));
  const binary=process.platform==="win32"?"py":"python3";
  const args=process.platform==="win32"?["-3"]:[];
  const p=spawnSync(binary,[...args,"-c",
    "import ast,sys;ast.parse(open(sys.argv[1],encoding='utf-8').read())",file],
    {encoding:"utf8",timeout:10000});
  if(p.error && (p.error as NodeJS.ErrnoException).code==="ENOENT"){
    t.skip("Python unavailable; delivery audit remains mandatory when actual ZIP is supplied");
    return;
  }
  assert.equal(p.status,0,p.stderr||p.stdout);
});

test("Native My Forest QA must scroll to the ledger field and then close the real modal",()=>{
  const native=source("../../../scripts/w200-android-smoke.py");
  const begin=native.indexOf("tap('sprout-hotspot'); wait('my-forest-info-panel')");
  const closing=native.indexOf("tap('close-sheet'); wait('stump-hotspot')",begin);
  assert.ok(begin>0&&closing>begin,"Native test must open and close My Forest");
  const flow=native.slice(begin,closing);
  assert.ok(flow.includes("wait('my-forest-stage-list')"),"Five stages still checked");
  assert.ok(flow.includes("reveal('my-forest-ledger-connection-state')"),
    "Offscreen ledger disclaimer must be reached with real gestures");
  assert.ok(flow.includes("shot(ratio+'-my-forest-info-ledger-visible')"),
    "Native evidence must show the lower information content");
  assert.ok(!flow.includes("wait('my-forest-ledger-connection-state')"),
    "Do not reintroduce a visibility-blind wait for offscreen content");
});

test("R5 placement gate accepts new geometry without accepting stale R4 screen evidence",()=>{
  const checker=source("../scripts/audit-f1-my-forest-delivery.py");
  // Correct R5 extends the existing placement.json. Do not require duplicated
  // milestone/text fields in obsolete dynamic_slots aliases.
  for(const fragment of [
    'p.get("milestone_slots", {})',
    'p.get("dynamic_text_fields", {})',
    'report["milestone_geometry_count"] += 1',
    'report["dynamic_text_geometry_count"] += 1',
    'MILESTONE_STAGE_01_IDENTITY_MISMATCH',
    'MILESTONE_STAGE_{i:02d}_BRIGHT_DIM_GEOMETRY_DIFF',
    'PROGRESS_FILL_CLIP_RECT_MISMATCH',
    'PROGRESS_FILL_NOT_LEDGER_GATED',
    'TEXT_SPRITE_RECT_OVERLAP',
    'PHONE_PREVIEW_STALE_PRIOR_BATCH',
    'PHONE_PREVIEW_DIMENSIONS_MISMATCH',
    'PHONE_BACKGROUND_NOT_FULL_BLEED',
    'PHONE_LAYER_FIT_NOT_SEPARATED',
    'LAYOUT_QA_REPORT_CONTRADICTS_SOURCE_EVIDENCE',
  ]) assert.ok(checker.includes(fragment),"Missing R5 regression guard: "+fragment);
  assert.ok(checker.includes('qa.get("asset_ready")'),
    "R5 must use its real asset_ready flag, not misclassify this as a format error");
  assert.ok(checker.includes('qa.get("ready_for_integration")'),
    "The existing V2/R4 flag must continue to fail closed");
  assert.ok(checker.includes('human_review_blockers'),
    "Engineering must preserve independent art review");
});


test("R6 visual QA remains opt-in, SHA-pinned and cannot promote candidate art",()=>{
  const overlay=source("../src/f1-my-forest-info-ui.tsx");
  const qa=source("../src/f1-my-forest-r6-qa-preview.tsx");
  const binding=source("../src/f1-my-forest-r6-qa-art.generated.ts");
  const importer=source("../scripts/f1-enable-my-forest-r6-qa.py");
  const formal=source("../src/f1-my-forest-info-art.generated.ts");
  const digest="07d95d741cb2e6ea5a1f82429a7f6d1d79b8c1b4cffe194854ad77133671dc75";
  assert.ok(binding.includes(digest)&&importer.includes(digest),"Only exact R6 archive may populate QA art slots");
  assert.ok(binding.includes("background:null")&&binding.includes("Array(9).fill(null)"));
  assert.ok(qa.includes('EXPO_PUBLIC_MY_FOREST_R6_QA_ART==="1"'),"Preview must require explicit opt-in");
  assert.ok(qa.includes("qaMode && dev && QA_OPT_IN"),"Do not show candidate in production");
  assert.ok(overlay.includes("f1R6QaEligible(qaMode"),"QA boundary must be checked at page entry");
  assert.ok(overlay.includes("<F1MyForestR6QaPreview"),"QA artwork must be an actual composed canvas");
  assert.ok(overlay.includes('pointerEvents={qaR6Art?"box-none":"auto"}'),
    "On-device QA taps must reach stage slots below the transparent safe area");
  assert.ok(qa.includes('resizeMode="cover"')&&qa.includes('resizeMode="contain"'));
  assert.ok(qa.includes("myForestValues(ledgerSnapshot)"),"No fabricated resource metrics");
  assert.ok(!qa.includes("dispatch(")&&!qa.includes("fetch("));
  assert.ok(formal.includes("F1_MY_FOREST_DIM_BACKGROUND: ImageSourcePropType|null=null"),
    "Production imports remain blocked");
  assert.ok(importer.includes("LOCAL_QA_ART_DIFFERS_DO_NOT_OVERWRITE"));
  assert.ok(importer.includes("LOCAL_GENERATED_QA_SOURCE_DIRTY_DO_NOT_OVERWRITE"));
  assert.ok(!importer.includes("f1-runtime-art.generated.ts"));
});

test("R6 import script validates source without writing by default",t=>{
  const path=fileURLToPath(new URL("../scripts/f1-enable-my-forest-r6-qa.py",import.meta.url));
  const binary=process.platform==="win32"?"py":"python3";
  const args=process.platform==="win32"?["-3"]:[];
  const r=spawnSync(binary,[...args,"-c",
    "import ast,sys;ast.parse(open(sys.argv[1],encoding='utf-8').read())",path],
    {encoding:"utf8",timeout:10000});
  if(r.error&&(r.error as NodeJS.ErrnoException).code==="ENOENT"){
    t.skip("Python unavailable; exact R6 QA import must fail closed");
    return;
  }
  assert.equal(r.status,0,r.stderr||r.stdout);
});


test("user-approved My Forest composition SHA must override alternative R6 QA artwork",()=>{
  const contract=source("../src/f1-my-forest-info-contract.ts");
  const preview=source("../src/f1-my-forest-r6-qa-preview.tsx");
  const importer=source("../scripts/f1-enable-my-forest-r6-qa.py");
  const gate=source("../scripts/qa-art-integration.mjs");
  const screenshotSha="b324e4cc37d52d04ecc730532f027fb990b8cc96e970e5f97916992f14652081";
  assert.ok(contract.includes(screenshotSha),"The screenshot's real bytes are the sole visual composition reference");
  assert.ok(contract.includes('visualStateId:"V-HUD-CARBONDETAIL"'));
  assert.ok(contract.includes("V-HUD-CARBONDETAIL_APPROVED_VISUAL_REFERENCE_20261024.png"));
  for(const invariant of [
    "SEPARATE brown explanatory wood plank",
    "five milestone saplings on dark bottom ground/wood rail BELOW the plank",
    "layoutLocked:true",
    "doesNotGrantAssetReady:true",
  ]) assert.ok(contract.includes(invariant),"Do not replace user's screen composition: "+invariant);
  assert.ok(preview.includes("R6_QA_VISUAL_COMPOSITION_APPROVED = false"),
    "A QA env flag must not enable an artwork with a different composition");
  assert.ok(importer.includes("R6_VISUAL_COMPOSITION_NOT_APPROVED__DO_NOT_INSTALL"),
    "Prevent future ZIP apply of unapproved alternate artwork");
  assert.ok(gate.includes("R6_UNAPPROVED_COMPOSITION_REENABLED"),
    "Future PRs must fail CI if they silently re-enable R6");
  assert.ok(gate.includes("MY_FOREST_APPROVED_SCREEN_AUTHORITY_LOST"),
    "Future PRs must fail CI if they replace the canonical screenshot reference");
});


test("canonical approved My Forest screenshot receives independent pixel-parity gate",()=>{
  const gate=source("../scripts/qa-art-integration.mjs");
  const parity=source("../scripts/verify-my-forest-visual.py");
  const sha="b324e4cc37d52d04ecc730532f027fb990b8cc96e970e5f97916992f14652081";
  assert.ok(parity.includes(sha),"Source screenshot must have pinned byte identity");
  for(const region of [
    "close_control",
    "left_marmot_on_stump",
    "right_wooden_sign",
    "central_sprout",
    "three_column_pale_board",
    "separate_brown_description_plank",
    "five_milestones_below_plank",
  ])assert.ok(parity.includes(region),"Missing protected visual region: "+region);
  for(const item of [
    "COMPOSITION_MISMATCH_DO_NOT_PROMOTE",
    "APPROVED_SCREEN_SHA_MISMATCH",
    "RENDERED_CAPTURE_HAS_TRANSPARENT_BARS",
    "CORE_COMPOSITION_SIMILAR__TALL_ADAPTATION_HUMAN_REVIEW_REQUIRED",
    '"passed_iphone_visual_qa": False',
    '"ledger_behavior_verified": False',
  ])assert.ok(parity.includes(item),"Visual parity script must fail closed: "+item);
  for(const item of [
    '--approved-reference','--visual-capture','--visual-profile',
    'CANONICAL_MY_FOREST_SCREEN_MISMATCH_OR_UNVERIFIED',
    'g.canonicalVisualParity=visualParity',
  ])assert.ok(gate.includes(item),"Single art gate missing source capture check: "+item);
});

test("missing visual source cannot return a false pixel-parity PASS",t=>{
  const file=fileURLToPath(new URL("../scripts/verify-my-forest-visual.py",import.meta.url));
  const binary=process.platform==="win32"?"py":"python3";
  const args=process.platform==="win32"?["-3"]:[];
  const capture=join(tmpdir(),"LOOPER_MISSING_REFERENCE_DO_NOT_CREATE_"+process.pid+".png");
  const r=spawnSync(binary,[...args,file,
    "--reference",capture,"--rendered",capture,"--profile","9:16"],
    {encoding:"utf8",timeout:10000});
  if(r.error&&(r.error as NodeJS.ErrnoException).code==="ENOENT"){
    t.skip("Python unavailable; no pixel-parity PASS may be claimed without it");
    return;
  }
  assert.equal(r.status,2,r.stderr||r.stdout);
  const report=JSON.parse(r.stdout);
  assert.equal(report.passed_iphone_visual_qa,false);
  assert.notEqual(report.status,"CORE_COMPOSITION_SIMILAR__HUMAN_ART_QA_REQUIRED");
});


test("canonical whole-screen QA uses the exact user's source without entering production ledger",()=>{
  const overlay=source("../src/f1-my-forest-info-ui.tsx");
  const qaSlot=source("../src/f1-my-forest-canonical-qa-art.generated.ts");
  const importer=source("../scripts/f1-enable-my-forest-canonical-qa.py");
  const official=source("../src/f1-my-forest-info-art.generated.ts");
  const sha="b324e4cc37d52d04ecc730532f027fb990b8cc96e970e5f97916992f14652081";
  assert.ok(qaSlot.includes(sha)&&importer.includes(sha));
  assert.ok(qaSlot.includes("F1_MY_FOREST_CANONICAL_REFERENCE_QA: ImageSourcePropType|null=null"),
    "No candidate binary is imported by CI or production");
  assert.ok(overlay.includes('EXPO_PUBLIC_MY_FOREST_CANONICAL_REFERENCE_QA==="1"'));
  assert.ok(overlay.includes('qaMode && (typeof __DEV__!=="undefined" && __DEV__)'));
  assert.ok(overlay.includes('my-forest-canonical-reference-qa-image'));
  assert.ok(overlay.includes('my-forest-canonical-static-sample-notice'));
  assert.ok(overlay.includes("numbers")||overlay.includes("示意"),
    "Reference image has illustration figures, not ledger totals");
  const branch=overlay.slice(overlay.indexOf("if(referenceQaAllowed"),overlay.indexOf("  return (\n    <Modal visible={visible}",overlay.indexOf("if(referenceQaAllowed")+1));
  assert.ok(branch.includes('testID="close-sheet"')&&branch.includes("onPress={onClose}"),
    "The static preview must close back into the same Forest instance");
  assert.ok(branch.includes('resizeMode="contain"'),"Never stretch the approved original");
  assert.ok(!branch.includes("dispatch(")&&!branch.includes("fetch("),
    "Reference-only mode must never write or fake player progress");
  assert.ok(official.includes("F1_MY_FOREST_DIM_BACKGROUND: ImageSourcePropType|null=null"));
  assert.ok(importer.includes("LOCAL_QA_REFERENCE_DIFFERS_DO_NOT_OVERWRITE"));
  assert.ok(importer.includes("LOCAL_QA_GENERATED_SOURCE_DIRTY_DO_NOT_OVERWRITE"));
  assert.ok(!importer.includes("f1-my-forest-info-art.generated.ts"));
});

test("canonical screenshot importer is syntactically valid and fails closed without its source",t=>{
  const sourcePath=fileURLToPath(new URL("../scripts/f1-enable-my-forest-canonical-qa.py",import.meta.url));
  const binary=process.platform==="win32"?"py":"python3";
  const args=process.platform==="win32"?["-3"]:[];
  const missing=join(tmpdir(),"LOOPER_APPROVED_REFERENCE_MISSING_"+process.pid+".png");
  const check=spawnSync(binary,[...args,sourcePath,"--source",missing],
    {encoding:"utf8",timeout:10000});
  if(check.error&&(check.error as NodeJS.ErrnoException).code==="ENOENT"){
    t.skip("Python unavailable; approved reference cannot be installed");
    return;
  }
  assert.equal(check.status,2,check.stderr||check.stdout);
  assert.ok(check.stderr.includes("APPROVED_REFERENCE_SOURCE_FILE_MISSING"));
});


test("canonical approved composition has independent null-ledger dynamic QA metrics",async()=>{
  const {canonicalMetricLabels,canonicalProgressFraction,CANONICAL_DYNAMIC_VIEW_STATE}=
    await import("../src/f1-my-forest-canonical-dynamic-model");
  assert.equal(CANONICAL_DYNAMIC_VIEW_STATE,"DERIVED_SCREEN_CANDIDATE_QA_ONLY");
  assert.deepEqual(canonicalMetricLabels(null),{
    planted:"—",carbon:"—",next:"—",fraction:null,
  },"No formal ledger must NEVER show design illustration amounts as real values");
  assert.equal(canonicalProgressFraction(null),null);
  assert.deepEqual(canonicalMetricLabels(example),{
    planted:"0",carbon:"0",next:"0 / 2 kg",fraction:0,
  },"Ledger zero is a real amount, not an absent/made-up value");
  assert.deepEqual(canonicalMetricLabels({...example,
    plantedCount:3,accumulatedCarbonKg:6.8,
    nextPlantProgress:{currentKg:.8,targetKg:2}}),{
    planted:"3",carbon:"6.8",next:"0.8 / 2 kg",fraction:.4,
  },"Only an explicit FORMAL_RESOURCE_LEDGER snapshot can supply amounts");
  assert.equal(canonicalProgressFraction({...example,
    nextPlantProgress:{currentKg:5,targetKg:2}}),1,
    "Progress may not extend beyond the approved track");
  assert.equal(canonicalProgressFraction({...example,
    nextPlantProgress:{currentKg:1,targetKg:0}}),null,
    "No guessed denominator or division by zero");
  assert.equal(canonicalProgressFraction({...example,
    nextPlantProgress:{currentKg:-1,targetKg:2}}),null,
    "Negative/non-finite progress must not become an illustrated fraction");
});

test("canonical dynamic screenshot stays opt-in/dev-only, source-locked, and returns to Forest",()=>{
  const ui=source("../src/f1-my-forest-info-ui.tsx");
  const dynamic=source("../src/f1-my-forest-canonical-dynamic-qa.tsx");
  const generated=source("../src/f1-my-forest-canonical-dynamic-qa-art.generated.ts");
  const importer=source("../scripts/f1-enable-my-forest-canonical-dynamic-qa.py");
  const formal=source("../src/f1-my-forest-info-art.generated.ts");
  const zipSha="a22be2a48a05710b57597539a8094745b72b17dfc5a9a1c7a5f5cf4a633fba94";
  const sourceSha="b324e4cc37d52d04ecc730532f027fb990b8cc96e970e5f97916992f14652081";
  for(const name of ["EXPO_PUBLIC_MY_FOREST_CANONICAL_DYNAMIC_QA","F1MyForestCanonicalDynamicQa",
    "my-forest-canonical-dynamic-qa","my-forest-planted-count",
    "my-forest-total-carbon","my-forest-next-progress",
    "my-forest-ledger-progress-fill","my-forest-stage-",
    "my-forest-ledger-connection-state"]){
    assert.ok((ui+dynamic).includes(name),"QA field/interface missing: "+name);
  }
  assert.ok(dynamic.includes("qaMode && dev")&&
    dynamic.includes("EXPO_PUBLIC_MY_FOREST_CANONICAL_DYNAMIC_QA"));
  assert.ok(dynamic.includes('resizeMode="contain"'));
  assert.ok(!dynamic.includes('resizeMode="cover"'),
    "Tall-phone QA must not duplicate scenery with an unapproved cover backdrop");
  const model=source("../src/f1-my-forest-canonical-dynamic-model.ts");
  assert.ok(model.includes("myForestValues(ledger)"));
  assert.ok(dynamic.includes("myForestStageState("));
  assert.ok(model.includes("FORMAL_RESOURCE_LEDGER"));
  assert.ok(!dynamic.includes("dispatch(")&&!dynamic.includes("fetch("));
  assert.ok(ui.includes('testID="close-sheet"')&&ui.includes("onPress={onClose}"));
  assert.ok(generated.includes(zipSha)&&importer.includes(zipSha)&&importer.includes(sourceSha));
  assert.ok(generated.includes("F1_MY_FOREST_CANONICAL_DYNAMIC_QA_IMAGE: ImageSourcePropType|null=null"),
    "QA source must remain null until original bytes locally verified");
  for(const err of ["ARCHIVE_SHA_MISMATCH","LOCAL_QA_ART_DIFFERS_DO_NOT_OVERWRITE",
    "LOCAL_GENERATED_QA_SOURCE_DIRTY_DO_NOT_OVERWRITE","SHA256SUMS_INVALID"]){
    assert.ok(importer.includes(err),"Don't overwrite or accept invalid candidate input: "+err);
  }
  assert.ok(formal.includes("F1_MY_FOREST_DIM_BACKGROUND: ImageSourcePropType|null=null"),
    "No formal art promotion");
});

test("canonical dynamic QA importer has valid syntax and fails without source bytes",t=>{
  const target=fileURLToPath(new URL("../scripts/f1-enable-my-forest-canonical-dynamic-qa.py",import.meta.url));
  const bin=process.platform==="win32"?"py":"python3";
  const args=process.platform==="win32"?["-3"]:[];
  const sample=join(tmpdir(),"looper-canonical-qa-missing-"+process.pid+".zip");
  const r=spawnSync(bin,[...args,target,"--archive",sample,
    "--sha","a22be2a48a05710b57597539a8094745b72b17dfc5a9a1c7a5f5cf4a633fba94"],
    {encoding:"utf8",timeout:10000});
  if(r.error&&(r.error as NodeJS.ErrnoException).code==="ENOENT"){
    t.skip("Python unavailable; candidate screenshot import remains fail-closed");
    return;
  }
  assert.equal(r.status,2,r.stdout||r.stderr);
  assert.ok(r.stderr.includes("DYNAMIC_QA_IMPORT_BLOCKED"));
});

test("canonical QA importer accepts the exact committed null binding without weakening dirty protection",()=>{
  const importer=source("../scripts/f1-enable-my-forest-canonical-dynamic-qa.py");
  const generated=source("../src/f1-my-forest-canonical-dynamic-qa-art.generated.ts");
  const expectedHash=createHash("sha256").update(generated).digest("hex");
  assert.ok(importer.includes('pristine_git_generated_sha="'+expectedHash+'"'),
    "The importer must pin the exact committed generated.ts bytes, including EOF newline semantics");
  assert.ok(importer.includes("before != desired()"),
    "Idempotent second import must remain allowed");
  assert.ok(importer.includes("sha(before.encode('utf-8'))!=pristine_git_generated_sha"),
    "A changed local source must still block import, not trigger overwrite");
  assert.ok(!importer.includes("before not in (baseline,desired())"),
    "Do not restore the broken newline-dependent candidate validation");
});


test("locally installed canonical dynamic QA picture must match the approved byte-pinned source",()=>{
  const gate=source("../scripts/qa-art-integration.mjs");
  const neutral=source("../src/f1-my-forest-canonical-dynamic-qa-art.generated.ts");
  const exactSha="9cade6ab742dc14cef5188dc7cd0ac2ca094df8a58067b6fa5b97030566f21b7";
  assert.ok(gate.includes("CANONICAL_QA_IMAGE_MISSING_OR_SOURCE_SHA_DRIFT"));
  assert.ok(gate.includes("UNTRACKED_CANONICAL_QA_IMAGE_SHA_DRIFT"));
  assert.ok(gate.includes("CANONICAL_QA_IMAGE_BOUND_WITHOUT_PINNED_DELIVERY"));
  assert.ok(gate.includes("canonicalQaObservedSha=binHash(canonicalQaPath)"));
  assert.ok(gate.includes("EXACT_QA_SOURCE_VERIFIED__NOT_FORMAL_ART_APPROVAL"));
  assert.ok(gate.includes("isFormalRuntimeArt:false"));
  assert.ok(gate.includes(exactSha));
  assert.ok(neutral.includes("F1_MY_FOREST_CANONICAL_DYNAMIC_QA_IMAGE: ImageSourcePropType|null=null"),
    "CI must remain a placeholder until the exact private image is locally installed");
});
