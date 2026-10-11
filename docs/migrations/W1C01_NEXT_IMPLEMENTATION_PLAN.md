# W1C0.1 Next Implementation Plan

This package stops before full async implementation.

1. Hosted closure is complete in CI Run 38182103335; keep Draft PR #43 unmerged for central review.
2. Decide whether an independent Looper staging project and region/budget are approved; do not create it here.
4. Implement only the async contract and pool harness in a separately authorized package. No route/business migration until cancellation, saturation, queue, connection-failure, context-leakage and shutdown tests pass.
5. Migrate read-only methods first, then identity/session, task-code/queue, and reward/ledger/settlement. After each slice run SQLite/PostgreSQL P01–P27, concurrency, failure injection and the full 488 oracle.
6. Keep Draft PR #43 unmerged until central review accepts hosted evidence, async design, Vercel separation and staging decision.
