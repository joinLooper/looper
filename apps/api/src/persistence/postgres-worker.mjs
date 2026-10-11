import { parentPort, workerData } from "node:worker_threads";
import pg from "pg";
import { safeInteger } from "./bigint-codec.mjs";
import { translateSql } from "./postgres-sql.mjs";
const { connection, schema, shared } = workerData;
const client = new pg.Client({
  ...connection,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
  application_name: "looper-w1b-parity",
  types: {
    getTypeParser(oid, format) {
      if (oid === 20 || oid === 1700) return safeInteger;
      if (oid === 16) return (value) => (value === "t" ? 1 : 0);
      return pg.types.getTypeParser(oid, format);
    },
  },
});
// pg emits an idle connection error as well as rejecting active queries.
// Retain it so the next RPC fails explicitly instead of crashing the worker.
let connectionFailure;
client.on("error", (error) => {
  connectionFailure = error;
});
let transaction = false,
  rootSavepoint = null;
const connected = (async () => {
  await client.connect();
  const identity = await client.query(
    "SELECT current_database() db,host(inet_server_addr()) addr,current_setting('server_version_num') ver",
  );
  const row = identity.rows[0];
  if (
    row.db !== "looper_w1b" ||
    row.addr !== "127.0.0.1" ||
    !/^17\d{4}$/.test(row.ver)
  )
    throw Error("Not the isolated real PostgreSQL 17 runtime");
  await client.query(`SET search_path TO "${schema}",pg_catalog`);
})();
// Capture connection errors even before the first RPC is received.
connected.catch(() => {});
async function begin() {
  await client.query("BEGIN");
  transaction = true;
  await client.query("SELECT pg_advisory_xact_lock(170027,1)");
}
async function execute({ operation, sql, values = [] }) {
  await connected;
  if (operation === "connect") return { connected: true };
  if (operation === "close") {
    await client.end();
    return null;
  }
  if (connectionFailure) throw connectionFailure;
  const trimmed = sql.trim().replace(/;$/, "");
  if (operation === "exec" && /CREATE SCHEMA/.test(sql)) {
    await client.query(sql);
    return null;
  }
  if (/^BEGIN(?: IMMEDIATE)?$/i.test(trimmed)) {
    await begin();
    return null;
  }
  if (/^(COMMIT|ROLLBACK)$/i.test(trimmed)) {
    await client.query(trimmed);
    transaction = false;
    rootSavepoint = null;
    return null;
  }
  if (/^SAVEPOINT\s+\w+$/i.test(trimmed)) {
    if (!transaction) {
      await begin();
      rootSavepoint = trimmed.split(/\s+/)[1];
    }
    await client.query(trimmed);
    return null;
  }
  if (/^(ROLLBACK TO|RELEASE)\b/i.test(trimmed)) {
    for (const command of trimmed
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean)) {
      await client.query(command);
      if (
        new RegExp("^RELEASE(?: SAVEPOINT)? " + rootSavepoint + "$", "i").test(
          command,
        )
      ) {
        await client.query("COMMIT");
        transaction = false;
        rootSavepoint = null;
      }
    }
    return null;
  }
  if (/^PRAGMA/i.test(trimmed))
    throw Error("SQLite-only PRAGMA cannot run on PostgreSQL");
  const ignored = /^INSERT\s+OR\s+IGNORE\b/i.test(trimmed);
  const write = /^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)/i.test(
    trimmed,
  );
  const ownTransaction = write && !transaction;
  if (ownTransaction) await begin();
  const savepoint = transaction;
  if (savepoint) await client.query("SAVEPOINT w1b_statement");
  try {
    const params = values.map((value) =>
      typeof value === "bigint"
        ? safeInteger(value)
        : typeof value === "number"
          ? safeInteger(value)
          : value,
    );
    const result = await client.query(translateSql(sql), params);
    if (/^INSERT(?: OR IGNORE)? INTO player_event_queue\b/i.test(trimmed)) {
      await client.query(
        "UPDATE w1b_control.queue_counters SET high_water=GREATEST(high_water,(SELECT COALESCE(MAX(queue_order),0) FROM player_event_queue)) WHERE schema_name=$1",
        [schema],
      );
    }
    if (savepoint) await client.query("RELEASE SAVEPOINT w1b_statement");
    if (ownTransaction) {
      await client.query("COMMIT");
      transaction = false;
    }
    return operation === "run"
      ? { changes: result.rowCount ?? 0 }
      : operation === "exec"
        ? null
        : result.rows;
  } catch (error) {
    if (savepoint)
      await client.query(
        "ROLLBACK TO SAVEPOINT w1b_statement; RELEASE SAVEPOINT w1b_statement",
      );
    if (ownTransaction) {
      await client.query("ROLLBACK");
      transaction = false;
    }
    // SQLite OR IGNORE suppresses UNIQUE/NOT NULL/CHECK, not FK or RAISE(ABORT).
    if (ignored && ["23505", "23502", "23514"].includes(error.code))
      return { changes: 0 };
    throw error;
  }
}
function reply(value, error) {
  let encoded = new TextEncoder().encode(
    JSON.stringify(
      error
        ? {
            error: {
              message: error.code?.startsWith("23")
                ? "constraint failed: " + error.message
                : error.message,
              code: error.code?.startsWith("23")
                ? "ERR_SQLITE_CONSTRAINT"
                : error.code,
              sqlState: error.code,
            },
          }
        : { value },
    ),
  );
  if (encoded.length > shared.byteLength - 8)
    encoded = new TextEncoder().encode(
      JSON.stringify({
        error: {
          message: "PostgreSQL result exceeds the bounded parity bridge buffer",
        },
      }),
    );
  new Uint8Array(shared, 8, encoded.length).set(encoded);
  const header = new Int32Array(shared, 0, 2);
  Atomics.store(header, 1, encoded.length);
  Atomics.store(header, 0, 1);
  Atomics.notify(header, 0);
}
let chain = Promise.resolve();
parentPort.on("message", (request) => {
  chain = chain.then(async () => {
    try {
      reply(await execute(request));
    } catch (error) {
      reply(null, error);
    }
  });
});
