import assert from "node:assert/strict";
import test from "node:test";
import { writeFileSync, readFileSync } from "node:fs";
import {
  harness,
  deterministic,
  plain,
  inventory,
  credentials,
  reward,
  pending,
  decide,
} from "./fixtures.js";
import { safeInteger } from "../src/persistence/bigint-codec.mjs";
import { PostgresDatabase } from "../src/persistence/postgres.js";
const results: any[] = [];
async function dual(t: any, name: string, run: (h: any) => any) {
  const clock = deterministic(t);
  let oracle: any;
  try {
    for (const engine of ["sqlite", "postgres"] as const) {
      clock.reset();
      const h = await harness(engine, "compat_" + name);
      try {
        const actual = plain(await run(h));
        if (engine === "sqlite") oracle = actual;
        else assert.deepEqual(actual, oracle);
      } finally {
        await h.close();
      }
    }
    results.push({ name, status: "PASS", result: oracle });
  } catch (e: any) {
    results.push({ name, status: "FAIL", error: e.message });
    throw e;
  } finally {
    clock.restore();
    writeFileSync(
      new URL(
        "../../../docs/migrations/W1B_COMPATIBILITY_RESULTS.json",
        import.meta.url,
      ),
      JSON.stringify({ results }, null, 2) + "\n",
    );
  }
}
test("BIGINT explicit codec and real pg int8 decoding", () => {
  const db = new PostgresDatabase(credentials(), "w1b_smoke");
  try {
    for (const value of [0, 1, 2 ** 31, 2 ** 32, Number.MAX_SAFE_INTEGER]) {
      assert.equal(safeInteger(String(value)), value);
      assert.equal(
        db.prepare("SELECT CAST(? AS bigint) value").get(value)!.value,
        value,
      );
    }
    assert.throws(() => safeInteger(9007199254740992n), RangeError);
    assert.throws(() => safeInteger("9007199254740992"), RangeError);
    assert.throws(
      () => db.prepare("SELECT 9007199254740992::bigint value").get(),
      /safe integer/,
    );
    assert.throws(
      () => db.prepare("SELECT ?::bigint value").get(9007199254740992n),
      /safe integer/,
    );
    assert.equal(db.prepare("SELECT 1::bigint value").get()!.value, 1);
    results.push({
      name: "bigint",
      status: "PASS",
      boundaries: [0, 1, 2 ** 31, 2 ** 32, Number.MAX_SAFE_INTEGER],
      overflow:
        "DB int8 read, parameter binding and codec reject MAX_SAFE_INTEGER + 1",
    });
  } finally {
    db.close();
  }
});
test("v27 schema counts, types, FK actions, trigger names, indexes, seed separation", async (t) => {
  const clock = deterministic(t);
  const h = await harness("postgres", "schema_check");
  try {
    const db = h.db;
    assert.equal(
      db
        .prepare(
          "SELECT count(*) n FROM information_schema.tables WHERE table_schema='w1b_schema_check'",
        )
        .get()!.n,
      35,
    );
    const columns = db
      .prepare(
        "SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='w1b_schema_check' ORDER BY table_name,ordinal_position",
      )
      .all();
    assert.equal(columns.length, 332);
    for (const table of inventory.tables)
      for (const c of table.columns) {
        const actual = columns.find(
          (x: any) => x.table_name === table.name && x.column_name === c.name,
        );
        assert.equal(actual!.data_type, c.type === "TEXT" ? "text" : "bigint");
      }
    const constraints = db
      .prepare(
        "SELECT contype,count(*) n FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='w1b_schema_check' GROUP BY contype",
      )
      .all();
    assert.equal(constraints.find((r: any) => r.contype === "f")!.n, 55);
    assert.equal(constraints.find((r: any) => r.contype === "c")!.n, 112);
    const foreign = db
      .prepare(
        "SELECT r.relname table_name,a.attname column_name,rr.relname foreign_table,aa.attname foreign_column,c.confdeltype,c.confupdtype FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace JOIN pg_class r ON r.oid=c.conrelid JOIN pg_class rr ON rr.oid=c.confrelid JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum=c.conkey[1] JOIN pg_attribute aa ON aa.attrelid=rr.oid AND aa.attnum=c.confkey[1] WHERE n.nspname='w1b_schema_check' AND c.contype='f'",
      )
      .all();
    const actions: any = {
      "NO ACTION": "a",
      CASCADE: "c",
      RESTRICT: "r",
      "SET NULL": "n",
    };
    for (const table of inventory.tables)
      for (const fk of table.foreignKeys)
        assert.ok(
          foreign.some(
            (r: any) =>
              r.table_name === table.name &&
              r.column_name === fk.from &&
              r.foreign_table === fk.table &&
              r.foreign_column === fk.to &&
              r.confdeltype === actions[fk.on_delete] &&
              r.confupdtype === actions[fk.on_update],
          ),
        );
    const triggers = db
      .prepare(
        "SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='w1b_schema_check' AND NOT t.tgisinternal",
      )
      .all()
      .map((r: any) => r.tgname)
      .sort();
    assert.deepEqual(
      triggers,
      inventory.tables
        .flatMap((x: any) => x.triggers.map((v: any) => v.name))
        .sort(),
    );
    const indexes = db
      .prepare(
        "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='w1b_schema_check'",
      )
      .all();
    for (const table of inventory.tables)
      for (const index of table.indexes.filter((i: any) => i.sql))
        assert.ok(indexes.some((r: any) => r.indexname === index.name));
    assert.equal(
      indexes.filter((r: any) => r.indexdef.includes(" WHERE ")).length,
      7,
    );
    // A separate fresh PG bootstrap must never create harness/demo users.
    const { bootstrapPostgres } =
      await import("../src/persistence/postgres-bootstrap.js");
    const fresh = new PostgresDatabase(credentials(), "w1b_seed_absent");
    try {
      bootstrapPostgres(fresh, "w1b_seed_absent", true);
      for (const table of [
        "accounts",
        "users",
        "account_external_identities",
        "account_sessions",
      ])
        assert.equal(
          fresh.prepare(`SELECT count(*) n FROM ${table}`).get()!.n,
          0,
        );
      for (const table of Object.keys(inventory.configurationSeedRows))
        assert.ok(
          (fresh.prepare(`SELECT count(*) n FROM ${table}`).get()!
            .n as number) > 0,
        );
    } finally {
      fresh.close();
    }
    results.push({
      name: "schema",
      status: "PASS",
      tables: 35,
      columns: 332,
      foreignKeys: 55,
      checks: 112,
      triggers: 12,
      partialIndexes: 7,
      physicalIndexes: indexes.length,
      physicalIndexNote:
        "PG additionally indexes INTEGER primary keys; SQLite rowid aliases do not have separate index objects",
      seedUsers: 0,
    });
  } finally {
    await h.close();
    clock.restore();
  }
});
test("W1A complete JSON extraction corpus, NULL, malformed, duplicate keys and json_set", (t) =>
  dual(t, "json", (h) => {
    const corpus = JSON.parse(
      readFileSync(
        new URL(
          "../../../docs/migrations/W1A_SQLITE_BEHAVIOR_PROBES.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ).results.find((r: any) => r.cases).cases;
    const cases = corpus.map(({ json }: any) => ({
      json,
      ...h.db
        .prepare(
          "SELECT json_extract(?, '$.x') value, typeof(json_extract(?, '$.x')) storage_type, json_extract(?, '$.x') > 0 positive, json_extract(?, '$.x') = 1 equals_one",
        )
        .get(json, json, json, json),
    }));
    assert.deepEqual(plain(cases), corpus);
    const valid = [null, "{}", '{"x":1}', "{bad", '{"x":1,"x":2}'].map((doc) =>
      h.db.prepare("SELECT json_valid(?) valid").get(doc),
    );
    const updates = [
      "{}",
      '{ "x": 1, "x": 2, "raw": 1.00 }',
      '{"raw":" whitespace stays "}',
    ].map((doc) =>
      h.db.prepare("SELECT json_set(?, '$.x', 120) value").get(doc),
    );
    assert.throws(() =>
      h.db.prepare("SELECT json_extract(?, '$.x') value").get("{bad"),
    );
    return { cases, valid, updates };
  }));
test("SQLite nullable TEXT primary keys / INSERT OR IGNORE constraint classes", (t) =>
  dual(t, "ignore", (h) => {
    h.db
      .prepare(
        "INSERT INTO accounts(id,display_name,status,created_at,updated_at) VALUES(NULL,'null-one','active','t','t')",
      )
      .run();
    h.db
      .prepare(
        "INSERT INTO accounts(id,display_name,status,created_at,updated_at) VALUES(NULL,'null-two','active','t','t')",
      )
      .run();
    const check = h.db
      .prepare(
        "INSERT OR IGNORE INTO accounts VALUES('bad','name','invalid','t','t',NULL)",
      )
      .run().changes;
    const notNull = h.db
      .prepare(
        "INSERT OR IGNORE INTO accounts VALUES('null-name',NULL,'active','t','t',NULL)",
      )
      .run().changes;
    const duplicate = h.db
      .prepare(
        "INSERT OR IGNORE INTO accounts VALUES('user-demo','other','active','t','t',NULL)",
      )
      .run().changes;
    assert.throws(() =>
      h.db
        .prepare(
          "INSERT OR IGNORE INTO users VALUES('orphan','nonexistent','orphan','t')",
        )
        .run(),
    );
    h.db
      .prepare("UPDATE economy_settings SET value_json='{}' WHERE key='core'")
      .run();
    return {
      check,
      notNull,
      duplicate,
      nullKeys: h.db
        .prepare("SELECT count(*) n FROM accounts WHERE id IS NULL")
        .get()!.n,
      config: h.db
        .prepare("SELECT value_json FROM economy_settings WHERE key='core'")
        .get(),
    };
  }));
test("Queue order rollback, delete high-water, failed insert, explicit order", (t) =>
  dual(t, "queue", (h) => {
    reward(h, "user-demo", "queue-source", 0, 0);
    const r = h.db.prepare("SELECT id FROM reward_events").get()!.id;
    const insert = h.db.prepare(
      "INSERT INTO player_event_queue(id,user_id,source_reward_event_id,event_key,event_type,event_name,payload_json,status,created_at) VALUES(?,'user-demo',?,?,'home_scene','probe','{}','pending','t')",
    );
    h.db.exec("BEGIN IMMEDIATE");
    insert.run("failed", r, "failed");
    const allocated = h.db
      .prepare("SELECT queue_order n FROM player_event_queue WHERE id='failed'")
      .get()!.n;
    h.db.exec("ROLLBACK");
    insert.run("success", r, "success");
    const reused = h.db
      .prepare(
        "SELECT queue_order n FROM player_event_queue WHERE id='success'",
      )
      .get()!.n;
    assert.equal(allocated, reused);
    assert.throws(() => insert.run("success", r, "duplicate"));
    h.db.exec("DELETE FROM player_event_queue WHERE id='success'");
    insert.run("after-delete", r, "after-delete");
    h.db
      .prepare(
        "INSERT INTO player_event_queue(queue_order,id,user_id,source_reward_event_id,event_key,event_type,event_name,payload_json,status,created_at) VALUES(100,'explicit','user-demo',?,'explicit','home_scene','probe','{}','pending','t')",
      )
      .run(r);
    insert.run("after-explicit", r, "after-explicit");
    return {
      allocated,
      reused,
      rows: h.db
        .prepare(
          "SELECT queue_order,id FROM player_event_queue ORDER BY queue_order",
        )
        .all(),
    };
  }));
test("Raw TEXT timestamps, NULL ordering, ASCII LIKE and GLOB", (t) =>
  dual(t, "text", (h) => {
    const values = [
      "2026-08-01T00:00:00+08:00",
      "2026-07-31T16:00:00.000Z",
      "2026-08-01 00:00:00",
      "2026-08-01T00:00:00Z",
    ];
    for (let i = 0; i < values.length; i++)
      h.db
        .prepare(
          "INSERT INTO accounts(id,display_name,status,created_at,updated_at,creation_idempotency_key) VALUES(?,?,'active',?,?,?)",
        )
        .run(
          "text-" + i,
          ["ASCII", "ascii", "Ä", "back\\slash"][i],
          values[i],
          values[i],
          i === 0 ? null : "key-" + i,
        );
    return {
      raw: h.db
        .prepare(
          "SELECT id,created_at FROM accounts WHERE id LIKE 'text-%' ORDER BY created_at",
        )
        .all(),
      nulls: h.db
        .prepare(
          "SELECT id,creation_idempotency_key FROM accounts WHERE id LIKE 'text-%' ORDER BY creation_idempotency_key ASC",
        )
        .all(),
      like: ["as%", "ä", "back\\%"].map((pattern) =>
        h.db
          .prepare(
            "SELECT id FROM accounts WHERE lower(display_name) LIKE lower(?) ORDER BY id",
          )
          .all(pattern),
      ),
      glob: h.db
        .prepare(
          "SELECT id FROM accounts WHERE id NOT GLOB 'text-*' ORDER BY id",
        )
        .all(),
    };
  }));

test("Read statement failure keeps outer transaction usable; JSON scalar root NULL semantics", (t) =>
  dual(t, "statement_abort", (h) => {
    h.db.exec("BEGIN IMMEDIATE");
    assert.throws(() =>
      h.db.prepare("SELECT json_extract(?, '$.x') value").get("{bad"),
    );
    const stillUsable = h.db.prepare("SELECT count(*) n FROM accounts").get();
    h.db.exec("ROLLBACK");
    const roots = ["null", "[]", "1", '"text"'].map((doc) =>
      h.db
        .prepare(
          "SELECT json_extract(?, '$.x') extracted, json_set(?, '$.x', 1) updated",
        )
        .get(doc, doc),
    );
    return { stillUsable, roots };
  }));

test("Real connection termination rolls back an open transaction and fails without retry", async (t) => {
  const clock = deterministic(t);
  const h = await harness("postgres", "connection_drop");
  const control = new PostgresDatabase(credentials(), "w1b_connection_drop");
  try {
    const before = h.snapshot();
    const pid = h.db.prepare("SELECT pg_backend_pid() pid").get()!.pid;
    assert.ok(typeof pid === "number");
    h.db.exec("BEGIN IMMEDIATE");
    h.db
      .prepare(
        "UPDATE user_resources SET star_balance=star_balance+17 WHERE user_id='user-demo'",
      )
      .run();
    assert.equal(
      control.prepare("SELECT pg_terminate_backend(?) terminated").get(pid)!
        .terminated,
      1,
    );
    assert.throws(
      () => h.db.prepare("SELECT 1").get(),
      /terminat|closed|connection/i,
    );
    const after = Object.fromEntries(
      inventory.tables.map((table: any) => [
        table.name,
        plain(control.prepare(`SELECT * FROM ${table.name}`).all()).sort(
          (a: any, b: any) =>
            JSON.stringify(a).localeCompare(JSON.stringify(b), "en"),
        ),
      ]),
    );
    assert.deepEqual(after, before);
    assert.equal(
      control.prepare("SELECT count(*) n FROM reward_events").get()!.n,
      0,
    );
    results.push({
      name: "connection_drop",
      status: "PASS",
      rollback:
        "All 35 rows snapshots unchanged; no automatic retry/reward after real backend termination",
    });
  } finally {
    control.close();
    await h.close();
    clock.restore();
    writeFileSync(
      new URL(
        "../../../docs/migrations/W1B_COMPATIBILITY_RESULTS.json",
        import.meta.url,
      ),
      JSON.stringify({ results }, null, 2) + "\n",
    );
  }
});
