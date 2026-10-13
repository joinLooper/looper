import { createHash, randomUUID } from "node:crypto";
import type { UserProgress } from "@looper/types";
import { InMemoryStore } from "../store.js";
import { buildRewardSummary, nextLevelExp } from "../economy.js";
import { calculateEnergyRegeneration } from "../energy-regeneration.js";
import { UnknownCommitOutcomeError, type AsyncDatabase, type AsyncQueryOptions, type AsyncTransaction } from "./async-contract.js";
import { safeInteger } from "./bigint-codec.mjs";

type Row = Record<string, unknown>;
const str = (value: unknown) => String(value ?? "");
const num = (value: unknown) => safeInteger(value ?? 0);
const json = <T>(value: unknown, fallback: T): T => typeof value === "string" ? JSON.parse(value) as T : fallback;
const nowIso = () => new Date().toISOString();
const missing = (message: string) => Object.assign(new Error(message), { statusCode: 404 });
const authoritySql = "SELECT current_database() AS database, current_schema() AS schema, inet_server_port() AS port, host(inet_server_addr()) AS address";

/** Reuse the existing settings/level validation on immutable rows already read
 * through the pinned async connection. This view cannot issue SQL or writes. */
function configuration(settings: Row | undefined, levels: Row[]) {
  const view = new InMemoryStore(undefined, { database: {
    prepare(sql) {
      const economy = sql === "SELECT value_json, version, updated_at, updated_by FROM economy_settings WHERE key = 'core'";
      const level = sql === "SELECT level, required_total_exp, reward_stars, max_energy_increase, unlock_flags_json FROM level_definitions ORDER BY level";
      if (!economy && !level) throw new Error("Unsupported configuration snapshot read");
      return { get: () => economy ? settings : levels[0], all: () => economy ? (settings ? [settings] : []) : levels,
        run: () => { throw new Error("Configuration snapshot is immutable"); } };
    },
    exec() { throw new Error("Configuration snapshot is immutable"); }, close() {},
  } });
  return view;
}

export class PlayerStateUnknownOutcomeError extends UnknownCommitOutcomeError {
  constructor(readonly operationId: string, cause: unknown) { super(cause); }
}

/** Caller owns the database/pool and drains it after the HTTP server closes. */
export class AsyncPlayerStateRepository {
  constructor(private readonly database: AsyncDatabase) {}

  async assertStoreAuthority(store: InMemoryStore): Promise<void> {
    // Fail before enabling the route if SQLite or a different PG schema would
    // remain the login/write authority. Never create an implicit SQLite Store.
    let sync: Row | undefined;
    try { sync = store.db.prepare(authoritySql).get(); }
    catch { throw new Error("Async player state requires the same PostgreSQL Store authority"); }
    const async = (await this.database.query(authoritySql)).rows[0];
    if (!sync || !async || ["database", "schema", "port", "address"].some(key => str(sync![key]) !== str(async[key]))) {
      throw new Error("Async player state and Store database authority differ");
    }
  }

