import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { buildApp } from "../src/app.js";
import { AsyncMissionReadStore } from "../src/persistence/async-mission-read-store.js";
import { AsyncPostgresDatabase } from "../src/persistence/async-postgres.js";
import { credentials, deterministic, harness, merchant } from "./fixtures.js";

// This spec is outside *.test.ts: the 488 baseline and 15 foundation tests
// retain their existing authority/count. No emulator or missing-PG skip exists.
for (const maxConnections of [2, 4]) {
  test(`PG17 async /missions matches SQLite and sync PG with zero writes (pool=${maxConnections})`, async (t) => {
    const clock = deterministic(t);
    const name = `readonly_${process.pid}_${maxConnections}`;
    const schema = `w1b_${name}`;
    const sqlite = await harness("sqlite", name);
    t.after(() => sqlite.close());
    const postgres = await harness("postgres", name);
    let db: AsyncPostgresDatabase | undefined;
    let app: Awaited<ReturnType<typeof buildApp>> | undefined;
    t.after(async () => {
      try {
        await app?.close();
      } finally {
        try {
          await db?.drain();
          if (db) {
            assert.equal(db.pool.totalCount, 0);
            assert.equal(db.pool.waitingCount, 0);
          }
        } finally {
          // Only this process-owned disposable schema is removed.
          postgres.db.exec(`DROP SCHEMA "${schema}" CASCADE`);
          postgres.db.prepare("DELETE FROM w1b_control.queue_counters WHERE schema_name=?").run(schema);
          await postgres.close();
          clock.restore();
        }
      }
    });
    db = new AsyncPostgresDatabase(credentials(), {
      maxConnections,
      pool: { options: `-c search_path=${schema},pg_catalog -c default_transaction_read_only=on` },
      applicationName: `looper-w1c1b-readonly-${maxConnections}`,
    });
    assert.equal(db.pool.options.max, maxConnections);
    assert.equal(Number((await db.query("SHOW server_version_num")).rows[0].server_version_num) / 10000 | 0, 17);
    assert.equal((await db.query("SHOW default_transaction_read_only")).rows[0].default_transaction_read_only, "on");
    // A mutation through the actual adapter must be rejected by PostgreSQL.
    await assert.rejects(db.execute("UPDATE economy_settings SET version=version+1"), { code: "25006" });
    app = await buildApp(postgres.store, { asyncMissionReadStore: new AsyncMissionReadStore(db) });
    const stages: Array<{ name: string; requests: number; status: number }> = [];
    const verify = async (stage: string, status = 200, cookie?: string) => {
      const beforePG = postgres.snapshot();
      const beforeSQLite = sqlite.snapshot();
      const allocatorBefore = postgres.db.prepare("SELECT high_water FROM w1b_control.queue_counters WHERE schema_name=?").get(schema);
      const expectedSQLite = await sqlite.api("GET", "/missions");
      const expectedPG = await postgres.api("GET", "/missions");
      assert.equal(expectedSQLite.status, status);
      assert.deepEqual(expectedPG, expectedSQLite);
      const replies = await Promise.all(Array.from({ length: 10 }, () => app!.inject({
        method: "GET", url: "/missions", headers: cookie ? { cookie } : {},
      })));
      for (const response of replies) {
        assert.equal(response.statusCode, status);
        assert.deepEqual(response.json(), expectedSQLite.body);
        assert.equal(response.headers["set-cookie"], undefined);
      }
      assert.deepEqual(postgres.snapshot(), beforePG, "all 35 PG tables remain byte-equivalent");
      assert.deepEqual(sqlite.snapshot(), beforeSQLite, "all 35 SQLite tables remain unchanged");
      assert.deepEqual(postgres.db.prepare("SELECT high_water FROM w1b_control.queue_counters WHERE schema_name=?").get(schema), allocatorBefore);
      assert.ok(db!.pool.totalCount <= maxConnections);
      assert.equal(db!.pool.waitingCount, 0);
      assert.equal(db!.pool.idleCount, db!.pool.totalCount);
      stages.push({ name: stage, requests: replies.length, status });
    };
    await verify("empty catalogue");
    let playerCookie = "";
    for (const h of [sqlite, postgres]) {
      clock.reset();
      playerCookie = h.session("readonly-fixture").cookie;
      const first = merchant(h, "first");
      clock.time("2026-08-16T03:01:00.000Z");
      const second = merchant(h, "second");
      h.db.prepare("UPDATE merchants SET status='suspended', reward_star_amount=777 WHERE id=?").run(second.profile.id);
      // Empty descriptions are permitted by the existing response contract.
      h.db.prepare("UPDATE missions SET description='' WHERE id=?").run(first.mission.id);
      const settings = h.store.economySettings;
      h.db.prepare("UPDATE economy_settings SET value_json=? WHERE key='core'").run(JSON.stringify({
        ...settings, redemptionEnergy: 43, redemptionExp: 321, vegetarianCarbonGrams: 999,
      }));
    }
    t.mock.method(postgres.store, "getPlayerSessionContext", () => { throw Error("Session resolver is forbidden for /missions"); });
    await verify("stored rewards, empty description, suspended merchant included, session cookie untouched", 200, playerCookie);
    await verify("invalid cookie is ignored on the public catalogue", 200, "looper_player_session=invalid");
    for (const h of [sqlite, postgres]) {
      const settings = h.store.economySettings;
      h.db.prepare("UPDATE economy_settings SET value_json=? WHERE key='core'").run(JSON.stringify({ ...settings, redemptionExp: 100001 }));
    }
    await verify("invalid settings preserve canonical 500 response", 500);
    for (const h of [sqlite, postgres]) h.db.prepare("DELETE FROM economy_settings WHERE key='core'").run();
    await verify("missing settings preserve canonical 500 response", 500);

    const root = new URL("../../../", import.meta.url);
    const output = resolve(process.env.W1C1B_READONLY_OUTPUT_DIR ?? "output/w1c1b-readonly");
    mkdirSync(output, { recursive: true });
    writeFileSync(resolve(output, `pool-${maxConnections}.json`), JSON.stringify({
      status: "PASS", sourceHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      postgresMajor: 17, maxConnections, defaultTransactionReadOnly: true, baselineTablesChecked: 35,
      stages, sessionTouch: false, rewardLedgerMutation: false, allocatorUnchanged: true,
      poolBeforeDrain: db.diagnostics,
    }, null, 2) + "\n");
  });
}
