# W1C0 PostgreSQL Adapter Deployment Readiness

The test ran against the existing portable PostgreSQL 17.11 loopback runtime using pnpm qa:pg-readiness. The runtime was started with scripts/w1b-pg-start.ps1 and stopped normally with scripts/w1b-pg-stop.ps1. Evidence is W1C0_PG_ADAPTER_READINESS_RESULTS.json; credentials are omitted.

| Area | Result | Deployment implication |
|---|---|---|
| Health | SELECT 1 about 1.9 ms | Basic health responsive in isolation |
| Event loop | 80 ms sleep delayed a 10 ms timer to about 105 ms | Blocker for API use in the main request process |
| DB latency | 40 calls, p50 about 0.23 ms, p95 about 1.20 ms | Local loopback only; no hosted-network SLO claim |
| API request | /player/state, 30 injects, p50 about 0.007 ms, p95 about 0.031 ms, one about 484 ms warm-up outlier | In-process inject is not a network benchmark |
| Pool lifecycle | Five create/bootstrap/use/close cycles passed | Lifecycle deterministic in isolation |
| Timeout / cancellation | Fixed 45 s RPC timeout; no request-level cancellation API | Blocker for cancellation-sensitive hosted requests |
| Memory / CPU | 100 small queries; RSS stable near 122 MB; 63 ms user and 31 ms system CPU | Small-load sample only |
| Worker failure / restart | Backend termination failed the old call; new adapter connected | Recovery requires replacing the adapter |
| Graceful shutdown | close completed and post-close calls rejected | Adapter shutdown behavior passed |
| Small load | 100 sequential calls, about 2,387 ops/s | Loopback smoke throughput, not capacity evidence |

The existing adapter remains the isolated parity implementation and test oracle. Before App API deployment, introduce a small asynchronous PostgreSQL repository boundary backed by a bounded pg pool or approved equivalent. Preserve the current PersistenceDatabase contract behind an adapter so business logic, gameplay, forest, economy, and data model remain unchanged. Add request abort propagation, statement timeout, pool acquire timeout, health probes, and graceful drain. Roll out behind a staging-only feature switch and compare parity before any production cutover.

Impact is limited to apps/api/src/persistence and API bootstrap/configuration. It must not modify gameplay rules or migrations in W1C0.
