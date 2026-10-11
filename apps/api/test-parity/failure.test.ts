import assert from "node:assert/strict";
import test from "node:test";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { harness, deterministic, pending, decide, plain } from "./fixtures.js";
const results: any[] = [];
for (const point of [
  "after_reward_insert",
  "after_resources_update",
  "during_growth",
  "before_audit",
  "before_settlement_link",
])
  test(
    `Failure injection ${point}: exact rollback and retry`,
    { concurrency: false },
    async (t) => {
      const clock = deterministic(t);
      let expected: any;
      try {
        for (const engine of ["sqlite", "postgres"] as const) {
          clock.reset();
          const h = await harness(engine, "failure_" + point);
          try {
            const resident = h.session("failure-player");
            const p = pending(h, resident.id);
            h.db
              .prepare(
                "UPDATE user_growth_balances SET carbon_total_grams=1600,carbon_balance_grams=1600,seed_count=4,plant_count=4 WHERE user_id=?",
              )
              .run(resident.id);
            const before = h.snapshot();
            h.db.point = point;
            assert.throws(() => decide(h, p), /W1B injected failure/);
            assert.equal(h.db.fired, true);
            assert.deepEqual(
              h.snapshot(),
              before,
              "All 35 tables must roll back exactly",
            );
            const retry = decide(h, p);
            assert.equal(retry.submission.status, "settled");
            const after = h.snapshot();
            const result = { retry: plain(retry), after };
            if (engine === "sqlite") expected = result;
            else
              assert.deepEqual(
                result,
                expected,
                "PG retry including queue order must equal SQLite",
              );
          } finally {
            await h.close();
          }
        }
        results.push({
          point,
          status: "PASS",
          rollback: "All 35 application tables equal pre-transaction snapshot",
          retry: "Exact SQLite/PG API-equivalent result, rows and queue order",
          sha256: createHash("sha256")
            .update(JSON.stringify(expected))
            .digest("hex"),
        });
      } catch (e: any) {
        results.push({ point, status: "FAIL", error: e.message });
        throw e;
      } finally {
        clock.restore();
        writeFileSync(
          new URL(
            "../../../docs/migrations/W1B_FAILURE_INJECTION_RESULTS.json",
            import.meta.url,
          ),
          JSON.stringify({ results }, null, 2) + "\n",
        );
      }
    },
  );
