import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  F1_FOREST_BACKGROUND, F1_SPROUT_INFO_STAGES, F1_SPROUT_STAGE_GROUP,
  F1_SPROUT_INFO_ROUTE, stageByIndex, qaSelectSproutStage,
} from "../src/f1-sprout-assets";
import {
  APPROVED_F1_BACKGROUND, APPROVED_F1_SPROUT_INFO_IMAGES,
} from "../src/f1-runtime-art.generated";

const read=(name: string)=>readFileSync(new URL(name,import.meta.url),"utf8");

test("one Forest V-F1 background and five ordered info-only asset identities",()=>{
  assert.equal(F1_FOREST_BACKGROUND.assetId,"scene_forest_clearing_base");
  assert.equal(F1_FOREST_BACKGROUND.visualStateId,"V-F1");
  assert.equal(F1_SPROUT_STAGE_GROUP,"f1_sprout_info_states");
  assert.equal(F1_SPROUT_INFO_STAGES.length,5);
  assert.deepEqual(F1_SPROUT_INFO_STAGES.map(x=>x.stage),[1,2,3,4,5]);
  assert.deepEqual(F1_SPROUT_INFO_STAGES.map(x=>x.assetId),
    [1,2,3,4,5].map(i=>"f1_sprout_info_stage_0"+i));
  for(const s of F1_SPROUT_INFO_STAGES){
    assert.equal(s.target,"sprout_info_only");
    assert.equal(stageByIndex(s.stage),s);
  }
  assert.equal(stageByIndex(0),null);
  assert.equal(stageByIndex(6),null);
  assert.equal(stageByIndex(1.5),null);
});
test("QA-only stage switching rejects invalid input and never writes the ledger",()=>{
  assert.deepEqual([1,2,3,4,5].map(qaSelectSproutStage),[1,2,3,4,5]);
  assert.equal(qaSelectSproutStage(6),null);
  assert.equal(qaSelectSproutStage(-1),null);
  assert.equal(F1_SPROUT_INFO_ROUTE.writesLedger,false);
  assert.equal(F1_SPROUT_INFO_ROUTE.qaOnlyStateSwitching,true);
  assert.deepEqual([...F1_SPROUT_INFO_ROUTE.systemEvents],["OB103","EV-CARBON-DETAIL"]);
  assert.equal(F1_SPROUT_INFO_ROUTE.back,"V-F1");
});
test("central Forest sprout remains its own sprite; info sprites confined to sheet",()=>{
  const forest=read("../app/forest.tsx");
  const panel=read("../src/sprout-info-ui.tsx");
  assert.match(forest,/testID="sprout-hotspot"/);
  assert.match(forest,/source=\{require\("\.\.\/assets\/sprout\.png"\)\}/);
  assert.match(forest,/<SproutInfoContents/);
  assert.match(panel,/testID="sprout-info-panel"/);
  assert.match(panel,/qa-sprout-stage-/);
  assert.doesNotMatch(forest,/sprout-info-stage-0[1-5]\.png/);
  assert.match(forest,/APPROVED_F1_BACKGROUND \?\? require/);
});
test("missing physical originals display explicit placeholders, not invented stage art",()=>{
  if(APPROVED_F1_BACKGROUND === null) {
    assert.deepEqual(Object.keys(APPROVED_F1_SPROUT_INFO_IMAGES),[]);
    assert.match(read("../src/sprout-info-ui.tsx"),/sprout-stage-asset-pending/);
    assert.match(read("../app/forest.tsx"),/forest-background-source-pending/);
  }
});
