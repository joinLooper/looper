# W1C0.1 SYNC to ASYNC Call Graph

Current flow:

```text
Fastify route -> Store method (sync) -> db.prepare().get/all/run or db.exec()
  -> SQLite DatabaseSync OR PostgreSQL bridge Atomics.wait()
```

The bridge blocks the caller, owns one worker/connection per instance, has a fixed RPC timeout, and has no request cancellation. It is not a drop-in async replacement.

| Area / call chain | Migration mark | Required treatment |
|---|---|---|
| `PersistenceDatabase.exec/prepare/close` | ASYNC SIGNATURE REQUIRED | Add async query/execute/withTransaction/health/drain while retaining the sync oracle |
| Store reads: users, accounts, missions, merchants, contexts, reports | ASYNC SIGNATURE REQUIRED | Convert leaf queries; preserve DTOs and ordering |
| Session create/resolve/touch/logout | TRANSACTION CONTEXT REQUIRED | Pin one connection for identity mutation and audit; abort rolls back |
| Admin/account/invitation/operator mutations | TRANSACTION CONTEXT REQUIRED; HIGH RISK | Preserve idempotency replay and audit atomically; use savepoints |
| Player preferences | ASYNC SIGNATURE REQUIRED | Simple async transaction; response unchanged |
| Reward/resource/growth/ledger (`settleActivityReward`, `redeem`) | TRANSACTION CONTEXT REQUIRED; HIGH RISK | One pinned transaction; advisory writer lock; ledger, balance, reward, growth and audit commit together |
| Merchant/task-code submission and settlement | TRANSACTION CONTEXT REQUIRED; HIGH RISK | Queue allocation, idempotency, reward link and settlement share transaction/savepoint |
| Player event queue | TRANSACTION CONTEXT REQUIRED; HIGH RISK | Lock/claim queue row and rollback allocation on cancellation or connection loss |
| Knowledge/resident missions | TRANSACTION CONTEXT REQUIRED | Keep answer/claim idempotency and reward effects atomic; reads may be leaf queries |
| Reporting/read models | ASYNC SIGNATURE REQUIRED | Read-only pool query; use snapshot consistency for multi-query reports |
| Bootstrap/migrations | ASYNC DRIVER REQUIRED; API boundary UNCHANGED | Dedicated migration connection before traffic; never request pool |
| Tests/fixtures | UNCHANGED oracle + ASYNC TEST REQUIRED | Keep W1B 488 suite; add cancellation, saturation, queue wait, leakage and shutdown tests |

Every route calling Store becomes `await`-based after the Store contract changes. HTTP status, DTO JSON, cookies, idempotency replay and error mapping remain unchanged.
