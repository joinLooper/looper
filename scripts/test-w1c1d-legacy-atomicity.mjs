import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { deterministic, harness, reward, pending, decide, plain, FIXED } from '../apps/api/test-parity/fixtures.ts';

const results={failure:[],nested:[],security:[],business:[],success:[]};
let sequence=0;
const touch=/^UPDATE account_sessions SET last_used_at/;
const energy=/^UPDATE user_resources SET current_energy/;
const ledger=/^INSERT INTO resource_transactions/;
const log=/^INSERT INTO energy_logs/;
const audit=/^INSERT INTO audit_events/;
const snapshot=/^SELECT \* FROM users WHERE id = \?/;
const now=new Date(Date.parse(FIXED)+120000).toISOString();
function fault(h,pattern,method='run',after=false,duplicate=false){
 const original=h.db.prepare.bind(h.db);let fired=false;
 h.db.prepare=sql=>{const statement=original(sql);return {...statement,[method]:(...values)=>{
  if(!fired&&pattern.test(sql)){
   fired=true;
   if(duplicate){const table=sql.match(/^INSERT INTO (\w+)/)[1];values[0]=original(`SELECT id FROM ${table} LIMIT 1`).get().id;return statement[method](...values)}
   if(after)statement[method](...values);
   throw new Error('W1C1D_INJECTED');
  }
  return statement[method](...values);
 }}};
 return {restore(){h.db.prepare=original},fired:()=>fired};
}
async function fixture(engine,clock,fn){
 clock.reset();const name=`w1c1d_${process.pid}_${++sequence}`;const h=await harness(engine,name);
 try{
  const player=h.session('w1c1d-synthetic');reward(h,player.id,'unlock',150,7,0);
  const due=()=>{h.db.prepare('UPDATE user_resources SET current_energy=0, energy_last_updated_at=?, updated_at=? WHERE user_id=?').run(FIXED,FIXED,player.id);clock.time(now)};
  await fn(h,player,due);
 }finally{
  try{if(engine==='postgres'){h.db.exec(`DROP SCHEMA "w1b_${name}" CASCADE`);h.db.prepare('DELETE FROM w1b_control.queue_counters WHERE schema_name=?').run(`w1b_${name}`)}}finally{await h.close()}
 }
}
function noLeak(h){h.db.exec('BEGIN IMMEDIATE');h.db.exec('ROLLBACK')}
function regenerationCount(h,id){return Number(h.db.prepare("SELECT COUNT(*) AS n FROM resource_transactions WHERE user_id=? AND source_id LIKE 'energy-regen-%'").get(id).n)}
function save(){
 assert.deepEqual(Object.fromEntries(Object.entries(results).map(([key,rows])=>[key,rows.length])),{failure:26,nested:12,security:16,business:8,success:2},'all evidence cases must complete before claiming PASS');
 mkdirSync('output/w1c1d',{recursive:true});writeFileSync('output/w1c1d/legacy-atomicity-results.json',JSON.stringify({status:'PASS',sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),tests:14,results},null,2)+'\n');
}

