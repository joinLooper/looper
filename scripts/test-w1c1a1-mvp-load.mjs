import assert from "node:assert/strict";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { AsyncPostgresDatabase } from "../apps/api/src/persistence/async-postgres.js";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const credentials = JSON.parse(readFileSync(resolve(root, process.env.LOOPER_PG_CREDENTIALS ?? ".runtime/postgres17/credentials.json"), "utf8").replace(/^\uFEFF/, ""));
const connection = { host: credentials.host, port: Number(credentials.port), database: credentials.database, user: credentials.user, password: credentials.password };
if (connection.host !== "127.0.0.1" || connection.port !== 55432 || connection.database !== "looper_w1b" || connection.user !== "looper_w1b_test") throw Error("MVP load only accepts the disposable loopback PG17 runtime");
const pools = [1, 2, 4];
const concurrencyLevels = [1, 5, 10, 20];
const requestsPerCell = Number(process.env.W1C1A1_REQUESTS ?? 24);
assert(Number.isInteger(requestsPerCell) && requestsPerCell > 0 && requestsPerCell <= 200);
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
};
const schema = `w1c1a1_load_${process.pid}`;
const result = {
  generatedAt: new Date().toISOString(), host: os.hostname(), platform: process.platform, node: process.version,
  connection: { host: connection.host, port: connection.port, database: connection.database, user: connection.user },
  authority: "Async infrastructure only; this is not full App API or 200-concurrent-user validation.",
  profile: { registeredAccountCeiling: 200, initialMax: 2, configurableMax: 4, pools, concurrencyLevels, requestsPerCell },
  scenarios: [], failures: [], cleanup: "PENDING",
};

function instrument(db) {
  const metrics = { acquireWaitMs: [], writerLockWaitMs: [], totalConnectionsPeak: 0, waitingPeak: 0, activePeak: 0 };
  const pool = db.pool;
  const connect = pool.connect.bind(pool);
  pool.connect = async (...args) => {
    const started = performance.now();
    try {
      const client = await connect(...args);
      metrics.acquireWaitMs.push(performance.now() - started);
      const query = client.query.bind(client);
      client.query = async (...queryArgs) => {
        const config = queryArgs[0];
        const text = typeof config === "string" ? config : config?.text;
        const lock = String(text ?? "").includes("pg_advisory_xact_lock");
        const queryStarted = performance.now();
        try { return await query(...queryArgs); }
        finally { if (lock) metrics.writerLockWaitMs.push(performance.now() - queryStarted); }
      };
      return client;
    } catch (error) {
      metrics.acquireWaitMs.push(performance.now() - started);
      throw error;
    }
  };
  return metrics;
}

