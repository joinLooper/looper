# W1C0.1 Async Persistence Risk Matrix

| Risk | Severity | Detection / mitigation | Status |
|---|---|---|---|
| Sync caller blocks event loop | Critical | timer-delay gate; async repository + bounded pool | Confirmed blocker |
| Pool exhaustion | High | saturation/acquire-wait tests; bounded size and timeout | Design required |
| Cancellation leaks pinned client | Critical | abort test; rollback and `finally` release | Design required |
| Transaction context escapes callback | Critical | leakage test; opaque active tx object | Design required |
| Duplicate reward/EXP on retry | Critical | W1B idempotency/failure suites; no blind retry | Oracle retained |
| Queue allocation lost/duplicated | Critical | waiting/rollback tests; row lock and atomic claim | Design required |
| Advisory lock wrong scope | High | concurrent writer test; transaction-scoped lock | Design required |
| Savepoint misuse | High | nested failure injection; explicit savepoint stack | Design required |
| Connection failure mid-commit | Critical | termination injection; unknown-outcome reconciliation | Design required |
| Shutdown drops writes | High | in-flight shutdown test; drain deadline and rollback | Design required |
| Pooler loses session state | Medium | hosted connection-mode test; direct/session mode or no prepared statements | Decision required |
| Async DTO/error drift | High | API contract snapshot and 488 oracle | Oracle retained |
| Migration uses request pool | High | deployment review; separate migration job/connection | Design rule |
| Vercel `apps/site` root missing | Medium | PR status URL; separate project setting decision | External blocker |
