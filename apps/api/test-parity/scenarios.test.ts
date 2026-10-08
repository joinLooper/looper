import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import {
  harness,
  deterministic,
  plain,
  caught,
  reward,
  pending,
  decide,
  merchant,
  answer,
  cardId,
  FIXED,
  type Harness,
} from "./fixtures.js";
const count = (h: Harness, table: string) =>
  h.db.prepare(`SELECT count(*) n FROM ${table}`).get()!.n;
const knowledge = (h: Harness, id: string, input = answer) =>
  h.store.answerKnowledgeCard(id, cardId, input);
const readyKnowledge = (h: Harness, id: string) =>
  reward(h, id, "unlock-" + id, 150, 0);
const cases: Array<
  [string, string, (h: Harness, a: any, b: any, clock: any) => any]
> = [
  [
    "P01",
    "Account / Player",
    async (h, a) => {
      const input = {
        displayName: "New account",
        actorId: "test-admin",
        idempotencyKey: "account-one",
      };
      const first = h.store.createAccount(input);
      const replay = h.store.createAccount(input);
      assert.equal(replay.replayed, true);
      const conflict = caught(() =>
        h.store.createAccount({ ...input, displayName: "Changed" }),
      );
      assert.equal(conflict.status, 409);
      assert.equal(
        h.db
          .prepare("SELECT count(*) n FROM users WHERE account_id=?")
          .get(first.account.accountId)!.n,
        0,
      );
      const beforeFailure = h.snapshot();
      h.store.failNextPlayerProfileWrite = true;
      const failed = caught(() =>
        h.store.createPlayerProfile("profile-retry", "Profile"),
      );
      assert.equal(failed.status, 500);
      assert.deepEqual(h.snapshot(), beforeFailure);
      const profile = h.store.createPlayerProfile("profile-retry", "Profile");
      return {
        first,
        replay,
        conflict,
        failed,
        profile,
        player: await h.api("GET", "/player/state", undefined, a.cookie),
      };
    },
  ],
  [
    "P02",
    "LINE verified identity",
    async (h) => {
      const first = await h.api("POST", "/auth/player/line/session", {
        idToken: "line-test",
      });
      const second = await h.api("POST", "/auth/player/line/session", {
        idToken: "line-test",
      });
      const invalid = await h.api("POST", "/auth/player/line/session", {
        idToken: "invalid",
      });
      assert.equal(first.status, 200);
      assert.equal(invalid.status, 401);
      return { first, second, invalid };
    },
  ],
  [
    "P03",
    "Session / logout / expiry",
    async (h, a, b, clock) => {
      const session = await h.api(
        "GET",
        "/auth/player/session",
        undefined,
        a.cookie,
      );
      const logout = h.store.logoutPlayerSessionToken(a.auth.sessionToken);
      const denied = await h.api("GET", "/player/state", undefined, a.cookie);
      clock.time("2026-08-24T03:00:00.000Z");
      const expired = await h.api("GET", "/player/state", undefined, b.cookie);
      assert.equal(denied.status, 401);
      assert.equal(expired.status, 401);
      return { session, logout, denied, expired };
    },
  ],
  [
    "P04",
    "Knowledge reward / replay / daily boundary",
    async (h, a, b, clock) => {
      reward(h, a.id, "level-two", 50, 0);
      const locked = caught(() => knowledge(h, a.id));
      assert.ok(locked.error);
      readyKnowledge(h, a.id);
      readyKnowledge(h, b.id);
      const first = await h.api(
        "POST",
        `/player/knowledge-cards/${cardId}/answers`,
        answer,
        a.cookie,
      );
      const replay = await h.api(
        "POST",
        `/player/knowledge-cards/${cardId}/answers`,
        answer,
        a.cookie,
      );
      const changed = caught(() =>
        knowledge(h, a.id, { ...answer, selectedOptionId: "extra-bag" }),
      );
      const globalConflict = caught(() => knowledge(h, b.id));
      assert.equal(changed.status, 409);
      assert.equal(globalConflict.status, 409);
      const incorrect = knowledge(h, b.id, {
        ...answer,
        selectedOptionId: "extra-bag",
        idempotencyKey: "knowledge-b",
      });
      assert.equal(count(h, "knowledge_card_attempts"), 2);
      clock.time("2026-08-16T16:00:00.000Z");
      const next = knowledge(h, a.id, {
        ...answer,
        idempotencyKey: "knowledge-next",
      });
      assert.equal(count(h, "knowledge_card_attempts"), 3);
      return {
        locked,
        first,
        replay,
        changed,
        globalConflict,
        incorrect,
        next,
      };
    },
  ],
  [
    "P05",
    "Resident free completion / claim / replay / daily boundary",
    async (h, a, b, clock) => {
      const board = h.store.getResidentMissionBoardState(a.id);
      const instance = board.today[1];
      assert.ok("instanceId" in instance);
      const incomplete = caught(() =>
        h.store.claimResidentMission(
          a.id,
          instance.instanceId!,
          "not-completed",
        ),
      );
      assert.ok(incomplete.error);
      const before = count(h, "reward_events");
      const completed = h.store.completeCoreTreeMission(a.id);
      assert.equal(count(h, "reward_events"), before);
      const beforeClaim = h.snapshot();
      h.store.failNextResidentMissionClaimFinalize = true;
      const failed = caught(() =>
        h.store.claimResidentMission(
          a.id,
          completed.missionInstance.id,
          "claim-first",
        ),
      );
      assert.equal(failed.status, 500);
      assert.deepEqual(h.snapshot(), beforeClaim);
      const first = h.store.claimResidentMission(
        a.id,
        completed.missionInstance.id,
        "claim-first",
      );
      const replay = h.store.claimResidentMission(
        a.id,
        completed.missionInstance.id,
        "claim-first",
      );
      assert.equal(count(h, "reward_events"), 1);
      const secondKey = caught(() =>
        h.store.claimResidentMission(
          a.id,
          completed.missionInstance.id,
          "claim-second",
        ),
      );
      assert.equal(secondKey.status, 409);
      assert.equal(h.store.getUser(a.id).resources.starBalance, 10);
      assert.equal(h.store.getUser(a.id).resources.currentExp, 0);
      assert.equal(count(h, "plant_growth_logs"), 0);
      clock.time("2026-08-16T16:00:00.000Z");
      return {
        completed,
        incomplete,
        failed,
        secondKey,
        first,
        replay,
        next: h.store.getResidentMissionBoardState(a.id),
      };
    },
  ],
  [
    "P06",
    "Cumulative EXP",
    (h) => {
      const one = reward(h, "user-demo", "exp-one", 30, 0),
        two = reward(h, "user-demo", "exp-two", 10, 0);
      assert.equal(h.store.getUser("user-demo").resources.currentExp, 40);
      return { one, two };
    },
  ],
  [
    "P07",
    "Single level and chest",
    (h) => {
      reward(h, "user-demo", "level-before", 49, 0);
      assert.equal(h.store.getUser("user-demo").resources.currentLevel, 1);
      const result = reward(h, "user-demo", "level-one", 1, 0);
      assert.equal(h.store.getUser("user-demo").resources.currentLevel, 2);
      assert.equal(count(h, "level_up_logs"), 1);
      return result;
    },
  ],
  [
    "P08",
    "Multiple level thresholds / queue",
    (h, a) => {
      const result = reward(h, "user-demo", "level-many", 1010, 0);
      assert.equal(h.store.getUser("user-demo").resources.currentLevel, 6);
      assert.equal(count(h, "level_up_logs"), 5);
      assert.equal(
        count(h, "player_event_queue"),
        0,
        "Generic activity does not create vegetarian presentation events",
      );
      const vegetarian = decide(h, pending(h, a.id, "multi-vegetarian"));
      assert.equal(h.store.getUser(a.id).resources.currentLevel, 3);
      assert.ok((count(h, "player_event_queue") as number) > 0);
      return { result, vegetarian };
    },
  ],
  [
    "P09",
    "Max-level EXP overflow",
    (h) => {
      reward(h, "user-demo", "max-level", 5000, 0);
      const result = reward(h, "user-demo", "overflow", 100, 0);
      const user = h.store.getUser("user-demo");
      assert.equal(user.resources.currentLevel, 10);
      assert.equal(user.resources.currentExp, 5100);
      assert.equal(user.resources.nextLevelExp, null);
      return { result, user };
    },
  ],
  [
    "P10",
    "Stars income / replay",
    (h) => {
      const first = reward(h, "user-demo", "stars", 0, 77);
      const second = reward(h, "user-demo", "stars", 0, 77);
      assert.equal(h.store.getUser("user-demo").resources.starBalance, 77);
      return { first, second };
    },
  ],
  [
    "P11",
    "Stars spending N/A with authority",
    async (h) => {
      const before = h.snapshot();
      const redemption = await h.api("POST", "/redemptions", {}),
        generic = await h.api("POST", "/admin/reward-events", {});
      assert.equal(redemption.status, 410);
      assert.equal(generic.status, 410);
      assert.deepEqual(h.snapshot(), before);
      return {
        authority:
          "No formal Stars spending domain; legacy economic writes remain 410",
        redemption,
        generic,
      };
    },
  ],
  [
    "P12",
    "Energy lock / cap / regen 120 seconds",
    (h, a, b, clock) => {
      const locked = reward(h, a.id, "energy-locked", 0, 0, 30);
      readyKnowledge(h, b.id);
      h.db
        .prepare(
          "UPDATE user_resources SET current_energy=0,energy_last_updated_at=? WHERE user_id=?",
        )
        .run(FIXED, b.id);
      clock.time("2026-08-16T03:01:59.999Z");
      const before = h.store.getUser(b.id);
      clock.time("2026-08-16T03:02:00.000Z");
      const tick = h.store.getUser(b.id);
      const repeat = h.store.getUser(b.id);
      const cap = reward(h, b.id, "energy-cap", 0, 0, 999);
      assert.equal(tick.resources.currentEnergy, 1);
      assert.equal(repeat.resources.currentEnergy, 1);
      return { locked, before, tick, repeat, cap };
    },
  ],
  [
    "P13",
    "CO2e integer grams",
    (h, a) => {
      const p = pending(h, a.id);
      const result = decide(h, p);
      assert.equal(
        h.db
          .prepare(
            "SELECT carbon_total_grams n FROM user_growth_balances WHERE user_id=?",
          )
          .get(a.id)!.n,
        800,
      );
      return result;
    },
  ],
  [
    "P14",
    "Growth conversions / remainders / multi-threshold",
    (h, a) => {
      h.db
        .prepare(
          "UPDATE user_growth_balances SET carbon_total_grams=1600,carbon_balance_grams=1600,seed_count=4,plant_count=4 WHERE user_id=?",
        )
        .run(a.id);
      const first = decide(h, pending(h, a.id, "growth-one"));
      h.db
        .prepare(
          "UPDATE user_growth_balances SET carbon_balance_grams=999200 WHERE user_id=?",
        )
        .run(a.id);
      const many = decide(
        h,
        pending(h, a.id, "growth-many"),
        "confirm",
        "decision-many",
      );
      const balance = h.db
        .prepare("SELECT * FROM user_growth_balances WHERE user_id=?")
        .get(a.id);
      assert.ok((balance!.tree_count as number) >= 10);
      return { first, many, balance };
    },
  ],
  [
    "P15",
    "Merchant calendar / category settlement",
    (h, a, b, clock) => {
      // Dates and expected base amounts are the existing finalizedStarDates tests' authority.
      const calendar: Array<[string, string, "general" | "star", number]> = [
        ["ordinary", "2026-07-15T04:00:00.000Z", "general", 0],
        ["monday", "2026-07-13T04:00:00.000Z", "general", 100],
        ["lunar-first", "2026-02-17T04:00:00.000Z", "general", 100],
        ["lunar-fifteenth", "2026-03-03T04:00:00.000Z", "general", 100],
        ["star-ordinary", "2026-07-15T04:00:00.000Z", "star", 200],
        ["star-designated", "2026-02-17T04:00:00.000Z", "star", 350],
        ["overlap", "2026-01-19T04:00:00.000Z", "star", 350],
        ["utc-sunday", "2026-07-12T16:30:00.000Z", "general", 100],
      ];
      return calendar.map(([name, time, category, expectedStars], i) => {
        clock.time(new Date(Date.parse(time) + i).toISOString());
        const p = pending(h, i % 2 ? a.id : b.id, name);
        h.db
          .prepare("UPDATE merchants SET reward_category=? WHERE id=?")
          .run(category, p.m.profile.id);
        const result = decide(h, p, "confirm", "calendar-" + name);
        const stored = h.db
          .prepare(
            "SELECT reward_payload_json FROM reward_events WHERE merchant_id=?",
          )
          .get(p.m.profile.id)!;
        assert.equal(
          JSON.parse(stored.reward_payload_json as string).stars,
          expectedStars,
        );
        return { name, time, category, result };
      });
    },
  ],
  [
    "P16",
    "Task Code pending has no reward",
    (h, a) => {
      const p = pending(h, a.id);
      assert.equal(p.submission.submission.status, "pending");
      assert.equal(count(h, "reward_events"), 0);
      return p;
    },
  ],
  [
    "P17",
    "Task Code confirmation is atomic",
    (h, a) => {
      const p = pending(h, a.id);
      const result = decide(h, p);
      assert.equal(result.submission.status, "settled");
      assert.equal(count(h, "redemptions"), 1);
      assert.equal(count(h, "reward_events"), 1);
      return result;
    },
  ],
  [
    "P18",
    "Task Code reject / replay / conflict",
    (h, a) => {
      const p = pending(h, a.id);
      const first = decide(h, p, "reject");
      const replay = decide(h, p, "reject");
      const conflict = caught(() => decide(h, p));
      assert.equal(count(h, "reward_events"), 0);
      assert.equal(conflict.status, 409);
      return { first, replay, conflict };
    },
  ],
  [
    "P19",
    "Expiry at boundary and delayed cleanup",
    (h, a, b, clock) => {
      const p = pending(h, a.id);
      clock.time("2026-08-16T03:04:59.999Z");
      const before = h.store.getTaskCodeSubmissionForUser(
        p.submission.submission.id,
        a.id,
      );
      clock.time("2026-08-16T03:05:00.000Z");
      const boundary = h.store.getTaskCodeSubmissionForUser(
        p.submission.submission.id,
        a.id,
      );
      const conflict = caught(() => decide(h, p));
      const q = pending(h, b.id, "later");
      clock.time("2026-08-16T03:20:00.000Z");
      const late = h.store.getTaskCodeSubmissionForUser(
        q.submission.submission.id,
        b.id,
      );
      assert.equal(count(h, "reward_events"), 0);
      return { before, boundary, conflict, late };
    },
  ],
  [
    "P20",
    "Idempotent confirm replay",
    (h, a) => {
      const p = pending(h, a.id);
      const first = decide(h, p);
      const replay = decide(h, p);
      assert.equal(replay.replayed, true);
      assert.equal(count(h, "reward_events"), 1);
      return { first, replay };
    },
  ],
  [
    "P21",
    "Payload conflict / cross-player key",
    (h, a, b) => {
      const first = reward(h, a.id, "conflict", 50, 10);
      const amount = caught(() => reward(h, a.id, "conflict", 51, 10));
      const player = caught(() => reward(h, b.id, "conflict", 50, 10));
      assert.equal(amount.status, 409);
      assert.equal(player.status, 409);
      return { first, amount, player };
    },
  ],
  [
    "P22",
    "Existing ledger rollback / same-key retry",
    (h, a) => {
      const before = h.snapshot();
      h.store.failNextLedgerWrite = true;
      const failure = caught(() => reward(h, a.id, "rollback", 500, 10));
      assert.equal(failure.status, 500);
      assert.deepEqual(h.snapshot(), before);
      return { failure, retry: reward(h, a.id, "rollback", 500, 10) };
    },
  ],
  [
    "P23",
    "Cross-player authorization",
    (h, a, b) => {
      const p = pending(h, a.id);
      const read = caught(() =>
        h.store.getTaskCodeSubmissionForUser(p.submission.submission.id, b.id),
      );
      const instance = h.store.completeCoreTreeMission(a.id).missionInstance;
      const claim = caught(() =>
        h.store.claimResidentMission(b.id, instance.id, "claim-other"),
      );
      assert.equal(count(h, "reward_events"), 0);
      assert.ok(read.error);
      assert.ok(claim.error);
      return { read, claim };
    },
  ],
  [
    "P24",
    "Merchant scope / overlap / wrong merchant",
    (h, a) => {
      const p = pending(h, a.id);
      const other = merchant(h, "other");
      const account = h.store.createAccount({
        displayName: "Operator",
        actorId: "admin",
        idempotencyKey: "scope-account",
      }).account;
      const membership = h.store.createMerchantOperatorMembership({
        accountId: account.accountId,
        brandId: p.m.profile.brandId,
        merchantId: p.m.profile.id,
        role: "branch_staff",
        actorId: "admin",
      });
      const overlap = caught(() =>
        h.store.createMerchantOperatorMembership({
          accountId: account.accountId,
          brandId: p.m.profile.brandId,
          role: "brand_owner",
          actorId: "admin",
        }),
      );
      const wrong = caught(() =>
        h.store.decideTaskCodeSubmission({
          submissionId: p.submission.submission.id,
          merchantId: other.profile.id,
          decision: "confirm",
          actorId: "other",
          idempotencyKey: "wrong-merchant",
        }),
      );
      assert.equal(wrong.status, 403);
      assert.ok(overlap.error);
      return { membership, overlap, wrong };
    },
  ],
  [
    "P25",
    "Four immutable tables / legal ledger update",
    (h, a) => {
      readyKnowledge(h, a.id);
      knowledge(h, a.id);
      const p = pending(h, a.id);
      decide(h, p);
      const admin = h.store.bootstrapInitialPlatformAdmin({
        displayName: "Admin",
      });
      const operator = h.store.createPlatformOperator({
        displayName: "Operator",
        role: "operations_admin",
        idempotencyKey: "operator-one",
        actorAccountId: admin.accountId,
      });
      h.store.updatePlatformOperatorRole({
        membershipId: operator.membership.membershipId,
        actorAccountId: admin.accountId,
        role: "finance_admin",
        reason: "test",
        idempotencyKey: "role-one",
      });
      h.store.updatePlatformOperatorStatus({
        membershipId: operator.membership.membershipId,
        actorAccountId: admin.accountId,
        status: "suspended",
        reason: "test",
        idempotencyKey: "status-one",
      });
      const rejected = [];
      for (const [table, column] of [
        ["knowledge_card_attempts", "id"],
        ["task_code_submission_scope_snapshots", "submission_id"],
        ["platform_operator_role_transitions", "id"],
        ["platform_operator_status_transitions", "id"],
      ]) {
        assert.ok(count(h, table));
        for (const sql of [
          `UPDATE ${table} SET ${column}=${column}`,
          `DELETE FROM ${table}`,
        ]) {
          assert.throws(() => h.db.exec(sql), /immutable/);
          rejected.push(sql);
        }
      }
      const legal = h.db
        .prepare("UPDATE resource_transactions SET metadata_json='[]'")
        .run();
      assert.ok(legal.changes);
      return { rejected, changedRows: legal.changes };
    },
  ],
  [
    "P26",
    "Historical scope and rule snapshots",
    (h, a) => {
      const p = pending(h, a.id);
      const original = h.db
        .prepare("SELECT * FROM task_code_submission_scope_snapshots")
        .all();
      h.db
        .prepare(
          "UPDATE merchant_brands SET display_name='Renamed brand' WHERE id=?",
        )
        .run(p.m.profile.brandId);
      const result = decide(h, p);
      assert.deepEqual(
        h.db
          .prepare("SELECT * FROM task_code_submission_scope_snapshots")
          .all(),
        original,
      );
      return {
        result,
        report: h.store.queryAdminLiveTaskCodeMonthlyReport({
          reportMonth: "2026-08",
        }),
      };
    },
  ],
  [
    "P27",
    "Taipei month cutoff / cross-month decision",
    (h, a, b, clock) => {
      clock.time("2026-08-31T15:59:59.999Z");
      const p = pending(h, a.id, "month-end");
      decide(h, p);
      const august = h.store.queryAdminLiveTaskCodeMonthlyReport({
        reportMonth: "2026-08",
      });
      const carry = pending(h, b.id, "carry");
      clock.time("2026-08-31T16:00:00.001Z");
      const clockValues = [
        "2026-08-31T15:59:58.000Z",
        "2026-08-31T15:59:59.999Z",
        "2026-08-31T16:00:00.001Z",
      ];
      h.setNowProvider(() => clockValues.shift() ?? "2026-08-31T16:00:00.001Z");
      const settled = decide(h, carry, "confirm", "september");
      assert.equal(settled.submission.confirmedAt, "2026-08-31T15:59:59.999Z");
      assert.equal(settled.submission.settledAt, "2026-08-31T16:00:00.001Z");
      h.setNowProvider(() => new Date().toISOString());
      const september = h.store.queryAdminLiveTaskCodeMonthlyReport({
        reportMonth: "2026-09",
      });
      const old = caught(() =>
        h.store.queryAdminLiveTaskCodeMonthlyReport({ reportMonth: "2026-08" }),
      );
      assert.equal(old.status, 409);
      return { august, settled, september, old };
    },
  ],
];
const results: any[] = [];
for (const [id, name, scenario] of cases)
  test(
    `${id} ${name}: SQLite ↔ PostgreSQL exact parity`,
    { concurrency: false },
    async (t) => {
      const clock = deterministic(t);
      let sqlite: any;
      let postgres: any;
      try {
        for (const engine of ["sqlite", "postgres"] as const) {
          clock.reset();
          const h = await harness(engine, id.toLowerCase());
          try {
            const a = h.session("resident-a"),
              b = h.session("resident-b");
            const result = plain(await scenario(h, a, b, clock));
            const value = { result, tables: h.snapshot() };
            if (engine === "sqlite") sqlite = value;
            else postgres = value;
          } finally {
            await h.close();
          }
        }
        assert.deepEqual(postgres, sqlite);
        results.push({
          id,
          name,
          status: id === "P11" ? "N/A WITH AUTHORITY — PASS" : "PASS",
          comparison:
            "Exact API/Store result and all 35 application table rows; only JSON wire serialization and relational row order normalized",
          sha256: createHash("sha256")
            .update(JSON.stringify(sqlite))
            .digest("hex"),
          rowCounts: Object.fromEntries(
            Object.entries(sqlite.tables).map(([key, value]: any) => [
              key,
              value.length,
            ]),
          ),
        });
      } catch (error: any) {
        results.push({
          id,
          name,
          status: "FAIL",
          message: error.message.slice(0, 2000),
        });
        throw error;
      } finally {
        clock.restore();
        writeFileSync(
          new URL(
            "../../../docs/migrations/W1B_PARITY_RESULTS.json",
            import.meta.url,
          ),
          JSON.stringify(
            {
              suite:
                "Shared business scenarios on real SQLite and PostgreSQL 17",
              results,
            },
            null,
            2,
          ) + "\n",
        );
      }
    },
  );
