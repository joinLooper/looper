// W1C1-D reruns the original ten scenarios against the approved atomic correction.
// Original partial-commit observations remain in W1C1D_LEGACY_BEFORE.json and Git.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { deterministic, harness, reward, plain } from '../apps/api/test-parity/fixtures.ts';

const results = [];
test('W1C1-D: original ten legacy scenarios now commit or roll back atomically', async (t) => {
  const clock = deterministic(t);
  const cases = [
    { name: 'no_failure', match: null, energy: 1, ledger: 1, log: 1, audit: 1 },
    { name: 'before_resource_update', match: /^UPDATE user_resources SET current_energy/, energy: 0, ledger: 0, log: 0, audit: 0 },
    { name: 'before_resource_transaction', match: /^INSERT INTO resource_transactions/, energy: 1, ledger: 0, log: 0, audit: 0 },
    { name: 'before_energy_log', match: /^INSERT INTO energy_logs/, energy: 1, ledger: 1, log: 0, audit: 0 },
    { name: 'before_regen_audit', match: /^INSERT INTO audit_events/, energy: 1, ledger: 1, log: 1, audit: 0 },
  ];
  try {
    for (const engine of ['sqlite', 'postgres']) {
      for (const [index, scenario] of cases.entries()) {
        clock.reset();
        const name = `w1c1c_boundary_${process.pid}_${index}`;
        const schema = `w1b_${name}`;
        const h = await harness(engine, name);
        const originalPrepare = h.db.prepare.bind(h.db);
        const originalExec = h.db.exec.bind(h.db);
        try {
          const player = h.session('w1c1c-synthetic');
          // Existing Lv3 authority unlocks Energy; new Lv1 accounts have max=0.
          reward(h, player.id, 'boundary-unlock', 150, 0, 0);
          assert.equal(h.store.getUser(player.id).resources.maxEnergy, 120);
          const interval = h.store.economySettings.energyRegenIntervalSeconds;
          const start = '2026-08-16T03:00:00.000Z';
          const now = new Date(Date.parse(start) + interval * 1000).toISOString();
          h.db.prepare('UPDATE user_resources SET current_energy = 0, energy_last_updated_at = ?, updated_at = ? WHERE user_id = ?').run(start, start, player.id);
          clock.time(now);
          const snapshot = () => ({
            session: h.db.prepare('SELECT last_used_at, updated_at FROM account_sessions WHERE account_id = ?').get(player.auth.context.accountId),
            resources: h.db.prepare('SELECT current_energy, energy_last_updated_at, updated_at FROM user_resources WHERE user_id = ?').get(player.id),
            ledger: Number(h.db.prepare('SELECT COUNT(*) AS n FROM resource_transactions WHERE user_id = ?').get(player.id).n),
            log: Number(h.db.prepare('SELECT COUNT(*) AS n FROM energy_logs WHERE user_id = ?').get(player.id).n),
            audit: Number(h.db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE actor_id = ? AND action = 'resource.energy_regenerated'").get(player.id).n),
          });
          const before = snapshot();
          const controls = [];
          let injected = false;
          h.db.exec = (sql) => { controls.push(sql); return originalExec(sql); };
          h.db.prepare = (sql) => {
            const statement = originalPrepare(sql);
            return { ...statement, run: (...values) => {
              if (!injected && scenario.match?.test(sql)) {
                injected = true;
                throw new Error('W1C1C_TEST_INJECTED_WRITE_FAILURE');
              }
              return statement.run(...values);
            } };
          };
          const response = await h.api('GET', '/player/state', undefined, player.cookie);
          h.db.prepare = originalPrepare;
          h.db.exec = originalExec;
          const after = snapshot();
          assert.equal(injected, Boolean(scenario.match));
          assert.equal(response.status, scenario.match ? 500 : 200);
          if (scenario.match) assert.deepEqual(after, before, 'all session/resource/history writes roll back');
          else {
            assert.equal(after.session.last_used_at, now);
            assert.equal(after.session.updated_at, now);
            assert.equal(after.resources.current_energy, 1);
            assert.equal(after.resources.energy_last_updated_at, now);
            assert.equal(after.resources.updated_at, now);
            for (const key of ['ledger', 'log', 'audit']) assert.equal(after[key] - before[key], 1);
          }
          assert.equal(controls.filter(sql=>sql.startsWith('SAVEPOINT ')).length,2);
          assert.equal(controls.filter(sql=>sql.startsWith('ROLLBACK TO ')).length,scenario.match?2:0);
          assert.equal(controls.filter(sql=>sql.startsWith('RELEASE ')).length,2);
          const retry = await h.api('GET', '/player/state', undefined, player.cookie);
          const afterRetry = snapshot();
          assert.equal(retry.status, 200);
          assert.equal(afterRetry.resources.current_energy, 1);
          if (!scenario.match) assert.deepEqual(afterRetry, after, 'successful repeat never duplicates regeneration');
          else for (const key of ['ledger', 'log', 'audit']) assert.equal(afterRetry[key] - before[key], 1);
          results.push({ engine, scenario: scenario.name, responseStatus: response.status,
            failureInjected: injected, before, after, retryStatus: retry.status, afterRetry,
            storeTransactionControls: controls, assertionStatus: 'PASS' });
        } finally {
          h.db.prepare = originalPrepare;
          h.db.exec = originalExec;
          try {
            if (engine === 'postgres') {
              // Only the fresh process-owned disposable schema from this case.
              assert.match(schema, /^w1b_w1c1c_boundary_\d+_[0-4]$/);
              h.db.exec(`DROP SCHEMA "${schema}" CASCADE`);
              h.db.prepare('DELETE FROM w1b_control.queue_counters WHERE schema_name = ?').run(schema);
              assert.equal(h.db.prepare('SELECT schema_name FROM information_schema.schemata WHERE schema_name = ?').get(schema), undefined);
            }
          } finally { await h.close(); }
        }
      }
    }
    for (let i = 0; i < cases.length; i++) {
      const { engine: leftEngine, storeTransactionControls: leftControls, ...left } = results[i];
      const { engine: rightEngine, storeTransactionControls: rightControls, ...right } = results[i + cases.length];
      // SQLite rows have null prototypes; compare persisted JSON values.
      assert.deepEqual(plain(right), plain(left), `sync backend boundary parity: ${cases[i].name}`);
      // Savepoint names are globally unique; compare their ownership structure,
      // not the process-wide numeric suffix. Raw controls stay in the evidence.
      const scopes = controls => {
        const names = new Map();
        return controls.map(sql => sql.replace(/looper_player_state_\d+/g, name => {
          if (!names.has(name)) names.set(name, `scope_${names.size + 1}`);
          return names.get(name);
        }));
      };
      assert.deepEqual(scopes(rightControls), scopes(leftControls));
    }
    const out = resolve('output/w1c1d');
    mkdirSync(out, { recursive: true });
    writeFileSync(resolve(out, 'transaction-boundary-results.json'), JSON.stringify({
      workPackage: 'W1C1-D', sourceHead: '6333b4c27a19bea0493c9d5327aedb160d0ddb72',
      executedHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      status: 'ATOMIC_ROLLBACK_CONFIRMED', diagnosticAssertions: 'PASS', cases: results.length,
      approvedFailureDelta: 'Legacy partial commit -> atomic rollback', postgresMajor: 17,
      credentialsOrRawTokensIncluded: false, disposableSchemasDropped: true,
      results,
    }, null, 2) + '\n');
  } finally { clock.restore(); }
});
