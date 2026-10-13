import pg from "pg";
import type { PoolClient, PoolConfig, QueryResultRow } from "pg";
import { performance } from "node:perf_hooks";
import {
  AsyncPersistenceError,
  PoolAcquireTimeoutError,
  RequestCancelledError,
  StatementTimeoutError,
  TransactionContextError,
  UnknownCommitOutcomeError,
  type AsyncDatabase,
  type AsyncDatabaseValue,
  type AsyncExecuteResult,
  type AsyncQueryOptions,
  type AsyncQueryResult,
  type AsyncTransaction,
} from "./async-contract.js";

const WRITER_LOCK = "SELECT pg_advisory_xact_lock(170027,1)";
const SCHEMA_NAME = /^[a-z_][a-z0-9_]*$/;

export type AsyncPostgresOptions = {
  pool?: Partial<PoolConfig>;
  maxConnections?: number;
  acquireTimeoutMs?: number;
  statementTimeoutMs?: number;
  lockTimeoutMs?: number;
  applicationName?: string;
};

function timeout(value: number | undefined, fallback: number): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result <= 0)
    throw new Error("Timeouts must be positive integers");
  return result;
}

function savepointName(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name))
    throw new Error("Invalid savepoint name");
  // Quote the validated identifier so PostgreSQL keywords (for example
  // `inner`) remain valid savepoint names without allowing SQL injection.
  return `"${name.replaceAll('"', '""')}"`;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

class TransactionContext implements AsyncTransaction {
  private active = true;
  constructor(
    private readonly client: PoolClient,
    private readonly defaults: {
      statementTimeoutMs: number;
      lockTimeoutMs: number;
      signal?: AbortSignal;
    },
  ) {}
  invalidate(): void {
    this.active = false;
  }
  private assertActive(): void {
    if (!this.active) throw new TransactionContextError();
  }
  async query<Row extends QueryResultRow = QueryResultRow>(
    sql: string,
    values: AsyncDatabaseValue[] = [],
    options: AsyncQueryOptions = {},
  ): Promise<AsyncQueryResult<Row>> {
    this.assertActive();
    const result = await runQuery<Row>(this.client, sql, values, {
      ...this.defaults,
      ...options,
    });
    return { rows: result.rows, rowCount: result.rowCount ?? 0 };
  }
  async execute(
    sql: string,
    values: AsyncDatabaseValue[] = [],
    options: AsyncQueryOptions = {},
  ): Promise<AsyncExecuteResult> {
    const result = await this.query(sql, values, options);
    return { changes: result.rowCount };
  }
  async savepoint<T>(
    name: string,
    callback: (transaction: AsyncTransaction) => Promise<T>,
  ): Promise<T> {
    this.assertActive();
    const safe = savepointName(name);
    await this.client.query(`SAVEPOINT ${safe}`);
    try {
      const result = await callback(this);
      await this.client.query(`RELEASE SAVEPOINT ${safe}`);
      return result;
    } catch (error) {
      try {
        await this.client.query(`ROLLBACK TO SAVEPOINT ${safe}`);
        await this.client.query(`RELEASE SAVEPOINT ${safe}`);
      } catch (rollbackError) {
        throw new UnknownCommitOutcomeError(rollbackError);
      }
      throw error;
    }
  }
  async allocateQueueOrder(schemaName: string): Promise<bigint> {
    this.assertActive();
    if (!SCHEMA_NAME.test(schemaName))
      throw new Error("Invalid queue schema name");
    const result = await this.query<{ high_water: string | number | bigint }>(
      "UPDATE w1b_control.queue_counters SET high_water=high_water+1 WHERE schema_name=$1 RETURNING high_water",
      [schemaName],
    );
    if (result.rows.length !== 1)
      throw new AsyncPersistenceError(
        "QUEUE_AUTHORITY_MISSING",
        "Queue high-water authority is missing",
      );
    return BigInt(result.rows[0].high_water);
  }
}

