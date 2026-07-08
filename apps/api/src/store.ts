import type {
  AdminOverview,
  AuditEvent,
  BusinessDayHours,
  EconomySettings,
  GrowthSummary,
  LevelSummary,
  MerchantApplication,
  MerchantApplicationInput,
  MerchantPlan,
  MerchantProfile,
  Mission,
  MissionEnrollment,
  PlantGrowthLog,
  Redemption,
  ResourceTransaction,
  RewardEvent,
  RewardSourceType,
  RewardSummary,
  SettlementResult,
  UserGrowthBalance,
  UserProgress,
  UserResources,
} from "@looper/types";
import { WEEKDAYS } from "@looper/types";
import { applyGrowth, applyLevelProgress, buildRewardSummary, DEFAULT_ECONOMY_SETTINGS, nextLevelExp } from "./economy.js";
import { openDatabase } from "./database.js";

import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

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
};
type SettlementWithEventId = SettlementResult & { rewardEventId: string };

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

function isSqliteConstraintError(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  return code === "ERR_SQLITE_CONSTRAINT" || String((error as Error).message ?? "").includes("constraint failed");
}

function conflict(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 409 });
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
  failNextLedgerWrite = false;
  failNextMerchantMissionWrite = false;

  constructor(databasePath?: string) {
    this.db = openDatabase(databasePath);
  }

  close(): void {
    this.db.close();
  }

  get economySettings(): EconomySettings {
    const row = this.db.prepare("SELECT value_json FROM economy_settings WHERE key = 'core'").get() as Row | undefined;
    return row ? parseJson<EconomySettings>(row.value_json, DEFAULT_ECONOMY_SETTINGS) : DEFAULT_ECONOMY_SETTINGS;
  }

  get merchantPlans() {
    return (this.db.prepare("SELECT plan, label, reward_star_amount FROM merchant_plan_definitions ORDER BY reward_star_amount").all() as Row[]).map((row) => ({
      plan: requireString(row.plan) as MerchantPlan,
      label: requireString(row.label),
      rewardStarAmount: requireNumber(row.reward_star_amount),
    }));
  }

  get levelDefinitions() {
    return (this.db.prepare("SELECT level, required_total_exp, reward_stars, max_energy_increase, unlock_flags_json FROM level_definitions ORDER BY level").all() as Row[]).map((row) => ({
      level: requireNumber(row.level),
      requiredTotalExp: requireNumber(row.required_total_exp),
      rewardStars: requireNumber(row.reward_stars),
      maxEnergyIncrease: requireNumber(row.max_energy_increase),
      unlockFlags: parseJson<string[]>(row.unlock_flags_json, []),
    }));
  }

  get merchants(): MerchantProfile[] {
    return (this.db.prepare("SELECT * FROM merchants ORDER BY created_at").all() as Row[]).map((row) => this.mapMerchant(row));
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

  listResourceTransactions(): ResourceTransaction[] {
    return (this.db.prepare("SELECT * FROM resource_transactions ORDER BY created_at").all() as Row[]).map((row) => this.mapResourceTransaction(row));
  }

  listRewardEvents(): RewardEvent[] {
    return (this.db.prepare("SELECT * FROM reward_events ORDER BY created_at").all() as Row[]).map((row) => this.mapRewardEvent(row));
  }

  listPlantGrowthLogs(): PlantGrowthLog[] {
    return (this.db.prepare("SELECT * FROM plant_growth_logs ORDER BY created_at").all() as Row[]).map((row) => this.mapPlantGrowthLog(row));
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
    const merchant = this.db.prepare("SELECT * FROM merchants WHERE id = ?").get(merchantId) as Row | undefined;
    if (!merchant) throw Object.assign(new Error("找不到合作店家"), { statusCode: 404 });
    return this.mapMerchant(merchant);
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
      const merchantId = makeId("merchant");
      this.db.prepare(`INSERT INTO merchants
        (id, application_id, store_name, address, store_category, other_store_category, vegetarian_offering_json, other_meal_type, business_hours_json, status, can_redeem, merchant_plan, reward_star_amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?)`).run(
        merchantId,
        applicationId,
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

  redeem(input: { userId: string; missionId: string; merchantId: string; idempotencyKey: string }): SettlementResult {
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
      partial.nextLevelExp ?? current.nextLevelExp,
      JSON.stringify(partial.unlockFlags ?? current.unlockFlags),
      nowIso(),
      userId,
    );
  }

  private redeemInTransaction(input: { userId: string; missionId: string; merchantId: string; idempotencyKey: string }): SettlementResult {
    const merchant = this.getMerchant(input.merchantId);
    if (merchant.status !== "active" || !merchant.canRedeem) throw Object.assign(new Error("此店家目前不可核銷"), { statusCode: 409 });
    const mission = this.getMission(input.missionId);
    if (mission.merchantId !== input.merchantId) throw Object.assign(new Error("任務不屬於此店家"), { statusCode: 403 });
    const settings = this.economySettings;
    const replayInput: RewardRequestInput = {
      userId: input.userId,
      sourceType: "vegetarian_purchase",
      sourceId: "pending-redemption",
      logicalSourceId: input.missionId,
      idempotencyKey: input.idempotencyKey,
      merchantId: input.merchantId,
      missionId: input.missionId,
      stars: merchant.rewardStarAmount,
      energy: settings.redemptionEnergy,
      exp: settings.redemptionExp,
      carbonGrams: settings.vegetarianCarbonGrams,
    };
    const replay = this.findReplayableRewardEvent(replayInput);
    if (replay) {
      this.audit("merchant", input.merchantId, "redemption.replayed", "redemption", replay.sourceId, { idempotencyKey: input.idempotencyKey });
      return this.rebuildSettlementFromRewardEvent(replay, true);
    }
    const enrollment = this.db.prepare("SELECT * FROM mission_enrollments WHERE user_id = ? AND mission_id = ?").get(input.userId, input.missionId) as Row | undefined;
    if (!enrollment) throw Object.assign(new Error("使用者尚未接取此任務"), { statusCode: 409 });
    if (enrollment.status === "completed") throw Object.assign(new Error("此任務已完成核銷"), { statusCode: 409 });

    const redemptionId = makeId("redemption");
    const createdAt = nowIso();
    this.db.prepare(`INSERT INTO redemptions
      (id, idempotency_key, user_id, mission_id, merchant_id, stars_granted, energy_granted, exp_granted, carbon_grams, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      redemptionId,
      input.idempotencyKey,
      input.userId,
      input.missionId,
      input.merchantId,
      merchant.rewardStarAmount,
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
      stars: merchant.rewardStarAmount,
      energy: settings.redemptionEnergy,
      exp: settings.redemptionExp,
      carbonGrams: settings.vegetarianCarbonGrams,
    });
    this.db.prepare("UPDATE redemptions SET reward_event_id = ? WHERE id = ?").run(result.rewardEventId, redemptionId);
    this.db.prepare("UPDATE mission_enrollments SET status = 'completed', completed_at = ? WHERE user_id = ? AND mission_id = ?").run(createdAt, input.userId, input.missionId);
    this.audit("merchant", input.merchantId, "redemption.created", "redemption", redemptionId, {
      starsGranted: merchant.rewardStarAmount,
      energyGranted: settings.redemptionEnergy,
      expGranted: settings.redemptionExp,
      carbonGrams: settings.vegetarianCarbonGrams,
    });
    const { rewardEventId: _rewardEventId, ...settlement } = result;
    return { ...settlement, redemption: this.findRedemptionByKey(input.idempotencyKey)!, user: this.getUser(input.userId), replayed: false };
  }

  private applyRewardEvent(input: {
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
  }): SettlementWithEventId {
    const createdAt = nowIso();
    const resources = this.getResources(input.userId);
    const growth = this.getGrowth(input.userId);
    const settings = this.economySettings;

    const energyLimit = Math.floor(resources.maxEnergy * settings.energyOverflowMultiplier);
    const rawEnergyAfter = resources.currentEnergy + input.energy;
    const energyAfterReward = Math.min(rawEnergyAfter, energyLimit);
    const energyOverflow = Math.max(0, rawEnergyAfter - energyLimit);
    const level = applyLevelProgress({
      currentLevel: resources.currentLevel,
      currentExp: resources.currentExp,
      currentMaxEnergy: resources.maxEnergy,
      expDelta: input.exp,
    });
    const energyAfterLevel = level.levelsGained > 0 ? Math.max(energyAfterReward, level.maxEnergy) : energyAfterReward;
    const unlockFlags = [...new Set([...resources.unlockFlags, ...level.unlockFlags])];
    const totalStars = input.stars + level.levelRewardStars;
    const growthSummary = applyGrowth({ ...growth, carbonDeltaGrams: input.carbonGrams, settings });
    const rewardSummary = buildRewardSummary(input.stars, input.energy, energyOverflow, input.exp, input.carbonGrams);
    const levelSummary: LevelSummary = {
      previousLevel: level.previousLevel,
      currentLevel: level.currentLevel,
      levelsGained: level.levelsGained,
      rewards: level.rewards,
    };

    const rewardEventId = makeId("reward-event");
    this.db.prepare(`INSERT INTO reward_events
      (id, source_type, source_id, user_id, merchant_id, mission_id, idempotency_key, logical_request_json, reward_payload_json, growth_summary_json, level_summary_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
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
      createdAt,
    );

    if (this.failNextLedgerWrite) {
      this.failNextLedgerWrite = false;
      throw Object.assign(new Error("Simulated ledger failure"), { statusCode: 500 });
    }

    this.recordTransaction(input.userId, "stars", totalStars, resources.starBalance, resources.starBalance + totalStars, input.sourceType, input.sourceId, input.idempotencyKey, createdAt, { baseStars: input.stars, levelRewardStars: level.levelRewardStars });
    this.recordTransaction(input.userId, "energy", input.energy, resources.currentEnergy, energyAfterLevel, input.sourceType, input.sourceId, input.idempotencyKey, createdAt, { maxEnergy: level.maxEnergy });
    if (energyOverflow > 0) this.recordTransaction(input.userId, "energy_overflow", energyOverflow, resources.energyOverflowPending, resources.energyOverflowPending + energyOverflow, input.sourceType, input.sourceId, input.idempotencyKey, createdAt, {});
    this.recordTransaction(input.userId, "exp", input.exp, resources.currentExp, level.currentExp, input.sourceType, input.sourceId, input.idempotencyKey, createdAt, {});
    if (input.carbonGrams > 0) {
      this.recordTransaction(input.userId, "carbon_total", input.carbonGrams, growth.carbonTotalGrams, growthSummary.carbonTotalGrams, input.sourceType, input.sourceId, input.idempotencyKey, createdAt, {});
      this.recordTransaction(input.userId, "carbon_balance", input.carbonGrams, growth.carbonBalanceGrams, growthSummary.carbonBalanceGrams, input.sourceType, input.sourceId, input.idempotencyKey, createdAt, { generatedSeeds: growthSummary.generatedSeeds });
    }
    if (growthSummary.generatedSeeds > 0) this.recordTransaction(input.userId, "seed", growthSummary.generatedSeeds, growth.seedCount, growthSummary.seedCount, input.sourceType, input.sourceId, input.idempotencyKey, createdAt, {});
    if (growthSummary.generatedPlants > 0) this.recordTransaction(input.userId, "plant", growthSummary.generatedPlants, growth.plantCount, growthSummary.plantCount, input.sourceType, input.sourceId, input.idempotencyKey, createdAt, {});
    if (growthSummary.generatedTrees > 0) this.recordTransaction(input.userId, "tree", growthSummary.generatedTrees, growth.treeCount, growthSummary.treeCount, input.sourceType, input.sourceId, input.idempotencyKey, createdAt, {});

    this.recordGrowthLogs(input.userId, input.sourceType, input.sourceId, createdAt, growth, growthSummary);
    this.recordLevelLogs(input.userId, input.sourceType, input.sourceId, createdAt, resources, level);
    this.recordEnergyLog(input.userId, input.sourceType, input.sourceId, createdAt, input.energy, resources.currentEnergy, energyAfterLevel, resources.energyOverflowPending, resources.energyOverflowPending + energyOverflow);

    this.db.prepare(`UPDATE user_resources SET
      star_balance = ?, current_energy = ?, max_energy = ?, energy_overflow_pending = ?, current_exp = ?, current_level = ?, next_level_exp = ?, unlock_flags_json = ?, updated_at = ?
      WHERE user_id = ?`).run(
      resources.starBalance + totalStars,
      energyAfterLevel,
      level.maxEnergy,
      resources.energyOverflowPending + energyOverflow,
      level.currentExp,
      level.currentLevel,
      nextLevelExp(level.currentLevel),
      JSON.stringify(unlockFlags),
      createdAt,
      input.userId,
    );
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
      replayed: false,
      rewardEventId,
    };
  }

  private applyEnergyRegeneration(userId: string): void {
    const row = this.db.prepare("SELECT * FROM user_resources WHERE user_id = ?").get(userId) as Row | undefined;
    if (!row) return;
    const currentEnergy = requireNumber(row.current_energy);
    const maxEnergy = requireNumber(row.max_energy);
    const interval = requireNumber(row.energy_regen_interval_seconds);
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
      this.db.prepare("UPDATE user_resources SET energy_last_updated_at = ?, updated_at = ? WHERE user_id = ?").run(nextLast, createdAt, userId);
      return;
    }
    const recovered = Math.min(ticks, maxEnergy - currentEnergy);
    const nextEnergy = currentEnergy + recovered;
    this.db.prepare("UPDATE user_resources SET current_energy = ?, energy_last_updated_at = ?, updated_at = ? WHERE user_id = ?").run(nextEnergy, nextLast, createdAt, userId);
    const sourceId = makeId("energy-regen");
    this.recordTransaction(userId, "energy", recovered, currentEnergy, nextEnergy, "daily_login", sourceId, sourceId, createdAt, { lazyRegeneration: true, ticks });
    this.recordEnergyLog(userId, "daily_login", sourceId, createdAt, recovered, currentEnergy, nextEnergy, requireNumber(row.energy_overflow_pending), requireNumber(row.energy_overflow_pending));
    this.audit("user", userId, "resource.energy_regenerated", "resource_transaction", sourceId, { recovered });
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
    return {
      starBalance: requireNumber(row.star_balance),
      currentEnergy: requireNumber(row.current_energy),
      maxEnergy: requireNumber(row.max_energy),
      energyRegenIntervalSeconds: requireNumber(row.energy_regen_interval_seconds),
      energyLastUpdatedAt: requireString(row.energy_last_updated_at),
      energyOverflowPending: requireNumber(row.energy_overflow_pending),
      currentExp: requireNumber(row.current_exp),
      currentLevel: requireNumber(row.current_level),
      nextLevelExp: requireNumber(row.next_level_exp),
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

  private recordTransaction(userId: string, resourceType: ResourceTransaction["resourceType"], amount: number, balanceBefore: number, balanceAfter: number, sourceType: RewardSourceType, sourceId: string, idempotencyKey: string, createdAt: string, metadata: Record<string, string | number | boolean>): void {
    this.db.prepare(`INSERT INTO resource_transactions
      (id, user_id, resource_type, amount, balance_before, balance_after, source_type, source_id, idempotency_key, created_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      makeId("resource-transaction"),
      userId,
      resourceType,
      amount,
      balanceBefore,
      balanceAfter,
      sourceType,
      sourceId,
      idempotencyKey,
      createdAt,
      JSON.stringify(metadata),
    );
  }

  private recordEnergyLog(userId: string, sourceType: RewardSourceType, sourceId: string, createdAt: string, amount: number, before: number, after: number, overflowBefore: number, overflowAfter: number): void {
    this.db.prepare(`INSERT INTO energy_logs
      (id, user_id, event_type, amount, energy_before, energy_after, overflow_before, overflow_after, source_type, source_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      makeId("energy-log"),
      userId,
      sourceType === "daily_login" ? "natural_regen" : "reward",
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

  private recordGrowthLogs(userId: string, sourceType: RewardSourceType, sourceId: string, createdAt: string, before: UserGrowthBalance, after: GrowthSummary): void {
    if (after.generatedSeeds > 0) this.db.prepare("INSERT INTO plant_growth_logs (id, user_id, source_type, source_id, event_type, quantity, before_count, after_count, created_at) VALUES (?, ?, ?, ?, 'seed_generated', ?, ?, ?, ?)").run(makeId("growth-log"), userId, sourceType, sourceId, after.generatedSeeds, before.seedCount, after.seedCount, createdAt);
    if (after.generatedPlants > 0) this.db.prepare("INSERT INTO plant_growth_logs (id, user_id, source_type, source_id, event_type, quantity, before_count, after_count, created_at) VALUES (?, ?, ?, ?, 'seeds_combined_to_plant', ?, ?, ?, ?)").run(makeId("growth-log"), userId, sourceType, sourceId, after.generatedPlants, before.plantCount, after.plantCount, createdAt);
    if (after.generatedTrees > 0) this.db.prepare("INSERT INTO plant_growth_logs (id, user_id, source_type, source_id, event_type, quantity, before_count, after_count, created_at) VALUES (?, ?, ?, ?, 'plants_combined_to_tree', ?, ?, ?, ?)").run(makeId("growth-log"), userId, sourceType, sourceId, after.generatedTrees, before.treeCount, after.treeCount, createdAt);
  }

  private recordLevelLogs(userId: string, sourceType: RewardSourceType, sourceId: string, createdAt: string, before: UserResources, level: ReturnType<typeof applyLevelProgress>): void {
    let previousLevel = before.currentLevel;
    let maxBefore = before.maxEnergy;
    for (const reward of level.rewards) {
      const maxAfter = maxBefore + reward.maxEnergyIncrease;
      this.db.prepare(`INSERT INTO level_up_logs
        (id, user_id, previous_level, new_level, reward_stars, max_energy_before, max_energy_after, unlock_flags_json, source_type, source_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        makeId("level-up"),
        userId,
        previousLevel,
        reward.level,
        reward.stars,
        maxBefore,
        maxAfter,
        JSON.stringify(reward.unlockFlags),
        sourceType,
        sourceId,
        createdAt,
      );
      previousLevel = reward.level;
      maxBefore = maxAfter;
    }
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

  private mapMerchant(row: Row): MerchantProfile {
    return {
      id: requireString(row.id),
      applicationId: requireString(row.application_id),
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
      quantity: requireNumber(row.quantity),
      beforeCount: requireNumber(row.before_count),
      afterCount: requireNumber(row.after_count),
      createdAt: requireString(row.created_at),
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
