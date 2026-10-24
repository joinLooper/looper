import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {
  F1_POT_TREE_QA_PLACEMENT,inspectPotTreeGeometry,potTreeLabels,
  rectanglesOverlap,withinRect,
} from "../src/f1-my-forest-pot-tree-qa-layout";
import {F1_MY_FOREST_POT_TREE_SOURCE_AUTHORITY,type MyForestLedgerSnapshot}
  from "../src/f1-my-forest-info-contract";
import {F1_POT_TREE_QA_IMAGES}
  from "../src/f1-my-forest-pot-tree-qa-art.generated";

const source=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
test("user-approved pot is unchanged; tree/layout stay candidate, not formal art",()=>{
  const b=F1_MY_FOREST_POT_TREE_SOURCE_AUTHORITY;
  assert.equal(b.pot.visualApproved,true);
  assert.equal(b.tree.visualApproved,false);
  assert.equal(b.pot.unit,"盆");
  assert.equal(b.tree.unit,"棵");
  assert.equal(b.runtimeIntegrated,false);
  assert.equal(b.placementApproved,false);
  assert.equal(b.formalAssetIdentityVerified,false);
  assert.equal(b.pot.sha256,
    "d8ee877b6720f2892e8ff6803dcb47b05c4f06d1de0e7a1d61cc4fa21f0abf3b");
  assert.equal(b.tree.sha256,
    "fc5ce9453e5a556c577bd3342f1e6e24350728b91f65af91d4225274bfb4f4ee");
  assert.deepEqual(F1_POT_TREE_QA_IMAGES,{pot:null,tree:null},
    "GitHub/production must never import private candidate artwork");
});

test("six first-column rectangles fit without collisions or carbon field intrusion",()=>{
  const p=F1_POT_TREE_QA_PLACEMENT;
  const result=inspectPotTreeGeometry();
  assert.deepEqual(result.issues,[]);
  assert.equal(result.valid,true);
  assert.equal(result.potVisualApproved,true);
  assert.equal(result.treeVisualApproved,false);
  assert.equal(result.placementApproved,false);
  const items=[p.pot.icon,p.pot.count,p.pot.unit,
    p.tree.icon,p.tree.count,p.tree.unit];
  for(const r of items){
    assert.ok(withinRect(r,p.firstColumn));
    assert.ok(r.x+r.width<=342,"Do not encroach into CO2e column");
  }
  for(let i=0;i<items.length;i++)
    for(let j=i+1;j<items.length;j++)
      assert.equal(rectanglesOverlap(items[i],items[j]),false,
        "Proposed pot/tree slot collision: "+i+"/"+j);
  assert.equal(p.pot.unitText,"盆");
  assert.equal(p.tree.unitText,"棵");
  assert.deepEqual(p.canvas,{width:941,height:1672});
  assert.equal(p.visualStateId,"V-HUD-CARBONDETAIL");
  assert.equal(p.finalRuntimeEnabled,false);
});

test("display pot/tree counts ONLY from formal growth ledger, never sprout duplicate",()=>{
  assert.deepEqual({...potTreeLabels(null)},
    {potCount:"—",treeCount:"—",potUnit:"盆",treeUnit:"棵"});
  const ledger:MyForestLedgerSnapshot={
    source:"FORMAL_RESOURCE_LEDGER",plantedCount:2,potCount:3,treeCount:1,
    stage01Lit:true,accumulatedCarbonKg:56,
    nextPlantProgress:{currentKg:0,targetKg:2},
    stageUnlocked:{2:true,3:false,4:false,5:false},
    stageNames:{},stageValues:{},footerDescription:null,
  };
  assert.deepEqual({...potTreeLabels(ledger)},
    {potCount:"3",treeCount:"1",potUnit:"盆",treeUnit:"棵"});
  assert.deepEqual({...potTreeLabels({...ledger,potCount:0,treeCount:0})},
    {potCount:"0",treeCount:"0",potUnit:"盆",treeUnit:"棵"});
  assert.equal("sproutCount" in potTreeLabels(ledger),false);
  assert.equal(potTreeLabels({...ledger,potCount:null}).potCount,"—");
  assert.equal(potTreeLabels({...ledger,treeCount:-1}).treeCount,"—");
});

test("single art preflight pins source PNGs; no premature integration",()=>{
  const gate=source("../scripts/qa-art-integration.mjs");
  const loader=source("../scripts/f1-import-pot-tree-candidate-qa.py");
  const binding=source("../src/f1-my-forest-pot-tree-qa-art.generated.ts");
  for(const key of ["POT_TREE_VISUAL_APPROVAL_OR_LAYOUT_SOURCE_GUARD_CHANGED",
    "POT_TREE_QA_IMAGE_SHA_DRIFT_","POT_TREE_UNAUTHORIZED_ART_IMPORT",
    "treeVisualApproved:false","placementApproved:false",
    "runtimeIntegrated:false"])assert.ok(gate.includes(key),key);
  assert.ok(loader.includes("ARCHIVE_SOURCE_BYTES_MISSING_OR_CHANGED"));
  assert.ok(loader.includes("DIRTY_QA_GENERATED_DO_NOT_OVERWRITE"));
  assert.ok(loader.includes("DIRTY_QA_PNG_DO_NOT_OVERWRITE"));
  assert.ok(loader.includes('"safeToEnableProduction":False'));
  assert.ok(binding.includes("Object.freeze({pot:null,tree:null})"));
});

test("QA-only icon importer requires an actual matching archive and remains no-write by default",t=>{
  const sourcePath=fileURLToPath(new URL(
    "../scripts/f1-import-pot-tree-candidate-qa.py",import.meta.url));
  const bin=process.platform==="win32"?"py":"python3";
  const prefix=process.platform==="win32"?["-3"]:[];
  const testPath="/missing-pot-tree-source-do-not-create.zip";
  const res=spawnSync(bin,[...prefix,sourcePath,"--archive",testPath,
    "--sha","86598f41bc3e0b2351c60db09d93cd572d0bd6993c145946c22de6595ae93989"],
    {encoding:"utf8",timeout:10000});
  if(res.error && (res.error as NodeJS.ErrnoException).code==="ENOENT"){
    t.skip("Python missing; importer stays fail closed");
    return;
  }
  assert.equal(res.status,2,res.stdout||res.stderr);
  assert.ok(res.stderr.includes("POT_TREE_QA_IMPORT_BLOCKED"));
});
