export type AsyncDatabaseValue = null | string | number | bigint | Uint8Array;

export type AsyncQueryOptions = {
  signal?: AbortSignal;
  statementTimeoutMs?: number;
  lockTimeoutMs?: number;
};

export type AsyncQueryResult<
  Row extends Record<string, unknown> = Record<string, unknown>,
> = {
  rows: Row[];
  rowCount: number;
};

export type AsyncExecuteResult = { changes: number };

export type TransactionOutcome =
  "ROLLBACK_CONFIRMED" | "COMMIT_CONFIRMED" | "OUTCOME_UNKNOWN";

export class AsyncPersistenceError extends Error {
  readonly code: string;
  readonly cause?: unknown;
  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = "AsyncPersistenceError";
    this.code = code;
    this.cause = cause;
  }
}

export class PoolAcquireTimeoutError extends AsyncPersistenceError {
  constructor(message = "PostgreSQL pool acquire timed out") {
    super("POOL_ACQUIRE_TIMEOUT", message);
    this.name = "PoolAcquireTimeoutError";
  }
}

export class StatementTimeoutError extends AsyncPersistenceError {
  constructor(message = "PostgreSQL statement timed out", cause?: unknown) {
    super("STATEMENT_TIMEOUT", message, cause);
    this.name = "StatementTimeoutError";
  }
}

export class RequestCancelledError extends AsyncPersistenceError {
  readonly outcome: TransactionOutcome;
  constructor(outcome: TransactionOutcome, cause?: unknown) {
    super("REQUEST_CANCELLED", `Request cancelled (${outcome})`, cause);
    this.name = "RequestCancelledError";
    this.outcome = outcome;
  }
}

export class TransactionContextError extends AsyncPersistenceError {
  constructor(message = "Transaction context is no longer active") {
    super("TRANSACTION_CONTEXT_INVALID", message);
    this.name = "TransactionContextError";
  }
}

export class UnknownCommitOutcomeError extends AsyncPersistenceError {
  readonly outcome = "OUTCOME_UNKNOWN" as const;
  constructor(cause?: unknown) {
    super(
      "COMMIT_OUTCOME_UNKNOWN",
      "Commit outcome is unknown; do not blindly retry",
      cause,
    );
    this.name = "UnknownCommitOutcomeError";
  }
}

export type AsyncTransaction = {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: AsyncDatabaseValue[],
    options?: AsyncQueryOptions,
  ): Promise<AsyncQueryResult<Row>>;
  execute(
    sql: string,
    values?: AsyncDatabaseValue[],
    options?: AsyncQueryOptions,
  ): Promise<AsyncExecuteResult>;
  savepoint<T>(
    name: string,
    callback: (transaction: AsyncTransaction) => Promise<T>,
  ): Promise<T>;
  allocateQueueOrder(schemaName: string): Promise<bigint>;
};

export type AsyncDatabase = {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: AsyncDatabaseValue[],
    options?: AsyncQueryOptions,
  ): Promise<AsyncQueryResult<Row>>;
  execute(
    sql: string,
    values?: AsyncDatabaseValue[],
    options?: AsyncQueryOptions,
  ): Promise<AsyncExecuteResult>;
  withTransaction<T>(
    callback: (transaction: AsyncTransaction) => Promise<T>,
    options?: AsyncQueryOptions,
  ): Promise<T>;
  health(
    options?: AsyncQueryOptions,
  ): Promise<{
    ok: true;
    latencyMs: number;
    pool: { total: number; idle: number; waiting: number };
  }>;
  drain(timeoutMs?: number): Promise<void>;
};
