import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deterministic, harness, reward, plain, FIXED } from '../apps/api/test-parity/fixtures.ts';

test('pure extraction preserves deterministic synchronous response, database and SQL order', async t => {
  const clock = deterministic(t);
  const results=[];
  try {
    for(const [name,energy,max,elapsed] of [
      ['below',0,120,119999],['exact',0,120,120000],['multi',3,120,600999],
      ['full',120,120,600999],['near',119,120,600999],['long',0,120,86400000],
      ['future',0,120,-1000],['locked',0,0,120000],
    ]) {
      clock.reset();const h=await harness('sqlite','extraction');
      try {
        const player=h.session('extraction');reward(h,player.id,'fixture',150,7,0);
        h.db.prepare('UPDATE user_resources SET current_energy=?, max_energy=?, energy_last_updated_at=? WHERE user_id=?').run(energy,max,FIXED,player.id);
        clock.time(new Date(Date.parse(FIXED)+elapsed).toISOString());
        const trace=[];const prepare=h.db.prepare.bind(h.db);
        h.db.prepare=sql=>{trace.push(sql);return prepare(sql)};
        const response=await h.api('GET','/player/state',undefined,player.cookie);
        const repeat=await h.api('GET','/player/state',undefined,player.cookie);
        h.db.prepare=prepare;
        assert.equal(response.status,200);assert.deepEqual(repeat,response);
        results.push({name,response,trace,state:plain(h.snapshot())});
      }finally{await h.close()}
    }
  }finally{clock.restore()}
  mkdirSync('output/w1c1c',{recursive:true});
  if(process.env.W1C1C_EXTRACTION_PHASE==='before')writeFileSync('output/w1c1c/helper-before-success.json',JSON.stringify(results,null,2));
  else {
    const before=JSON.parse(readFileSync('docs/migrations/evidence/W1C1C_HELPER_BEFORE_SUCCESS_HASHES.json','utf8'));
    assert.deepEqual(results.map(row=>({name:row.name,sha256:createHash('sha256').update(JSON.stringify(row)).digest('hex')})),before.cases,
      'same SQL, IDs, timestamps, responses and persisted rows captured before extraction');
    writeFileSync('output/w1c1c/helper-after-success.json',JSON.stringify({status:'PASS',cases:results.length,results},null,2));
  }
});
