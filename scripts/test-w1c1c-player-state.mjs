import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import http from 'node:http';
import { deterministic, harness, reward, merchant, plain, credentials, FIXED } from '../apps/api/test-parity/fixtures.ts';
import { buildApp } from '../apps/api/src/app.ts';
import { AsyncPlayerStateRepository, PlayerStateUnknownOutcomeError } from '../apps/api/src/persistence/async-player-state.ts';
import { AsyncPostgresDatabase } from '../apps/api/src/persistence/async-postgres.ts';
import { RequestCancelledError, PoolAcquireTimeoutError, TransactionContextError, StatementTimeoutError } from '../apps/api/src/persistence/async-contract.ts';
const evidence={sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),session:[],energy:[],failure:[],concurrency:[]};
let serial=0;
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture(engine, max=2, options={}) {
  const name=`playerstate_${process.pid}_${++serial}`;
  const h=await harness(engine==='sqlite'?'sqlite':'postgres',name);
  const schema=`w1b_${name}`;
  let db,app,repo;
  if(engine==='async'){
    db=new AsyncPostgresDatabase(credentials(),{maxConnections:max,...options,pool:{options:`-c search_path=${schema},pg_catalog`,...options.pool}});
    assert.equal(Math.floor(Number((await db.query('SHOW server_version_num')).rows[0].server_version_num)/10000),17);
    repo=new AsyncPlayerStateRepository(db);
    app=await buildApp(h.store,{asyncPlayerStateRepository:repo,playerAppUrl:'https://player.test',merchantAppUrl:'https://merchant.test',adminAppUrl:'https://admin.test'});
  }else app=h.app;
  const beforeClose=h.close;
  return {...h,app,dbAsync:db,repo,schema, async close(){
    try{if(engine==='async'){await app.close();await db.drain();assert.equal(db.pool.totalCount,0);assert.equal(db.pool.waitingCount,0)}}
    finally{try{if(engine!=='sqlite'){h.db.exec(`DROP SCHEMA "${schema}" CASCADE`);h.db.prepare('DELETE FROM w1b_control.queue_counters WHERE schema_name=?').run(schema)}}finally{await beforeClose()}}
  }};
}
function player(h,name='a'){
  const p=h.session(name);reward(h,p.id,`fixture-${name}`,150,7,0);
  h.db.prepare('UPDATE user_resources SET current_energy=0, energy_last_updated_at=? WHERE user_id=?').run(FIXED,p.id);
  h.db.prepare('UPDATE user_growth_balances SET carbon_total_grams=1234, carbon_balance_grams=1234 WHERE user_id=?').run(p.id);
  return p;
}
async function api(h,p,url='/player/state'){
  const r=await h.app.inject({method:'GET',url,headers:{origin:'https://player.test',...(p?{cookie:p.cookie}:{})}});
  const headers={...r.headers};delete headers.date;delete headers['connection'];
  return {status:r.statusCode,body:r.json(),headers};
}
function summary(h,id){return {
  energy:plain(h.db.prepare('SELECT * FROM user_resources WHERE user_id=?').get(id)),
  ledger:plain(h.db.prepare("SELECT * FROM resource_transactions WHERE user_id=? AND resource_type='energy' AND source_type='daily_login' ORDER BY id").all(id)),
  log:plain(h.db.prepare("SELECT * FROM energy_logs WHERE user_id=? AND event_type='natural_regen' ORDER BY id").all(id)),
  audit:plain(h.db.prepare("SELECT * FROM audit_events WHERE actor_id=? AND action='resource.energy_regenerated' ORDER BY id").all(id)),
}}
test('three-engine successful Energy/DTO/headers/history parity',async t=>{
  const clock=deterministic(t);
  try{
    for(const [name,energy,max,elapsed,interval] of [
      ['below',0,120,119999],['exact',0,120,120000],['multi',3,120,600999],['full',120,120,600999],
      ['near',119,120,600999],['long',0,120,86400000],['future',0,120,-1000],['locked',0,0,120000],['configured-interval',0,120,300000,300],
    ]){
      let expected;
      for(const engine of ['sqlite','postgres','async']){
        clock.reset();const h=await fixture(engine);
        try{
          const p=name==='locked'?h.session('a'):player(h);
          const m=merchant(h,'history');h.store.acceptMission(p.id,m.mission.id);
          if(interval){const settings=h.store.economySettings;h.db.prepare("UPDATE economy_settings SET value_json=? WHERE key='core'").run(JSON.stringify({...settings,energyRegenIntervalSeconds:interval}))}
          h.db.prepare('UPDATE user_resources SET current_energy=?,max_energy=? WHERE user_id=?').run(energy,max,p.id);
          clock.time(new Date(Date.parse(FIXED)+elapsed).toISOString());
          const response=await api(h,p);assert.equal(response.status,200);
          const first=plain(h.snapshot());const repeat=await api(h,p);
          assert.deepEqual(repeat,response);assert.deepEqual(plain(h.snapshot()),first);
          const observed={response,state:first};
          if(expected)assert.deepEqual(observed,expected,`${name}: ${engine}`);else expected=observed;
          evidence.energy.push({name,engine,status:'PASS',snapshotSha256:digest(first),responseSha256:digest(response)});
        }finally{await h.close()}
      }
    }
  }finally{clock.restore()}
});
test('session security and cross-player query cannot override cookie authority',async t=>{
  const clock=deterministic(t);
  try{
    for(const kind of ['valid','expired','revoked','invalid','wrong-purpose','disabled','missing','cross-player']){
      let expected;
      for(const engine of ['sqlite','postgres','async']){
        clock.reset();const h=await fixture(engine);
        try{
          const a=player(h,'a'),b=player(h,'b');
          const account=a.auth.context.accountId;
          if(kind==='expired')h.db.prepare('UPDATE account_sessions SET expires_at=? WHERE account_id=?').run(FIXED,account);
          if(kind==='revoked')h.db.prepare('UPDATE account_sessions SET revoked_at=? WHERE account_id=?').run(FIXED,account);
          if(kind==='wrong-purpose'){
            h.db.prepare(`INSERT INTO account_invitations (id,account_id,purpose,token_hash,status,expires_at,created_by_actor_id,creation_idempotency_key,created_at,updated_at)
              VALUES ('wrong-purpose-fixture',?,'merchant_operator',?,'redeemed',?,'test-fixture','wrong-purpose-fixture',?,?)`)
              .run(account,createHash('sha256').update('test invitation only').digest('hex'),a.auth.context.expiresAt,FIXED,FIXED);
            h.db.prepare("UPDATE account_sessions SET purpose='merchant_operator',created_from_invitation_id='wrong-purpose-fixture' WHERE account_id=?").run(account);
          }
          if(kind==='disabled')h.db.prepare("UPDATE accounts SET status='suspended' WHERE id=?").run(account);
          const before=plain(h.snapshot());
          const p=kind==='missing'?null:kind==='invalid'?{cookie:'looper_player_session=not-a-token'}:a;
          const response=await api(h,p,kind==='cross-player'?`/player/state?userId=${b.id}`:'/player/state');
          const authorized=['valid','cross-player'].includes(kind);
          assert.equal(response.status,authorized?200:401);
          if(authorized)assert.equal(response.body.id,a.id);else assert.deepEqual(plain(h.snapshot()),before);
          assert.equal(response.headers['set-cookie'],undefined);
          if(expected)assert.deepEqual(response,expected);else expected=response;
          evidence.session.push({kind,engine,status:'PASS',httpStatus:response.status});
        }finally{await h.close()}
      }
    }
  }finally{clock.restore()}
});
function wrapTransactions(db,decorate){
  const original=db.withTransaction.bind(db);
  db.withTransaction=(callback,options)=>original(tx=>callback(decorate(tx)),options);
  return ()=>{db.withTransaction=original};
}
test('atomic rollback after each write and snapshot failure; transaction context cannot escape',async t=>{
  const clock=deterministic(t);
  try{
    for(const point of ['session','resource','ledger','log','audit','snapshot']){
      clock.reset();const h=await fixture('async');
      try{
        const p=player(h);clock.time('2026-08-16T03:02:00.000Z');const before=plain(h.snapshot());let escaped,fired=false;
        const pattern={session:/UPDATE account_sessions/,resource:/UPDATE user_resources/,ledger:/INSERT INTO resource_transactions/,log:/INSERT INTO energy_logs/,audit:/INSERT INTO audit_events/,snapshot:/SELECT \* FROM users/}[point];
        const restore=wrapTransactions(h.dbAsync,tx=>{escaped=tx;return new Proxy(tx,{get(target,key){
          if(key==='execute'||key==='query')return async(sql,...args)=>{const result=await target[key](sql,...args);if(!fired&&pattern.test(sql)){fired=true;throw Error('test-only failure')}return result};
          return typeof target[key]==='function'?target[key].bind(target):target[key];
        }})});
        assert.equal((await api(h,p)).status,500);assert.equal(fired,true);assert.deepEqual(plain(h.snapshot()),before);
        await assert.rejects(escaped.query('SELECT 1'),TransactionContextError);restore();
        assert.equal((await api(h,p)).status,200);const s=summary(h,p.id);assert.equal(s.ledger.length,1);assert.equal(s.log.length,1);assert.equal(s.audit.length,1);
        evidence.failure.push({point,status:'PASS',rollbackAll:true,retryAfterConfirmedRollback:'one complete regeneration'});
      }finally{await h.close()}
    }
  }finally{clock.restore()}
});
test('pool 2/4, concurrent requests 1/5/10/20 preserve session isolation and one regen',async t=>{
  const clock=deterministic(t);
  try{
    for(const pool of [2,4])for(const concurrency of [1,5,10,20]){
      clock.reset();const h=await fixture('async',pool);
      try{
        const players=[player(h,'a'),player(h,'b')];clock.time('2026-08-16T03:02:00.000Z');
        const delay=monitorEventLoopDelay({resolution:10});delay.enable();let beats=0;const beat=setInterval(()=>beats++,1);
        const started=performance.now();const responses=await Promise.all(Array.from({length:concurrency},(_,i)=>api(h,players[i%2])));
        clearInterval(beat);delay.disable();responses.forEach((r,i)=>{assert.equal(r.status,200);assert.equal(r.body.id,players[i%2].id);assert.equal(r.body.energy,1)});
        for(let i=0;i<Math.min(2,concurrency);i++){const s=summary(h,players[i].id);assert.equal(s.ledger.length,1);assert.equal(s.log.length,1);assert.equal(s.audit.length,1)}
        const again=await Promise.all(Array.from({length:concurrency},()=>api(h,players[0])));for(const r of again)assert.equal(r.body.energy,1);
        assert.equal(summary(h,players[0].id).ledger.length,1);assert.ok(beats>0);assert.ok(h.dbAsync.pool.totalCount<=pool);
        assert.equal(h.dbAsync.pool.waitingCount,0);assert.equal(h.dbAsync.pool.idleCount,h.dbAsync.pool.totalCount);
        evidence.concurrency.push({pool,concurrency,status:'PASS',requests:concurrency*2,elapsedMs:performance.now()-started,eventLoopBeats:beats,eventLoopP95Ms:delay.percentile(95)/1e6,poolConnections:h.dbAsync.pool.totalCount,waiting:0,allConnectionsIdle:true});
      }finally{await h.close()}
    }
  }finally{clock.restore()}
});
test('cancellation after session touch rolls back and releases connection',async t=>{
  const clock=deterministic(t);clock.reset();const h=await fixture('async');
  try{
    const p=player(h);clock.time('2026-08-16T03:02:00.000Z');const before=plain(h.snapshot());const abort=new AbortController();
    const restore=wrapTransactions(h.dbAsync,tx=>new Proxy(tx,{get(target,key){if(key==='execute')return async(sql,...args)=>{const r=await target.execute(sql,...args);if(/UPDATE account_sessions/.test(sql))abort.abort();return r};return typeof target[key]==='function'?target[key].bind(target):target[key]}}));
    await assert.rejects(h.repo.getPlayerState(p.auth.sessionToken,{signal:abort.signal}),RequestCancelledError);restore();
    assert.deepEqual(plain(h.snapshot()),before);assert.equal(h.dbAsync.pool.idleCount,h.dbAsync.pool.totalCount);
    evidence.failure.push({point:'abort-after-touch',status:'PASS',rollbackAll:true});
  }finally{await h.close();clock.restore()}
});
test('pool acquire timeout causes no writes and recovers',async t=>{
  const clock=deterministic(t);clock.reset();const h=await fixture('async',2,{acquireTimeoutMs:1000,pool:{connectionTimeoutMillis:5000}});
  try{
    const p=player(h);const before=plain(h.snapshot());const clients=await Promise.all([h.dbAsync.pool.connect(),h.dbAsync.pool.connect()]);
    h.dbAsync.acquireTimeoutMs=80;
    try{await assert.rejects(h.repo.getPlayerState(p.auth.sessionToken),PoolAcquireTimeoutError)}finally{clients.forEach(c=>c.release());h.dbAsync.acquireTimeoutMs=1000}
    await sleep(20);assert.deepEqual(plain(h.snapshot()),before);assert.equal((await api(h,p)).status,200);
    evidence.failure.push({point:'pool-timeout',status:'PASS',noWrites:true});
  }finally{await h.close();clock.restore()}
});
test('lost COMMIT acknowledgement stays unknown, no retry, ledgers allow readback',async t=>{
  const clock=deterministic(t);clock.reset();const h=await fixture('async');
  try{
    const p=player(h);clock.time('2026-08-16T03:02:00.000Z');let commits=0;
    const connect=h.dbAsync.pool.connect.bind(h.dbAsync.pool);
    h.dbAsync.pool.connect=async()=>{const c=await connect();const q=c.query.bind(c);c.query=async(sql,...args)=>{const result=await q(sql,...args);if(sql==='COMMIT'){commits++;throw Error('test lost commit acknowledgement')}return result};return c};
    const response=await api(h,p);assert.equal(response.status,503);assert.equal(response.body.outcome,'OUTCOME_UNKNOWN');assert.equal(commits,1);
    const s=summary(h,p.id);assert.equal(s.ledger.length,1);assert.equal(s.log.length,1);assert.equal(s.audit.length,1);
    assert.equal(s.ledger[0].source_id,response.body.operationId);assert.equal(s.log[0].source_id,response.body.operationId);assert.equal(s.audit[0].entity_id,response.body.operationId);
    evidence.failure.push({point:'commit-ack-lost',status:'PASS',outcome:'OUTCOME_UNKNOWN',automaticRetries:0,reconciliation:'three records match operationId'});
    h.dbAsync.pool.connect=connect;
  }finally{await h.close();clock.restore()}
});
test('reject SQLite/different PG authority before enabling opt-in route',async t=>{
  const h=await fixture('async');const sqlite=await fixture('sqlite');const other=await fixture('postgres');
  try{
    await assert.rejects(buildApp(undefined,{asyncPlayerStateRepository:h.repo}),/explicit PostgreSQL/);
    await assert.rejects(buildApp(sqlite.store,{asyncPlayerStateRepository:h.repo}),/same PostgreSQL/);
    await assert.rejects(buildApp(other.store,{asyncPlayerStateRepository:h.repo}),/authority differ/);
    evidence.failure.push({point:'dual-authority-guard',status:'PASS'});
  }finally{await h.close();await sqlite.close();await other.close()}
});
test('writer-lock wait revalidates session expiration before touch',async t=>{
  const clock=deterministic(t);clock.reset();const h=await fixture('async');
  try{
    const p=player(h);const before=plain(h.snapshot());let release,started;
    const gate=new Promise(r=>release=r),ready=new Promise(r=>started=r);
    const held=h.dbAsync.withTransaction(async()=>{started();await gate});await ready;
    const pending=h.repo.getPlayerState(p.auth.sessionToken);await sleep(20);
    clock.time(p.auth.context.expiresAt);release();await held;assert.equal(await pending,null);
    assert.deepEqual(plain(h.snapshot()),before);evidence.session.push({kind:'expired-while-waiting-for-writer',engine:'async',status:'PASS'});
  }finally{await h.close();clock.restore()}
});
test('writer lock timeout leaves session and resources untouched',async t=>{
  const clock=deterministic(t);clock.reset();const h=await fixture('async');
  try{
    const p=player(h);const before=plain(h.snapshot());let release,started;
    const gate=new Promise(r=>release=r),ready=new Promise(r=>started=r);
    const held=h.dbAsync.withTransaction(async()=>{started();await gate});await ready;
    h.dbAsync.lockTimeoutMs=40;
    try{await assert.rejects(h.repo.getPlayerState(p.auth.sessionToken),StatementTimeoutError)}finally{release();await held;h.dbAsync.lockTimeoutMs=5000}
    assert.deepEqual(plain(h.snapshot()),before);evidence.failure.push({point:'writer-lock-timeout',status:'PASS',noWrites:true});
  }finally{await h.close();clock.restore()}
});
test('cancel running PostgreSQL query after touch confirms full rollback',async t=>{
  const clock=deterministic(t);clock.reset();const h=await fixture('async');
  try{
    const p=player(h);const before=plain(h.snapshot());const controller=new AbortController();let timer;
    const restore=wrapTransactions(h.dbAsync,tx=>new Proxy(tx,{get(target,key){if(key==='execute')return async(sql,...args)=>{
      const result=await target.execute(sql,...args);if(/UPDATE account_sessions/.test(sql)){timer=setTimeout(()=>controller.abort(),30);await target.query('SELECT pg_sleep(5)')}return result;
    };return typeof target[key]==='function'?target[key].bind(target):target[key]}}));
    try{await assert.rejects(h.repo.getPlayerState(p.auth.sessionToken,{signal:controller.signal}),RequestCancelledError)}finally{clearTimeout(timer);restore()}
    assert.deepEqual(plain(h.snapshot()),before);assert.equal((await api(h,p)).status,200);
    evidence.failure.push({point:'cancel-active-query',status:'PASS',rollbackAll:true});
  }finally{await h.close();clock.restore()}
});
test('uncertain COMMIT never returns a still-open transaction to pool',async t=>{
  const clock=deterministic(t);clock.reset();const h=await fixture('async');
  try{
    const p=player(h);clock.time('2026-08-16T03:02:00.000Z');const before=plain(h.snapshot());let pid;
    const connect=h.dbAsync.pool.connect.bind(h.dbAsync.pool);
    h.dbAsync.pool.connect=async()=>{const c=await connect();pid=c.processID;const q=c.query.bind(c);c.query=async(sql,...args)=>{if(sql==='COMMIT')throw Error('test commit transport failure before acknowledgement');return q(sql,...args)};return c};
    await assert.rejects(h.repo.getPlayerState(p.auth.sessionToken),PlayerStateUnknownOutcomeError);
    h.dbAsync.pool.connect=connect;await sleep(30);
    const state=h.db.prepare('SELECT state FROM pg_stat_activity WHERE pid=?').get(pid);
    assert.notEqual(state?.state,'idle in transaction','uncertain connection must be destroyed, not pooled');
    assert.deepEqual(plain(h.snapshot()),before);assert.equal((await api(h,p)).status,200);
    evidence.failure.push({point:'unknown-commit-connection-disposal',status:'PASS',outcome:'OUTCOME_UNKNOWN',recovered:true});
  }finally{await h.close();clock.restore()}
});
test('real HTTP disconnect cancels transaction and leaves no writes',async t=>{
  const clock=deterministic(t);clock.reset();const h=await fixture('async');
  try{
    const p=player(h);clock.time('2026-08-16T03:02:00.000Z');const before=plain(h.snapshot());let reached;
    const entered=new Promise(r=>reached=r);
    const restore=wrapTransactions(h.dbAsync,tx=>new Proxy(tx,{get(target,key){if(key==='execute')return async(sql,...args)=>{
      const result=await target.execute(sql,...args);if(/UPDATE account_sessions/.test(sql)){reached();await target.query('SELECT pg_sleep(5)')}return result;
    };return typeof target[key]==='function'?target[key].bind(target):target[key]}}));
    const url=await h.app.listen({port:0,host:'127.0.0.1'});
    const request=http.get(`${url}/player/state`,{headers:{cookie:p.cookie}});request.on('error',()=>{});
    await entered;request.destroy();
    const start=performance.now();while(h.dbAsync.diagnostics.activeTransactions>0&&performance.now()-start<4000)await sleep(10);
    restore();assert.equal(h.dbAsync.diagnostics.activeTransactions,0);assert.deepEqual(plain(h.snapshot()),before);
    evidence.failure.push({point:'http-disconnect',status:'PASS',rollbackAll:true});
  }finally{await h.close();clock.restore()}
});
test.after(()=>{
  mkdirSync('output/w1c1c',{recursive:true});
  writeFileSync('output/w1c1c/player-state-results.json',JSON.stringify(evidence,null,2)+'\n');
});
