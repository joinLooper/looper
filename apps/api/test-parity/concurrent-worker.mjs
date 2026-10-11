import { parentPort, workerData, threadId } from "node:worker_threads";
import { tsImport } from "tsx/esm/api";
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [workerData.now]));
  }
  static now() {
    return RealDate.parse(workerData.now);
  }
};
const { PostgresDatabase } = await tsImport(
  "../src/persistence/postgres.ts",
  import.meta.url,
);
const { InMemoryStore } = await tsImport("../src/store.ts", import.meta.url);
const { buildApp } = await tsImport("../src/app.ts", import.meta.url);
const db = new PostgresDatabase(workerData.credentials, workerData.schema);
const store = new InMemoryStore(undefined, {
  database: db,
  now: () => workerData.now,
  taskCodeSecret: "w1b-test-only-secret",
});
let app;
try {
  app = await buildApp(store, {
    playerAppUrl: "https://player.test",
    merchantAppUrl: "https://merchant.test",
    adminAppUrl: "https://admin.test",
    playerIdentityVerifier: null,
  });
  await app.ready();
  const pid = db.prepare("SELECT pg_backend_pid() pid").get().pid;
  parentPort.postMessage({ ready: true, pid, threadId });
  Atomics.wait(new Int32Array(workerData.gate), 0, 0, 30000);
  const response = await app.inject(workerData.request);
  parentPort.postMessage({
    result: { status: response.statusCode, body: response.json() },
    pid,
    threadId,
  });
} catch (error) {
  parentPort.postMessage({ error: error.message });
  process.exitCode = 1;
} finally {
  if (app) await app.close();
  store.close();
}
