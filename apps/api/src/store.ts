import type {
  Account,
  AccountCreateInput,
  AccountCreateResult,
  AccountQuery,
  AccountStatus,
  AdminOverview,
  AuditEvent,
  BusinessDayHours,
  CurrentTaskCodeWindow,
  EconomySettings,
  EconomySettingsRecord,
  EconomySettingsUpdateInput,
  EconomySettingsUpdateResult,
  GrowthSummary,
  LevelDefinition,
  LevelSummary,
  MerchantApplication,
  MerchantApplicationInput,
  MerchantBranchCreateInput,
  MerchantBranchCreateResult,
  MerchantTaskCodeSubmission,
  MerchantPlan,
  MerchantProfile,
  MerchantRewardCategory,
  Mission,
  PlayerEventNextResult,
  PlayerEventQueueItem,
  PlayerEventResolutionOutcome,
  PlayerEventResolveResult,
  MissionEnrollment,
  PlantGrowthLog,
  ResourceConversionType,
  Redemption,
  ResourceTransaction,
  ResourceTransactionKind,
  RewardEvent,
  RewardSourceType,
  RewardSummary,
  SettlementResult,
  SettlementRuleSnapshot,
  TaskCodeSubmissionDecision,
  TaskCodeSubmissionPlayerResult,
  TaskCodeSubmission,
  TaskCodeWindow,
  UserGrowthBalance,
  UserProgress,
  UserResources,
} from "@looper/types";
import { WEEKDAYS } from "@looper/types";
import { FINALIZED_SETTLEMENT_RULE_VERSION, applyLevelProgress, buildRewardSummary, calculateMerchantStarReward, currentLevelRequiredExp, getMaxEnergyForLevel, nextLevelExp } from "./economy.js";
import { openDatabase } from "./database.js";

import type { DatabaseSync } from "node:sqlite";
import { createHmac, randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type RewardRequestInput = {
  userId: string;
  sourceType: RewardSourceType;
  sourceId: string;
  logicalSourceId?: string;
  idempotencyKey: string;
  merchantId?: string;
  missionId?: string;
  stars: number;
  energy: number;
  exp: number;
  carbonGrams: number;
  settlementRule?: SettlementRuleContext;
};
type SettlementRuleContext = {
  ruleVersion: string;
  occurredAt: string;
  merchantTimezone: string;
  merchantLocalDate: string;
  merchantRewardCategory: MerchantRewardCategory;
  isMonday: boolean;
  lunarDay: number;
  isDesignatedDate: boolean;
};
type SettlementWithEventId = SettlementResult & { rewardEventId: string };
type GrowthFailurePoint =
  | "after_carbon_grant"
  | "after_carbon_debit"
  | "after_seed_credit"
  | "after_seed_debit"
  | "after_plant_credit"
  | "after_plant_debit"
  | "after_tree_credit"
  | "before_growth_balance_update"
  | "after_growth_balance_update";
type GrowthLogStep = {
  eventType: PlantGrowthLog["eventType"];
  conversionId: string;
  quantity: number;
  beforeCount: number;
  afterCount: number;
};
type LevelFailurePoint =
  | "after_first_level_log"
  | "after_level_reward_star_ledger"
  | "after_user_resources_update";
type EnergyLogEventType = "natural_regen" | "reward" | "level_up_refill";
type StoreOptions = {
  taskCodeSecret?: string;
};
type CreateTaskCodeWindowInput = {
  merchantId: string;
  codeLength: 4 | 6;
  validFrom: string;
  validUntil: string;
};
type CreateTaskCodeSubmissionInput = {
  taskCodeWindowId: string;
  merchantId: string;
  missionId: string;
  userId: string;
  idempotencyKey: string;
};
type SubmitTaskCodeInput = {
  userId: string;
  missionId: string;
  merchantId: string;
  code: string;
  idempotencyKey: string;
};
type TaskCodeSubmissionResult = {
  submission: TaskCodeSubmission;
  replayed: boolean;
  settlement?: SettlementResult;
};
type DecideTaskCodeSubmissionInput = {
  submissionId: string;
  merchantId: string;
  decision: TaskCodeSubmissionDecision;
  actorId: string;
  idempotencyKey: string;
};
type ResolvePlayerEventInput = {
  eventId: string;
  userId: string;
  outcome: PlayerEventResolutionOutcome;
  idempotencyKey: string;
};

const FIRST_MEAL_HOME_SCENE_ID = "forest_clearing";
const FIRST_MEAL_HOME_EVENT_NAME = "first_meal_lv3_arrival";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  return JSON.parse(value) as T;
}

function requireString(value: unknown): string {
  return String(value ?? "");
}

function requireNumber(value: unknown): number {
  return Number(value ?? 0);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonicalRewardRequest(input: RewardRequestInput): string {
  return stableStringify({
    userId: input.userId,
    sourceType: input.sourceType,
    sourceId: input.logicalSourceId ?? input.sourceId,
    merchantId: input.merchantId ?? null,
    missionId: input.missionId ?? null,
    rewardPayload: {
      stars: input.stars,
      energy: input.energy,
      exp: input.exp,
      carbonGrams: input.carbonGrams,
    },
  });
}

const taskCodeWindowMs = 2 * 60 * 60 * 1000;
const taskCodeConfirmationMs = 5 * 60 * 1000;
const defaultTaskCodeSecret = "looper-local-dev-task-code-secret";

function taskCodeSettlementIdempotencyKey(submissionId: string): string {
  return `task-code-submission:${submissionId}`;
}

function deriveTaskCode(secret: string, windowId: string, merchantId: string, codeLength: 4 | 6): string {
  const digest = createHmac("sha256", secret).update(`${windowId}:${merchantId}:${codeLength}`).digest("hex");
  const value = Number.parseInt(digest.slice(0, 12), 16);
  return String(value % (10 ** codeLength)).padStart(codeLength, "0");
}

function hashTaskCode(secret: string, windowId: string, merchantId: string, codeLength: 4 | 6, code: string): string {
  return createHmac("sha256", secret).update(`${windowId}:${merchantId}:${codeLength}:${code}`).digest("hex");
}

function parseTaskCodeLength(code: string): 4 | 6 {
  if (!/^\d{4}(\d{2})?$/.test(code)) throw requestError("任務碼格式錯誤");
  return code.length as 4 | 6;
}

function isSqliteConstraintError(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  return code === "ERR_SQLITE_CONSTRAINT" || String((error as Error).message ?? "").includes("constraint failed");
}

function conflict(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 409 });
}

function configurationError(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 500 });
}

function requestError(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function normalizeBranchCode(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,32}$/.test(normalized)) throw requestError("branchCode must use 1-32 lowercase letters, numbers, or hyphens");
  return normalized;
}

function parseRequiredJson<T>(value: unknown, label: string): T {
  if (typeof value !== "string") throw configurationError(`${label} must be stored as JSON text`);
  try {
    return JSON.parse(value) as T;
  } catch {
    throw configurationError(`${label} contains invalid JSON`);
  }
}

const economySettingLimits: Record<keyof EconomySettings, number> = {
  vegetarianCarbonGrams: 100_000,
  carbonGramsPerSeed: 100_000,
  seedsPerPlant: 1_000,
  plantsPerTree: 1_000,
  redemptionEnergy: 10_000,
  redemptionExp: 100_000,
  energyRegenIntervalSeconds: 86_400,
  energyOverflowMultiplier: 1,
};

function economyValidationError(message: string, statusCode: 400 | 500): Error {
  return statusCode === 400 ? requestError(message) : configurationError(message);
}

function requireIntegerSetting(record: Record<string, unknown>, key: keyof EconomySettings, minimum: number, statusCode: 400 | 500): number {
  const value = record[key];
  const limit = economySettingLimits[key];
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > limit) throw economyValidationError(`Invalid economy setting: ${String(key)}`, statusCode);
  return Number(value);
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) throw configurationError(`Invalid level definition: ${label}`);
  return Number(value);
}

function validateEconomySettings(value: unknown, statusCode: 400 | 500 = 500): EconomySettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw economyValidationError("economy_settings.core must be an object", statusCode);
  const record = value as Record<string, unknown>;
  const overflow = record.energyOverflowMultiplier;
  if (typeof overflow !== "number" || !Number.isFinite(overflow) || overflow < 1 || overflow > economySettingLimits.energyOverflowMultiplier) throw economyValidationError("Invalid economy setting: energyOverflowMultiplier", statusCode);
  return {
    vegetarianCarbonGrams: requireIntegerSetting(record, "vegetarianCarbonGrams", 1, statusCode),
    carbonGramsPerSeed: requireIntegerSetting(record, "carbonGramsPerSeed", 1, statusCode),
    seedsPerPlant: requireIntegerSetting(record, "seedsPerPlant", 1, statusCode),
    plantsPerTree: requireIntegerSetting(record, "plantsPerTree", 1, statusCode),
    redemptionEnergy: requireIntegerSetting(record, "redemptionEnergy", 0, statusCode),
    redemptionExp: requireIntegerSetting(record, "redemptionExp", 0, statusCode),
    energyRegenIntervalSeconds: requireIntegerSetting(record, "energyRegenIntervalSeconds", 1, statusCode),
    energyOverflowMultiplier: overflow,
  };
}

function validateLevelDefinitions(definitions: LevelDefinition[]): LevelDefinition[] {
  if (!definitions.length) throw configurationError("level_definitions must not be empty");
  definitions.forEach((definition, index) => {
    const expectedLevel = index + 1;
    if (definition.level !== expectedLevel) throw configurationError("level_definitions must start at LV1 and be continuous");
    if (definition.rewardStars < 0) throw configurationError(`Level ${definition.level} rewardStars must not be negative`);
    if (definition.maxEnergyIncrease < 0) throw configurationError(`Level ${definition.level} maxEnergyIncrease must not be negative`);
    if (!Array.isArray(definition.unlockFlags) || definition.unlockFlags.some((flag) => typeof flag !== "string")) throw configurationError(`Level ${definition.level} unlockFlags must be strings`);
    if (definition.level === 1) {
      if (definition.requiredTotalExp !== 0) throw configurationError("LV1 requiredTotalExp must be 0");
      return;
    }
    if (definition.requiredTotalExp <= definitions[index - 1].requiredTotalExp) throw configurationError("level_definitions thresholds must be strictly increasing");
  });
  return definitions;
}

function validateBusinessHours(input: MerchantApplicationInput["businessHours"]): void {
  const expectedDays = WEEKDAYS.map((item) => item.key);
  const actualDays = input.map((item) => item.day);
  if (input.length !== expectedDays.length || new Set(actualDays).size !== expectedDays.length || expectedDays.some((day) => !actualDays.includes(day))) {
    throw Object.assign(new Error("營業時間必須包含星期一至星期日"), { statusCode: 400 });
  }

  if (!input.some((day) => !day.closed)) throw Object.assign(new Error("至少需要有一天營業"), { statusCode: 400 });

  for (const day of input) {
    if (day.closed) {
      if (day.periods.length) throw Object.assign(new Error("公休日不可保留營業時段"), { statusCode: 400 });
      continue;
    }
    if (!day.periods.length || day.periods.length > 2) throw Object.assign(new Error("每天需要一至兩個營業時段"), { statusCode: 400 });
    const sorted = [...day.periods].sort((a, b) => a.start.localeCompare(b.start));
    for (const period of sorted) {
      if (period.start >= period.end) throw Object.assign(new Error("結束時間必須晚於開始時間"), { statusCode: 400 });
    }
    if (sorted[1] && sorted[0].end > sorted[1].start) throw Object.assign(new Error("同一天的兩個時段不可重疊"), { statusCode: 400 });
  }
}

export class InMemoryStore {
  readonly db: DatabaseSync;
  private readonly taskCodeSecret: string;
  failNextLedgerWrite = false;
  failNextMerchantMissionWrite = false;
  failNextGrowthSettlementAt?: GrowthFailurePoint;
  failNextLevelSettlementAt?: LevelFailurePoint;
  failNextPlayerEventQueueWrite = false;
  failNextPlayerProfileWrite = false;
  failNextAccountAuditWrite = false;

  constructor(databasePath?: string, options: StoreOptions = {}) {
    this.db = openDatabase(databasePath);
    this.taskCodeSecret = options.taskCodeSecret ?? process.env.LOOPER_TASK_CODE_SECRET ?? defaultTaskCodeSecret;
  }

  close(): void {
    this.db.close();
  }

  get economySettings(): EconomySettingsRecord {
    const row = this.db.prepare("SELECT value_json, version, updated_at, updated_by FROM economy_settings WHERE key = 'core'").get() as Row | undefined;
    if (!row) throw configurationError("Missing economy_settings.core");
    const settings = validateEconomySettings(parseRequiredJson<unknown>(row.value_json, "economy_settings.core"));
    return {
      ...settings,
      version: requireNumber(row.version),
      updatedAt: requireString(row.updated_at),
      updatedBy: requireString(row.updated_by),
    };
  }