  async getPlayerState(token: string, options: AsyncQueryOptions = {}): Promise<UserProgress | null> {
    if (!/^[A-Za-z0-9_-]{43,}$/.test(token)) return null;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    let sourceId: string | undefined;
    try {
      return await this.database.withTransaction(async tx => {
        // The writer lock has already been acquired: identity/status/expiry
        // are resolved afresh after any pool or writer-lock wait.
        const session = (await tx.query(`SELECT session.id AS session_id, session.account_id, session.expires_at, session.revoked_at,
          account.status AS account_status, resident.id AS user_id
          FROM account_sessions session JOIN accounts account ON account.id=session.account_id
          JOIN users resident ON resident.account_id=account.id
          WHERE session.token_hash=$1 AND session.purpose='player'`, [tokenHash])).rows[0];
        const now = nowIso();
        if (!session || session.account_status !== "active" || session.revoked_at || str(session.expires_at) <= now) return null;
        await tx.execute("UPDATE account_sessions SET last_used_at=$1, updated_at=$2 WHERE id=$3", [now, now, str(session.session_id)]);
        const userId = str(session.user_id);
        const row = (await tx.query("SELECT * FROM user_resources WHERE user_id=$1", [userId])).rows[0];
        const settings = (await tx.query("SELECT value_json, version, updated_at, updated_by FROM economy_settings WHERE key='core'")).rows[0];
        const config = configuration(settings, []);
        if (row) {
          const currentEnergy = num(row.current_energy), maxEnergy = num(row.max_energy);
          if (maxEnergy > 0) {
            const interval = config.economySettings.energyRegenIntervalSeconds;
            if (interval > 0) {
              const lastUpdated = new Date(str(row.energy_last_updated_at)).getTime();
              const nowMs = Date.now();
              const regen = calculateEnergyRegeneration({ currentEnergy, maxEnergy, interval, lastUpdated, nowMs });
              if (regen) {
                const { nextLast, recovered, nextEnergy, ticks, atCap } = regen;
                const createdAt = nowIso();
                if (atCap) {
                  await tx.execute("UPDATE user_resources SET energy_regen_interval_seconds=$1, energy_last_updated_at=$2, updated_at=$3 WHERE user_id=$4", [interval, nextLast, createdAt, userId]);
                } else {
                  await tx.execute("UPDATE user_resources SET current_energy=$1, energy_regen_interval_seconds=$2, energy_last_updated_at=$3, updated_at=$4 WHERE user_id=$5", [nextEnergy, interval, nextLast, createdAt, userId]);
                  sourceId = `energy-regen-${randomUUID()}`;
                  await tx.execute(`INSERT INTO resource_transactions
                    (id,user_id,resource_type,amount,balance_before,balance_after,transaction_kind,conversion_id,conversion_type,source_type,source_id,idempotency_key,created_at,metadata_json)
                    VALUES ($1,$2,'energy',$3,$4,$5,'grant','','none','daily_login',$6,$6,$7,$8)`,
                  [`resource-transaction-${randomUUID()}`, userId, recovered, currentEnergy, nextEnergy, sourceId, createdAt, JSON.stringify({ lazyRegeneration: true, ticks })]);
                  await tx.execute(`INSERT INTO energy_logs
                    (id,user_id,event_type,amount,energy_before,energy_after,overflow_before,overflow_after,source_type,source_id,created_at)
                    VALUES ($1,$2,'natural_regen',$3,$4,$5,$6,$6,'daily_login',$7,$8)`,
                  [`energy-log-${randomUUID()}`, userId, recovered, currentEnergy, nextEnergy, num(row.energy_overflow_pending), sourceId, createdAt]);
                  await tx.execute(`INSERT INTO audit_events (id,actor_role,actor_id,action,entity_type,entity_id,created_at,metadata_json)
                    VALUES ($1,'user',$2,'resource.energy_regenerated','resource_transaction',$3,$4,$5)`,
                  [`audit-${randomUUID()}`, userId, sourceId, nowIso(), JSON.stringify({ recovered })]);
                }
              }
            }
          }
        }
        return this.snapshot(tx, userId, settings);
      }, options);
    } catch (error) {
      if (error instanceof UnknownCommitOutcomeError) {
        // The generated regeneration source is queryable in all three ledgers.
        // No replay is attempted. Session-only attempts remain indeterminate.
        throw new PlayerStateUnknownOutcomeError(sourceId ?? `player-state-${randomUUID()}`, error);
      }
      throw error;
    }
  }

