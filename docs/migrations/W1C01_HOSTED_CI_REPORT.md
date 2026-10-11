# W1C0.1 Hosted CI Report

## PR and source

- Draft PR: https://github.com/joinLooper/looper/pull/43
- Base: `codex/welcome-first-resident`
- Head: `codex/app-w1b-postgres-parity`
- Commit SHA: `e158f6018054c395d68249999871985573b10b39`
- Working tree before repair: clean; the only repair is the Linux CI browser-launch compatibility change in `scripts/runtime-capture-support.mjs`.
- The PR is draft and was not merged.

## Hosted runs

| Workflow | Run | Trigger | Result | Evidence |
|---|---:|---|---|---|
| Backend Tests | 38181733637 | `pull_request` | PASS | https://github.com/joinLooper/looper/actions/runs/38181733637 (job 114595548066) |
| CI | 38181733636 | `pull_request` | FAIL at browser capture | https://github.com/joinLooper/looper/actions/runs/38181733636 (job 114595548212) |
| CI after minimal repair | 38182103335 | `pull_request` | PASS | https://github.com/joinLooper/looper/actions/runs/38182103335 (job 114596645214) |
| Backend Tests after repair | 38182103339 | `pull_request` | PASS | https://github.com/joinLooper/looper/actions/runs/38182103339 (job 114596644955) |

Both runs used the requested head SHA. Backend Tests completed checkout, pnpm setup, Node 22, migration, and API test successfully. Its workflow uses `--no-frozen-lockfile`; therefore it is API evidence, not frozen-install evidence.

The main CI run passed frozen install, SQLite migration, shared/API/web/admin/merchant lint, typecheck, isolated PostgreSQL 17 startup, root `pnpm test` (the W1B 488-test gate), shared/API/web/admin/merchant builds, root build, and Puppeteer Chrome installation. It failed only at `pnpm qa:capture-runtime`.

Failure classification: **runner/browser environment**. Chromium was installed, then exited with `No usable sandbox` caused by disabled unprivileged user namespaces/AppArmor on the Ubuntu runner. This is not a source, PostgreSQL startup, parity, dependency, or timeout failure. Failure log excerpt is retained in the Actions run above.

## Minimal repair

`runtime-capture-support.mjs` now adds `--no-sandbox --disable-setuid-sandbox` only when `process.platform === "linux" && CI === "true"`. Windows and local captures retain normal Puppeteer sandbox behavior. The automatic capture workflow and evidence output remain unchanged; no assertions or product behavior were changed.

The repair was pushed normally as `166bd62b4e3ceca8eeeec1a5961bf49aec43d2ac`. The new CI run passed every step, including browser capture and cleanup. No Supabase or production setting was touched.

The Vercel `looper-site` check remains an independent failure with `NOW_SANDBOX_WORKER_ROOTDIR_NOT_EXIST` and root directory `apps/site`; it is recorded but does not invalidate this PostgreSQL/hosted CI gate.
