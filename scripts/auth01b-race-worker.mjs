import { parentPort, workerData, threadId } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { tsImport } from "tsx/esm/api";
const { PostgresDatabase } = await tsImport(
  "../apps/api/src/persistence/postgres.ts",
  import.meta.url,
);
const { InMemoryStore } = await tsImport(
  "../apps/api/src/store.ts",
  import.meta.url,
);
const { configureDatabase } = await tsImport(
  "../apps/api/src/database.ts",
  import.meta.url,
);
const { MerchantStaffAuth } = await tsImport(
  "../apps/api/src/merchant-staff-auth.ts",
  import.meta.url,
);
const db =
  workerData.engine === "postgres"
    ? new PostgresDatabase(workerData.credentials, workerData.schema)
    : new DatabaseSync(workerData.path);
if (workerData.engine === "sqlite") configureDatabase(db);
const store = new InMemoryStore(undefined, { database: db });
try {
  const auth = new MerchantStaffAuth(
    store,
    workerData.channel,
    "https://merchant.test",
  );
  parentPort.postMessage({
    ready: true,
    id:
      workerData.engine === "postgres"
        ? db.prepare("SELECT pg_backend_pid() pid").get().pid
        : threadId,
  });
  Atomics.wait(new Int32Array(workerData.gate), 0, 0, 30000);
  if (workerData.mode === "player") {
    const result = store.createPlayerSession(
      {
        provider: "line",
        providerSubject: "staff-line",
        displayName: "staff-line",
      },
      604800,
    );
    parentPort.postMessage({
      done: true,
      status: 200,
      accountId: result.context.accountId,
      userId: result.context.userId,
    });
  } else {
    const c = workerData.challenge;
    const result = auth.login(c.state, c.browser, {
      subject: "staff-line",
      nonceHash: c.nonceHash,
      channelId: workerData.channel,
    });
    parentPort.postMessage({
      done: true,
      status: 200,
      accountId: result.accountId,
    });
  }
} catch (error) {
  parentPort.postMessage({
    done: true,
    status: error.statusCode ?? 500,
    code: error.code ?? error.message,
  });
} finally {
  store.close();
}