  updateEconomySettings(input: EconomySettingsUpdateInput): EconomySettingsUpdateResult {
    const updatedBy = input.updatedBy.trim();
    if (!updatedBy) throw requestError("updatedBy is required");
    const nextSettings = validateEconomySettings(input, 400);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.economySettings;
      if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) throw conflict("設定版本已更新，請重新整理後再修改");
      const fields: Array<keyof EconomySettings> = ["vegetarianCarbonGrams", "carbonGramsPerSeed", "seedsPerPlant", "plantsPerTree", "redemptionEnergy", "redemptionExp", "energyRegenIntervalSeconds", "energyOverflowMultiplier"];
      const changedFields = fields.reduce<Record<string, { before: number; after: number }>>((changes, field) => {
        if (current[field] !== nextSettings[field]) changes[field] = { before: current[field], after: nextSettings[field] };
        return changes;
      }, {});
      if (!Object.keys(changedFields).length) {
        this.db.exec("COMMIT");
        return { settings: current, changed: false };
      }
      const nextVersion = current.version + 1;
      const updatedAt = nowIso();
      this.db.prepare("UPDATE economy_settings SET value_json = ?, version = ?, updated_at = ?, updated_by = ? WHERE key = 'core'").run(JSON.stringify(nextSettings), nextVersion, updatedAt, updatedBy);
      this.audit("admin", updatedBy, "economy.settings_updated", "economy_settings", "core", { previousVersion: current.version, newVersion: nextVersion, changedFields });
      this.db.exec("COMMIT");
      return { settings: { ...nextSettings, version: nextVersion, updatedAt, updatedBy }, changed: true };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  get merchantPlans() {
    return (this.db.prepare("SELECT plan, label, reward_star_amount FROM merchant_plan_definitions ORDER BY reward_star_amount").all() as Row[]).map((row) => ({
      plan: requireString(row.plan) as MerchantPlan,
      label: requireString(row.label),
      rewardStarAmount: requireNumber(row.reward_star_amount),
    }));
  }

  get levelDefinitions() {
    const definitions = (this.db.prepare("SELECT level, required_total_exp, reward_stars, max_energy_increase, unlock_flags_json FROM level_definitions ORDER BY level").all() as Row[]).map((row) => ({
      level: requireNumber(row.level),
      requiredTotalExp: requireNumber(row.required_total_exp),
      rewardStars: requireNumber(row.reward_stars),
      maxEnergyIncrease: requireNumber(row.max_energy_increase),
      unlockFlags: parseRequiredJson<string[]>(row.unlock_flags_json, `level_definitions.${requireString(row.level)}.unlock_flags`),
    }));
    return validateLevelDefinitions(definitions);
  }

  get merchants(): MerchantProfile[] {
    return (this.db.prepare(`SELECT m.*, b.display_name AS brand_display_name
      FROM merchants m
      JOIN merchant_brands b ON b.id = m.brand_id
      ORDER BY m.created_at`).all() as Row[]).map((row) => this.mapMerchant(row));
  }

  get merchantApplications(): MerchantApplication[] {
    return (this.db.prepare("SELECT * FROM merchant_applications ORDER BY submitted_at").all() as Row[]).map((row) => this.mapApplication(row));
  }

  get missions(): Mission[] {
    return (this.db.prepare("SELECT * FROM missions ORDER BY created_at").all() as Row[]).map((row) => this.mapMission(row));
  }

  get redemptions(): Redemption[] {
    return (this.db.prepare("SELECT * FROM redemptions ORDER BY created_at").all() as Row[]).map((row) => this.mapRedemption(row));
  }

  get auditEvents(): AuditEvent[] {
    return (this.db.prepare("SELECT * FROM audit_events ORDER BY created_at").all() as Row[]).map((row) => this.mapAudit(row));
  }

  listUsers(): UserProgress[] {
    return (this.db.prepare("SELECT id FROM users ORDER BY created_at").all() as Row[]).map((row) => this.getUser(requireString(row.id)));
  }

  listAccounts(query: AccountQuery = {}): Account[] {
    const limit = Math.max(1, Math.min(Number(query.limit ?? 50), 100));
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (query.accountId) {
      conditions.push("a.id = ?");
      params.push(query.accountId);
    }
    if (query.status) {
      conditions.push("a.status = ?");
      params.push(query.status);
    }
    if (query.displayNameQuery) {
      conditions.push("lower(a.display_name) LIKE lower(?)");
      params.push(`%${query.displayNameQuery.trim()}%`);
    }
    if (query.cursor) {
      conditions.push("a.id > ?");
      params.push(query.cursor);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.db.prepare(`SELECT a.*, u.id AS player_user_id
      FROM accounts a
      LEFT JOIN users u ON u.account_id = a.id
      ${where}
      ORDER BY a.id
      LIMIT ?`).all(...params, limit) as Row[];
    return rows.map((row) => this.mapAccount(row));
  }

  createAccount(input: AccountCreateInput): AccountCreateResult {
    const displayName = input.displayName.trim();
    const idempotencyKey = input.idempotencyKey.trim();
    const actorId = input.actorId.trim();
    if (!displayName) throw requestError("displayName is required");
    if (!idempotencyKey) throw requestError("idempotencyKey is required");
    if (!actorId) throw requestError("actorId is required");

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const replay = this.db.prepare("SELECT * FROM accounts WHERE creation_idempotency_key = ?").get(idempotencyKey) as Row | undefined;
      if (replay) {
        const account = this.mapAccount(this.db.prepare(`SELECT a.*, u.id AS player_user_id
          FROM accounts a
          LEFT JOIN users u ON u.account_id = a.id
          WHERE a.id = ?`).get(requireString(replay.id)) as Row);
        if (account.displayName !== displayName) throw conflict("冪等鍵已被不同 account 建立內容使用");
        this.db.exec("COMMIT");
        return { account, replayed: true };
      }

      const accountId = makeId("account");
      const createdAt = nowIso();
      this.db.prepare(`INSERT INTO accounts
        (id, display_name, status, created_at, updated_at, creation_idempotency_key)
        VALUES (?, ?, 'active', ?, ?, ?)`).run(accountId, displayName, createdAt, createdAt, idempotencyKey);
      if (this.failNextAccountAuditWrite) {
        this.failNextAccountAuditWrite = false;
        throw Object.assign(new Error("Simulated account audit failure"), { statusCode: 500 });
      }
      this.audit("admin", actorId, "identity.account_created", "account", accountId, { accountId, displayName, actorId, createdAt });
      this.db.exec("COMMIT");
      return { account: this.listAccounts({ accountId })[0], replayed: false };
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (isSqliteConstraintError(error)) throw conflict("account already exists");
      throw error;
    }
  }