async function runQuery<Row extends QueryResultRow>(
  client: PoolClient,
  text: string,
  values: AsyncDatabaseValue[],
  options: AsyncQueryOptions,
): Promise<pg.QueryResult<Row>> {
  const statementTimeoutMs = timeout(options.statementTimeoutMs, 30000);
  const lockTimeoutMs = timeout(options.lockTimeoutMs, 5000);
  if (options.signal?.aborted)
    throw new RequestCancelledError("ROLLBACK_CONFIRMED");
  try {
    await client.query(`SET statement_timeout = '${statementTimeoutMs}ms'`);
    await client.query(`SET lock_timeout = '${lockTimeoutMs}ms'`);
    // The signal may abort while the SET queries are in flight, before the
    // cancellation listener for the actual statement exists.
    if (options.signal?.aborted)
      throw new RequestCancelledError("ROLLBACK_CONFIRMED");
    if (!options.signal)
      return await client.query({ text, values } as pg.QueryConfig);

    // node-postgres 8.x does not consume AbortSignal on QueryConfig. Use its
    // native cancellation hook so an aborted request sends PostgreSQL's cancel
    // packet immediately while keeping the pooled connection reusable.
    const query = new pg.Query({ text, values });
    const cancel = () => {
      // Client.cancel() in pg 8.x reuses the active connection's internal
      // socket and can emit EISCONN on newer Node versions. Open a short-lived
      // cancel connection instead, and consume its error event explicitly.
      void (async () => {
        try {
          const source = client as unknown as {
            connectionParameters: pg.ClientConfig;
            processID?: number;
            secretKey?: number;
          };
          if (source.processID === undefined || source.secretKey === undefined)
            return;
          const cancelClient = new pg.Client(source.connectionParameters);
          cancelClient.on("error", () => {});
          cancelClient.connection.on("error", () => {});
          // pg.Client.cancel() opens an unauthenticated, short-lived socket
          // when the client is not connected. Seed only the source backend
          // identity; do not connect this helper as a normal PostgreSQL client.
          const helper = cancelClient as unknown as {
            activeQuery?: unknown;
            processID?: number;
            secretKey?: number;
            cancel: (client: unknown, query: unknown) => void;
          };
          helper.activeQuery = query;
          helper.processID = source.processID;
          helper.secretKey = source.secretKey;
          helper.cancel(cancelClient, query);
        } catch {
          /* cancellation is best-effort; the query result remains authoritative */
        }
      })();
    };
    options.signal.addEventListener("abort", cancel, { once: true });
    try {
      return await new Promise<pg.QueryResult<Row>>((resolve, reject) => {
        query.once("error", reject);
        query.once("end", (result) =>
          resolve(result as unknown as pg.QueryResult<Row>),
        );
        client.query(query);
      });
    } finally {
      options.signal.removeEventListener("abort", cancel);
    }
  } catch (error) {
    if (options.signal?.aborted || isAbort(error))
      throw new RequestCancelledError("ROLLBACK_CONFIRMED", error);
    if (
      error instanceof Error &&
      /statement timeout|canceling statement|lock timeout/i.test(error.message)
    )
      throw new StatementTimeoutError(undefined, error);
    throw error;
  } finally {
    await client.query("RESET statement_timeout").catch(() => {});
    await client.query("RESET lock_timeout").catch(() => {});
  }
}

export class AsyncPostgresDatabase implements AsyncDatabase {
  readonly pool: pg.Pool;
  private readonly acquireTimeoutMs: number;
  private readonly statementTimeoutMs: number;
  private readonly lockTimeoutMs: number;
  private draining = false;
  private lastPoolError: Error | null = null;
  private activeTransactions = 0;

  constructor(connection: PoolConfig, options: AsyncPostgresOptions = {}) {
    const max = options.maxConnections ?? options.pool?.max ?? 4;
    if (!Number.isInteger(max) || max < 1 || max > 32)
      throw new Error("Async PostgreSQL pool max must be between 1 and 32");
    this.acquireTimeoutMs = timeout(options.acquireTimeoutMs, 5000);
    this.statementTimeoutMs = timeout(options.statementTimeoutMs, 30000);
    this.lockTimeoutMs = timeout(options.lockTimeoutMs, 5000);
    this.pool = new pg.Pool({
      ...connection,
      ...options.pool,
      max,
      idleTimeoutMillis: options.pool?.idleTimeoutMillis ?? 10000,
      connectionTimeoutMillis:
        options.pool?.connectionTimeoutMillis ?? this.acquireTimeoutMs,
      statement_timeout:
        options.pool?.statement_timeout ?? this.statementTimeoutMs,
      application_name:
        options.applicationName ??
        options.pool?.application_name ??
        "looper-w1c1-async-foundation",
    });
    this.pool.on("error", (error) => {
      this.lastPoolError = error;
    });
  }

