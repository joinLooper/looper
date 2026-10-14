import { parentPort, workerData } from "node:worker_threads";
import { tsImport } from "tsx/esm/api";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { createLocalJWKSet } = await import(
  pathToFileURL(require.resolve("jose")).href
);
const { PostgresDatabase } = await tsImport(
  "../apps/api/src/persistence/postgres.ts",
  import.meta.url,
);
const { InMemoryStore } = await tsImport(
  "../apps/api/src/store.ts",
  import.meta.url,
);
const { GoogleMerchantVerifier } = await tsImport(
  "../apps/api/src/merchant-google-verifier.ts",
  import.meta.url,
);
const { buildApp } = await tsImport("../apps/api/src/app.ts", import.meta.url);
const db = new PostgresDatabase(workerData.credentials, workerData.schema);
const store = new InMemoryStore(undefined, { database: db });
let app;
try {
  app = await buildApp(store, {
    production: false,
    merchantAppUrl: "https://merchant.test",
    merchantGoogle: {
      enabled: true,
      clientId: workerData.clientId,
      verifier: new GoogleMerchantVerifier(
        workerData.clientId,
        createLocalJWKSet({ keys: [workerData.jwk] }),
      ),
    },
  });
  await app.ready();
  parentPort.postMessage({
    ready: true,
    pid: db.prepare("SELECT pg_backend_pid() AS pid").get().pid,
  });
  Atomics.wait(new Int32Array(workerData.gate), 0, 0, 30000);
  const r = await app.inject(workerData.request);
  parentPort.postMessage({ status: r.statusCode });
} catch {
  parentPort.postMessage({ error: "AUTH01A_RACE_FAILURE" });
  process.exitCode = 1;
} finally {
  await app?.close();
  store.close();
}