  private async snapshot(tx: AsyncTransaction, userId: string, settings: Row | undefined): Promise<UserProgress> {
    const user = (await tx.query("SELECT * FROM users WHERE id=$1", [userId])).rows[0];
    if (!user) throw missing("找不到使用者");
    const r = (await tx.query("SELECT * FROM user_resources WHERE user_id=$1", [userId])).rows[0];
    if (!r) throw missing("找不到使用者資源");
    const levels = (await tx.query("SELECT level, required_total_exp, reward_stars, max_energy_increase, unlock_flags_json FROM level_definitions ORDER BY level")).rows;
    // The sync bridge decodes bigint to safe JS numbers; match that boundary.
    const decoded = levels.map(l => ({ ...l, level: num(l.level), required_total_exp: num(l.required_total_exp), reward_stars: num(l.reward_stars), max_energy_increase: num(l.max_energy_increase) }));
    const config = configuration(settings, decoded);
    const nextExp = nextLevelExp(num(r.current_level), config.levelDefinitions);
    const resources = { starBalance: num(r.star_balance), currentEnergy: num(r.current_energy), maxEnergy: num(r.max_energy),
      energyRegenIntervalSeconds: config.economySettings.energyRegenIntervalSeconds, energyLastUpdatedAt: str(r.energy_last_updated_at),
      energyOverflowPending: num(r.energy_overflow_pending), currentExp: num(r.current_exp), currentLevel: num(r.current_level),
      nextLevelExp: nextExp, isMaxLevel: nextExp === null, unlockFlags: json<string[]>(r.unlock_flags_json, []) };
    const g = (await tx.query("SELECT * FROM user_growth_balances WHERE user_id=$1", [userId])).rows[0];
    if (!g) throw missing("找不到使用者成長資料");
    const growth = { carbonTotalGrams: num(g.carbon_total_grams), carbonBalanceGrams: num(g.carbon_balance_grams), seedCount: num(g.seed_count),
      plantCount: num(g.plant_count), treeCount: num(g.tree_count), version: num(g.version), updatedAt: str(g.updated_at) };
    const enrollments = (await tx.query("SELECT * FROM mission_enrollments WHERE user_id=$1 ORDER BY accepted_at", [userId])).rows.map(e => ({
      userId: str(e.user_id), missionId: str(e.mission_id), status: str(e.status) as UserProgress["enrollments"][number]["status"],
      acceptedAt: str(e.accepted_at), completedAt: e.completed_at ? str(e.completed_at) : undefined,
    }));
    const event = (await tx.query("SELECT * FROM reward_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1", [userId])).rows[0];
    type Reward = NonNullable<UserProgress["latestRewardEvent"]>;
    const latestRewardEvent: Reward | undefined = event ? {
      id: str(event.id), userId: str(event.user_id), sourceType: str(event.source_type) as Reward["sourceType"], sourceId: str(event.source_id),
      merchantId: event.merchant_id ? str(event.merchant_id) : undefined, missionId: event.mission_id ? str(event.mission_id) : undefined,
      idempotencyKey: str(event.idempotency_key), rewardPayload: json(event.reward_payload_json, buildRewardSummary(0, 0, 0, 0, 0)),
      growthSummary: json(event.growth_summary_json, { generatedSeeds: 0, generatedPlants: 0, generatedTrees: 0, seedCount: 0, plantCount: 0, treeCount: 0, carbonTotalGrams: 0, carbonBalanceGrams: 0 }),
      levelSummary: json(event.level_summary_json, { previousLevel: 1, currentLevel: 1, levelsGained: 0, rewards: [] }),
      ruleVersion: event.rule_version ? str(event.rule_version) : undefined,
      ruleSnapshot: event.rule_snapshot_json ? json<Reward["ruleSnapshot"]>(event.rule_snapshot_json, undefined) : undefined,
      createdAt: str(event.created_at),
    } : undefined;
    return { id: str(user.id), displayName: str(user.display_name), stars: resources.starBalance, energy: resources.currentEnergy, resources, growth, enrollments, latestRewardEvent };
  }
}

export type AsyncPlayerStateRepositoryLike = Pick<AsyncPlayerStateRepository, "getPlayerState" | "assertStoreAuthority">;
