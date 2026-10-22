import test from "node:test";
import assert from "node:assert/strict";
import {
  QA_FLOW_COUNTS, FLOW_REGISTRY, registryDiagnostics,
  eventById, pathById, childrenOf, eventsForPath,
  transitionsForEvent, startingVisualState, choicesFrom,
  qaAdvance, minimumQaLevel, isWithinQaLevel,
} from "../src/qa/event-flow";

test("QA registry reflects current authoritative tables",()=>{
  assert.deepEqual(QA_FLOW_COUNTS,{paths:186,events:151,transitions:807});
  assert.deepEqual(registryDiagnostics(),{
    duplicateEvents:[], unknownTransitionEvents:[], missingPathParents:[],
    missingEventPaths:[], eventsWithoutTransitions:[]
  });
});

test("every event has a canonical path and transitions; all paths have known parents",()=>{
  for(const event of FLOW_REGISTRY.events){
    assert.ok(event.id);
    assert.ok(transitionsForEvent(event.id).length>0,event.id);
    assert.ok(event.paths.length>0,event.id);
    for (const id of event.paths) assert.ok(pathById(id),event.id+" -> "+id);
  }
  for(const path of FLOW_REGISTRY.paths){
    if(path.parent) assert.ok(pathById(path.parent),path.id+" -> "+path.parent);
  }
  assert.ok(childrenOf("ROOT").length>0);
  assert.ok(eventsForPath("F1").length>0);
});

test("read-only transition navigation moves local visual state, not resource balances",()=>{
  const event=eventById("OB101");
  assert.ok(event);
  const from=startingVisualState(event);
  const choices=choicesFrom(event.id,from);
  assert.ok(choices.length>0);
  const next=qaAdvance(event.id,from,choices[0].id);
  assert.deepEqual(next,{nextVisualState:choices[0].to,transitionId:choices[0].id});
  assert.equal(qaAdvance(event.id,from,"NOT_A_REAL_STEP"),null);
  assert.equal(qaAdvance(event.id,"NOT_A_REAL_STATE",choices[0].id),null);
});

test("QA gate shows level requirements without granting unlocks",()=>{
  assert.equal(minimumQaLevel("Lv.1→2"),1);
  assert.equal(minimumQaLevel("Lv5"),5);
  assert.equal(minimumQaLevel("10"),10);
  const first=eventById("OB101");
  assert.ok(first);
  assert.equal(isWithinQaLevel(first,1),true);
});