  createPlayerProfile(userId: string, displayName: string): UserProgress {
    const normalizedUserId = userId.trim();
    const normalizedDisplayName = displayName.trim();
    if (!normalizedUserId) throw requestError("userId is required");
    if (!normalizedDisplayName) throw requestError("displayName is required");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.db.prepare("SELECT id FROM users WHERE id = ?").get(normalizedUserId) as Row | undefined;
      if (existing) {
        this.db.exec("COMMIT");
        return this.getUser(normalizedUserId);
      }
      const createdAt = nowIso();
      this.db.prepare(`INSERT INTO accounts
        (id, display_name, status, created_at, updated_at, creation_idempotency_key)
        VALUES (?, ?, 'active', ?, ?, NULL)`).run(normalizedUserId, normalizedDisplayName, createdAt, createdAt);
      if (this.failNextPlayerProfileWrite) {
        this.failNextPlayerProfileWrite = false;
        throw Object.assign(new Error("Simulated player profile failure"), { statusCode: 500 });
      }
      this.db.prepare("INSERT INTO users (id, account_id, display_name, created_at) VALUES (?, ?, ?, ?)").run(normalizedUserId, normalizedUserId, normalizedDisplayName, createdAt);
      const levelOne = this.levelDefinitions.find((level) => level.level === 1);
      this.db.prepare(`INSERT INTO user_resources
        (user_id, star_balance, current_energy, max_energy, energy_regen_interval_seconds, energy_last_updated_at, energy_overflow_pending, current_exp, current_level, next_level_exp, unlock_flags_json, updated_at)
        VALUES (?, 0, 0, 0, ?, ?, 0, 0, 1, 50, ?, ?)`).run(normalizedUserId, this.economySettings.energyRegenIntervalSeconds, createdAt, JSON.stringify(levelOne?.unlockFlags ?? []), createdAt);
      this.db.prepare(`INSERT INTO user_growth_balances
        (user_id, carbon_total_grams, carbon_balance_grams, seed_count, plant_count, tree_count, version, updated_at)
        VALUES (?, 0, 0, 0, 0, 0, 1, ?)`).run(normalizedUserId, createdAt);
      this.db.exec("COMMIT");
      return this.getUser(normalizedUserId);
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (isSqliteConstraintError(error)) throw conflict("player profile already exists");
      throw error;
    }
  }

  listResourceTransactions(): ResourceTransaction[] {
    return (this.db.prepare("SELECT * FROM resource_transactions ORDER BY created_at").all() as Row[]).map((row) => this.mapResourceTransaction(row));
  }

  listRewardEvents(): RewardEvent[] {
    return (this.db.prepare("SELECT * FROM reward_events ORDER BY created_at").all() as Row[]).map((row) => this.mapRewardEvent(row));
  }

  listPlantGrowthLogs(): PlantGrowthLog[] {
    return (this.db.prepare("SELECT * FROM plant_growth_logs ORDER BY created_at").all() as Row[]).map((row) => this.mapPlantGrowthLog(row));
  }

  listTaskCodeWindows(): TaskCodeWindow[] {
    return (this.db.prepare("SELECT * FROM task_code_windows ORDER BY created_at").all() as Row[]).map((row) => this.mapTaskCodeWindow(row));
  }

  listTaskCodeSubmissions(): TaskCodeSubmission[] {
    return (this.db.prepare("SELECT * FROM task_code_submissions ORDER BY submitted_at").all() as Row[]).map((row) => this.mapTaskCodeSubmission(row));
  }

  listPlayerEventQueue(): PlayerEventQueueItem[] {
    return (this.db.prepare("SELECT * FROM player_event_queue ORDER BY queue_order").all() as Row[]).map((row) => this.mapPlayerEventQueueItem(row));
  }

  rebuildGrowthBalancesFromLedger(userId: string): Omit<UserGrowthBalance, "version" | "updatedAt"> {
    const rows = this.db.prepare(`SELECT * FROM resource_transactions
      WHERE user_id = ? AND resource_type IN ('carbon_total', 'carbon_balance', 'seed', 'plant', 'tree') AND transaction_kind <> 'legacy'
      ORDER BY created_at, id`).all(userId) as Row[];
    const balance = { carbonTotalGrams: 0, carbonBalanceGrams: 0, seedCount: 0, plantCount: 0, treeCount: 0 };
    for (const row of rows) {
      const resourceType = requireString(row.resource_type);
      const amount = requireNumber(row.amount);
      const before = requireNumber(row.balance_before);
      const after = requireNumber(row.balance_after);
      if (before + amount !== after) throw new Error(`Ledger equation mismatch: ${requireString(row.id)}`);
      if (resourceType === "carbon_total") balance.carbonTotalGrams += amount;
      if (resourceType === "carbon_balance") balance.carbonBalanceGrams += amount;
      if (resourceType === "seed") balance.seedCount += amount;
      if (resourceType === "plant") balance.plantCount += amount;
      if (resourceType === "tree") balance.treeCount += amount;
    }
    return balance;
  }

  reconcileGrowthBalance(userId: string): { stored: UserGrowthBalance; rebuilt: Omit<UserGrowthBalance, "version" | "updatedAt">; matches: boolean } {
    const stored = this.getGrowth(userId);
    const rebuilt = this.rebuildGrowthBalancesFromLedger(userId);
    return {
      stored,
      rebuilt,
      matches:
        stored.carbonTotalGrams === rebuilt.carbonTotalGrams
        && stored.carbonBalanceGrams === rebuilt.carbonBalanceGrams
        && stored.seedCount === rebuilt.seedCount
        && stored.plantCount === rebuilt.plantCount
        && stored.treeCount === rebuilt.treeCount,
    };
  }

  getUser(userId: string): UserProgress {
    this.applyEnergyRegeneration(userId);
    const user = this.db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as Row | undefined;
    if (!user) throw Object.assign(new Error("找不到使用者"), { statusCode: 404 });
    return this.mapUser(user);
  }

  getMission(missionId: string): Mission {
    const mission = this.db.prepare("SELECT * FROM missions WHERE id = ?").get(missionId) as Row | undefined;
    if (!mission) throw Object.assign(new Error("找不到任務"), { statusCode: 404 });
    return this.mapMission(mission);
  }

  getMerchant(merchantId: string): MerchantProfile {
    const merchant = this.db.prepare(`SELECT m.*, b.display_name AS brand_display_name
      FROM merchants m
      JOIN merchant_brands b ON b.id = m.brand_id
      WHERE m.id = ?`).get(merchantId) as Row | undefined;
    if (!merchant) throw Object.assign(new Error("找不到合作店家"), { statusCode: 404 });
    return this.mapMerchant(merchant);
  }

  getCurrentTaskCode(merchantId: string, codeLength: 4 | 6 = 4): CurrentTaskCodeWindow {
    this.requireTaskCodeMerchant(merchantId);
    const now = nowIso();
    this.expireTaskCodeWindows(now);
    const active = this.findActiveTaskCodeWindow(merchantId) ?? this.createTaskCodeWindow({
      merchantId,
      codeLength,
      validFrom: now,
      validUntil: new Date(new Date(now).getTime() + taskCodeWindowMs).toISOString(),
    });
    return this.withTaskCode(active);
  }

  createTaskCodeWindow(input: CreateTaskCodeWindowInput): TaskCodeWindow {
    this.requireTaskCodeMerchant(input.merchantId);
    if (input.codeLength !== 4 && input.codeLength !== 6) throw Object.assign(new Error("任務碼長度僅支援 4 或 6 碼"), { statusCode: 400 });
    if (new Date(input.validUntil).getTime() <= new Date(input.validFrom).getTime()) throw Object.assign(new Error("任務碼有效結束時間必須晚於開始時間"), { statusCode: 400 });
    const id = makeId("task-code-window");
    const createdAt = nowIso();
    const code = deriveTaskCode(this.taskCodeSecret, id, input.merchantId, input.codeLength);
    this.db.prepare(`INSERT INTO task_code_windows
      (id, merchant_id, code_hash, code_length, valid_from, valid_until, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`).run(
      id,
      input.merchantId,
      hashTaskCode(this.taskCodeSecret, id, input.merchantId, input.codeLength, code),
      input.codeLength,
      input.validFrom,
      input.validUntil,
      createdAt,
    );
    return this.mapTaskCodeWindow(this.db.prepare("SELECT * FROM task_code_windows WHERE id = ?").get(id) as Row);
  }

  createTaskCodeSubmission(input: CreateTaskCodeSubmissionInput): TaskCodeSubmission {
    return this.createTaskCodeSubmissionResult(input).submission;
  }

  submitTaskCode(input: SubmitTaskCodeInput): TaskCodeSubmissionResult {
    const codeLength = parseTaskCodeLength(input.code);
    this.requireTaskCodeMerchant(input.merchantId);
    const mission = this.getMission(input.missionId);
    if (mission.merchantId !== input.merchantId) throw requestError("任務不屬於此店家");
    this.ensureUserExists(input.userId);

    const now = nowIso();
    this.expireTaskCodeWindows(now);
    const active = this.findActiveTaskCodeWindow(input.merchantId);
    if (!active) throw conflict("任務碼已過期");
    if (active.codeLength !== codeLength) throw requestError("任務碼錯誤");
    const codeHash = hashTaskCode(this.taskCodeSecret, active.id, active.merchantId, active.codeLength, input.code);
    if (codeHash !== active.codeHash) throw requestError("任務碼錯誤");
    return this.createTaskCodeSubmissionResult({
      taskCodeWindowId: active.id,
      merchantId: input.merchantId,
      missionId: input.missionId,
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
    });
  }

  listMerchantTaskCodeSubmissions(merchantId: string, status?: TaskCodeSubmission["status"]): MerchantTaskCodeSubmission[] {
    this.requireTaskCodeMerchant(merchantId);
    this.expirePendingTaskCodeSubmissions(nowIso());
    const rows = status
      ? this.db.prepare(`SELECT s.*, u.display_name AS user_display_name, m.title AS mission_title
          FROM task_code_submissions s
          JOIN users u ON u.id = s.user_id
          JOIN missions m ON m.id = s.mission_id
          WHERE s.merchant_id = ? AND s.status = ?
          ORDER BY s.submitted_at DESC`).all(merchantId, status) as Row[]
      : this.db.prepare(`SELECT s.*, u.display_name AS user_display_name, m.title AS mission_title
          FROM task_code_submissions s
          JOIN users u ON u.id = s.user_id
          JOIN missions m ON m.id = s.mission_id
          WHERE s.merchant_id = ?
          ORDER BY s.submitted_at DESC`).all(merchantId) as Row[];
    return rows.map((row) => this.mapMerchantTaskCodeSubmission(row));
  }

  getTaskCodeSubmissionForUser(submissionId: string, userId: string): TaskCodeSubmissionPlayerResult {
    const row = this.db.prepare("SELECT * FROM task_code_submissions WHERE id = ?").get(submissionId) as Row | undefined;
    if (!row) throw Object.assign(new Error("找不到任務碼提交"), { statusCode: 404 });
    const submission = this.mapTaskCodeSubmission(row);
    if (submission.userId !== userId) throw Object.assign(new Error("不可讀取其他玩家的任務碼提交"), { statusCode: 403 });
    const base: TaskCodeSubmissionPlayerResult = {
      submissionId: submission.id,
      status: submission.status,
      merchantId: submission.merchantId,
      missionId: submission.missionId,
      submittedAt: submission.submittedAt,
      confirmationExpiresAt: submission.confirmationExpiresAt,
      settledAt: submission.settledAt,
    };
    if (submission.status !== "settled") return base;
    if (!submission.rewardEventId) throw Object.assign(new Error("任務碼提交缺少 reward event link"), { statusCode: 500 });
    const eventRow = this.db.prepare("SELECT * FROM reward_events WHERE id = ?").get(submission.rewardEventId) as Row | undefined;
    if (!eventRow) throw Object.assign(new Error("找不到任務碼結算結果"), { statusCode: 500 });
    const event = this.mapRewardEvent(eventRow);
    return {
      ...base,
      baseReward: {
        stars: event.rewardPayload.stars,
        exp: event.rewardPayload.exp,
        energy: event.rewardPayload.energy,
        carbonGrams: event.rewardPayload.carbonGrams,
      },
      growthResult: event.growthSummary,
      levelBefore: event.levelSummary.previousLevel,
      levelAfter: event.levelSummary.currentLevel,
      levelsCrossed: event.levelSummary.rewards.map((reward) => reward.level),
      chestStars: event.levelSummary.rewards.reduce((sum, reward) => sum + reward.stars, 0),
      resources: this.getUser(userId).resources,
    };
  }

  getNextPlayerEvent(userId: string): PlayerEventNextResult {
    this.ensureUserExists(userId);
    const row = this.db.prepare("SELECT * FROM player_event_queue WHERE user_id = ? AND status = 'pending' ORDER BY queue_order LIMIT 1").get(userId) as Row | undefined;
    return { event: row ? this.mapPlayerEventQueueItem(row) : null };
  }

  resolvePlayerEvent(input: ResolvePlayerEventInput): PlayerEventResolveResult {
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey) throw requestError("idempotencyKey is required");
    if (input.outcome !== "completed" && input.outcome !== "skipped") throw requestError("outcome is invalid");
    this.ensureUserExists(input.userId);

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existingKey = this.db.prepare("SELECT * FROM player_event_queue WHERE resolution_idempotency_key = ?").get(idempotencyKey) as Row | undefined;
      if (existingKey) {
        const existing = this.mapPlayerEventQueueItem(existingKey);
        if (existing.userId !== input.userId) throw Object.assign(new Error("不可處理其他玩家的事件"), { statusCode: 403 });
        if (existing.id === input.eventId && existing.status === input.outcome) {
          this.db.exec("COMMIT");
          return { event: existing, replayed: true };
        }
        throw conflict("事件處理冪等鍵已被不同事件或結果使用");
      }

      const row = this.db.prepare("SELECT * FROM player_event_queue WHERE id = ?").get(input.eventId) as Row | undefined;
      if (!row) throw Object.assign(new Error("找不到玩家事件"), { statusCode: 404 });
      const event = this.mapPlayerEventQueueItem(row);
      if (event.userId !== input.userId) throw Object.assign(new Error("不可處理其他玩家的事件"), { statusCode: 403 });
      if (event.status !== "pending") throw conflict("事件已完成或已跳過");
      const firstPending = this.db.prepare("SELECT * FROM player_event_queue WHERE user_id = ? AND status = 'pending' ORDER BY queue_order LIMIT 1").get(input.userId) as Row | undefined;
      if (!firstPending || requireString(firstPending.id) !== input.eventId) throw conflict("請先處理最早的待播放事件");

      const resolvedAt = nowIso();
      const updated = this.db.prepare("UPDATE player_event_queue SET status = ?, resolved_at = ?, resolution_idempotency_key = ? WHERE id = ? AND status = 'pending'").run(input.outcome, resolvedAt, idempotencyKey, input.eventId) as { changes: number };
      if (updated.changes !== 1) throw conflict("事件已由其他請求處理");
      const resolved = this.mapPlayerEventQueueItem(this.db.prepare("SELECT * FROM player_event_queue WHERE id = ?").get(input.eventId) as Row);
      this.db.exec("COMMIT");
      return { event: resolved, replayed: false };
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (isSqliteConstraintError(error)) throw conflict("事件處理冪等鍵已使用");
      throw error;
    }
  }

  decideTaskCodeSubmission(input: DecideTaskCodeSubmissionInput): TaskCodeSubmissionResult {
    this.requireTaskCodeMerchant(input.merchantId);
    const actorId = input.actorId.trim();
    if (!actorId) throw requestError("actorId is required");
    if (input.decision !== "confirm" && input.decision !== "reject") throw requestError("decision is invalid");
    this.expirePendingTaskCodeSubmissions(nowIso());

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existingDecision = this.db.prepare("SELECT * FROM task_code_submissions WHERE decision_idempotency_key = ?").get(input.idempotencyKey) as Row | undefined;
      if (existingDecision) {
        const submission = this.mapTaskCodeSubmission(existingDecision);
        if (submission.id !== input.submissionId || submission.merchantId !== input.merchantId) throw conflict("冪等鍵已被不同任務碼決定使用");
        if (input.decision === "reject" && submission.status === "rejected") {
          this.db.exec("COMMIT");
          return { submission, replayed: true };
        }
        if (input.decision === "confirm" && submission.status === "settled") {
          const settlement = this.rebuildTaskCodeSettlement(submission);
          this.db.exec("COMMIT");
          return { submission, settlement, replayed: true };
        }
        if (input.decision === "confirm" && submission.status === "confirmed") {
          const settled = this.settleConfirmedTaskCodeSubmission(submission, actorId, true);
          this.db.exec("COMMIT");
          return { ...settled, replayed: true };
        }
        throw conflict("冪等鍵已被不同任務碼決定使用");
      }

      const row = this.db.prepare("SELECT * FROM task_code_submissions WHERE id = ?").get(input.submissionId) as Row | undefined;
      if (!row) throw Object.assign(new Error("找不到任務碼提交"), { statusCode: 404 });
      const submission = this.mapTaskCodeSubmission(row);
      if (submission.merchantId !== input.merchantId) throw Object.assign(new Error("此店家不可操作這筆任務碼提交"), { statusCode: 403 });
      if (submission.status !== "pending") throw conflict("任務碼提交已完成或不可再變更");

      const decidedAt = nowIso();
      if (input.decision === "reject") {
        const result = this.db.prepare(`UPDATE task_code_submissions
          SET status = 'rejected', rejected_at = ?, decided_by = ?, decision_idempotency_key = ?
          WHERE id = ? AND status = 'pending'`).run(decidedAt, actorId, input.idempotencyKey, input.submissionId) as { changes: number };
        if (result.changes !== 1) throw conflict("任務碼提交已被其他店員處理");
        const updated = this.mapTaskCodeSubmission(this.db.prepare("SELECT * FROM task_code_submissions WHERE id = ?").get(input.submissionId) as Row);
        this.auditTaskCodeDecision(updated, actorId, "reject", input.idempotencyKey, decidedAt);
        this.db.exec("COMMIT");
        return { submission: updated, replayed: false };
      }

      const confirmResult = this.db.prepare(`UPDATE task_code_submissions
        SET status = 'confirmed', confirmed_at = ?, decided_by = ?, decision_idempotency_key = ?
        WHERE id = ? AND status = 'pending'`).run(decidedAt, actorId, input.idempotencyKey, input.submissionId) as { changes: number };
      if (confirmResult.changes !== 1) throw conflict("任務碼提交已被其他店員處理");
      const confirmed = this.mapTaskCodeSubmission(this.db.prepare("SELECT * FROM task_code_submissions WHERE id = ?").get(input.submissionId) as Row);
      this.auditTaskCodeDecision(confirmed, actorId, "confirm", input.idempotencyKey, decidedAt);
      const settled = this.settleConfirmedTaskCodeSubmission(confirmed, actorId, false);
      this.db.exec("COMMIT");
      return settled;
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (isSqliteConstraintError(error)) throw conflict("任務碼提交已被其他店員處理或已結算");
      throw error;
    }
  }

  private auditTaskCodeDecision(submission: TaskCodeSubmission, actorId: string, decision: TaskCodeSubmissionDecision, idempotencyKey: string, decidedAt: string): void {
    this.audit(
      "merchant",
      actorId,
      decision === "confirm" ? "task_code_submission.confirmed" : "task_code_submission.rejected",
      "task_code_submission",
      submission.id,
      {
        submissionId: submission.id,
        merchantId: submission.merchantId,
        actorId,
        decision,
        decisionIdempotencyKey: idempotencyKey,
        decidedAt,
      },
    );
  }

  private settleConfirmedTaskCodeSubmission(submission: TaskCodeSubmission, actorId: string, replayed: boolean): TaskCodeSubmissionResult {
    if (submission.status !== "confirmed") throw conflict("任務碼提交尚未確認或已結算");
    const occurredAt = submission.confirmedAt;
    if (!occurredAt) throw Object.assign(new Error("任務碼提交缺少確認時間"), { statusCode: 500 });
    this.ensureMissionEnrollmentForTaskCode(submission, occurredAt);
    const settlement = this.redeemInTransaction({
      userId: submission.userId,
      missionId: submission.missionId,
      merchantId: submission.merchantId,
      idempotencyKey: taskCodeSettlementIdempotencyKey(submission.id),
      occurredAt,
    });
    const redemptionId = settlement.redemption.id;
    const rewardEventId = settlement.redemption.rewardEventId;
    if (!rewardEventId) throw Object.assign(new Error("任務碼結算缺少 reward event"), { statusCode: 500 });
    const settledAt = submission.settledAt ?? occurredAt;
    const updated = this.db.prepare(`UPDATE task_code_submissions
      SET status = 'settled', settled_at = ?, redemption_id = ?, reward_event_id = ?
      WHERE id = ? AND status = 'confirmed' AND (redemption_id IS NULL OR redemption_id = ?)`).run(
      settledAt,
      redemptionId,
      rewardEventId,
      submission.id,
      redemptionId,
    ) as { changes: number };
    if (updated.changes !== 1) throw conflict("任務碼提交已被其他店員結算");
    const settled = this.mapTaskCodeSubmission(this.db.prepare("SELECT * FROM task_code_submissions WHERE id = ?").get(submission.id) as Row);
    if (!replayed) {
      this.audit("merchant", actorId, "task_code_submission.settled", "task_code_submission", settled.id, {
        submissionId: settled.id,
        merchantId: settled.merchantId,
        actorId,
        decision: "confirm",
        decisionIdempotencyKey: settled.decisionIdempotencyKey,
        redemptionId,
        rewardEventId,
        settledAt,
      });
    }
    return { submission: settled, settlement, replayed };
  }

  private ensureMissionEnrollmentForTaskCode(submission: TaskCodeSubmission, acceptedAt: string): void {
    const existing = this.db.prepare("SELECT * FROM mission_enrollments WHERE user_id = ? AND mission_id = ?").get(submission.userId, submission.missionId) as Row | undefined;
    if (existing) return;
    this.db.prepare("INSERT INTO mission_enrollments (user_id, mission_id, status, accepted_at) VALUES (?, ?, 'awaiting_verification', ?)").run(submission.userId, submission.missionId, acceptedAt);
  }

  private rebuildTaskCodeSettlement(submission: TaskCodeSubmission): SettlementResult {
    if (!submission.redemptionId) throw Object.assign(new Error("任務碼提交缺少 redemption link"), { statusCode: 500 });
    const redemption = this.db.prepare("SELECT * FROM redemptions WHERE id = ?").get(submission.redemptionId) as Row | undefined;
    if (!redemption) throw Object.assign(new Error("找不到任務碼結算結果"), { statusCode: 500 });
    return this.rebuildSettlement(this.mapRedemption(redemption), true);
  }

  private createTaskCodeSubmissionResult(input: CreateTaskCodeSubmissionInput): TaskCodeSubmissionResult {
    const existing = this.db.prepare("SELECT * FROM task_code_submissions WHERE idempotency_key = ?").get(input.idempotencyKey) as Row | undefined;
    if (existing) {
      const submission = this.mapTaskCodeSubmission(existing);
      if (
        submission.taskCodeWindowId === input.taskCodeWindowId
        && submission.merchantId === input.merchantId
        && submission.missionId === input.missionId
        && submission.userId === input.userId
      ) return { submission, replayed: true };
      throw conflict("冪等鍵已被不同任務碼提交使用");
    }

    this.expireTaskCodeWindows(nowIso());
    const window = this.db.prepare("SELECT * FROM task_code_windows WHERE id = ?").get(input.taskCodeWindowId) as Row | undefined;
    if (!window) throw Object.assign(new Error("找不到任務碼窗"), { statusCode: 404 });
    if (requireString(window.status) !== "active" || new Date(requireString(window.valid_until)).getTime() <= Date.now()) throw Object.assign(new Error("任務碼已過期"), { statusCode: 409 });
    if (requireString(window.merchant_id) !== input.merchantId) throw Object.assign(new Error("任務碼不屬於此店家"), { statusCode: 400 });
    const mission = this.getMission(input.missionId);
    if (mission.merchantId !== input.merchantId) throw requestError("任務不屬於此店家");
    this.ensureUserExists(input.userId);

    const submittedAt = nowIso();
    const confirmationExpiresAt = new Date(new Date(submittedAt).getTime() + taskCodeConfirmationMs).toISOString();
    const id = makeId("task-code-submission");
    this.db.prepare(`INSERT INTO task_code_submissions
      (id, task_code_window_id, merchant_id, mission_id, user_id, status, submitted_at, confirmation_expires_at, confirmed_at, rejected_at, idempotency_key)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, NULL, NULL, ?)`).run(
      id,
      input.taskCodeWindowId,
      input.merchantId,
      input.missionId,
      input.userId,
      submittedAt,
      confirmationExpiresAt,
      input.idempotencyKey,
    );
    return { submission: this.mapTaskCodeSubmission(this.db.prepare("SELECT * FROM task_code_submissions WHERE id = ?").get(id) as Row), replayed: false };
  }

  submitMerchantApplication(input: MerchantApplicationInput): MerchantApplication {
    const existing = this.db.prepare("SELECT id FROM merchant_applications WHERE lower(email) = lower(?) AND status <> 'rejected'").get(input.email) as Row | undefined;
    if (existing) throw Object.assign(new Error("此 Email 已有審核中的申請"), { statusCode: 409 });
    if (input.storeCategory === "其他" && !input.otherStoreCategory.trim()) throw Object.assign(new Error("請填寫其他店家業態"), { statusCode: 400 });
    if (input.vegetarianOffering.includes("其他") && !input.otherMealType.trim()) throw Object.assign(new Error("請填寫其他餐點類型"), { statusCode: 400 });
    validateBusinessHours(input.businessHours);

    const submittedAt = nowIso();
    const id = makeId("merchant-application");
    this.db.prepare(`INSERT INTO merchant_applications
      (id, store_name, contact_name, contact_line_id, phone, email, address, store_category, other_store_category, vegetarian_offering_json, other_meal_type, business_hours_json, status, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`).run(
      id,
      input.storeName,
      input.contactName,
      input.contactLineId,
      input.phone,
      input.email,
      input.address,
      input.storeCategory,
      input.otherStoreCategory.trim(),
      JSON.stringify(input.vegetarianOffering),
      input.otherMealType.trim(),
      JSON.stringify(input.businessHours),
      submittedAt,
    );
    this.audit("merchant", input.email, "merchant.application_submitted", "merchant_application", id, { storeName: input.storeName });
    return this.mapApplication(this.db.prepare("SELECT * FROM merchant_applications WHERE id = ?").get(id) as Row);
  }

  reviewMerchantApplication(applicationId: string, decision: "approve" | "reject" | "request_revision", reviewerId: string, note = ""): MerchantApplication {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const application = this.db.prepare("SELECT * FROM merchant_applications WHERE id = ?").get(applicationId) as Row | undefined;
      if (!application) throw Object.assign(new Error("找不到店家申請"), { statusCode: 404 });
      if (application.status === "approved" || application.merchant_id) throw conflict("申請已通過審核");

      const reviewedAt = nowIso();
      if (decision === "reject" || decision === "request_revision") {
        const status = decision === "reject" ? "rejected" : "needs_revision";
        this.db.prepare("UPDATE merchant_applications SET status = ?, reviewed_at = ?, review_note = ? WHERE id = ?").run(status, reviewedAt, note, applicationId);
        this.audit("admin", reviewerId, decision === "reject" ? "merchant.application_rejected" : "merchant.application_revision_requested", "merchant_application", applicationId, { note });
        this.db.exec("COMMIT");
        return this.mapApplication(this.db.prepare("SELECT * FROM merchant_applications WHERE id = ?").get(applicationId) as Row);
      }

      const plan = this.merchantPlans[0];
      const brandId = makeId("merchant-brand");
      const merchantId = makeId("merchant");
      this.db.prepare(`INSERT INTO merchant_brands
        (id, display_name, legal_name, status, created_at, updated_at)
        VALUES (?, ?, NULL, 'active', ?, ?)`).run(
        brandId,
        requireString(application.store_name),
        reviewedAt,
        reviewedAt,
      );
      this.db.prepare(`INSERT INTO merchants
        (id, application_id, brand_id, branch_code, store_name, address, store_category, other_store_category, vegetarian_offering_json, other_meal_type, business_hours_json, status, can_redeem, merchant_plan, reward_star_amount, reward_category, timezone, created_at)
        VALUES (?, ?, ?, 'main', ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, 'general', 'Asia/Taipei', ?)`).run(
        merchantId,
        applicationId,
        brandId,
        requireString(application.store_name),
        requireString(application.address),
        requireString(application.store_category),
        requireString(application.other_store_category),
        requireString(application.vegetarian_offering_json),
        requireString(application.other_meal_type),
        requireString(application.business_hours_json),
        plan.plan,
        plan.rewardStarAmount,
        reviewedAt,
      );
      const missionId = makeId("mission");
      if (this.failNextMerchantMissionWrite) {
        this.failNextMerchantMissionWrite = false;
        throw Object.assign(new Error("Simulated merchant mission failure"), { statusCode: 500 });
      }
      this.db.prepare("INSERT INTO missions (id, merchant_id, mission_type, title, description, created_at) VALUES (?, ?, 'vegetarian_meal', ?, ?, ?)").run(
        missionId,
        merchantId,
        "完成一餐蔬食",
        `到 ${String(application.store_name)} 完成一餐蔬食，請店家協助核銷。`,
        reviewedAt,
      );
      this.db.prepare("UPDATE merchant_applications SET status = 'approved', reviewed_at = ?, review_note = ?, merchant_id = ? WHERE id = ? AND status <> 'approved' AND merchant_id IS NULL").run(reviewedAt, note, merchantId, applicationId);
      this.audit("admin", reviewerId, "merchant.application_approved", "merchant", merchantId, { applicationId, missionId });
      this.db.exec("COMMIT");
      return this.mapApplication(this.db.prepare("SELECT * FROM merchant_applications WHERE id = ?").get(applicationId) as Row);
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (isSqliteConstraintError(error)) throw conflict("申請已通過或資料關聯重複");
      throw error;
    }
  }

  createMerchantBranch(brandId: string, input: MerchantBranchCreateInput): MerchantBranchCreateResult {
    const branchCode = normalizeBranchCode(input.branchCode);
    const storeName = input.storeName.trim();
    const address = input.address.trim();
    const actorId = input.actorId.trim();
    const timezone = (input.timezone ?? "Asia/Taipei").trim();
    if (!storeName) throw requestError("storeName is required");
    if (!address) throw requestError("address is required");
    if (!actorId) throw requestError("actorId is required");
    if (input.rewardCategory !== "general" && input.rewardCategory !== "star") throw requestError("rewardCategory is invalid");
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    } catch {
      throw requestError("timezone is invalid");
    }

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const brand = this.db.prepare("SELECT * FROM merchant_brands WHERE id = ?").get(brandId) as Row | undefined;
      if (!brand) throw Object.assign(new Error("找不到品牌"), { statusCode: 404 });
      if (brand.status === "suspended") throw conflict("品牌已停權，無法新增分店");

      const existing = this.db.prepare(`SELECT m.*, b.display_name AS brand_display_name
        FROM merchants m
        JOIN merchant_brands b ON b.id = m.brand_id
        WHERE m.brand_id = ? AND m.branch_code = ?`).get(brandId, branchCode) as Row | undefined;
      if (existing) {
        const merchant = this.mapMerchant(existing);
        const samePayload =
          merchant.storeName === storeName
          && merchant.address === address
          && merchant.rewardCategory === input.rewardCategory
          && merchant.timezone === timezone;
        if (!samePayload) throw conflict("branchCode 已存在且內容不同");
        this.db.exec("COMMIT");
        return { merchant: this.branchCreateResponse(merchant), replayed: true };
      }

      const source = this.db.prepare(`SELECT * FROM merchants
        WHERE brand_id = ?
        ORDER BY CASE WHEN branch_code = 'main' THEN 0 ELSE 1 END, created_at ASC
        LIMIT 1`).get(brandId) as Row | undefined;
      if (!source) throw conflict("品牌尚無可繼承方案的分店");

      const createdAt = nowIso();
      const merchantId = makeId("merchant");
      this.db.prepare(`INSERT INTO merchants
        (id, application_id, brand_id, branch_code, store_name, address, store_category, other_store_category, vegetarian_offering_json, other_meal_type, business_hours_json, status, can_redeem, merchant_plan, reward_star_amount, reward_category, timezone, created_at)
        VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?, ?, ?)`).run(
        merchantId,
        brandId,
        branchCode,
        storeName,
        address,
        requireString(source.store_category),
        requireString(source.other_store_category),
        requireString(source.vegetarian_offering_json),
        requireString(source.other_meal_type),
        requireString(source.business_hours_json),
        requireString(source.merchant_plan),
        requireNumber(source.reward_star_amount),
        input.rewardCategory,
        timezone,
        createdAt,
      );
      this.audit("admin", actorId, "merchant.branch_created", "merchant", merchantId, {
        brandId,
        merchantId,
        branchCode,
        actorId,
        storeName,
        rewardCategory: input.rewardCategory,
        timezone,
        createdAt,
      });
      this.db.exec("COMMIT");
      return { merchant: this.branchCreateResponse(this.getMerchant(merchantId)), replayed: false };
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (isSqliteConstraintError(error)) throw conflict("branchCode 已存在或分店資料違反限制");
      throw error;
    }
  }

  acceptMission(userId: string, missionId: string): MissionEnrollment {
    this.getUser(userId);
    this.getMission(missionId);
    const existing = this.db.prepare("SELECT * FROM mission_enrollments WHERE user_id = ? AND mission_id = ?").get(userId, missionId) as Row | undefined;
    if (existing) return this.mapEnrollment(existing);
    const acceptedAt = nowIso();
    this.db.prepare("INSERT INTO mission_enrollments (user_id, mission_id, status, accepted_at) VALUES (?, ?, 'awaiting_verification', ?)").run(userId, missionId, acceptedAt);
    this.audit("user", userId, "mission.accepted", "mission_enrollment", `${userId}:${missionId}`, { missionId });
    return this.mapEnrollment(this.db.prepare("SELECT * FROM mission_enrollments WHERE user_id = ? AND mission_id = ?").get(userId, missionId) as Row);
  }

  redeem(input: { userId: string; missionId: string; merchantId: string; idempotencyKey: string; occurredAt?: string }): SettlementResult {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = this.redeemInTransaction(input);
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (isSqliteConstraintError(error)) throw conflict("冪等鍵或資料關聯已存在");
      throw error;
    }
  }

  settleActivityReward(input: {
    userId: string;
    sourceType: RewardSourceType;
    sourceId: string;
    idempotencyKey: string;
    stars: number;
    energy?: number;
    exp: number;
  }): SettlementResult {
    if (input.sourceType === "vegetarian_purchase") throw Object.assign(new Error("蔬食核銷必須使用 redemptions 流程"), { statusCode: 400 });
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const rewardInput: RewardRequestInput = {
        userId: input.userId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        idempotencyKey: input.idempotencyKey,
        merchantId: undefined,
        missionId: undefined,
        stars: input.stars,
        energy: input.energy ?? 0,
        exp: input.exp,
        carbonGrams: 0,
      };
      const replay = this.findReplayableRewardEvent(rewardInput);
      if (replay) {
        this.db.exec("COMMIT");
        return this.rebuildSettlementFromRewardEvent(replay, true);
      }
      const existingSource = this.db.prepare("SELECT * FROM reward_events WHERE source_type = ? AND source_id = ? AND user_id = ?").get(input.sourceType, input.sourceId, input.userId) as Row | undefined;
      if (existingSource) throw conflict("此 reward source 已結算");
      const { rewardEventId: _rewardEventId, ...result } = this.applyRewardEvent(rewardInput);
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (isSqliteConstraintError(error)) throw conflict("冪等鍵或 reward source 已結算");
      throw error;
    }
  }

  updateMerchantPlan(merchantId: string, merchantPlan: MerchantPlan): MerchantProfile {
    const plan = this.merchantPlans.find((item) => item.plan === merchantPlan);
    if (!plan) throw Object.assign(new Error("找不到店家方案"), { statusCode: 400 });
    this.getMerchant(merchantId);
    this.db.prepare("UPDATE merchants SET merchant_plan = ?, reward_star_amount = ? WHERE id = ?").run(plan.plan, plan.rewardStarAmount, merchantId);
    return this.getMerchant(merchantId);
  }

  overview(): AdminOverview {
    const users = this.listUsers();
    const enrollments = users.flatMap((user) => user.enrollments);
    const redemptions = this.redemptions;
    const growthTotals = users.reduce((sum, user) => ({
      carbonTotalGrams: sum.carbonTotalGrams + user.growth.carbonTotalGrams,
      seedCount: sum.seedCount + user.growth.seedCount,
      plantCount: sum.plantCount + user.growth.plantCount,
      treeCount: sum.treeCount + user.growth.treeCount,
    }), { carbonTotalGrams: 0, seedCount: 0, plantCount: 0, treeCount: 0 });

    return {
      users,
      merchants: this.merchants,
      merchantApplications: this.merchantApplications,
      missions: this.missions,
      redemptions,
      auditEvents: this.auditEvents,
      resourceTransactions: this.listResourceTransactions(),
      rewardEvents: this.listRewardEvents(),
      plantGrowthLogs: this.listPlantGrowthLogs(),
      economySettings: this.economySettings,
      merchantPlans: this.merchantPlans,
      levelDefinitions: this.levelDefinitions,
      metrics: {
        totalUsers: users.length,
        activeMerchants: this.merchants.filter((item) => item.status === "active").length,
        pendingMerchantApplications: this.merchantApplications.filter((item) => item.status === "pending").length,
        awaitingVerification: enrollments.filter((item) => item.status === "awaiting_verification").length,
        completedMissions: enrollments.filter((item) => item.status === "completed").length,
        starsGranted: redemptions.reduce((sum, item) => sum + item.starsGranted, 0),
        energyGranted: redemptions.reduce((sum, item) => sum + item.energyGranted, 0),
        expGranted: redemptions.reduce((sum, item) => sum + item.expGranted, 0),
        carbonTotalGrams: growthTotals.carbonTotalGrams,
        seedCount: growthTotals.seedCount,
        plantCount: growthTotals.plantCount,
        treeCount: growthTotals.treeCount,
      },
    };
  }

  setGrowthBalanceForTest(userId: string, partial: Partial<UserGrowthBalance>): void {
    const current = this.getGrowth(userId);
    this.db.prepare(`UPDATE user_growth_balances SET carbon_total_grams = ?, carbon_balance_grams = ?, seed_count = ?, plant_count = ?, tree_count = ?, version = version + 1, updated_at = ? WHERE user_id = ?`).run(
      partial.carbonTotalGrams ?? current.carbonTotalGrams,
      partial.carbonBalanceGrams ?? current.carbonBalanceGrams,
      partial.seedCount ?? current.seedCount,
      partial.plantCount ?? current.plantCount,
      partial.treeCount ?? current.treeCount,
      nowIso(),
      userId,
    );
  }

  setUserResourcesForTest(userId: string, partial: Partial<UserResources>): void {
    const current = this.getResources(userId);
    this.db.prepare(`UPDATE user_resources SET star_balance = ?, current_energy = ?, max_energy = ?, energy_regen_interval_seconds = ?, energy_last_updated_at = ?, energy_overflow_pending = ?, current_exp = ?, current_level = ?, next_level_exp = ?, unlock_flags_json = ?, updated_at = ? WHERE user_id = ?`).run(
      partial.starBalance ?? current.starBalance,
      partial.currentEnergy ?? current.currentEnergy,
      partial.maxEnergy ?? current.maxEnergy,
      partial.energyRegenIntervalSeconds ?? current.energyRegenIntervalSeconds,
      partial.energyLastUpdatedAt ?? current.energyLastUpdatedAt,
      partial.energyOverflowPending ?? current.energyOverflowPending,
      partial.currentExp ?? current.currentExp,
      partial.currentLevel ?? current.currentLevel,
      partial.nextLevelExp ?? current.nextLevelExp ?? currentLevelRequiredExp(partial.currentLevel ?? current.currentLevel, this.levelDefinitions),
      JSON.stringify(partial.unlockFlags ?? current.unlockFlags),
      nowIso(),
      userId,
    );
  }

  private redeemInTransaction(input: { userId: string; missionId: string; merchantId: string; idempotencyKey: string; occurredAt?: string }): SettlementResult {
    const merchant = this.getMerchant(input.merchantId);
    if (merchant.status !== "active" || !merchant.canRedeem) throw Object.assign(new Error("此店家目前不可核銷"), { statusCode: 409 });
    const mission = this.getMission(input.missionId);
    if (mission.merchantId !== input.merchantId) throw Object.assign(new Error("任務不屬於此店家"), { statusCode: 403 });
    const replay = this.findReplayableVegetarianRedemption(input);
    if (replay) {
      this.audit("merchant", input.merchantId, "redemption.replayed", "redemption", replay.sourceId, { idempotencyKey: input.idempotencyKey });
      return this.rebuildSettlementFromRewardEvent(replay, true);
    }
    const settings = this.economySettings;
    const enrollment = this.db.prepare("SELECT * FROM mission_enrollments WHERE user_id = ? AND mission_id = ?").get(input.userId, input.missionId) as Row | undefined;
    if (!enrollment) throw Object.assign(new Error("使用者尚未接取此任務"), { statusCode: 409 });
    if (enrollment.status === "completed") throw Object.assign(new Error("此任務已完成核銷"), { statusCode: 409 });

    const redemptionId = makeId("redemption");
    const createdAt = nowIso();
    const occurredAt = input.occurredAt ?? createdAt;
    let starReward: ReturnType<typeof calculateMerchantStarReward>;
    try {
      starReward = calculateMerchantStarReward({
        rewardCategory: merchant.rewardCategory,
        occurredAt,
        timezone: merchant.timezone,
      });
    } catch {
      throw Object.assign(new Error("核銷發生時間格式錯誤"), { statusCode: 400 });
    }
    const settlementRule: SettlementRuleContext = {
      ruleVersion: FINALIZED_SETTLEMENT_RULE_VERSION,
      occurredAt: starReward.occurredAt,
      merchantTimezone: starReward.merchantTimezone,
      merchantLocalDate: starReward.merchantLocalDate,
      merchantRewardCategory: starReward.merchantRewardCategory,
      isMonday: starReward.isMonday,
      lunarDay: starReward.lunarDay,
      isDesignatedDate: starReward.isDesignatedDate,
    };
    this.db.prepare(`INSERT INTO redemptions
      (id, idempotency_key, user_id, mission_id, merchant_id, stars_granted, energy_granted, exp_granted, carbon_grams, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      redemptionId,
      input.idempotencyKey,
      input.userId,
      input.missionId,
      input.merchantId,
      starReward.stars,
      settings.redemptionEnergy,
      settings.redemptionExp,
      settings.vegetarianCarbonGrams,
      createdAt,
    );

    const result = this.applyRewardEvent({
      userId: input.userId,
      sourceType: "vegetarian_purchase",
      sourceId: redemptionId,
      logicalSourceId: input.missionId,
      idempotencyKey: input.idempotencyKey,
      merchantId: input.merchantId,
      missionId: input.missionId,
      stars: starReward.stars,
      energy: settings.redemptionEnergy,
      exp: settings.redemptionExp,
      carbonGrams: settings.vegetarianCarbonGrams,
      settlementRule,
    });
    this.db.prepare("UPDATE redemptions SET reward_event_id = ? WHERE id = ?").run(result.rewardEventId, redemptionId);
    this.db.prepare("UPDATE mission_enrollments SET status = 'completed', completed_at = ? WHERE user_id = ? AND mission_id = ?").run(createdAt, input.userId, input.missionId);
    this.audit("merchant", input.merchantId, "redemption.created", "redemption", redemptionId, {
      starsGranted: starReward.stars,
      energyGranted: settings.redemptionEnergy,
      expGranted: settings.redemptionExp,
      carbonGrams: settings.vegetarianCarbonGrams,
      ruleVersion: FINALIZED_SETTLEMENT_RULE_VERSION,
    });
    const { rewardEventId: _rewardEventId, ...settlement } = result;
    return { ...settlement, redemption: this.findRedemptionByKey(input.idempotencyKey)!, user: this.getUser(input.userId), replayed: false };
  }

  private applyRewardEvent(input: RewardRequestInput): SettlementWithEventId {
    const createdAt = nowIso();
    const resources = this.getResources(input.userId);
    const growth = this.getGrowth(input.userId);
    const settings = this.economySettings;
    const levelDefinitions = this.levelDefinitions;

    const energyLimit = resources.maxEnergy;
    const rawEnergyAfter = resources.currentEnergy + input.energy;
    const energyAfterReward = Math.min(rawEnergyAfter, energyLimit);
    const energyOverflow = 0;
    const level = applyLevelProgress({
      currentLevel: resources.currentLevel,
      currentExp: resources.currentExp,
      currentMaxEnergy: resources.maxEnergy,
      expDelta: input.exp,
      levelDefinitions,
    });
    const levelRefillEnergy = level.levelsGained > 0 ? Math.max(0, level.maxEnergy - energyAfterReward) : 0;
    const energyAfterLevel = energyAfterReward + levelRefillEnergy;
    const unlockFlags = [...new Set([...resources.unlockFlags, ...level.unlockFlags])];
    const starBalanceAfterBaseReward = resources.starBalance + input.stars;
    const totalStars = input.stars + level.levelRewardStars;
    const rewardSummary = buildRewardSummary(input.stars, input.energy, energyOverflow, input.exp, input.carbonGrams);
    const levelSummary: LevelSummary = {
      previousLevel: level.previousLevel,
      currentLevel: level.currentLevel,
      levelsGained: level.levelsGained,
      rewards: level.rewards,
    };

    if (this.failNextLedgerWrite) {
      this.failNextLedgerWrite = false;
      throw Object.assign(new Error("Simulated ledger failure"), { statusCode: 500 });
    }

    const { growthSummary, growthLogSteps } = this.settleGrowthLedger(input, growth, settings, createdAt);
    const rewardEventId = makeId("reward-event");
    const ruleSnapshot = input.settlementRule ? this.buildSettlementRuleSnapshot(input, settings, resources.currentLevel, level.currentLevel, level.rewards.map((reward) => reward.level), levelDefinitions) : undefined;
    this.db.prepare(`INSERT INTO reward_events
      (id, source_type, source_id, user_id, merchant_id, mission_id, idempotency_key, logical_request_json, reward_payload_json, growth_summary_json, level_summary_json, rule_version, rule_snapshot_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      rewardEventId,
      input.sourceType,
      input.sourceId,
      input.userId,
      input.merchantId ?? null,
      input.missionId ?? null,
      input.idempotencyKey,
      canonicalRewardRequest(input),
      JSON.stringify(rewardSummary),
      JSON.stringify(growthSummary),
      JSON.stringify(levelSummary),
      input.settlementRule?.ruleVersion ?? null,
      ruleSnapshot ? JSON.stringify(ruleSnapshot) : null,
      createdAt,
    );
    this.createPlayerEventsForSettlement(input, rewardEventId, levelSummary, levelDefinitions, createdAt);

    if (input.stars > 0) this.recordTransaction(input.userId, "stars", input.stars, resources.starBalance, starBalanceAfterBaseReward, input.sourceType, input.sourceId, input.idempotencyKey, createdAt, { rewardType: "base" }, "grant");
    if (energyAfterReward !== resources.currentEnergy || input.energy > 0) this.recordTransaction(input.userId, "energy", energyAfterReward - resources.currentEnergy, resources.currentEnergy, energyAfterReward, input.sourceType, input.sourceId, input.idempotencyKey, createdAt, { rewardEnergy: input.energy, maxEnergyBeforeLevel: resources.maxEnergy }, "grant");
    this.recordTransaction(input.userId, "exp", input.exp, resources.currentExp, level.currentExp, input.sourceType, input.sourceId, input.idempotencyKey, createdAt, {}, "grant");

    this.recordGrowthLogs(input.userId, input.sourceType, input.sourceId, createdAt, growthLogSteps);
    this.recordLevelLogsAndRewards(input, createdAt, resources, level, starBalanceAfterBaseReward);
    if (levelRefillEnergy > 0) {
      const refillSourceId = makeId("level-up-refill");
      this.recordTransaction(input.userId, "energy", levelRefillEnergy, energyAfterReward, energyAfterLevel, "level_up", refillSourceId, input.idempotencyKey, createdAt, { rewardType: "level_up_refill", levelsGained: level.levelsGained }, "grant");
      this.recordEnergyLog(input.userId, "level_up", refillSourceId, "level_up_refill", createdAt, levelRefillEnergy, energyAfterReward, energyAfterLevel, resources.energyOverflowPending + energyOverflow, resources.energyOverflowPending + energyOverflow);
    }
    if (input.energy > 0 || energyAfterReward !== resources.currentEnergy || energyOverflow > 0) this.recordEnergyLog(input.userId, input.sourceType, input.sourceId, "reward", createdAt, input.energy, resources.currentEnergy, energyAfterReward, resources.energyOverflowPending, resources.energyOverflowPending + energyOverflow);
    const nextExp = nextLevelExp(level.currentLevel, levelDefinitions);
    const persistedNextExp = nextExp ?? currentLevelRequiredExp(level.currentLevel, levelDefinitions);

    this.db.prepare(`UPDATE user_resources SET
      star_balance = ?, current_energy = ?, max_energy = ?, energy_overflow_pending = ?, current_exp = ?, current_level = ?, next_level_exp = ?, unlock_flags_json = ?, updated_at = ?
      WHERE user_id = ?`).run(
      resources.starBalance + totalStars,
      energyAfterLevel,
      level.maxEnergy,
      resources.energyOverflowPending + energyOverflow,
      level.currentExp,
      level.currentLevel,
      persistedNextExp,
      JSON.stringify(unlockFlags),
      createdAt,
      input.userId,
    );
    this.failLevelAt("after_user_resources_update");

    return {
      redemption: {
        id: input.sourceId,
        idempotencyKey: input.idempotencyKey,
        userId: input.userId,
        missionId: input.missionId ?? "",
        merchantId: input.merchantId ?? "",
        starsGranted: input.stars,
        energyGranted: input.energy,
        expGranted: input.exp,
        carbonGrams: input.carbonGrams,
        rewardEventId,
        createdAt,
      },
      user: this.getUser(input.userId),
      rewardSummary,
      growthSummary,
      levelSummary,
      ruleSnapshot,
      replayed: false,
      rewardEventId,
    };
  }

  private buildSettlementRuleSnapshot(
    input: RewardRequestInput,
    settings: EconomySettings,
    levelBefore: number,
    levelAfter: number,
    levelsCrossed: number[],
    levelDefinitions: LevelDefinition[],
  ): SettlementRuleSnapshot {
    if (!input.settlementRule) throw new Error("Missing settlement rule context");
    const levelRewards = levelsCrossed.map((level) => {
      const definition = levelDefinitions.find((item) => item.level === level);
      if (!definition) throw new Error(`Missing level definition for snapshot level ${level}`);
      return {
        level: definition.level,
        requiredTotalExp: definition.requiredTotalExp,
        rewardStars: definition.rewardStars,
        maxEnergy: getMaxEnergyForLevel(definition.level, levelDefinitions),
        unlockFlags: definition.unlockFlags,
      };
    });
    return {
      ...input.settlementRule,
      stars: input.stars,
      exp: input.exp,
      energy: input.energy,
      carbonGrams: input.carbonGrams,
      gramsPerSeed: settings.carbonGramsPerSeed,
      seedsPerPlant: settings.seedsPerPlant,
      plantsPerTree: settings.plantsPerTree,
      levelBefore,
      levelAfter,
      levelsCrossed,
      levelRewards,
    };
  }

  private createPlayerEventsForSettlement(input: RewardRequestInput, rewardEventId: string, levelSummary: LevelSummary, levelDefinitions: LevelDefinition[], createdAt: string): void {
    if (input.sourceType !== "vegetarian_purchase" || levelSummary.levelsGained <= 0) return;
    let inserted = 0;
    const insertEvent = (eventKey: string, eventType: PlayerEventQueueItem["eventType"], eventLevel: number | null, sceneId: string | null, eventName: string, payload: Record<string, unknown>) => {
      this.db.prepare(`INSERT INTO player_event_queue
        (id, user_id, source_reward_event_id, event_key, event_type, event_level, scene_id, event_name, payload_json, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`).run(
        makeId("player-event"),
        input.userId,
        rewardEventId,
        eventKey,
        eventType,
        eventLevel,
        sceneId,
        eventName,
        JSON.stringify(payload),
        createdAt,
      );
      inserted += 1;
      if (this.failNextPlayerEventQueueWrite && inserted === 1) {
        this.failNextPlayerEventQueueWrite = false;
        throw Object.assign(new Error("Simulated player event queue failure"), { statusCode: 500 });
      }
    };

    for (const reward of levelSummary.rewards) {
      const definition = levelDefinitions.find((item) => item.level === reward.level);
      if (!definition) throw new Error("Missing level definition for player event level " + reward.level);
      insertEvent(
        "reward-event:" + rewardEventId + ":level:" + reward.level,
        "level_up",
        reward.level,
        null,
        "level_up_lv" + reward.level,
        {
          level: reward.level,
          totalExpRequired: definition.requiredTotalExp,
          chestStars: reward.stars,
          maxEnergy: getMaxEnergyForLevel(reward.level, levelDefinitions),
          unlockFlags: reward.unlockFlags,
          levelBefore: levelSummary.previousLevel,
          levelAfter: levelSummary.currentLevel,
          sourceRewardEventId: rewardEventId,
        },
      );
    }

    if (levelSummary.previousLevel === 1 && levelSummary.currentLevel >= 3 && levelSummary.rewards.some((reward) => reward.level === 3)) {
      const levelThree = levelDefinitions.find((item) => item.level === 3);
      if (!levelThree) throw new Error("Missing level definition for first meal home scene");
      insertEvent(
        "reward-event:" + rewardEventId + ":home:" + FIRST_MEAL_HOME_EVENT_NAME,
        "home_scene",
        null,
        FIRST_MEAL_HOME_SCENE_ID,
        FIRST_MEAL_HOME_EVENT_NAME,
        {
          requiredLevel: 3,
          sceneId: FIRST_MEAL_HOME_SCENE_ID,
          eventName: FIRST_MEAL_HOME_EVENT_NAME,
          requiredUnlockFlags: levelThree.unlockFlags,
          sourceRewardEventId: rewardEventId,
        },
      );
    }
  }

  private settleGrowthLedger(input: RewardRequestInput, growth: UserGrowthBalance, settings: EconomySettings, createdAt: string): { growthSummary: GrowthSummary; growthLogSteps: GrowthLogStep[] } {
    let carbonTotalGrams = growth.carbonTotalGrams;
    let carbonBalanceGrams = growth.carbonBalanceGrams;
    let seedCount = growth.seedCount;
    let plantCount = growth.plantCount;
    let treeCount = growth.treeCount;
    let generatedSeeds = 0;
    let generatedPlants = 0;
    let generatedTrees = 0;
    const growthLogSteps: GrowthLogStep[] = [];

    if (input.carbonGrams > 0) {
      this.recordTransaction(input.userId, "carbon_total", input.carbonGrams, carbonTotalGrams, carbonTotalGrams + input.carbonGrams, input.sourceType, input.sourceId, input.idempotencyKey, createdAt, {}, "grant");
      carbonTotalGrams += input.carbonGrams;
      this.recordTransaction(input.userId, "carbon_balance", input.carbonGrams, carbonBalanceGrams, carbonBalanceGrams + input.carbonGrams, input.sourceType, input.sourceId, input.idempotencyKey, createdAt, {}, "grant");
      carbonBalanceGrams += input.carbonGrams;
      this.failGrowthAt("after_carbon_grant");
    }

    const seedsFromCarbon = Math.floor(carbonBalanceGrams / settings.carbonGramsPerSeed);
    if (seedsFromCarbon > 0) {
      const conversionId = makeId("conversion-carbon-to-seed");
      const carbonConsumed = seedsFromCarbon * settings.carbonGramsPerSeed;
      this.recordTransaction(input.userId, "carbon_balance", -carbonConsumed, carbonBalanceGrams, carbonBalanceGrams - carbonConsumed, input.sourceType, input.sourceId, input.idempotencyKey, createdAt, {}, "convert_debit", conversionId, "carbon_to_seed");
      carbonBalanceGrams -= carbonConsumed;
      this.failGrowthAt("after_carbon_debit");
      this.recordTransaction(input.userId, "seed", seedsFromCarbon, seedCount, seedCount + seedsFromCarbon, input.sourceType, input.sourceId, input.idempotencyKey, createdAt, {}, "convert_credit", conversionId, "carbon_to_seed");
      growthLogSteps.push({ eventType: "seed_generated", conversionId, quantity: seedsFromCarbon, beforeCount: seedCount, afterCount: seedCount + seedsFromCarbon });
      seedCount += seedsFromCarbon;
      generatedSeeds = seedsFromCarbon;
      this.failGrowthAt("after_seed_credit");
    }

    const plantsFromSeeds = Math.floor(seedCount / settings.seedsPerPlant);
    if (plantsFromSeeds > 0) {
      const conversionId = makeId("conversion-seed-to-plant");
      const seedsConsumed = plantsFromSeeds * settings.seedsPerPlant;
      this.recordTransaction(input.userId, "seed", -seedsConsumed, seedCount, seedCount - seedsConsumed, input.sourceType, input.sourceId, input.idempotencyKey, createdAt, {}, "convert_debit", conversionId, "seed_to_plant");
      seedCount -= seedsConsumed;
      this.failGrowthAt("after_seed_debit");
      this.recordTransaction(input.userId, "plant", plantsFromSeeds, plantCount, plantCount + plantsFromSeeds, input.sourceType, input.sourceId, input.idempotencyKey, createdAt, {}, "convert_credit", conversionId, "seed_to_plant");
      growthLogSteps.push({ eventType: "seeds_combined_to_plant", conversionId, quantity: plantsFromSeeds, beforeCount: plantCount, afterCount: plantCount + plantsFromSeeds });
      plantCount += plantsFromSeeds;
      generatedPlants = plantsFromSeeds;
      this.failGrowthAt("after_plant_credit");
    }

    const treesFromPlants = Math.floor(plantCount / settings.plantsPerTree);
    if (treesFromPlants > 0) {
      const conversionId = makeId("conversion-plant-to-tree");
      const plantsConsumed = treesFromPlants * settings.plantsPerTree;
      this.recordTransaction(input.userId, "plant", -plantsConsumed, plantCount, plantCount - plantsConsumed, input.sourceType, input.sourceId, input.idempotencyKey, createdAt, {}, "convert_debit", conversionId, "plant_to_tree");
      plantCount -= plantsConsumed;
      this.failGrowthAt("after_plant_debit");
      this.recordTransaction(input.userId, "tree", treesFromPlants, treeCount, treeCount + treesFromPlants, input.sourceType, input.sourceId, input.idempotencyKey, createdAt, {}, "convert_credit", conversionId, "plant_to_tree");
      growthLogSteps.push({ eventType: "plants_combined_to_tree", conversionId, quantity: treesFromPlants, beforeCount: treeCount, afterCount: treeCount + treesFromPlants });
      treeCount += treesFromPlants;
      generatedTrees = treesFromPlants;
      this.failGrowthAt("after_tree_credit");
    }

    const growthSummary = { generatedSeeds, generatedPlants, generatedTrees, seedCount, plantCount, treeCount, carbonTotalGrams, carbonBalanceGrams };
    this.failGrowthAt("before_growth_balance_update");
    this.db.prepare(`UPDATE user_growth_balances SET
      carbon_total_grams = ?, carbon_balance_grams = ?, seed_count = ?, plant_count = ?, tree_count = ?, version = version + 1, updated_at = ?
      WHERE user_id = ?`).run(
      growthSummary.carbonTotalGrams,
      growthSummary.carbonBalanceGrams,
      growthSummary.seedCount,
      growthSummary.plantCount,
      growthSummary.treeCount,
      createdAt,
      input.userId,
    );
    this.failGrowthAt("after_growth_balance_update");
    return { growthSummary, growthLogSteps };
  }

  private failGrowthAt(point: GrowthFailurePoint): void {
    if (this.failNextGrowthSettlementAt !== point) return;
    this.failNextGrowthSettlementAt = undefined;
    throw Object.assign(new Error(`Simulated growth settlement failure: ${point}`), { statusCode: 500 });
  }

  private applyEnergyRegeneration(userId: string): void {
    const row = this.db.prepare("SELECT * FROM user_resources WHERE user_id = ?").get(userId) as Row | undefined;
    if (!row) return;
    const currentEnergy = requireNumber(row.current_energy);
    const maxEnergy = requireNumber(row.max_energy);
    if (maxEnergy <= 0) return;
    const interval = this.economySettings.energyRegenIntervalSeconds;
    if (interval <= 0) return;
    const lastUpdated = new Date(requireString(row.energy_last_updated_at)).getTime();
    const nowMs = Date.now();
    if (!Number.isFinite(lastUpdated) || nowMs <= lastUpdated) return;
    const elapsedSeconds = Math.floor((nowMs - lastUpdated) / 1000);
    const ticks = Math.floor(elapsedSeconds / interval);
    if (ticks <= 0) return;
    const nextLast = new Date(lastUpdated + ticks * interval * 1000).toISOString();
    const createdAt = nowIso();
    if (currentEnergy >= maxEnergy) {
      this.db.prepare("UPDATE user_resources SET energy_regen_interval_seconds = ?, energy_last_updated_at = ?, updated_at = ? WHERE user_id = ?").run(interval, nextLast, createdAt, userId);
      return;
    }
    const recovered = Math.min(ticks, maxEnergy - currentEnergy);
    const nextEnergy = currentEnergy + recovered;
    this.db.prepare("UPDATE user_resources SET current_energy = ?, energy_regen_interval_seconds = ?, energy_last_updated_at = ?, updated_at = ? WHERE user_id = ?").run(nextEnergy, interval, nextLast, createdAt, userId);
    const sourceId = makeId("energy-regen");
    this.recordTransaction(userId, "energy", recovered, currentEnergy, nextEnergy, "daily_login", sourceId, sourceId, createdAt, { lazyRegeneration: true, ticks });
    this.recordEnergyLog(userId, "daily_login", sourceId, "natural_regen", createdAt, recovered, currentEnergy, nextEnergy, requireNumber(row.energy_overflow_pending), requireNumber(row.energy_overflow_pending));
    this.audit("user", userId, "resource.energy_regenerated", "resource_transaction", sourceId, { recovered });
  }

  private requireTaskCodeMerchant(merchantId: string): MerchantProfile {
    const merchant = this.getMerchant(merchantId);
    if (merchant.status !== "active" || !merchant.canRedeem) throw Object.assign(new Error("店家不存在或不可用"), { statusCode: 409 });
    return merchant;
  }

  private ensureUserExists(userId: string): void {
    const row = this.db.prepare("SELECT id FROM users WHERE id = ?").get(userId) as Row | undefined;
    if (!row) throw Object.assign(new Error("找不到使用者"), { statusCode: 404 });
  }

  private expireTaskCodeWindows(now: string): void {
    this.db.prepare("UPDATE task_code_windows SET status = 'expired' WHERE status = 'active' AND valid_until <= ?").run(now);
  }

  private expirePendingTaskCodeSubmissions(now: string): void {
    this.db.prepare("UPDATE task_code_submissions SET status = 'expired' WHERE status = 'pending' AND confirmation_expires_at <= ?").run(now);
  }

  private findActiveTaskCodeWindow(merchantId: string): TaskCodeWindow | undefined {
    const row = this.db.prepare("SELECT * FROM task_code_windows WHERE merchant_id = ? AND status = 'active' ORDER BY valid_until DESC LIMIT 1").get(merchantId) as Row | undefined;
    return row ? this.mapTaskCodeWindow(row) : undefined;
  }

  private withTaskCode(window: TaskCodeWindow): CurrentTaskCodeWindow {
    const code = deriveTaskCode(this.taskCodeSecret, window.id, window.merchantId, window.codeLength);
    const codeHash = hashTaskCode(this.taskCodeSecret, window.id, window.merchantId, window.codeLength, code);
    if (codeHash !== window.codeHash) throw configurationError("Stored task code hash does not match current server secret");
    return { ...window, windowId: window.id, code };
  }

  private findReplayableRewardEvent(input: RewardRequestInput): RewardEvent | undefined {
    const row = this.db.prepare("SELECT * FROM reward_events WHERE idempotency_key = ?").get(input.idempotencyKey) as Row | undefined;
    if (!row) return undefined;
    const expected = canonicalRewardRequest(input);
    const actual = requireString(row.logical_request_json);
    if (actual !== expected) {
      const legacy = parseJson<{ legacy?: boolean }>(actual, {});
      const rewardPayload = parseJson<RewardSummary>(row.reward_payload_json, buildRewardSummary(0, 0, 0, 0, 0));
      const sameLegacyRequest = legacy.legacy === true
        && requireString(row.user_id) === input.userId
        && requireString(row.source_type) === input.sourceType
        && (row.merchant_id ? requireString(row.merchant_id) : undefined) === input.merchantId
        && (row.mission_id ? requireString(row.mission_id) : undefined) === input.missionId
        && rewardPayload.stars === input.stars
        && rewardPayload.energy === input.energy
        && rewardPayload.exp === input.exp
        && rewardPayload.carbonGrams === input.carbonGrams;
      if (!sameLegacyRequest) throw conflict("冪等鍵已被不同 reward request 使用");
    }
    return this.mapRewardEvent(row);
  }

  private findReplayableVegetarianRedemption(input: { userId: string; missionId: string; merchantId: string; idempotencyKey: string }): RewardEvent | undefined {
    const row = this.db.prepare("SELECT * FROM reward_events WHERE idempotency_key = ?").get(input.idempotencyKey) as Row | undefined;
    if (!row) return undefined;
    const event = this.mapRewardEvent(row);
    const logicalRequest = parseJson<{ sourceId?: string }>(row.logical_request_json, {});
    const sameRequest = event.sourceType === "vegetarian_purchase"
      && event.userId === input.userId
      && event.merchantId === input.merchantId
      && event.missionId === input.missionId
      && logicalRequest.sourceId === input.missionId;
    if (!sameRequest) throw conflict("冪等鍵已被不同 reward request 使用");
    return event;
  }

  private rebuildSettlement(redemption: Redemption, replayed: boolean): SettlementResult {
    const event = this.db.prepare("SELECT * FROM reward_events WHERE source_type = 'vegetarian_purchase' AND source_id = ? AND user_id = ?").get(redemption.id, redemption.userId) as Row | undefined;
    if (!event) throw Object.assign(new Error("找不到核銷 settlement 結果"), { statusCode: 500 });
    const rewardEvent = this.mapRewardEvent(event);
    return {
      redemption,
      user: this.getUser(redemption.userId),
      rewardSummary: rewardEvent.rewardPayload,
      growthSummary: rewardEvent.growthSummary,
      levelSummary: rewardEvent.levelSummary,
      ruleSnapshot: rewardEvent.ruleSnapshot,
      replayed,
    };
  }

  private rebuildSettlementFromRewardEvent(event: RewardEvent, replayed: boolean): SettlementResult {
    return {
      redemption: {
        id: event.sourceId,
        idempotencyKey: event.idempotencyKey,
        userId: event.userId,
        missionId: event.missionId ?? "",
        merchantId: event.merchantId ?? "",
        starsGranted: event.rewardPayload.stars,
        energyGranted: event.rewardPayload.energy,
      expGranted: event.rewardPayload.exp,
      carbonGrams: event.rewardPayload.carbonGrams,
      rewardEventId: event.id,
      createdAt: event.createdAt,
    },
      user: this.getUser(event.userId),
      rewardSummary: event.rewardPayload,
      growthSummary: event.growthSummary,
      levelSummary: event.levelSummary,
      ruleSnapshot: event.ruleSnapshot,
      replayed,
    };
  }

  private findRedemptionByKey(idempotencyKey: string): Redemption | undefined {
    const row = this.db.prepare("SELECT * FROM redemptions WHERE idempotency_key = ?").get(idempotencyKey) as Row | undefined;
    return row ? this.mapRedemption(row) : undefined;
  }

  private getResources(userId: string): UserResources {
    const row = this.db.prepare("SELECT * FROM user_resources WHERE user_id = ?").get(userId) as Row | undefined;
    if (!row) throw Object.assign(new Error("找不到使用者資源"), { statusCode: 404 });
    const currentLevel = requireNumber(row.current_level);
    const levelDefinitions = this.levelDefinitions;
    const nextExp = nextLevelExp(currentLevel, levelDefinitions);
    return {
      starBalance: requireNumber(row.star_balance),
      currentEnergy: requireNumber(row.current_energy),
      maxEnergy: requireNumber(row.max_energy),
      energyRegenIntervalSeconds: this.economySettings.energyRegenIntervalSeconds,
      energyLastUpdatedAt: requireString(row.energy_last_updated_at),
      energyOverflowPending: requireNumber(row.energy_overflow_pending),
      currentExp: requireNumber(row.current_exp),
      currentLevel,
      nextLevelExp: nextExp,
      isMaxLevel: nextExp === null,
      unlockFlags: parseJson<string[]>(row.unlock_flags_json, []),
    };
  }

  private getGrowth(userId: string): UserGrowthBalance {
    const row = this.db.prepare("SELECT * FROM user_growth_balances WHERE user_id = ?").get(userId) as Row | undefined;
    if (!row) throw Object.assign(new Error("找不到使用者成長資料"), { statusCode: 404 });
    return {
      carbonTotalGrams: requireNumber(row.carbon_total_grams),
      carbonBalanceGrams: requireNumber(row.carbon_balance_grams),
      seedCount: requireNumber(row.seed_count),
      plantCount: requireNumber(row.plant_count),
      treeCount: requireNumber(row.tree_count),
      version: requireNumber(row.version),
      updatedAt: requireString(row.updated_at),
    };
  }

  private recordTransaction(
    userId: string,
    resourceType: ResourceTransaction["resourceType"],
    amount: number,
    balanceBefore: number,
    balanceAfter: number,
    sourceType: RewardSourceType,
    sourceId: string,
    idempotencyKey: string,
    createdAt: string,
    metadata: Record<string, string | number | boolean>,
    transactionKind: ResourceTransactionKind = "grant",
    conversionId = "",
    conversionType: ResourceConversionType = "none",
  ): void {
    this.db.prepare(`INSERT INTO resource_transactions
      (id, user_id, resource_type, amount, balance_before, balance_after, transaction_kind, conversion_id, conversion_type, source_type, source_id, idempotency_key, created_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      makeId("resource-transaction"),
      userId,
      resourceType,
      amount,
      balanceBefore,
      balanceAfter,
      transactionKind,
      conversionId,
      conversionType,
      sourceType,
      sourceId,
      idempotencyKey,
      createdAt,
      JSON.stringify(metadata),
    );
  }

  private recordEnergyLog(userId: string, sourceType: RewardSourceType, sourceId: string, eventType: EnergyLogEventType, createdAt: string, amount: number, before: number, after: number, overflowBefore: number, overflowAfter: number): void {
    this.db.prepare(`INSERT INTO energy_logs
      (id, user_id, event_type, amount, energy_before, energy_after, overflow_before, overflow_after, source_type, source_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      makeId("energy-log"),
      userId,
      eventType,
      amount,
      before,
      after,
      overflowBefore,
      overflowAfter,
      sourceType,
      sourceId,
      createdAt,
    );
  }

  private recordGrowthLogs(userId: string, sourceType: RewardSourceType, sourceId: string, createdAt: string, steps: GrowthLogStep[]): void {
    for (const step of steps) {
      this.db.prepare("INSERT INTO plant_growth_logs (id, user_id, source_type, source_id, event_type, conversion_id, quantity, before_count, after_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
        makeId("growth-log"),
        userId,
        sourceType,
        sourceId,
        step.eventType,
        step.conversionId,
        step.quantity,
        step.beforeCount,
        step.afterCount,
        createdAt,
      );
    }
  }

  private recordLevelLogsAndRewards(input: RewardRequestInput, createdAt: string, before: UserResources, level: ReturnType<typeof applyLevelProgress>, starBalanceAfterBaseReward: number): void {
    let previousLevel = before.currentLevel;
    let maxBefore = before.maxEnergy;
    let starBalance = starBalanceAfterBaseReward;
    let loggedLevels = 0;
    for (const reward of level.rewards) {
      const maxAfter = maxBefore + reward.maxEnergyIncrease;
      const levelUpId = makeId("level-up");
      this.db.prepare(`INSERT INTO level_up_logs
        (id, user_id, previous_level, new_level, reward_stars, max_energy_before, max_energy_after, unlock_flags_json, source_type, source_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        levelUpId,
        input.userId,
        previousLevel,
        reward.level,
        reward.stars,
        maxBefore,
        maxAfter,
        JSON.stringify(reward.unlockFlags),
        input.sourceType,
        input.sourceId,
        createdAt,
      );
      loggedLevels += 1;
      if (loggedLevels === 1) this.failLevelAt("after_first_level_log");
      if (reward.stars > 0) {
        this.recordTransaction(input.userId, "stars", reward.stars, starBalance, starBalance + reward.stars, "level_up", levelUpId, input.idempotencyKey, createdAt, { level: reward.level, settlementSourceType: input.sourceType, settlementSourceId: input.sourceId }, "grant");
        starBalance += reward.stars;
        this.failLevelAt("after_level_reward_star_ledger");
      }
      previousLevel = reward.level;
      maxBefore = maxAfter;
    }
  }

  private failLevelAt(point: LevelFailurePoint): void {
    if (this.failNextLevelSettlementAt !== point) return;
    this.failNextLevelSettlementAt = undefined;
    throw Object.assign(new Error(`Simulated level settlement failure: ${point}`), { statusCode: 500 });
  }

  private audit(actorRole: AuditEvent["actorRole"], actorId: string, action: AuditEvent["action"], entityType: AuditEvent["entityType"], entityId: string, metadata: AuditEvent["metadata"]): void {
    this.db.prepare("INSERT INTO audit_events (id, actor_role, actor_id, action, entity_type, entity_id, created_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      makeId("audit"),
      actorRole,
      actorId,
      action,
      entityType,
      entityId,
      nowIso(),
      JSON.stringify(metadata),
    );
  }

  private branchCreateResponse(merchant: MerchantProfile): MerchantBranchCreateResult["merchant"] {
    return {
      merchantId: merchant.id,
      brandId: merchant.brandId,
      brandDisplayName: merchant.brandDisplayName,
      branchCode: merchant.branchCode,
      storeName: merchant.storeName,
      address: merchant.address,
      rewardCategory: merchant.rewardCategory,
      timezone: merchant.timezone,
      merchantPlan: merchant.merchantPlan,
      createdAt: merchant.createdAt,
    };
  }

  private mapApplication(row: Row): MerchantApplication {
    return {
      id: requireString(row.id),
      storeName: requireString(row.store_name),
      contactName: requireString(row.contact_name),
      contactLineId: requireString(row.contact_line_id),
      phone: requireString(row.phone),
      email: requireString(row.email),
      address: requireString(row.address),
      storeCategory: requireString(row.store_category) as MerchantApplication["storeCategory"],
      otherStoreCategory: requireString(row.other_store_category),
      vegetarianOffering: parseJson(row.vegetarian_offering_json, []),
      otherMealType: requireString(row.other_meal_type),
      businessHours: parseJson<BusinessDayHours[]>(row.business_hours_json, []),
      status: requireString(row.status) as MerchantApplication["status"],
      submittedAt: requireString(row.submitted_at),
      reviewedAt: row.reviewed_at ? requireString(row.reviewed_at) : undefined,
      reviewNote: row.review_note ? requireString(row.review_note) : undefined,
      merchantId: row.merchant_id ? requireString(row.merchant_id) : undefined,
    };
  }

  private mapAccount(row: Row): Account {
    const playerUserId = row.player_user_id ? requireString(row.player_user_id) : null;
    return {
      accountId: requireString(row.id),
      displayName: requireString(row.display_name),
      status: requireString(row.status) as AccountStatus,
      hasPlayerProfile: playerUserId !== null,
      playerUserId,
      createdAt: requireString(row.created_at),
      updatedAt: requireString(row.updated_at),
    };
  }

  private mapMerchant(row: Row): MerchantProfile {
    return {
      id: requireString(row.id),
      applicationId: requireString(row.application_id),
      brandId: requireString(row.brand_id),
      brandDisplayName: row.brand_display_name ? requireString(row.brand_display_name) : requireString(row.store_name),
      branchCode: row.branch_code ? requireString(row.branch_code) : "main",
      storeName: requireString(row.store_name),
      address: requireString(row.address),
      storeCategory: requireString(row.store_category) as MerchantProfile["storeCategory"],
      otherStoreCategory: requireString(row.other_store_category),
      vegetarianOffering: parseJson(row.vegetarian_offering_json, []),
      otherMealType: requireString(row.other_meal_type),
      businessHours: parseJson<BusinessDayHours[]>(row.business_hours_json, []),
      status: requireString(row.status) as MerchantProfile["status"],
      canRedeem: Boolean(row.can_redeem),
      merchantPlan: requireString(row.merchant_plan) as MerchantPlan,
      rewardStarAmount: requireNumber(row.reward_star_amount),
      rewardCategory: (row.reward_category ? requireString(row.reward_category) : "general") as MerchantRewardCategory,
      timezone: row.timezone ? requireString(row.timezone) : "Asia/Taipei",
      createdAt: requireString(row.created_at),
    };
  }

  private mapMission(row: Row): Mission {
    const merchant = this.getMerchant(requireString(row.merchant_id));
    const settings = this.economySettings;
    return {
      id: requireString(row.id),
      merchantId: requireString(row.merchant_id),
      title: requireString(row.title),
      description: requireString(row.description),
      starReward: merchant.rewardStarAmount,
      energyReward: settings.redemptionEnergy,
      expReward: settings.redemptionExp,
      carbonGrams: settings.vegetarianCarbonGrams,
    };
  }

  private mapEnrollment(row: Row): MissionEnrollment {
    return {
      userId: requireString(row.user_id),
      missionId: requireString(row.mission_id),
      status: requireString(row.status) as MissionEnrollment["status"],
      acceptedAt: requireString(row.accepted_at),
      completedAt: row.completed_at ? requireString(row.completed_at) : undefined,
    };
  }

  private mapUser(row: Row): UserProgress {
    const id = requireString(row.id);
    const resources = this.getResources(id);
    const growth = this.getGrowth(id);
    const enrollments = (this.db.prepare("SELECT * FROM mission_enrollments WHERE user_id = ? ORDER BY accepted_at").all(id) as Row[]).map((item) => this.mapEnrollment(item));
    const latestRewardRow = this.db.prepare("SELECT * FROM reward_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(id) as Row | undefined;
    return {
      id,
      displayName: requireString(row.display_name),
      stars: resources.starBalance,
      energy: resources.currentEnergy,
      resources,
      growth,
      enrollments,
      latestRewardEvent: latestRewardRow ? this.mapRewardEvent(latestRewardRow) : undefined,
    };
  }

  private mapRedemption(row: Row): Redemption {
    return {
      id: requireString(row.id),
      idempotencyKey: requireString(row.idempotency_key),
      userId: requireString(row.user_id),
      missionId: requireString(row.mission_id),
      merchantId: requireString(row.merchant_id),
      starsGranted: requireNumber(row.stars_granted),
      energyGranted: requireNumber(row.energy_granted),
      expGranted: requireNumber(row.exp_granted),
      carbonGrams: requireNumber(row.carbon_grams),
      rewardEventId: row.reward_event_id ? requireString(row.reward_event_id) : undefined,
      createdAt: requireString(row.created_at),
    };
  }

  private mapResourceTransaction(row: Row): ResourceTransaction {
    return {
      id: requireString(row.id),
      userId: requireString(row.user_id),
      resourceType: requireString(row.resource_type) as ResourceTransaction["resourceType"],
      amount: requireNumber(row.amount),
      balanceBefore: requireNumber(row.balance_before),
      balanceAfter: requireNumber(row.balance_after),
      transactionKind: requireString(row.transaction_kind) as ResourceTransactionKind,
      conversionId: requireString(row.conversion_id),
      conversionType: requireString(row.conversion_type) as ResourceConversionType,
      sourceType: requireString(row.source_type) as RewardSourceType,
      sourceId: requireString(row.source_id),
      idempotencyKey: requireString(row.idempotency_key),
      createdAt: requireString(row.created_at),
      metadata: parseJson(row.metadata_json, {}),
    };
  }

  private mapRewardEvent(row: Row): RewardEvent {
    return {
      id: requireString(row.id),
      sourceType: requireString(row.source_type) as RewardSourceType,
      sourceId: requireString(row.source_id),
      userId: requireString(row.user_id),
      merchantId: row.merchant_id ? requireString(row.merchant_id) : undefined,
      missionId: row.mission_id ? requireString(row.mission_id) : undefined,
      idempotencyKey: requireString(row.idempotency_key),
      rewardPayload: parseJson<RewardSummary>(row.reward_payload_json, buildRewardSummary(0, 0, 0, 0, 0)),
      growthSummary: parseJson<GrowthSummary>(row.growth_summary_json, { generatedSeeds: 0, generatedPlants: 0, generatedTrees: 0, seedCount: 0, plantCount: 0, treeCount: 0, carbonTotalGrams: 0, carbonBalanceGrams: 0 }),
      levelSummary: parseJson<LevelSummary>(row.level_summary_json, { previousLevel: 1, currentLevel: 1, levelsGained: 0, rewards: [] }),
      ruleVersion: row.rule_version ? requireString(row.rule_version) : undefined,
      ruleSnapshot: row.rule_snapshot_json ? parseJson<SettlementRuleSnapshot>(row.rule_snapshot_json, undefined as unknown as SettlementRuleSnapshot) : undefined,
      createdAt: requireString(row.created_at),
    };
  }

  private mapPlantGrowthLog(row: Row): PlantGrowthLog {
    return {
      id: requireString(row.id),
      userId: requireString(row.user_id),
      sourceType: requireString(row.source_type) as RewardSourceType,
      sourceId: requireString(row.source_id),
      eventType: requireString(row.event_type) as PlantGrowthLog["eventType"],
      conversionId: requireString(row.conversion_id),
      quantity: requireNumber(row.quantity),
      beforeCount: requireNumber(row.before_count),
      afterCount: requireNumber(row.after_count),
      createdAt: requireString(row.created_at),
    };
  }

  private mapTaskCodeWindow(row: Row): TaskCodeWindow {
    return {
      id: requireString(row.id),
      merchantId: requireString(row.merchant_id),
      codeHash: requireString(row.code_hash),
      codeLength: requireNumber(row.code_length) as TaskCodeWindow["codeLength"],
      validFrom: requireString(row.valid_from),
      validUntil: requireString(row.valid_until),
      status: requireString(row.status) as TaskCodeWindow["status"],
      createdAt: requireString(row.created_at),
    };
  }

  private mapTaskCodeSubmission(row: Row): TaskCodeSubmission {
    return {
      id: requireString(row.id),
      taskCodeWindowId: requireString(row.task_code_window_id),
      merchantId: requireString(row.merchant_id),
      missionId: requireString(row.mission_id),
      userId: requireString(row.user_id),
      status: requireString(row.status) as TaskCodeSubmission["status"],
      submittedAt: requireString(row.submitted_at),
      confirmationExpiresAt: requireString(row.confirmation_expires_at),
      confirmedAt: row.confirmed_at ? requireString(row.confirmed_at) : undefined,
      rejectedAt: row.rejected_at ? requireString(row.rejected_at) : undefined,
      settledAt: row.settled_at ? requireString(row.settled_at) : undefined,
      idempotencyKey: requireString(row.idempotency_key),
      decidedBy: row.decided_by ? requireString(row.decided_by) : undefined,
      decisionIdempotencyKey: row.decision_idempotency_key ? requireString(row.decision_idempotency_key) : undefined,
      redemptionId: row.redemption_id ? requireString(row.redemption_id) : undefined,
      rewardEventId: row.reward_event_id ? requireString(row.reward_event_id) : undefined,
    };
  }

  private mapMerchantTaskCodeSubmission(row: Row): MerchantTaskCodeSubmission {
    const submission = this.mapTaskCodeSubmission(row);
    return {
      ...submission,
      user: {
        id: submission.userId,
        displayName: requireString(row.user_display_name),
      },
      mission: {
        id: submission.missionId,
        title: requireString(row.mission_title),
      },
    };
  }

  private mapPlayerEventQueueItem(row: Row): PlayerEventQueueItem {
    return {
      queueOrder: requireNumber(row.queue_order),
      id: requireString(row.id),
      userId: requireString(row.user_id),
      sourceRewardEventId: requireString(row.source_reward_event_id),
      eventKey: requireString(row.event_key),
      eventType: requireString(row.event_type) as PlayerEventQueueItem["eventType"],
      eventLevel: row.event_level === null || row.event_level === undefined ? undefined : requireNumber(row.event_level),
      sceneId: row.scene_id ? requireString(row.scene_id) : undefined,
      eventName: requireString(row.event_name),
      payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
      status: requireString(row.status) as PlayerEventQueueItem["status"],
      createdAt: requireString(row.created_at),
      resolvedAt: row.resolved_at ? requireString(row.resolved_at) : undefined,
      resolutionIdempotencyKey: row.resolution_idempotency_key ? requireString(row.resolution_idempotency_key) : undefined,
    };
  }

  private mapAudit(row: Row): AuditEvent {
    return {
      id: requireString(row.id),
      actorRole: requireString(row.actor_role) as AuditEvent["actorRole"],
      actorId: requireString(row.actor_id),
      action: requireString(row.action) as AuditEvent["action"],
      entityType: requireString(row.entity_type) as AuditEvent["entityType"],
      entityId: requireString(row.entity_id),
      createdAt: requireString(row.created_at),
      metadata: parseJson(row.metadata_json, {}),
    };
  }
}