async function runScenario({ poolSize, concurrency, kind, mode }) {
  const db = new AsyncPostgresDatabase(connection, { maxConnections: poolSize, acquireTimeoutMs: mode === "saturation" ? 100 : 5000, statementTimeoutMs: 5000, lockTimeoutMs: 5000, pool: { application_name: `looper-w1c1a1-${process.pid}` } });
  const metrics = instrument(db);
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  const cpuStart = process.cpuUsage();
  let peakRss = process.memoryUsage().rss;
  const sample = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); const d = db.diagnostics; metrics.totalConnectionsPeak = Math.max(metrics.totalConnectionsPeak, d.total); metrics.waitingPeak = Math.max(metrics.waitingPeak, d.waiting); metrics.activePeak = Math.max(metrics.activePeak, d.activeTransactions); }, 10);
  const latencies = [], errors = [], expectedTimeouts = [];
  let activeWork = 0;
  let maxActiveWork = 0;
  const work = async (index) => {
    const started = performance.now();
    try {
      if (mode === "saturation") {
        await db.query("SELECT pg_sleep(0.15)");
      } else if (kind === "read") {
        await db.query(`SELECT count(*)::int AS count FROM ${schema}.probe WHERE id >= $1`, [index % 10]);
      } else if (kind === "write") {
        await db.query(`INSERT INTO ${schema}.probe(id, value) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET value=EXCLUDED.value`, [index % 200, String(index)]);
      } else if (kind === "mixed") {
        await db.query(`SELECT count(*)::int AS count FROM ${schema}.probe`);
        await db.query(`INSERT INTO ${schema}.probe(id, value) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET value=EXCLUDED.value`, [index % 200, String(index)]);
      } else if (kind === "writer-contention") {
        await db.withTransaction(async (tx) => { await tx.query("SELECT pg_advisory_xact_lock(170027,2)"); await tx.query("SELECT pg_sleep(0.01)"); await tx.query(`UPDATE ${schema}.probe SET value=value WHERE id=1`); });
      }
      latencies.push(performance.now() - started);
    } catch (error) {
      if (mode === "saturation" && /PoolAcquireTimeout|timeout/i.test(String(error?.name ?? "") + " " + String(error?.message ?? error))) expectedTimeouts.push(String(error.name ?? "timeout"));
      else errors.push(String(error?.stack ?? error));
    }
  };
  try {
    // Lazy bounded workers: work(index) is called only after a worker claims a
    // slot. This keeps the configured concurrency real instead of creating all
    // promises up front and merely awaiting them in batches.
    let nextIndex = 0;
    const worker = async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= requestsPerCell) return;
        activeWork += 1;
        maxActiveWork = Math.max(maxActiveWork, activeWork);
        try {
          await work(index);
        } finally {
          activeWork -= 1;
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(concurrency, requestsPerCell) }, () =>
        worker(),
      ),
    );
  } finally {
    clearInterval(sample); histogram.disable();
  }
  const cpu = process.cpuUsage(cpuStart);
  const schedulerViolation =
    maxActiveWork > concurrency || (concurrency === 1 && maxActiveWork !== 1)
      ? `scheduler peak ${maxActiveWork} does not satisfy configured concurrency ${concurrency}`
      : null;
  const scenario = {
    pool: poolSize, concurrency, configuredConcurrency: concurrency, actualMaxActiveWork: maxActiveWork,
    kind, mode, requested: requestsPerCell,
    completed: latencies.length, errors: errors.length, unexpectedErrors: errors.length,
    expectedTimeouts: expectedTimeouts.length,
    p50Ms: percentile(latencies, 0.5), p95Ms: percentile(latencies, 0.95),
    eventLoopDelayP95Ms: Number(histogram.percentile(95)) / 1e6,
    acquireWaitP95Ms: percentile(metrics.acquireWaitMs, 0.95), writerLockWaitP95Ms: percentile(metrics.writerLockWaitMs, 0.95),
    cpuUserMs: cpu.user / 1000, cpuSystemMs: cpu.system / 1000, peakRssMb: peakRss / 1024 / 1024,
    connectionsPeak: metrics.totalConnectionsPeak, poolConnectionsPeak: metrics.totalConnectionsPeak,
    waitingPeak: metrics.waitingPeak, activeTransactionsPeak: metrics.activePeak,
    leaksAfterDrain: null, errorSamples: errors.slice(0, 2),
    schedulerViolation,
  };
  await db.drain();
  scenario.leaksAfterDrain = db.diagnostics.total;
  result.scenarios.push(scenario);
  if (errors.length || scenario.leaksAfterDrain !== 0 || schedulerViolation)
    result.failures.push({ scenario: { poolSize, concurrency, kind, mode }, errors: errors.slice(0, 2), leaks: scenario.leaksAfterDrain, schedulerViolation });
}

let observer;
try {
  observer = new Client({ ...connection, application_name: `looper-w1c1a1-observer-${process.pid}` });
  await observer.connect();
  const version = (await observer.query("SHOW server_version_num")).rows[0].server_version_num;
  if (!/^17\d{4}$/.test(version)) throw Error(`Expected PostgreSQL 17, got ${version}`);
  await observer.query("CREATE SCHEMA IF NOT EXISTS w1b_control");
  await observer.query("CREATE TABLE IF NOT EXISTS w1b_control.queue_counters(schema_name text PRIMARY KEY, high_water bigint NOT NULL)");
  await observer.query(`CREATE SCHEMA ${schema}`);
  await observer.query(`CREATE TABLE ${schema}.probe(id integer PRIMARY KEY, value text NOT NULL)`);
  await observer.query(`INSERT INTO ${schema}.probe SELECT i, 'seed' FROM generate_series(1,200) i`);
  for (const poolSize of pools) for (const concurrency of concurrencyLevels) for (const kind of ["read", "write", "mixed"]) await runScenario({ poolSize, concurrency, kind, mode: "normal" });
  for (const poolSize of pools) for (const concurrency of [5, 10, 20]) await runScenario({ poolSize, concurrency, kind: "writer-contention", mode: "contention" });
  for (const poolSize of pools) await runScenario({ poolSize, concurrency: 20, kind: "read", mode: "saturation" });
  await observer.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  result.cleanup = "PASS";
} catch (error) {
  result.failures.push({ fatal: String(error?.stack ?? error) }); result.cleanup = "FAIL";
} finally { await observer?.end().catch(() => {}); }
result.status = result.failures.length === 0 ? "PASS" : "FAIL";
const outputDir = resolve(root, process.env.W1C1A1_LOAD_OUTPUT_DIR ?? "output/w1c1a1-load");
mkdirSync(outputDir, { recursive: true });
writeFileSync(resolve(outputDir, "W1C1A1_MVP_LOAD_RESULTS.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ status: result.status, scenarios: result.scenarios.length, failures: result.failures.length, cleanup: result.cleanup }, null, 2));
if (result.failures.length) process.exitCode = 1;
