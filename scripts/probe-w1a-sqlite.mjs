import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { openDatabase } from "../apps/api/src/database.ts";
const db = openDatabase(":memory:");
const results = [];
const probe = (name, fn) => {
  db.exec("SAVEPOINT probe");
  try {
    results.push({ name, ...fn() });
  } finally {
    db.exec("ROLLBACK TO probe; RELEASE probe");
  }
};
try {
  probe("TEXT PRIMARY KEY permits NULL in source", () => {
    db.prepare(
      "INSERT INTO accounts(id,display_name,status,created_at,updated_at) VALUES(NULL,'probe','active','t','t')",
    ).run();
    return {
      accepted: true,
      count: db
        .prepare("SELECT count(*) n FROM accounts WHERE id IS NULL")
        .get().n,
    };
  });
  probe("economy core CHECK accepts missing JSON keys through NULL", () => {
    db.prepare(
      "UPDATE economy_settings SET value_json='{}' WHERE key='core'",
    ).run();
    return {
      accepted: true,
      value: db
        .prepare("SELECT value_json FROM economy_settings WHERE key='core'")
        .get().value_json,
    };
  });
  probe("INSERT OR IGNORE suppresses a CHECK failure", () => {
    const r = db
      .prepare(
        "INSERT OR IGNORE INTO accounts VALUES('invalid-probe','probe','invalid','t','t',NULL)",
      )
      .run();
    assert.equal(r.changes, 0);
    return { changes: r.changes };
  });
  probe("audit_events has no immutable update guard", () => {
    db.prepare(
      "INSERT INTO audit_events VALUES('audit-probe','admin','probe','probe','probe','probe','t','{}')",
    ).run();
    const r = db
      .prepare(
        "UPDATE audit_events SET action='changed' WHERE id='audit-probe'",
      )
      .run();
    assert.equal(r.changes, 1);
    return { updateAccepted: true };
  });
  probe("resource_transactions has no immutable update guard", () => {
    db.prepare(
      "INSERT INTO resource_transactions(id,user_id,resource_type,amount,balance_before,balance_after,source_type,source_id,idempotency_key,created_at,metadata_json) VALUES('ledger-probe','user-demo','stars',1,0,1,'admin_adjustment','probe','probe','t','{}')",
    ).run();
    const r = db
      .prepare(
        "UPDATE resource_transactions SET metadata_json='[]' WHERE id='ledger-probe'",
      )
      .run();
    assert.equal(r.changes, 1);
    return { updateAccepted: true };
  });
  const reward = () =>
    db
      .prepare(
        "INSERT INTO reward_events(id,source_type,source_id,user_id,idempotency_key,logical_request_json,reward_payload_json,growth_summary_json,level_summary_json,created_at) VALUES('reward-probe','task_completion','probe','user-demo','probe','{}','{}','{}','{}','t')",
      )
      .run();
  probe("knowledge immutable UPDATE and DELETE remain blocked", () => {
    reward();
    db.prepare(
      "INSERT INTO knowledge_card_attempts VALUES('attempt-probe','user-demo','probe','probe','a',1,50,'probe','t','reward-probe')",
    ).run();
    const errors = [];
    for (const sql of [
      "UPDATE knowledge_card_attempts SET selected_option_id='b' WHERE id='attempt-probe'",
      "DELETE FROM knowledge_card_attempts WHERE id='attempt-probe'",
    ]) {
      assert.throws(
        () => db.exec(sql),
        (e) => {
          errors.push(e.message);
          return e.message.includes("immutable");
        },
      );
    }
    return { blocked: 2, messages: errors };
  });
  probe("AUTOINCREMENT rolled-back allocation can be reused", () => {
    reward();
    const insert = db.prepare(
      "INSERT INTO player_event_queue(id,user_id,source_reward_event_id,event_key,event_type,event_name,payload_json,status,created_at) VALUES(?,'user-demo','reward-probe',?,'home_scene','probe','{}','pending','t')",
    );
    db.exec("SAVEPOINT failed");
    insert.run("first", "first");
    const first = db
      .prepare("SELECT queue_order FROM player_event_queue WHERE id='first'")
      .get().queue_order;
    db.exec("ROLLBACK TO failed; RELEASE failed");
    insert.run("second", "second");
    const second = db
      .prepare("SELECT queue_order FROM player_event_queue WHERE id='second'")
      .get().queue_order;
    assert.equal(first, second);
    return { rolledBackOrder: first, nextOrder: second };
  });
  const extractionCases = [
    "{}",
    '{"x":null}',
    '{"x":1}',
    '{"x":"1"}',
    '{"x":true}',
    '{"x":[]}',
    '{"x":{}}',
    '{"x":1,"x":2}',
  ];
  results.push({
    name: "JSON extraction comparison corpus (actual SQLite)",
    cases: extractionCases.map((json) => ({
      json,
      ...db
        .prepare(
          "SELECT json_extract(?, '$.x') value, typeof(json_extract(?, '$.x')) storage_type, json_extract(?, '$.x') > 0 positive, json_extract(?, '$.x') = 1 equals_one",
        )
        .get(json, json, json, json),
    })),
  });
  const result = {
    scope:
      "Disposable SQLite only; no production data or PostgreSQL connection",
    results,
    foreignKeyCheck: db.prepare("PRAGMA foreign_key_check").all(),
  };
  writeFileSync(
    "docs/migrations/W1A_SQLITE_BEHAVIOR_PROBES.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  db.close();
}
