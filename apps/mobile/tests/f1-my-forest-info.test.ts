import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
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
  F1_MY_FOREST_STAGE_ART,
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
