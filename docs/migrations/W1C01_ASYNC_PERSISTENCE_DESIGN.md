# W1C0.1 Async Persistence Migration Design

Design only; no async adapter replacement is implemented here.

## Boundary

Keep the synchronous `PersistenceDatabase` and SQLite/PostgreSQL parity implementation as the W1B oracle. Add a separate async repository boundary:

```ts
interface AsyncDatabase {
  query<T>(sql: string, values: DatabaseValue[], options?: QueryOptions): Promise<T[]>;
  execute(sql: string, values: DatabaseValue[], options?: QueryOptions): Promise<ExecuteResult>;
  withTransaction<T>(fn: (tx: AsyncTransaction) => Promise<T>, signal?: AbortSignal): Promise<T>;
  health(signal?: AbortSignal): Promise<HealthResult>;
  drain(timeoutMs: number): Promise<void>;
}
```

`AsyncTransaction` is valid only inside its callback, exposes query/execute and savepoints, and cannot escape or be reused after commit/rollback.

## Pool and cancellation

- Use bounded `pg.Pool`; acquire timeout is shorter than the API request budget.
- Set PostgreSQL `statement_timeout` and `lock_timeout` per transaction/query.
- Propagate Fastify request abort to `AbortSignal`; abort releases a waiting acquire and rolls back a pinned transaction.
- Use SSL verification in hosted environments. Disable prepared statements if transaction pooling is selected.
- Health reports pool saturation separately from database failure.

## Transaction safety

- A write orchestration pins one client for its entire transaction.
- Start `BEGIN`, acquire the existing writer advisory lock, set local timeouts, execute ledger/economy/audit work, and commit once.
- Nested orchestration uses `SAVEPOINT` / `ROLLBACK TO SAVEPOINT`, never nested top-level `BEGIN`.
- Queue allocation uses row locking and writes claim plus idempotency in one transaction; cancellation/failure rolls it back.
- Connection loss makes outcome unknown; never blindly retry non-idempotent work. Re-read idempotency before replay.

## Lifecycle and compatibility

`drain()` stops new acquires, waits for active transactions, rolls back overdue work, and closes idle clients. Pool errors degrade health; the supervisor recreates the pool only after active requests receive typed failures. Route DTOs, status codes, cookies, reward IDs, ledger/audit links, and error categories stay unchanged.

Retain P01–P27, compatibility, concurrency, failure injection and all 488 tests. Add request cancellation, pool saturation, queue waiting, connection failure, transaction context leakage, and shutdown during an in-flight transaction. Prove no duplicate Stars, EXP, Level, Energy, CO₂e, Growth, Knowledge, Task Code, settlement, ledger, audit or idempotency effect.
