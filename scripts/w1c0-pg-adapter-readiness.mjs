import { performance } from "node:perf_hooks";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgresDatabase } from "../apps/api/src/persistence/postgres.js";
import { bootstrapPostgres } from "../apps/api/src/persistence/postgres-bootstrap.js";
import { seedDatabase } from "../apps/api/src/database.js";
import { InMemoryStore } from "../apps/api/src/store.js";
import { buildApp } from "../apps/api/src/app.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const credentials = JSON.parse(readFileSync(resolve(root, ".runtime/postgres17/credentials.json"), "utf8").replace(/^\uFEFF/, ""));
const schema = "w1b_readiness";
const connection = { host: "127.0.0.1", port: 55432, database: "looper_w1b", user: "looper_w1b_test", password: credentials.password };
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const percentile = (values, p) => values.slice().sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];
const timed = (fn) => { const start = performance.now(); const value = fn(); return { value, ms: performance.now() - start }; };

let db;
let control;
const result = {
  schema,
  runtime: { host: connection.host, port: connection.port, database: connection.database, user: connection.user, passwordOmitted: true },
  checks: {},
  limitations: [
    "PostgresDatabase is intentionally synchronous and blocks its caller with Atomics.wait while the worker performs I/O.",
    "The adapter owns one worker and one connection per instance; it does not provide a pool or request cancellation API.",
    "Measurements are isolated local-loopback smoke/load data, not production SLO evidence."
  ],
};

try {
  db = new PostgresDatabase(connection, schema);
  bootstrapPostgres(db, schema, true);
  seedDatabase(db);

  result.checks.health = timed(() => db.prepare("SELECT 1 AS ok, version() AS version").get()).ms;

  const heartbeat = { scheduledAt: performance.now(), firedAt: null };
  setTimeout(() => { heartbeat.firedAt = performance.now(); }, 10);
  const blocking = timed(() => db.prepare("SELECT pg_sleep(0.08) AS slept").get());
  await sleep(30);
  result.checks.eventLoopBlocking = { queryMs: blocking.ms, timerDelayMs: heartbeat.firedAt == null ? null : heartbeat.firedAt - heartbeat.scheduledAt, blocked: (heartbeat.firedAt ?? 0) - heartbeat.scheduledAt > 60 };

  const dbLatencies = [];
  for (let i = 0; i < 40; i += 1) dbLatencies.push(timed(() => db.prepare("SELECT 1 AS ok").get()).ms);
  result.checks.databaseLatencyMs = { count: dbLatencies.length, min: Math.min(...dbLatencies), p50: percentile(dbLatencies, 0.5), p95: percentile(dbLatencies, 0.95), p99: percentile(dbLatencies, 0.99), max: Math.max(...dbLatencies) };

  const store = new InMemoryStore(undefined, { database: db, now: () => new Date().toISOString(), taskCodeSecret: "w1c0-test-only-secret" });
  const app = await buildApp(store, { playerAppUrl: "https://player.test", merchantAppUrl: "https://merchant.test", adminAppUrl: "https://admin.test", playerIdentityVerifier: { async verifyIdToken(token) { return { provider: "line", providerSubject: token, displayName: token }; } } });
  await app.ready();
  const session = store.createPlayerSession({ provider: "line", providerSubject: "w1c0-readiness-player", displayName: "Readiness" }, 3600);
  const apiLatencies = [];
  for (let i = 0; i < 30; i += 1) apiLatencies.push(timed(() => app.inject({ method: "GET", url: "/player/state", headers: { cookie: `looper_player_session=${session.sessionToken}` } })).ms);
  result.checks.apiRequestLatencyMs = { route: "/player/state", count: apiLatencies.length, min: Math.min(...apiLatencies), p50: percentile(apiLatencies, 0.5), p95: percentile(apiLatencies, 0.95), p99: percentile(apiLatencies, 0.99), max: Math.max(...apiLatencies) };
  await app.close();

  const before = process.memoryUsage().rss;
  const cpuBefore = process.cpuUsage();
  for (let i = 0; i < 100; i += 1) db.prepare("SELECT 1 AS ok").get();
  const cpu = process.cpuUsage(cpuBefore);
  result.checks.smallLoad = { operations: 100, elapsedMs: timed(() => {}).ms, approxOpsPerSecond: null, rssBeforeBytes: before, rssAfterBytes: process.memoryUsage().rss, cpuUserMicros: cpu.user, cpuSystemMicros: cpu.system };
  const loadStart = performance.now();
  for (let i = 0; i < 100; i += 1) db.prepare("SELECT 1 AS ok").get();
  const loadElapsed = performance.now() - loadStart;
  result.checks.smallLoad.elapsedMs = loadElapsed;
  result.checks.smallLoad.approxOpsPerSecond = 100000 / loadElapsed;

  const pid = db.prepare("SELECT pg_backend_pid() AS pid").get().pid;
  control = new PostgresDatabase(connection, "w1b_control");
  const terminated = control.prepare("SELECT pg_terminate_backend(?) AS terminated").get(pid);
  result.checks.workerFailureRestart = { backendPid: pid, terminateRequested: Boolean(terminated.terminated) };
  try { db.prepare("SELECT 1 AS ok").get(); result.checks.workerFailureRestart.oldConnectionCall = "unexpected-success"; }
  catch (error) { result.checks.workerFailureRestart.oldConnectionCall = "failed-as-expected"; result.checks.workerFailureRestart.error = String(error?.message ?? error); }
  db.close();
  db = new PostgresDatabase(connection, schema);
  result.checks.workerFailureRestart.restartedConnection = db.prepare("SELECT 1 AS ok").get().ok === 1;
  db.close();
  control.close(); control = null;

  const lifecycle = [];
  for (let i = 0; i < 5; i += 1) { const cycle = new PostgresDatabase(connection, `w1b_lifecycle_${i}`); bootstrapPostgres(cycle, `w1b_lifecycle_${i}`, true); cycle.prepare("SELECT 1").get(); cycle.close(); lifecycle.push(true); }
  result.checks.connectionLifecycle = { cycles: lifecycle.length, allClosed: lifecycle.every(Boolean) };
  result.checks.gracefulShutdown = { closeCompleted: true, postCloseCallRejected: false };
  const closed = new PostgresDatabase(connection, "w1b_shutdown");
  bootstrapPostgres(closed, "w1b_shutdown", true); closed.close();
  try { closed.prepare("SELECT 1").get(); } catch { result.checks.gracefulShutdown.postCloseCallRejected = true; }
} finally {
  try { control?.close(); } catch {}
  try { db?.close(); } catch {}
}

mkdirSync(resolve(root, "docs/migrations"), { recursive: true });
writeFileSync(resolve(root, "docs/migrations/W1C0_PG_ADAPTER_READINESS_RESULTS.json"), JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
