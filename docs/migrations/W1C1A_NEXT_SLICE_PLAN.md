# W1C1-A Next Slice Plan

This work package stops at the isolated async persistence primitive. The next approved slice must remain a separate review and must not be inferred as started by this branch.

1. Review the hosted CI evidence and approve the foundation branch.
2. Freeze the async contract and error/outcome semantics, including cancellation and `OUTCOME_UNKNOWN` reconciliation rules.
3. Produce a call-chain migration inventory for one low-risk read path before touching Store or routes.
4. Define async transaction orchestration adapters for reward, ledger, idempotency, queue, and reporting paths while preserving the W1B SQLite/PG oracle.
5. Add parity and failure cases for pool saturation, cancellation, savepoints, queue rollback, unknown commit, and shutdown at every migrated slice.
6. Only after central approval, begin a separately scoped W1C1-B slice. No Supabase, Native App, dual-write, Gameplay, Economy, Forest, Treehouse, or production migration is part of this plan's execution.
