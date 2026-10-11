# W1C0.1 Next Implementation Plan

This package stops before full async implementation.

1. Push the minimal Linux CI browser-launch repair and let Draft PR #43 rerun both workflows.
2. Accept hosted PASS only when the repaired CI run records frozen install, lint/typecheck/build, PG17 startup, 488 root tests, browser capture, and cleanup as successful. Backend Tests remains supplemental API evidence.
3. Decide whether an independent Looper staging project and region/budget are approved; do not create it here.
4. Implement only the async contract and pool harness in a separately authorized package. No route/business migration until cancellation, saturation, queue, connection-failure, context-leakage and shutdown tests pass.
5. Migrate read-only methods first, then identity/session, task-code/queue, and reward/ledger/settlement. After each slice run SQLite/PostgreSQL P01–P27, concurrency, failure injection and the full 488 oracle.
6. Keep Draft PR #43 unmerged until central review accepts hosted evidence, async design, Vercel separation and staging decision.
