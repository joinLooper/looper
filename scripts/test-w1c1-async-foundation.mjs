import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AsyncPostgresDatabase } from "../apps/api/src/persistence/async-postgres.js";
import {
  RequestCancelledError,
  PoolAcquireTimeoutError,
  StatementTimeoutError,
  TransactionContextError,
  UnknownCommitOutcomeError,
} from "../apps/api/src/persistence/async-contract.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const credentials = JSON.parse(
  readFileSync(
    resolve(root, ".runtime/postgres17/credentials.json"),
    "utf8",
  ).replace(/^\uFEFF/, ""),
);
const connection = {
  host: "127.0.0.1",
  port: 55432,
  database: "looper_w1b",
  user: "looper_w1b_test",
  password: credentials.password,
};
const schema = "w1b_async_foundation";
const sleep = (ms) =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const results = {
  generatedAt: new Date().toISOString(),
  schema,
  checks: {},
  failures: [],
};
const record = async (name, fn, group = "transaction") => {
  const started = performance.now();
  try {
    await fn();
    results.checks[name] = {
      group,
      status: "PASS",
      elapsedMs: performance.now() - started,
    };
  } catch (error) {
    results.checks[name] = {
      group,
      status: "FAIL",
      error: String(error?.stack ?? error),
      elapsedMs: performance.now() - started,
    };
    results.failures.push(name);
  }
};
const expectError = async (promise, Type) => {
  await assert.rejects(promise, (error) => error instanceof Type);
};