for(const engine of ['sqlite','postgres']){
 test(`${engine}: session/state rollback at every pre-commit boundary`,async t=>{
  const clock=deterministic(t);
  try{
   for(const [name,pattern,method,after] of [
    ['before_session_touch',touch,'run',false],['after_session_touch',touch,'run',true],
    ['before_energy',energy,'run',false],['after_energy',energy,'run',true],
    ['ledger',ledger,'run',false],['energy_log',log,'run',false],['audit',audit,'run',false],
    ['snapshot',snapshot,'get',false],
   ])await fixture(engine,clock,async(h,p,due)=>{
    due();const before=plain(h.snapshot());const f=fault(h,pattern,method,after);
    const response=await h.api('GET','/player/state',undefined,p.cookie);f.restore();
    assert.equal(f.fired(),true);assert.equal(response.status,500);assert.deepEqual(plain(h.snapshot()),before);
    noLeak(h);const retry=await h.api('GET','/player/state',undefined,p.cookie);assert.equal(retry.status,200);assert.equal(regenerationCount(h,p.id),1);
    results.failure.push({engine,name,httpStatus:500,fullDatabaseRollback:true,retryAfterConfirmedRollback:1,noLeak:true});
   });
  }finally{clock.restore()}
 });
 test(`${engine}: real database constraint errors roll back session and all histories`,async t=>{
  const clock=deterministic(t);
  try{for(const [name,pattern] of [['ledger',ledger],['energy_log',log],['audit',audit]])await fixture(engine,clock,async(h,p,due)=>{
   due();const before=plain(h.snapshot());const f=fault(h,pattern,'run',false,true);
   const response=await h.api('GET','/player/state',undefined,p.cookie);f.restore();
   // Existing PG constraint normalization maps this synthetic error to 409;
   // node:sqlite exposes ERR_SQLITE_ERROR, which the unchanged API maps to 500.
   assert.equal(f.fired(),true);assert.equal(response.status,engine==='postgres'?409:500);assert.deepEqual(plain(h.snapshot()),before);noLeak(h);
   results.failure.push({engine,name:`constraint_${name}`,httpStatus:response.status,nativeDatabaseError:true,fullDatabaseRollback:true,noLeak:true});
  })}finally{clock.restore()}
 });
 test(`${engine}: nested BEGIN and SAVEPOINT preserve outer ownership`,async t=>{
  const clock=deterministic(t);
  try{for(const owner of ['begin','savepoint'])for(const outcome of ['commit','rollback','caught_inner_failure'])await fixture(engine,clock,async(h,p,due)=>{
   due();const before=plain(h.snapshot());const controls=[];const original=h.db.exec.bind(h.db);h.db.exec=sql=>{controls.push(sql);return original(sql)};
   try{
    h.db.exec(owner==='begin'?'BEGIN IMMEDIATE':'SAVEPOINT fixture_outer');
    h.db.prepare('UPDATE users SET display_name=? WHERE id=?').run('outer-marker',p.id);
    const f=outcome==='caught_inner_failure'?fault(h,log):null;
    if(f){assert.throws(()=>h.store.getPlayerSessionContext(p.auth.sessionToken),/W1C1D_INJECTED/);f.restore();assert.equal(f.fired(),true);assert.equal(h.store.getPlayerPresentationPreference(p.id).reducedMotion,null)}
    else assert.equal(h.store.getPlayerSessionContext(p.auth.sessionToken).profile.energy,1);
    assert.equal(controls.filter(s=>s.startsWith('BEGIN')).length,owner==='begin'?1:0,'no nested BEGIN');
    assert.equal(controls.includes('COMMIT'),false,'inner operation cannot commit caller');
    if(outcome==='rollback'){
     h.db.exec(owner==='begin'?'ROLLBACK':'ROLLBACK TO SAVEPOINT fixture_outer');if(owner==='savepoint')h.db.exec('RELEASE SAVEPOINT fixture_outer');
     assert.deepEqual(plain(h.snapshot()),before);
    }else{
     h.db.exec(owner==='begin'?'COMMIT':'RELEASE SAVEPOINT fixture_outer');
     assert.equal(h.db.prepare('SELECT display_name FROM users WHERE id=?').get(p.id).display_name,'outer-marker');
     if(f){const expected=plain(before);expected.users.find(u=>u.id===p.id).display_name='outer-marker';assert.deepEqual(plain(h.snapshot()),expected)}
     else assert.equal(regenerationCount(h,p.id),1);
    }
    noLeak(h);results.nested.push({engine,owner,outcome,innerCommittedOuter:false,noNestedBegin:true,fullRollbackOrExpectedCommit:true,noLeak:true});
   }finally{h.db.exec=original}
  })}finally{clock.restore()}
 });
 test(`${engine}: standalone getUser protects regeneration and snapshot`,async t=>{
  const clock=deterministic(t);
  try{for(const [name,pattern,method] of [['log',log,'run'],['snapshot',snapshot,'get']])await fixture(engine,clock,async(h,p,due)=>{
   due();const before=plain(h.snapshot());const f=fault(h,pattern,method);
   assert.throws(()=>h.store.getUser(p.id),/W1C1D_INJECTED/);f.restore();assert.equal(f.fired(),true);assert.deepEqual(plain(h.snapshot()),before);noLeak(h);
   assert.equal(h.store.getUser(p.id).energy,1);assert.equal(regenerationCount(h,p.id),1);
   results.failure.push({engine,name:`direct_getUser_${name}`,fullDatabaseRollback:true,noLeak:true});
  })}finally{clock.restore()}
 });
 test(`${engine}: unauthorized sessions write nothing; touch=false remains intact`,async t=>{
  const clock=deterministic(t);
  try{for(const kind of ['missing','invalid','expired','revoked','disabled','wrong_purpose','unknown','touch_false'])await fixture(engine,clock,async(h,p,due)=>{
   due();let token=p.auth.sessionToken;
   if(kind==='expired')h.db.prepare('UPDATE account_sessions SET expires_at=? WHERE account_id=?').run(FIXED,p.auth.context.accountId);
   if(kind==='revoked')h.db.prepare('UPDATE account_sessions SET revoked_at=? WHERE account_id=?').run(FIXED,p.auth.context.accountId);
   if(kind==='disabled')h.db.prepare("UPDATE accounts SET status='suspended' WHERE id=?").run(p.auth.context.accountId);
   if(kind==='wrong_purpose'){
    h.db.prepare(`INSERT INTO account_invitations (id,account_id,purpose,token_hash,status,expires_at,created_by_actor_id,creation_idempotency_key,created_at,updated_at)
      VALUES ('w1c1d-invitation',?,'merchant_operator',?,'redeemed',?,'test-fixture','w1c1d-invitation',?,?)`)
      .run(p.auth.context.accountId,createHash('sha256').update('synthetic invitation').digest('hex'),p.auth.context.expiresAt,FIXED,FIXED);
    h.db.prepare("UPDATE account_sessions SET purpose='merchant_operator',created_from_invitation_id='w1c1d-invitation' WHERE account_id=?").run(p.auth.context.accountId);
   }
   if(kind==='invalid')token='bad';if(kind==='unknown')token='a'.repeat(43);
   const before=plain(h.snapshot());
   if(kind==='touch_false'){
    const result=h.store.getPlayerSessionContext(token,false);assert.equal(result.profile.energy,1);
    assert.deepEqual(plain(h.snapshot()).account_sessions,before.account_sessions);
   }else{
    const response=await h.api('GET','/player/state',undefined,kind==='missing'?undefined:`looper_player_session=${token}`);
    assert.equal(response.status,401);assert.deepEqual(plain(h.snapshot()),before);
   }
   noLeak(h);results.security.push({engine,kind,status:'PASS',sessionTouch:kind==='touch_false'?false:'none',unauthorizedWrites:0});
  })}finally{clock.restore()}
 });
 test(`${engine}: actual reward and merchant settlement transactions retain ownership`,async t=>{
  const clock=deterministic(t);
  try{for(const kind of ['reward','settlement'])for(const fail of [false,true])await fixture(engine,clock,async(h,p,due)=>{
   const merchant=kind==='settlement'?pending(h,p.id,'atomic'):null;
   due();const before=plain(h.snapshot());
   const f=fail?fault(h,snapshot,'get'):null;
   const run=()=>kind==='reward'?reward(h,p.id,'nested-business',0,3,0):decide(h,merchant);
   if(f){assert.throws(run,/W1C1D_INJECTED/);f.restore();assert.equal(f.fired(),true);assert.deepEqual(plain(h.snapshot()),before)}
   else{
    run();const state=h.store.getUser(p.id);
    if(kind==='reward')assert.equal(regenerationCount(h,p.id),1,'reward path regenerates once');
    else{assert.equal(state.energy,state.resources.maxEnergy,'settlement level refill reaches cap');assert.equal(regenerationCount(h,p.id),0,'at cap only the regeneration timestamp advances')}
    assert.equal(state.energy>0,true);
   }
   noLeak(h);results.business.push({engine,kind,fail,fullOuterRollback:fail,successfulCommit:!fail,noLeak:true});
  })}finally{clock.restore()}
 });
 test(`${engine}: successful session touch and repeated state reads regenerate once`,async t=>{
  const clock=deterministic(t);
  try{await fixture(engine,clock,async(h,p,due)=>{
   due();const first=await h.api('GET','/player/state',undefined,p.cookie);const after=plain(h.snapshot());
   assert.equal(first.status,200);assert.equal(first.body.energy,1);assert.equal(after.account_sessions.find(s=>s.account_id===p.auth.context.accountId).last_used_at,now);
   for(let i=0;i<5;i++)assert.deepEqual(await h.api('GET','/player/state',undefined,p.cookie),first);
   assert.deepEqual(plain(h.snapshot()),after);assert.equal(regenerationCount(h,p.id),1);noLeak(h);
   results.success.push({engine,repeats:5,regenerations:1,sessionTouched:true,dto:first.body,state:after});
  })}finally{clock.restore()}
  if(engine==='postgres'){
   assert.deepEqual(results.success[1].dto,results.success[0].dto);
   assert.deepEqual(results.success[1].state,results.success[0].state);
   save();
  }
 });
}
