import assert from "node:assert/strict";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { writeFileSync } from "node:fs";
import {
  harness,
  deterministic,
  credentials,
  reward,
  pending,
  answer,
  cardId,
  FIXED,
  type Harness,
} from "./fixtures.js";
const results: any[] = [];
function operator(h: Harness, p: any) {
  const account = h.store.createAccount({
    displayName: "Race operator",
    actorId: "test-admin",
    idempotencyKey: "op-" + p.m.profile.id,
  }).account;
  h.store.createMerchantOperatorMembership({
    accountId: account.accountId,
    brandId: p.m.profile.brandId,
    merchantId: p.m.profile.id,
    role: "branch_staff",
    actorId: "test-admin",
  });
  const invitation = h.store.createAccountInvitation({
    accountId: account.accountId,
    actorId: "test-admin",
    idempotencyKey: "inv-" + p.m.profile.id,
    merchantAppBaseUrl: "https://merchant.test",
  });
  const auth = h.store.redeemAccountInvitation({
    token: invitation.invitationToken!,
    origin: "https://merchant.test",
    merchantAppUrl: "https://merchant.test",
    production: false,
  });
  return `looper_session=${auth.sessionToken}`;
}
function confirmation(h: Harness, p: any, key: string) {
  return {
    method: "POST",
    url: `/merchant/task-code-submissions/${p.submission.submission.id}/decision`,
    payload: {
      merchantId: p.m.profile.id,
      decision: "confirm",
      idempotencyKey: key,
    },
    headers: { cookie: operator(h, p), origin: "https://merchant.test" },
  };
}
async function concurrent(h: Harness, schema: string, requests: any[]) {
  const gate = new SharedArrayBuffer(4);
  const workers: Worker[] = [];
  const ready: Promise<any>[] = [];
  const done: Promise<any>[] = [];
  for (const request of requests) {
    let readyResolve: any, readyReject: any, doneResolve: any, doneReject: any;
    ready.push(
      new Promise((a, b) => {
        readyResolve = a;
        readyReject = b;
      }),
    );
    done.push(
      new Promise((a, b) => {
        doneResolve = a;
        doneReject = b;
      }),
    );
    const worker = new Worker(
      new URL("./concurrent-worker.mjs", import.meta.url),
      {
        workerData: {
          credentials: credentials(),
          schema,
          gate,
          request,
          now: FIXED,
        },
      },
    );
    workers.push(worker);
    worker.on("message", (message) => {
      if (message.error) {
        readyReject(Error(message.error));
        doneReject(Error(message.error));
      } else if (message.ready) readyResolve(message);
      else doneResolve(message);
    });
    worker.on("error", (error) => {
      readyReject(error);
      doneReject(error);
    });
  }
  let locked = false;
  try {
    const clients = await Promise.all(ready);
    assert.equal(new Set(clients.map((x) => x.pid)).size, 2);
    h.db.exec("BEGIN IMMEDIATE");
    locked = true;
    Atomics.store(new Int32Array(gate), 0, 1);
    Atomics.notify(new Int32Array(gate), 0, 2);
    let waiting = 0;
    for (let attempt = 0; attempt < 150; attempt++) {
      waiting = h.db
        .prepare(
          "SELECT count(*) n FROM pg_stat_activity WHERE pid IN (?,?) AND wait_event='advisory'",
        )
        .get(clients[0].pid, clients[1].pid)!.n as number;
      if (waiting === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(
      waiting,
      2,
      "Both independent PG connections must concurrently wait on the same writer lock",
    );
    h.db.exec("COMMIT");
    locked = false;
    const responses = await Promise.all(done);
    return {
      clients,
      simultaneousWriterWaiters: waiting,
      responses: responses.map((x) => x.result),
    };
  } finally {
    if (locked) h.db.exec("ROLLBACK");
    for (const worker of workers) await worker.terminate();
  }
}
for (const kind of ["knowledge", "confirm", "claim", "different_players"])
  test(
    `Real concurrent API requests: ${kind}`,
    { concurrency: false },
    async (t) => {
      const clock = deterministic(t),
        h = await harness("postgres", "race_" + kind);
      try {
        const a = h.session("race-a"),
          b = h.session("race-b");
        let requests: any[] = [];
        if (kind === "knowledge") {
          reward(h, a.id, "unlock", 150, 0);
          const request = {
            method: "POST",
            url: `/player/knowledge-cards/${cardId}/answers`,
            payload: answer,
            headers: { cookie: a.cookie, origin: "https://player.test" },
          };
          requests = [request, request];
        }
        if (kind === "claim") {
          const completed = h.store.completeCoreTreeMission(a.id);
          const request = {
            method: "POST",
            url: `/player/missions/instances/${completed.missionInstance.id}/claim`,
            payload: { idempotencyKey: "race-claim" },
            headers: { cookie: a.cookie, origin: "https://player.test" },
          };
          requests = [request, request];
        }
        if (kind === "confirm") {
          const p = pending(h, a.id);
          const request = confirmation(h, p, "race-confirm");
          requests = [request, request];
        }
        if (kind === "different_players") {
          requests = [
            confirmation(h, pending(h, a.id, "a"), "confirm-a"),
            confirmation(h, pending(h, b.id, "b"), "confirm-b"),
          ];
        }
        const before = h.snapshot();
        const result = await concurrent(h, "w1b_race_" + kind, requests);
        for (const response of result.responses)
          assert.ok(
            [200, 201].includes(response.status),
            JSON.stringify(response),
          );
        const after = h.snapshot(),
          expectedRewards = kind === "different_players" ? 2 : 1;
        assert.equal(
          after.reward_events.length - before.reward_events.length,
          expectedRewards,
        );
        for (const table of ["reward_events", "resource_transactions"]) {
          const keys = after[table].map((r: any) =>
            table === "reward_events"
              ? r.idempotency_key
              : JSON.stringify([
                  r.user_id,
                  r.resource_type,
                  r.source_type,
                  r.source_id,
                  r.transaction_kind,
                  r.conversion_id,
                  r.conversion_type,
                ]),
          );
          assert.equal(new Set(keys).size, keys.length, table + " unique keys");
        }
        assert.equal(
          after.resource_transactions.length -
            before.resource_transactions.length,
          (
            { knowledge: 3, claim: 2, confirm: 7, different_players: 14 } as any
          )[kind],
        );
        const queue = after.player_event_queue
          .map((r: any) => r.queue_order)
          .sort((a: number, b: number) => a - b);
        assert.equal(new Set(queue).size, queue.length);
        for (let i = 1; i < queue.length; i++)
          assert.equal(queue[i], queue[i - 1] + 1);
        if (kind === "knowledge") {
          assert.equal(after.knowledge_card_attempts.length, 1);
          assert.equal(h.store.getUser(a.id).resources.currentExp, 200);
        }
        if (kind === "claim") {
          assert.equal(h.store.getUser(a.id).resources.starBalance, 10);
          assert.equal(h.store.getUser(a.id).resources.currentExp, 0);
          assert.equal(after.resident_mission_claim_requests.length, 1);
        }
        if (kind === "confirm" || kind === "different_players") {
          assert.equal(after.redemptions.length, expectedRewards);
          assert.equal(
            after.task_code_submissions.filter(
              (r: any) =>
                r.status === "settled" && r.reward_event_id && r.redemption_id,
            ).length,
            expectedRewards,
          );
          assert.equal(h.store.getUser(a.id).resources.currentExp, 200);
          if (kind === "different_players")
            assert.equal(h.store.getUser(b.id).resources.currentExp, 200);
        }
        if (kind === "knowledge" || kind === "claim")
          assert.equal(
            result.responses.filter((x) => x.body.replayed).length,
            1,
          );
        if (kind === "confirm")
          assert.deepEqual(
            result.responses[0],
            result.responses[1],
            "Merchant API intentionally returns the same settled body for replay",
          );
        results.push({
          kind,
          status: "PASS",
          ...result,
          rewardDelta: expectedRewards,
          queueOrder: queue,
          checks: [
            "real independent concurrent API requests",
            "both connections observed waiting on same transaction writer lock",
            "no duplicate reward/EXP/ledger",
            "no lost update",
            "atomic settlement links",
            "stable queue order",
            "idempotent replay",
          ],
        });
      } catch (e: any) {
        results.push({ kind, status: "FAIL", error: e.message });
        throw e;
      } finally {
        await h.close();
        clock.restore();
        writeFileSync(
          new URL(
            "../../../docs/migrations/W1B_CONCURRENCY_RESULTS.json",
            import.meta.url,
          ),
          JSON.stringify({ results }, null, 2) + "\n",
        );
      }
    },
  );
