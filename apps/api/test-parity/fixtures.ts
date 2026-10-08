import assert from "node:assert/strict";
import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { buildApp } from "../src/app.js";
import {
  configureDatabase,
  migrateDatabase,
  seedDatabase,
} from "../src/database.js";
import { InMemoryStore } from "../src/store.js";
import { PostgresDatabase } from "../src/persistence/postgres.js";
import { bootstrapPostgres } from "../src/persistence/postgres-bootstrap.js";
import type { PersistenceDatabase } from "../src/persistence/contract.js";
export const FIXED = "2026-08-16T03:00:00.000Z";
export const inventory = JSON.parse(
  readFileSync(
    new URL(
      "../../../docs/migrations/W1A_SCHEMA_INVENTORY.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
export const credentials = () =>
  JSON.parse(
    readFileSync(
      new URL("../../../.runtime/postgres17/credentials.json", import.meta.url),
      "utf8",
    ).replace(/^\uFEFF/, ""),
  );
export const plain = (value: any) => JSON.parse(JSON.stringify(value));
export function deterministic(t: any) {
  let counter = 0;
  t.mock.method(
    crypto,
    "randomUUID",
    () =>
      `00000000-0000-4000-8000-${(++counter).toString(16).padStart(12, "0")}`,
  );
  t.mock.method(crypto, "randomBytes", (size: number) => {
    const bytes = Buffer.alloc(size);
    bytes.writeUInt32BE(++counter, size - 4);
    return bytes;
  });
  syncBuiltinESMExports();
  t.mock.timers.enable({ apis: ["Date"], now: new Date(FIXED) });
  return {
    reset() {
      counter = 0;
      t.mock.timers.setTime(Date.parse(FIXED));
    },
    time(value: string) {
      t.mock.timers.setTime(Date.parse(value));
    },
    restore() {
      t.mock.restoreAll();
      t.mock.timers.reset();
      syncBuiltinESMExports();
    },
  };
}
export class FailureDatabase implements PersistenceDatabase {
  point: string | null = null;
  fired = false;
  constructor(readonly inner: PersistenceDatabase) {}
  exec(sql: string) {
    this.inner.exec(sql);
  }
  close() {
    this.inner.close();
  }
  prepare(sql: string) {
    const statement = this.inner.prepare(sql);
    return {
      all: statement.all.bind(statement),
      get: statement.get.bind(statement),
      run: (...values: any[]) => {
        const before =
          (this.point === "before_audit" &&
            /^INSERT INTO audit_events/i.test(sql) &&
            values[3] === "redemption.created") ||
          (this.point === "before_settlement_link" &&
            /^UPDATE task_code_submissions\s+SET status = 'settled'/i.test(
              sql,
            ));
        if (before) {
          this.point = null;
          this.fired = true;
          throw Error("W1B injected failure");
        }
        const result = statement.run(...values);
        const after =
          (this.point === "after_reward_insert" &&
            /^INSERT INTO reward_events/i.test(sql)) ||
          (this.point === "after_resources_update" &&
            /^UPDATE user_resources/i.test(sql)) ||
          (this.point === "during_growth" &&
            /^INSERT INTO plant_growth_logs/i.test(sql));
        if (after) {
          this.point = null;
          this.fired = true;
          throw Error("W1B injected failure");
        }
        return result;
      },
    };
  }
}
export async function harness(engine: "sqlite" | "postgres", name: string) {
  let inner: PersistenceDatabase;
  if (engine === "sqlite") {
    const sqlite = new DatabaseSync(":memory:");
    configureDatabase(sqlite);
    migrateDatabase(sqlite);
    inner = sqlite;
  } else {
    const postgres = new PostgresDatabase(credentials(), `w1b_${name}`);
    try {
      bootstrapPostgres(postgres, `w1b_${name}`, true);
    } catch (e) {
      postgres.close();
      throw e;
    }
    inner = postgres;
  }
  // Explicit test fixtures only: connection/bootstrap never creates demo accounts.
  seedDatabase(inner);
  inner
    .prepare("UPDATE schema_migrations SET applied_at=?")
    .run("2026-08-16 03:00:00");
  const db = new FailureDatabase(inner);
  let nowProvider = () => new Date().toISOString();
  const store = new InMemoryStore(undefined, {
    database: db,
    now: () => nowProvider(),
    taskCodeSecret: "w1b-test-only-secret",
  });
  const app = await buildApp(store, {
    playerAppUrl: "https://player.test",
    merchantAppUrl: "https://merchant.test",
    adminAppUrl: "https://admin.test",
    playerIdentityVerifier: {
      async verifyIdToken(token: string) {
        if (token === "invalid")
          throw Object.assign(Error("invalid test identity"), {
            statusCode: 401,
          });
        return { provider: "line", providerSubject: token, displayName: token };
      },
    },
  });
  await app.ready();
  return {
    engine,
    db,
    store,
    app,
    setNowProvider(provider: () => string) {
      nowProvider = provider;
    },
    session(subject: string) {
      const auth = store.createPlayerSession(
        { provider: "line", providerSubject: subject, displayName: subject },
        604800,
      );
      return {
        auth,
        id: auth.context.userId,
        cookie: `looper_player_session=${auth.sessionToken}`,
      };
    },
    async api(method: any, url: string, payload?: any, cookie?: string) {
      const r = await app.inject({
        method,
        url,
        payload,
        headers: {
          origin: "https://player.test",
          ...(cookie ? { cookie } : {}),
        },
      });
      return { status: r.statusCode, body: r.json() };
    },
    snapshot() {
      return Object.fromEntries(
        inventory.tables.map((table: any) => [
          table.name,
          plain(db.prepare(`SELECT * FROM ${table.name}`).all()).sort(
            (a: any, b: any) =>
              JSON.stringify(a).localeCompare(JSON.stringify(b), "en"),
          ),
        ]),
      );
    },
    async close() {
      await app.close();
      store.close();
    },
  };
}
export type Harness = Awaited<ReturnType<typeof harness>>;
export const caught = (fn: () => unknown) => {
  try {
    return { result: plain(fn()) };
  } catch (e: any) {
    return { error: e.message, status: e.statusCode ?? 500 };
  }
};
export function reward(
  h: Harness,
  userId: string,
  suffix: string,
  exp = 50,
  stars = 10,
  energy = 0,
) {
  return h.store.settleActivityReward({
    userId,
    sourceType: "task_completion",
    sourceId: `source-${suffix}`,
    idempotencyKey: `reward-${suffix}`,
    exp,
    stars,
    energy,
  });
}
export function merchant(h: Harness, suffix = "one") {
  const application = h.store.submitMerchantApplication({
    storeName: `Merchant ${suffix}`,
    contactName: "Test",
    contactLineId: `test-${suffix}`,
    phone: "0912345678",
    email: `${suffix}@example.test`,
    address: "Test address",
    storeCategory: "餐廳",
    otherStoreCategory: "",
    vegetarianOffering: ["火鍋"],
    otherMealType: "",
    businessHours: (
      [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ] as const
    ).map((day) => ({
      day,
      closed: false,
      periods: [{ start: "11:00", end: "20:00" }],
    })),
  });
  const reviewed = h.store.reviewMerchantApplication(
    application.id,
    "approve",
    "test-admin",
  );
  const profile = h.store.getMerchant(reviewed.merchantId!);
  const mission = h.store.missions.find((m) => m.merchantId === profile.id)!;
  assert.ok(mission);
  return { profile, mission };
}
export function pending(h: Harness, userId: string, suffix = "one") {
  const m = merchant(h, suffix);
  const window = h.store.getCurrentTaskCode(m.profile.id);
  const submission = h.store.submitTaskCode({
    userId,
    missionId: m.mission.id,
    merchantId: m.profile.id,
    code: window.code,
    idempotencyKey: `submit-${suffix}`,
  });
  return { m, window, submission };
}
export function decide(
  h: Harness,
  p: ReturnType<typeof pending>,
  decision: "confirm" | "reject" = "confirm",
  key = "decision",
) {
  return h.store.decideTaskCodeSubmission({
    submissionId: p.submission.submission.id,
    merchantId: p.m.profile.id,
    decision,
    actorId: "test-merchant",
    idempotencyKey: key,
  });
}
export const answer = {
  cardVersion: "v1",
  selectedOptionId: "reusable-container",
  idempotencyKey: "knowledge-one",
};
export const cardId = "sustainable-takeaway-container-v1";
