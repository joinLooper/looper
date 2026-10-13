# Pure Helper Extraction Before / After Evidence

Authority before extraction: `66b3beffd2ab4de94a056264f9d3c78bbbfbf781`, with central extraction approval dated 2026-10-14 (Asia/Taipei).

`apps/api/src/energy-regeneration.ts::calculateEnergyRegeneration` is the only regeneration arithmetic implementation used by both synchronous Store and AsyncPlayerStateRepository. It takes currentEnergy, maxEnergy, interval, lastUpdated epoch and nowMs. It returns null or ticks, nextLast, atCap, recovered and nextEnergy. There is no SQL, clock read, UUID, connection or transaction operation in the function.

The legacy Store still checks missing resource/max<=0/interval<=0 before reading the same clocks. It reads lastUpdated, calls Date.now(), invokes the pure helper, and calls nowIso() at the same successful-calculation point. The cap-only UPDATE remains before the recovering branch. Resource update → source UUID → ledger → energy log → audit order is unchanged. No historical data is repaired.

`scripts/w1c1c-extraction.spec.mjs` was run before editing store.ts. It captured eight scenarios: sub-interval, exact interval, multiple intervals/fractional remainder, full cap, near cap, long absence, future timestamp, and locked/max=0. Each captures the API result, repeated-read result, SQL sequence and complete 35-table fixture snapshot with deterministic IDs/times. The post-extraction run matched all eight exactly.

The immutable pre-extraction hashes are in `evidence/W1C1C_HELPER_BEFORE_SUCCESS_HASHES.json`; CI compares regenerated complete observations against those hashes. This is an independent before-source oracle, not a second Energy formula. The full unhashed pre/post observations remain in the ZIP.

The existing `scripts/w1c1c-transaction-boundary.spec.mjs` also ran before and after the extraction: five scenarios × two engines, ten cases. Their full result arrays matched exactly, including legacy partial commits and unrepaired missing records after retries. New async rollback correctness is deliberately a separate test/authority.

Reproduce: `pnpm test:energy-extraction` with the isolated PG17 runtime running. It is two diagnostic tests (eight success snapshots plus ten failure cases), separate from baseline 488 and new Player State tests. Before/after stdout and JSON, plus initial disk-full failure and recovery evidence, are in the delivery ZIP. This helper approval is narrow and does not resolve the legacy **PRE-BETA DATA CONSISTENCY BLOCKER**.
