import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { demoReducer, demoJourney, INITIAL_STATE, sceneVisibility } from "../src/model";
import { QA_LEVELS, qaGateEnabled, qaWorld, type QaLevel } from "../src/qa-levels";
const economy = readFileSync(new URL("../../api/src/economy.ts",import.meta.url),"utf8");
const definitions = [...economy.matchAll(/\{ level: (\d+), requiredTotalExp: (\d+), rewardStars: (\d+), maxEnergyIncrease: (\d+), unlockFlags: (\[[^\]]*\])/g)].map(m=>({level:+m[1],exp:+m[2],energy:+m[4],flags:JSON.parse(m[5]) as string[]}));
test("QA snapshots match canonical EXP, energy, flags without awarding rewards",()=>{
  assert.equal(definitions.length,10);
  for(const level of QA_LEVELS){
    const q=qaWorld(level), reached=definitions.filter(d=>d.level<=level), flags=reached.flatMap(d=>d.flags);
    assert.equal(q.exp,definitions.find(d=>d.level===level)!.exp);
    assert.equal(q.nextExp,definitions.find(d=>d.level===level+1)?.exp??null);
    assert.equal(q.energy,reached.reduce((sum,d)=>sum+d.energy,0));
    assert.equal(q.knowledge,flags.includes("knowledge_entry"));
    assert.equal(q.energyUnlocked,flags.includes("energy"));
    assert.equal(q.treehouse,flags.includes("treehouse_main"));
    assert.equal(q.rabbit,flags.includes("dual_character"));
    assert.equal(q.memoryUnlocked,flags.includes("memory_photos"));
    assert.equal(q.chapterComplete,flags.includes("chapter_one_complete"));
    assert.equal(q.stars,6);assert.equal(q.carbonGrams,0);
  }
});
test("repeated QA selection resets activity preserving reduced motion",()=>{
  let state={...INITIAL_STATE,reduceMotion:true};
  for(const level of [1,5,3,10,1,3,5,10] as QaLevel[]){
    state=demoReducer(state,{type:"qa-level",level});
    assert.equal(state.level,level);assert.equal(state.qaPreview,true);
    assert.equal(state.answer,null);assert.equal(state.cared,false);assert.equal(state.missionComplete,false);assert.equal(state.reduceMotion,true);
    assert.equal(sceneVisibility(level).rabbit,level>=5);
    assert.equal(sceneVisibility(level).treehouseEntrance,level>=5);
    assert.equal(qaWorld(level).chapterComplete,level===10);
    state=demoReducer(state,{type:"mission"});state=demoReducer(state,{type:"care"});state=demoReducer(state,{type:"answer",answer:"reuse"});
  }
  assert.deepEqual(demoReducer(state,{type:"qa-exit"}),{...INITIAL_STATE,reduceMotion:true});
});
test("Lv1 QA rejects knowledge and excludes it from suggestions; original demo unchanged",()=>{
  const qa=demoReducer(INITIAL_STATE,{type:"qa-level",level:1});
  assert.equal(demoReducer(qa,{type:"answer",answer:"reuse"}),qa);
  assert.equal(demoJourney(qa).total,2);assert.equal(demoJourney(qa).next,"mission");
  assert.equal(demoJourney(INITIAL_STATE).total,3);
  assert.equal(demoReducer(INITIAL_STATE,{type:"answer",answer:"reuse"}).answer,"reuse");
  assert.equal(demoReducer(qa,{type:"qa-level",level:4 as QaLevel}),qa);
});
test("QA routes are off in default release and guarded against direct navigation",()=>{
  assert.equal(qaGateEnabled(false),false);assert.equal(qaGateEnabled(false,"0"),false);
  assert.equal(qaGateEnabled(true),true);assert.equal(qaGateEnabled(false,"1"),true);
  const gate=readFileSync(new URL("../app/qa-levels.tsx",import.meta.url),"utf8");
  const events=readFileSync(new URL("../app/qa-events.tsx",import.meta.url),"utf8");
  assert.match(gate,/if \(!QA_LEVEL_GATE_ENABLED\) return <Redirect/);
  assert.match(events,/if\(!ENABLED\) return <Redirect/);
});