const db = new AsyncPostgresDatabase(connection, {
  maxConnections: 4,
  acquireTimeoutMs: 1000,
  statementTimeoutMs: 1000,
  lockTimeoutMs: 120,
});
const control = new AsyncPostgresDatabase(connection, {
  maxConnections: 2,
  acquireTimeoutMs: 500,
  statementTimeoutMs: 1000,
  lockTimeoutMs: 120,
});
try {
  await db.execute(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await control.execute(
    "INSERT INTO w1b_control.queue_counters(schema_name,high_water) VALUES($1,0) ON CONFLICT(schema_name) DO NOTHING",
    [schema],
  );
  await record("health", async () => {
    const health = await db.health();
    assert.equal(health.ok, true);
  });
  await record("pool_bounded", async () => {
    assert.equal(db.pool.options.max, 4);
  });
  await record(
    "pool_saturation",
    async () => {
      const saturated = new AsyncPostgresDatabase(connection, {
        maxConnections: 1,
        acquireTimeoutMs: 1000,
        statementTimeoutMs: 5000,
      });
      try {
        const held = saturated.withTransaction(async (tx) => {
          await tx.query("SELECT pg_sleep(0.18)");
        });
        await sleep(50);
        saturated.acquireTimeoutMs = 40;
        await expectError(saturated.query("SELECT 1"), PoolAcquireTimeoutError);
        await held;
      } finally {
        await saturated.drain();
      }
    },
    "pool",
  );
  await record(
    "acquire_timeout",
    async () => {
      const saturated = new AsyncPostgresDatabase(connection, {
        maxConnections: 1,
        acquireTimeoutMs: 1000,
        statementTimeoutMs: 5000,
      });
      try {
        const held = saturated.withTransaction(async (tx) => {
          await tx.query("SELECT pg_sleep(0.15)");
        });
        await sleep(50);
        saturated.acquireTimeoutMs = 35;
        await expectError(saturated.query("SELECT 1"), PoolAcquireTimeoutError);
        await held;
      } finally {
        await saturated.drain();
      }
    },
    "pool",
  );
  await record(
    "statement_timeout",
    async () => {
      await expectError(
        db.query("SELECT pg_sleep(0.2)", [], { statementTimeoutMs: 35 }),
        StatementTimeoutError,
      );
    },
    "cancellation",
  );
  await record(
    "advisory_lock_waiting",
    async () => {
      const first = new AsyncPostgresDatabase(connection, {
        maxConnections: 1,
        lockTimeoutMs: 500,
        statementTimeoutMs: 1500,
      });
      const second = new AsyncPostgresDatabase(connection, {
        maxConnections: 1,
        lockTimeoutMs: 60,
        statementTimeoutMs: 1000,
      });
      try {
        let firstReady;
        const lockHeld = new Promise((resolveReady) => {
          firstReady = resolveReady;
        });
        const held = first.withTransaction(async (tx) => {
          firstReady();
          await tx.query("SELECT pg_sleep(1)");
        });
        await lockHeld;
        await sleep(20);
        await expectError(
          second.withTransaction(async () => undefined),
          StatementTimeoutError,
        );
        await held;
      } finally {
        await first.drain();
        await second.drain();
      }
    },
    "transaction",
  );
  await record(
    "request_cancellation_running_query",
    async () => {
      const controller = new AbortController();
      const query = db.query("SELECT pg_sleep(1)", [], {
        signal: controller.signal,
      });
      setTimeout(() => controller.abort(), 25);
      await expectError(query, RequestCancelledError);
    },
    "cancellation",
  );
  await record(
    "transaction_cancellation",
    async () => {
      const controller = new AbortController();
      const transaction = db.withTransaction(
        async (tx) => {
          setTimeout(() => controller.abort(), 25);
          await tx.query("SELECT pg_sleep(1)");
        },
        { signal: controller.signal },
      );
      await expectError(transaction, RequestCancelledError);
    },
    "cancellation",
  );
  await record(
    "savepoint_rollback",
    async () => {
      const savepointDb = new AsyncPostgresDatabase(connection, {
        maxConnections: 1,
        statementTimeoutMs: 1000,
        lockTimeoutMs: 120,
      });
      try {
        await savepointDb.execute(
          `CREATE TABLE IF NOT EXISTS ${schema}.savepoint_probe(id integer primary key, value text)`,
        );
        await savepointDb.withTransaction(async (tx) => {
          await tx.execute(`DELETE FROM ${schema}.savepoint_probe`);
          await tx.execute(
            `INSERT INTO ${schema}.savepoint_probe VALUES(1,'outer')`,
          );
          await assert.rejects(
            tx.savepoint("inner", async (nested) => {
              await nested.execute(
                `INSERT INTO ${schema}.savepoint_probe VALUES(2,'inner')`,
              );
              throw new Error("rollback probe");
            }),
          );
          const rows = await tx.query(
            `SELECT id FROM ${schema}.savepoint_probe ORDER BY id`,
          );
          assert.deepEqual(
            rows.rows.map((row) => row.id),
            [1],
          );
        });
      } finally {
        await savepointDb.drain();
      }
    },
    "transaction",
  );
  await record(
    "queue_allocation_rollback",
    async () => {
      const before = await db.query(
        "SELECT high_water FROM w1b_control.queue_counters WHERE schema_name=$1",
        [schema],
      );
      await assert.rejects(
        db.withTransaction(async (tx) => {
          await tx.allocateQueueOrder(schema);
          throw new Error("queue rollback probe");
        }),
      );
      const after = await db.query(
        "SELECT high_water FROM w1b_control.queue_counters WHERE schema_name=$1",
        [schema],
      );
      assert.equal(
        String(after.rows[0].high_water),
        String(before.rows[0].high_water),
      );
      const order = await db.withTransaction((tx) =>
        tx.allocateQueueOrder(schema),
      );
      assert.equal(order, BigInt(before.rows[0].high_water) + 1n);
    },
    "queue",
  );
  await record(
    "transaction_context_leakage",
    async () => {
      let escaped;
      await db.withTransaction(async (tx) => {
        escaped = tx;
      });
      await expectError(escaped.query("SELECT 1"), TransactionContextError);
    },
    "transaction",
  );
  await record(
    "unknown_commit_outcome",
    async () => {
      const target = new AsyncPostgresDatabase(connection, {
        maxConnections: 1,
      });
      const original = target.pool.connect.bind(target.pool);
      target.pool.connect = async () => {
        const client = await original();
        const query = client.query.bind(client);
        client.query = async (config, values) => {
          const text = typeof config === "string" ? config : config.text;
          const result = await query(config, values);
          if (String(text).trim().toUpperCase() === "COMMIT")
            throw new Error("commit acknowledgement lost");
          return result;
        };
        return client;
      };
      try {
        await expectError(
          target.withTransaction(async (tx) => {
            await tx.query("SELECT 1");
          }),
          UnknownCommitOutcomeError,
        );
      } finally {
        await target.drain();
      }
    },
    "transaction",
  );
  await record(
    "backend_failure_recovery",
    async () => {
      const pid = (await db.query("SELECT pg_backend_pid() AS pid")).rows[0]
        .pid;
      await control.query("SELECT pg_terminate_backend($1)", [pid]);
      await sleep(50);
      const health = await db.health();
      assert.equal(health.ok, true);
    },
    "failure",
  );
  await record(
    "shutdown_during_inflight_transaction",
    async () => {
      const target = new AsyncPostgresDatabase(connection, {
        maxConnections: 1,
        statementTimeoutMs: 1000,
      });
      const transaction = target.withTransaction(async (tx) => {
        await tx.query("SELECT pg_sleep(0.08)");
      });
      await sleep(10);
      await target.drain(1000);
      await transaction;
    },
    "pool",
  );
  await record(
    "pool_recovery_reconnection",
    async () => {
      const value = await db.query("SELECT 1 AS ok");
      assert.equal(value.rows[0].ok, 1);
    },
    "failure",
  );
} finally {
  await db.drain().catch(() => {});
  await control.drain().catch(() => {});
}

results.status = results.failures.length === 0 ? "PASS" : "FAIL";
mkdirSync(resolve(root, "docs/migrations"), { recursive: true });
writeFileSync(
  resolve(root, "docs/migrations/W1C1A_TRANSACTION_TEST_RESULTS.json"),
  JSON.stringify(
    {
      generatedAt: results.generatedAt,
      status: results.status,
      checks: Object.fromEntries(
        Object.entries(results.checks).filter(
          ([, value]) =>
            value.group === "transaction" || value.group === "queue",
        ),
      ),
      failures: results.failures,
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  resolve(root, "docs/migrations/W1C1A_CANCELLATION_RESULTS.json"),
  JSON.stringify(
    {
      generatedAt: results.generatedAt,
      status: results.status,
      checks: Object.fromEntries(
        Object.entries(results.checks).filter(
          ([, value]) => value.group === "cancellation",
        ),
      ),
      failures: results.failures,
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  resolve(root, "docs/migrations/W1C1A_POOL_LIFECYCLE_RESULTS.json"),
  JSON.stringify(
    {
      generatedAt: results.generatedAt,
      status: results.status,
      checks: Object.fromEntries(
        Object.entries(results.checks).filter(
          ([, value]) => value.group === "pool" || value.group === "failure",
        ),
      ),
      failures: results.failures,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(results, null, 2));
if (results.failures.length) process.exitCode = 1;