  private async acquire(signal?: AbortSignal): Promise<PoolClient> {
    if (this.draining)
      throw new AsyncPersistenceError(
        "POOL_DRAINING",
        "PostgreSQL pool is draining",
      );
    if (signal?.aborted) throw new RequestCancelledError("ROLLBACK_CONFIRMED");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const connect = this.pool.connect();
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new PoolAcquireTimeoutError()),
        this.acquireTimeoutMs,
      );
    });
    let abortHandler: (() => void) | undefined;
    const abortPromise = new Promise<never>((_, reject) => {
      if (!signal) return;
      abortHandler = () =>
        reject(new RequestCancelledError("ROLLBACK_CONFIRMED"));
      signal.addEventListener("abort", abortHandler, { once: true });
    });
    try {
      const client = await Promise.race([
        connect,
        timeoutPromise,
        abortPromise,
      ]);
      settled = true;
      return client;
    } finally {
      if (timer) clearTimeout(timer);
      if (signal && abortHandler)
        signal.removeEventListener("abort", abortHandler);
      if (!settled)
        void connect.then((client) => client.release()).catch(() => {});
    }
  }

  async query<Row extends QueryResultRow = QueryResultRow>(
    sql: string,
    values: AsyncDatabaseValue[] = [],
    options: AsyncQueryOptions = {},
  ): Promise<AsyncQueryResult<Row>> {
    const client = await this.acquire(options.signal);
    try {
      const result = await runQuery<Row>(client, sql, values, {
        statementTimeoutMs: this.statementTimeoutMs,
        lockTimeoutMs: this.lockTimeoutMs,
        ...options,
      });
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    } finally {
      client.release();
    }
  }

  async execute(
    sql: string,
    values: AsyncDatabaseValue[] = [],
    options: AsyncQueryOptions = {},
  ): Promise<AsyncExecuteResult> {
    const result = await this.query(sql, values, options);
    return { changes: result.rowCount };
  }

  async withTransaction<T>(
    callback: (transaction: AsyncTransaction) => Promise<T>,
    options: AsyncQueryOptions = {},
  ): Promise<T> {
    const client = await this.acquire(options.signal);
    this.activeTransactions += 1;
    const transaction = new TransactionContext(client, {
      statementTimeoutMs: this.statementTimeoutMs,
      lockTimeoutMs: this.lockTimeoutMs,
      signal: options.signal,
    });
    let begun = false;
    let committing = false;
    let discardConnection = false;
    try {
      await client.query("BEGIN");
      begun = true;
      await client.query(`SET LOCAL lock_timeout = '${this.lockTimeoutMs}ms'`);
      try {
        await runQuery(client, WRITER_LOCK, [], {
          statementTimeoutMs: this.statementTimeoutMs,
          lockTimeoutMs: this.lockTimeoutMs,
          signal: options.signal,
        });
      } catch (error) {
        if (error instanceof StatementTimeoutError)
          throw new StatementTimeoutError(
            "PostgreSQL advisory writer lock timed out",
            error,
          );
        throw error;
      }
      const result = await callback(transaction);
      if (options.signal?.aborted)
        throw new RequestCancelledError("ROLLBACK_CONFIRMED");
      committing = true;
      await client.query("COMMIT");
      transaction.invalidate();
      return result;
    } catch (error) {
      if (committing) {
        discardConnection = true;
        throw new UnknownCommitOutcomeError(error);
      }
      if (begun) {
        try {
          await client.query("ROLLBACK");
          transaction.invalidate();
        } catch (rollbackError) {
          discardConnection = true;
          transaction.invalidate();
          throw new UnknownCommitOutcomeError(rollbackError);
        }
      }
      if (error instanceof RequestCancelledError) throw error;
      if (options.signal?.aborted || isAbort(error))
        throw new RequestCancelledError("ROLLBACK_CONFIRMED", error);
      throw error;
    } finally {
      transaction.invalidate();
      this.activeTransactions -= 1;
      // An uncertain COMMIT/ROLLBACK must never put a possibly-open transaction
      // back into the pool. Closing its socket does not prove commit outcome.
      client.release(discardConnection);
    }
  }

  async health(options: AsyncQueryOptions = {}): Promise<{
    ok: true;
    latencyMs: number;
    pool: { total: number; idle: number; waiting: number };
  }> {
    const start = performance.now();
    await this.query("SELECT 1 AS ok", [], options);
    return {
      ok: true,
      latencyMs: performance.now() - start,
      pool: {
        total: this.pool.totalCount,
        idle: this.pool.idleCount,
        waiting: this.pool.waitingCount,
      },
    };
  }

  async drain(timeoutMs = 10000): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new AsyncPersistenceError(
              "POOL_DRAIN_TIMEOUT",
              "PostgreSQL pool drain timed out",
            ),
          ),
        timeoutMs,
      ),
    );
    await Promise.race([this.pool.end(), timeoutPromise]);
  }

  get diagnostics() {
    return {
      activeTransactions: this.activeTransactions,
      lastPoolError: this.lastPoolError?.message ?? null,
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
      draining: this.draining,
    };
  }
}
