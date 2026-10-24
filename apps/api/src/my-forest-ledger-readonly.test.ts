import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {buildApp} from "./app.js";
import {InMemoryStore} from "./store.js";

test("My Forest endpoint isolates sessions and never changes resource, energy, audit or session ledgers",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"looper-myforest-readonly-"));
  const store=new InMemoryStore(join(dir,"isolated.sqlite"));
  const app=await buildApp(store,{
    playerAppUrl:"https://player.test",merchantAppUrl:"https://merchant.test",
    adminAppUrl:"https://admin.test",production:false,playerIdentityVerifier:null,
  });
  try{
    const a=store.createPlayerSession({
      provider:"line",providerSubject:"read-only-forest-a",displayName:"Forest Resident A",
    },7*24*60*60);
    const b=store.createPlayerSession({
      provider:"line",providerSubject:"read-only-forest-b",displayName:"Forest Resident B",
    },7*24*60*60);
    const cookie=(token:string)=>({cookie:"looper_player_session="+token});
    assert.equal((await app.inject({method:"GET",url:"/player/my-forest/ledger"})).statusCode,401);
    assert.equal((await app.inject({method:"GET",url:"/player/my-forest/ledger",
      headers:cookie("invalid-token")})).statusCode,401);
    const beforeZero=(await app.inject({method:"GET",url:"/player/my-forest/ledger",
      headers:cookie(a.sessionToken)}));
    assert.equal(beforeZero.statusCode,200);
    assert.equal(beforeZero.headers["cache-control"],"private, no-store");
    assert.deepEqual(beforeZero.json().stageUnlocked,{2:false,3:false,4:false,5:false});
    assert.equal(beforeZero.json().plantedCount,0);
    assert.equal(beforeZero.json().nextPlantProgress.currentKg,0);
    const read=store.db.prepare("SELECT * FROM user_growth_balances WHERE user_id = ?");
    const userId=a.context.userId;
    const isolatedUser=b.context.userId;
    // Build a fixture that mirrors the real conversion ledger, including
    // cumulative seed credits that can later be consumed into plants/trees.
    store.db.prepare(`UPDATE user_growth_balances SET carbon_total_grams=6800,
      carbon_balance_grams=800, seed_count=3 WHERE user_id=?`).run(userId);
    store.db.prepare(`INSERT INTO resource_transactions
      (id,user_id,resource_type,amount,balance_before,balance_after,
       transaction_kind,conversion_id,conversion_type,source_type,source_id,
       idempotency_key,created_at,metadata_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "qa-canonical-myforest-seed-credit",userId,"seed",3,0,3,
      "convert_credit","qa-carbon-to-seed","carbon_to_seed",
      "vegetarian_purchase","qa-source-1","qa-idempotency-1",
      new Date().toISOString(),"{}");
    const counts=()=>{
      const kinds=["resource_transactions","energy_logs","audit_events",
        "user_growth_balances","account_sessions"];
      return Object.fromEntries(kinds.map(table=>[table,
        Number((store.db.prepare("SELECT COUNT(*) AS n FROM "+table).get() as {n:number}).n)]));
    };
    const beforeCounts=counts();
    const beforeGrowth=read.get(userId);
    const beforeSession=store.db.prepare(`SELECT last_used_at,updated_at FROM account_sessions
      WHERE purpose='player' AND account_id=?`).get(a.context.accountId);
    for(let i=0;i<4;i++){
      const res=await app.inject({method:"GET",url:"/player/my-forest/ledger",
        headers:cookie(a.sessionToken)});
      assert.equal(res.statusCode,200);
      const body=res.json();
      assert.equal(body.source,"FORMAL_RESOURCE_LEDGER");
      assert.equal(body.plantedCount,3,"Cumulative grant ledger, not residual inventory");
      assert.equal(body.accumulatedCarbonKg,6.8);
      assert.deepEqual(body.nextPlantProgress,{currentKg:0.8,targetKg:2});
      assert.deepEqual(body.stageUnlocked,{2:true,3:true,4:false,5:false});
      assert.deepEqual(body.stageNames,{});
      assert.deepEqual(body.stageValues,{});
    }
    const other=await app.inject({method:"GET",url:"/player/my-forest/ledger",
      headers:cookie(b.sessionToken)});
    assert.equal(other.statusCode,200);
    assert.equal(other.json().plantedCount,0);
    assert.equal(other.json().accumulatedCarbonKg,0);
    assert.equal((await app.inject({method:"GET",
      url:"/player/my-forest/ledger?userId="+encodeURIComponent(isolatedUser),
      headers:cookie(a.sessionToken)})).statusCode,400,
      "Do not accept caller-selected account IDs");
    assert.deepEqual(counts(),beforeCounts,"GET must never write any ledger/audit/session tables");
    assert.deepEqual(read.get(userId),beforeGrowth,"No lazy Energy or growth mutation");
    const afterSession=store.db.prepare(`SELECT last_used_at,updated_at
      FROM account_sessions WHERE purpose='player' AND account_id=?`).get(a.context.accountId);
    assert.deepEqual(afterSession,beforeSession,"GET must not touch last_used_at");
  } finally{
    await app.close();
    store.db.close();
    rmSync(dir,{recursive:true,force:true});
  }
});
