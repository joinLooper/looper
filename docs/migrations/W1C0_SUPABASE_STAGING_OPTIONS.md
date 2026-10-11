# W1C0 Supabase Staging Options and Cost Comparison

This is research only. No Supabase project, branch, credential, or paid resource was created.

## Region and PostgreSQL

For Taiwan/APAC latency, candidates are Singapore (ap-southeast-1), Tokyo (ap-northeast-1), and Seoul (ap-northeast-2). Supabase lists these regions and says the selected region determines primary data location: https://supabase.com/docs/guides/platform/regions . The final choice needs confirmation against latency, residency, and cost.

The staging major should be PostgreSQL 17 to match W1B, but the actual Supabase major/minor must be recorded at creation and rechecked before migration.

## Options

| Option | Region / PG | Monthly cost | Branch cost | Isolation and fit |
|---|---|---:|---:|---|
| Independent Looper Development/Staging project (recommended) | Confirmed APAC region; verify PG17 at creation | Free tier $0 but pauses and has no automatic backup; Pro starts at $25/month, first Micro compute covered by $10 compute credit | N/A | Strongest separation from existing projects and clean CI boundary |
| Supabase persistent branch | Inherits parent region/configuration | Requires paid parent project; usage metered | Preview Micro starts at $0.01344/hour plus disk/egress | Isolated services and credentials, but cloned from a parent and mergeable; defer until an approved Looper parent exists |
| Existing local portable PG17 | Loopback; PG17.11 | $0 cloud cost | N/A | Safe parity baseline; cannot prove hosted network or managed operations |

Published Supabase pricing currently lists Pro at $25/month, additional projects from $10/month, Micro compute at $10/month, $10/month Pro compute credits, and preview branching at $0.01344 per branch-hour: https://supabase.com/pricing . Branch charges are usage-based and not covered by Spend Cap: https://supabase.com/docs/guides/platform/manage-your-usage/branching . Verify amounts at approval time.

## Required staging controls

- Connection/pooling: backend-only SSL connections and a small application pool. Transaction pooling uses port 6543 and does not support prepared statements or session state: https://supabase.com/docs/guides/database/connecting-to-postgres .
- Backups/restore: Pro has daily backups with 7-day retention. PITR is an add-on, requires at least Small compute, and is listed around $100/month for 7-day retention: https://supabase.com/docs/guides/platform/backups . Run a restore drill before migration.
- Secret management: database URLs, pooler credentials, and service keys belong only in backend runtime secrets and GitHub environment secrets.
- Backend-only schema: private non-exposed schema, dedicated non-owner runtime role, migration owner separate.
- Data API exposure: disable it for this backend-only shape, or expose no Looper tables. If exposure is later approved, explicitly grant roles and enable RLS/policies.
- RLS/grants boundary: no PUBLIC, anon, or authenticated access to backend-only tables; verify grants and RLS in CI.
- CI/staging isolation: separate project/ref or disposable branch, separate secrets, no production data, explicit teardown.
- Production migration prerequisites: central approval of region/cost, hosted CI green, async pool adapter, restore drill, migration rehearsal, rollback plan, observability, and data exposure review. No dual-write is authorized here.

Supabase branches are data-less by default and have separate services and credentials, but included data is production-sensitive: https://supabase.com/docs/guides/deployment/branching .
