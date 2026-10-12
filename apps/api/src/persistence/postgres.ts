import { Worker } from "node:worker_threads";
import type {
  DatabaseValue,
  PersistenceDatabase,
  PersistenceStatement,
} from "./contract.js";

export type PostgresConnection = {
  host: "127.0.0.1";
  port: 55432;
  database: "looper_w1b";
  user: "looper_w1b_test";
  password: string;
};
/** Keep the Store synchronous without copying business logic. The pinned pg driver
 * runs on a dedicated worker/connection. Concurrent callers use separate workers.
 * This bridge is an isolated parity implementation, not a production server default. */
export class PostgresDatabase implements PersistenceDatabase {
  private readonly worker: Worker;
  private readonly shared = new SharedArrayBuffer(16 * 1024 * 1024);
  private closed = false;
  constructor(connection: PostgresConnection, schema = "looper_core") {
    if (
      connection.host !== "127.0.0.1" ||
      connection.port !== 55432 ||
      connection.database !== "looper_w1b" ||
      connection.user !== "looper_w1b_test"
    )
      throw new Error("Only the isolated W1B runtime is allowed");
    if (!/^(looper_core|w1b_[a-z0-9_]+)$/.test(schema))
      throw new Error("Invalid isolated schema");
    this.worker = new Worker(
      new URL("./postgres-worker.mjs", import.meta.url),
      { workerData: { connection, schema, shared: this.shared } },
    );
    this.worker.unref();
    // A worker-level fault is terminal. The synchronous call has its own bounded
    // timeout; never leave an unhandled Worker error after it returns.
    this.worker.on("error", () => {
      this.closed = true;
    });
    try {
      this.call("connect", "");
    } catch (error) {
      void this.worker.terminate();
      throw error;
    }
  }
  private call(
    operation: string,
    sql: string,
    values: DatabaseValue[] = [],
  ): any {
    if (this.closed) throw new Error("Database is closed");
    const header = new Int32Array(this.shared, 0, 2);
    Atomics.store(header, 0, 0);
    this.worker.postMessage({ operation, sql, values });
    if (Atomics.wait(header, 0, 0, 45000) === "timed-out") {
      this.closed = true;
      void this.worker.terminate();
      throw new Error(
        "PostgreSQL worker timed out; transaction outcome must be inspected before retry",
      );
    }
    const result = JSON.parse(
      new TextDecoder().decode(
        new Uint8Array(this.shared, 8, Atomics.load(header, 1)),
      ),
    );
    if (result.error)
      throw Object.assign(new Error(result.error.message), {
        code: result.error.code,
        sqlState: result.error.sqlState,
      });
    return result.value;
  }
  exec(sql: string): void {
    this.call("exec", sql);
  }
  prepare(sql: string): PersistenceStatement {
    return {
      all: (...values) => this.call("all", sql, values),
      get: (...values) => this.call("all", sql, values)[0],
      run: (...values) => this.call("run", sql, values),
    };
  }
  close(): void {
    if (!this.closed) {
      try {
        this.call("close", "");
      } finally {
        this.closed = true;
        void this.worker.terminate();
      }
    }
  }
}
