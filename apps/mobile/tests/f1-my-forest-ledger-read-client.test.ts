import test from "node:test";
import assert from "node:assert/strict";
import {fetchMyForestReadOnlySnapshot,parseMyForestReadOnlySnapshot}
  from "../src/f1-my-forest-ledger-read-client";

const example={
  source:"FORMAL_RESOURCE_LEDGER",
  plantedCount:3,potCount:0,treeCount:0,stage01Lit:true,
  accumulatedCarbonKg:6.8,
  nextPlantProgress:{currentKg:.8,targetKg:2},
  stageUnlocked:{2:true,3:true,4:false,5:false},
  stageNames:{},stageValues:{},footerDescription:null,growthVersion:1,
};

test("read-only contract rejects demo values, invalid growth, and fabricated stages",()=>{
  assert.equal(parseMyForestReadOnlySnapshot(null),null);
  assert.equal(parseMyForestReadOnlySnapshot({...example,source:"QA_FIXTURE"}),null);
  assert.equal(parseMyForestReadOnlySnapshot({...example,plantedCount:-1}),null);
  assert.equal(parseMyForestReadOnlySnapshot({...example,accumulatedCarbonKg:NaN}),null);
  assert.equal(parseMyForestReadOnlySnapshot({...example,
    nextPlantProgress:{currentKg:3,targetKg:2}}),null);
  assert.equal(parseMyForestReadOnlySnapshot({...example,
    stageUnlocked:{2:true,3:true,4:false}}),null);
  assert.equal(parseMyForestReadOnlySnapshot({...example,
    stageUnlocked:{2:true,3:true,4:false,5:"bright"}}),null);
  assert.equal(parseMyForestReadOnlySnapshot({...example,
    plantedCount:0,stageUnlocked:{2:true,3:true,4:false,5:false}}),null,
    "Cannot light three seedlings while the current round has none");
  assert.equal(parseMyForestReadOnlySnapshot({...example,
    stageUnlocked:{2:true,3:false,4:true,5:false}}),null,
    "Unlock statuses must remain monotone across five approved milestones");
  assert.equal(parseMyForestReadOnlySnapshot({...example,
    plantedCount:5,stageUnlocked:{2:true,3:true,4:true,5:true}}),null,
    "The fifth seed becomes a pot; a settled snapshot never has five remaining seedlings");
  assert.ok(parseMyForestReadOnlySnapshot({...example,
    plantedCount:0,potCount:1,stage01Lit:false,
    stageUnlocked:{2:false,3:false,4:false,5:false}}),
    "At 10kg: pot count increases, all five bottom lamps reset");
  assert.ok(parseMyForestReadOnlySnapshot({...example,
    plantedCount:0,potCount:0,treeCount:1,stage01Lit:false,
    stageUnlocked:{2:false,3:false,4:false,5:false}}),
    "At 50kg: the fifth pot converts into a tree");
  const data=parseMyForestReadOnlySnapshot(example);
  assert.equal(data?.plantedCount,3);
  assert.equal(data?.potCount,0);
  assert.equal(data?.treeCount,0);
  assert.equal(data?.stage01Lit,true);
  assert.equal(data?.accumulatedCarbonKg,6.8);
  assert.deepEqual(data?.stageUnlocked,{2:true,3:true,4:false,5:false});
  assert.deepEqual(data?.stageNames,{});
});

test("only authenticated HTTPS origin can receive a credentialed GET; no state mutations",async()=>{
  const calls:Array<{url:string;init:RequestInit|undefined}>=[];
  const fake=(async (url:string|URL|Request,init?:RequestInit)=>{
    calls.push({url:String(url),init});
    return new Response(JSON.stringify(example),{status:200,
      headers:{"content-type":"application/json"}});
  }) as typeof fetch;
  for(const url of ["http://player.test/","https://user:pw@player.test/",
    "https://player.test/?userId=attacker","not-an-origin",
    "https://player.test/other/path"]){
    assert.equal(await fetchMyForestReadOnlySnapshot(url,fake),null);
  }
  assert.equal(calls.length,0,"Untrusted/cleartext URL cannot receive cookies");
  const snapshot=await fetchMyForestReadOnlySnapshot("https://player.test/",fake);
  assert.equal(snapshot?.plantedCount,3);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,"https://player.test/player/my-forest/ledger");
  assert.equal(calls[0].init?.method,"GET");
  assert.equal(calls[0].init?.credentials,"include");
  assert.equal(calls[0].init?.cache,"no-store");
  assert.equal((calls[0].init as Record<string,unknown>)?.body,undefined);
});

test("unauthorized, unavailable or forged HTTP payload preserves unknown/null",async()=>{
  for(const status of [401,403,429,500,503]){
    const denied=(async ()=>new Response("{}",{status})) as typeof fetch;
    assert.equal(await fetchMyForestReadOnlySnapshot("https://player.test/",denied),null);
  }
  const bad=(async ()=>new Response(JSON.stringify({...example,
    stageUnlocked:{2:null,3:null,4:null,5:null}}),{status:200})) as typeof fetch;
  assert.equal(await fetchMyForestReadOnlySnapshot("https://player.test/",bad),null);
  const failed=(async ()=>{throw new Error("offline")}) as typeof fetch;
  assert.equal(await fetchMyForestReadOnlySnapshot("https://player.test/",failed),null);
});
