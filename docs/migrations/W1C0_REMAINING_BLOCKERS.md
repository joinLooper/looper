# W1C0 Remaining Blockers

1. Hosted CI is not verified. The workflow does not run on a feature-branch push and no PR run exists. Central review must authorize a controlled PR/run.
2. The synchronous PG bridge is not deployment-ready for API use. The isolated test measured event-loop blocking and confirmed no pool or request cancellation. An asynchronous bounded-pool adapter is required before App API staging.
3. Staging region and spend are undecided. User confirmation is required before any Supabase resource is created. No resource was created.
4. Supabase project choice is undecided. Independent Looper staging is recommended; branching requires an approved parent Looper project.
5. Git fetch emitted a stale unrelated checkpoint ref bad-object warning. ls-remote succeeded and matched local HEAD; cleanup of unrelated refs is outside this package.

No production database, player data, school workspace, school meeting, Auth migration, native app, gameplay/economy, Forest/Treehouse, or Character Canon work was touched.
