import assert from "node:assert/strict";
import test from "node:test";
import type { Mission } from "@looper/types";
import { buildApp } from "./app.js";
import { AsyncMissionReadStore } from "./persistence/async-mission-read-store.js";
import type { AsyncDatabase } from "./persistence/async-contract.js";
import { InMemoryStore } from "./store.js";

const expectedMission: Mission = {
  id: "mission-read-only",
  merchantId: "merchant-read-only",
  title: "Read-only mission",
  description: "Async catalogue contract",
  starReward: 350,
  energyReward: 30,
  expReward: 200,
  carbonGrams: 800,
};

function databaseWithRows(): AsyncDatabase & { queries: string[]; writes: number } {
  const state = { queries: [] as string[], writes: 0 };
  return {
    queries: state.queries,
    get writes() { return state.writes; },
    async query<Row extends Record<string, unknown> = Record<string, unknown>>(sql: string) {
      state.queries.push(sql);
      return {
        rows: [{
          id: expectedMission.id,
          merchant_id: expectedMission.merchantId,
          title: expectedMission.title,
          description: expectedMission.description,
          reward_star_amount: expectedMission.starReward,
          value_json: JSON.stringify({
            vegetarianCarbonGrams: expectedMission.carbonGrams,
            redemptionEnergy: expectedMission.energyReward,
            redemptionExp: expectedMission.expReward,
          }),
        }],
        rowCount: 1,
      } as unknown as { rows: Row[]; rowCount: number };
    },
    async execute() { state.writes += 1; throw new Error("async mission read attempted a write"); },
    async withTransaction() { state.writes += 1; throw new Error("async mission read attempted a transaction"); },
    async health() { return { ok: true, latencyMs: 0, pool: { total: 0, idle: 0, waiting: 0 } }; },
    async drain() {},
  };
}

test("AsyncMissionReadStore maps the canonical mission contract with SELECT only", async () => {
  const database = databaseWithRows();
  const result = await new AsyncMissionReadStore(database).listMissions();
  assert.deepEqual(result, [expectedMission]);
  assert.equal(database.writes, 0);
  assert.match(database.queries[0], /^\s*SELECT/i);
  assert.doesNotMatch(database.queries[0], /\b(INSERT|UPDATE|DELETE|UPSERT)\b/i);
});

test("GET /missions can use the async read-only Store slice without changing its response contract", async (t) => {
  const database = databaseWithRows();
  const readStore = new AsyncMissionReadStore(database);
  const store = new InMemoryStore(":memory:");
  const app = await buildApp(store, { asyncMissionReadStore: readStore });
  t.after(async () => { await app.close(); store.close(); });

  const response = await app.inject({ method: "GET", url: "/missions" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), [expectedMission]);
  assert.equal(database.writes, 0);
});
