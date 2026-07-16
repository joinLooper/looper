export type UserRole = "user" | "merchant" | "admin";
export type MissionStatus = "available" | "awaiting_verification" | "completed";
export type MerchantApplicationStatus = "pending" | "needs_revision" | "approved" | "rejected";
export type MerchantPlan = "sprout" | "grove" | "forest";
export type MerchantRewardCategory = "general" | "star";
export type MerchantBrandStatus = "active" | "suspended";
export type MerchantOperatorRole = "brand_owner" | "brand_manager" | "branch_manager" | "branch_staff";
export type MerchantOperatorStatus = "active" | "suspended" | "left";
export type AccountStatus = "active" | "suspended" | "closed";
export type RewardSourceType = "vegetarian_purchase" | "task_completion" | "event_checkin" | "daily_login" | "level_up" | "admin_adjustment";
export type ResourceType = "stars" | "energy" | "energy_overflow" | "exp" | "carbon_total" | "carbon_balance" | "seed" | "plant" | "tree";
export type ResourceTransactionKind = "grant" | "consume" | "convert_debit" | "convert_credit" | "adjustment" | "legacy";
export type ResourceConversionType = "none" | "carbon_to_seed" | "seed_to_plant" | "plant_to_tree";
export type TaskCodeSubmissionStatus = "pending" | "confirmed" | "rejected" | "expired" | "settled";
export type TaskCodeSubmissionDecision = "confirm" | "reject";
export type PlayerEventQueueStatus = "pending" | "completed" | "skipped";
export type PlayerEventType = "level_up" | "home_scene";
export type PlayerEventResolutionOutcome = "completed" | "skipped";
export const TASK_CODE_LENGTH = 4;

export const MEAL_TYPES = [
  "火鍋", "義大利麵", "咖哩飯", "拉麵", "便當", "早午餐", "甜點飲品", "小吃／夜市",
  "漢堡三明治", "蔬食自助餐", "壽司／飯糰", "披薩／焗烤", "中式料理",
  "泰式料理", "日式料理", "墨西哥料理", "台式料理", "異國料理", "其他",
] as const;

export const STORE_CATEGORIES = [
  "餐廳", "咖啡廳", "小吃／夜市攤位", "甜點／飲料店", "早餐店", "便當店",
  "義大利麵", "旅宿／活動空間", "蔬食友善商家", "其他",
] as const;

export const WEEKDAYS = [
  { key: "monday", label: "星期一" },
  { key: "tuesday", label: "星期二" },
  { key: "wednesday", label: "星期三" },
  { key: "thursday", label: "星期四" },
  { key: "friday", label: "星期五" },
  { key: "saturday", label: "星期六" },
  { key: "sunday", label: "星期日" },
] as const;

export type MealType = (typeof MEAL_TYPES)[number];
export type StoreCategory = (typeof STORE_CATEGORIES)[number];
export type WeekdayKey = (typeof WEEKDAYS)[number]["key"];

export interface BusinessPeriod { start: string; end: string; }
export interface BusinessDayHours { day: WeekdayKey; closed: boolean; periods: BusinessPeriod[]; }
export type WeeklyBusinessHours = BusinessDayHours[];

export interface MerchantApplicationInput {
  storeName: string;
  contactName: string;
  contactLineId: string;
  phone: string;
  email: string;
  address: string;
  storeCategory: StoreCategory;
  otherStoreCategory: string;
  vegetarianOffering: MealType[];
  otherMealType: string;
  businessHours: WeeklyBusinessHours;
}

export interface MerchantApplication extends MerchantApplicationInput {
  id: string;
  status: MerchantApplicationStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewNote?: string;
  merchantId?: string;
}

export interface MerchantProfile {
  id: string;
  applicationId: string;
  brandId: string;
  brandDisplayName: string;
  branchCode: string;
  storeName: string;
  address: string;
  storeCategory: StoreCategory;
  otherStoreCategory: string;
  vegetarianOffering: MealType[];
  otherMealType: string;
  businessHours: WeeklyBusinessHours;
  status: "active" | "suspended";
  canRedeem: boolean;
  merchantPlan: MerchantPlan;
  rewardStarAmount: number;
  rewardCategory: MerchantRewardCategory;
  timezone: string;
  createdAt: string;
}

export interface MerchantBranchCreateInput {
  branchCode: string;
  storeName: string;
  address: string;
  rewardCategory: MerchantRewardCategory;
  timezone?: string;
  actorId: string;
}

export interface MerchantBranchCreateResult {
  merchant: {
    merchantId: string;
    brandId: string;
    brandDisplayName: string;
    branchCode: string;
    storeName: string;
    address: string;
    rewardCategory: MerchantRewardCategory;
    timezone: string;
    merchantPlan: MerchantPlan;
    createdAt: string;
  };
  replayed: boolean;
}

export interface Account {
  accountId: string;
  displayName: string;
  status: AccountStatus;
  hasPlayerProfile: boolean;
  playerUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountCreateInput {
  displayName: string;
  idempotencyKey: string;
  actorId: string;
}

export interface AccountCreateResult {
  account: Account;
  replayed: boolean;
}

export interface AccountQuery {
  accountId?: string;
  status?: AccountStatus;
  displayNameQuery?: string;
  limit?: number;
  cursor?: string;
}

export interface MerchantOperatorMembership {
  membershipId: string;
  accountId: string;
  accountDisplayName: string;
  accountStatus: AccountStatus;
  brandId: string;
  brandDisplayName: string;
  merchantId: string | null;
  branchCode: string | null;
  storeName: string | null;
  role: MerchantOperatorRole;
  status: MerchantOperatorStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantOperatorMembershipCreateInput {
  accountId: string;
  brandId: string;
  merchantId?: string | null;
  role: MerchantOperatorRole;
  actorId: string;
}

export interface MerchantOperatorMembershipCreateResult {
  membership: MerchantOperatorMembership;
  replayed: boolean;
}

export interface MerchantOperatorMembershipQuery {
  membershipId?: string;
  accountId?: string;
  brandId?: string;
  merchantId?: string;
  role?: MerchantOperatorRole;
  status?: MerchantOperatorStatus;
  limit?: number;
  cursor?: string;
}

export interface Mission {
  id: string;
  merchantId: string;
  title: string;
  description: string;
  starReward: number;
  energyReward: number;
  expReward: number;
  carbonGrams: number;
}

export interface MissionEnrollment {
  userId: string;
  missionId: string;
  status: Exclude<MissionStatus, "available">;
  acceptedAt: string;
  completedAt?: string;
}

export interface TaskCodeWindow {
  id: string;
  merchantId: string;
  codeHash: string;
  codeLength: 4 | 6;
  validFrom: string;
  validUntil: string;
  status: "active" | "expired" | "revoked";
  createdAt: string;
}

export interface CurrentTaskCodeWindow extends TaskCodeWindow {
  windowId: string;
  code: string;
}

export interface TaskCodeSubmission {
  id: string;
  taskCodeWindowId: string;
  merchantId: string;
  missionId: string;
  userId: string;
  status: TaskCodeSubmissionStatus;
  submittedAt: string;
  confirmationExpiresAt: string;
  confirmedAt?: string;
  rejectedAt?: string;
  settledAt?: string;
  idempotencyKey: string;
  decidedBy?: string;
  decisionIdempotencyKey?: string;
  redemptionId?: string;
  rewardEventId?: string;
}

export interface TaskCodeSubmissionPlayerResult {
  submissionId: string;
  status: TaskCodeSubmissionStatus;
  merchantId: string;
  missionId: string;
  submittedAt: string;
  confirmationExpiresAt: string;
  settledAt?: string;
  baseReward?: {
    stars: number;
    exp: number;
    energy: number;
    carbonGrams: number;
  };
  growthResult?: GrowthSummary;
  levelBefore?: number;
  levelAfter?: number;
  levelsCrossed?: number[];
  chestStars?: number;
  resources?: UserResources;
}

export interface PlayerEventQueueItem {
  queueOrder: number;
  id: string;
  userId: string;
  sourceRewardEventId: string;
  eventKey: string;
  eventType: PlayerEventType;
  eventLevel?: number;
  sceneId?: string;
  eventName: string;
  payload: Record<string, unknown>;
  status: PlayerEventQueueStatus;
  createdAt: string;
  resolvedAt?: string;
  resolutionIdempotencyKey?: string;
}

export interface PlayerEventNextResult {
  event: PlayerEventQueueItem | null;
}

export interface PlayerEventResolveResult {
  event: PlayerEventQueueItem;
  replayed: boolean;
}

export interface MerchantTaskCodeSubmission extends TaskCodeSubmission {
  user: {
    id: string;
    displayName: string;
  };
  mission: {
    id: string;
    title: string;
  };
}

export interface UserResources {
  starBalance: number;
  currentEnergy: number;
  maxEnergy: number;
  energyRegenIntervalSeconds: number;
  energyLastUpdatedAt: string;
  energyOverflowPending: number;
  currentExp: number;
  currentLevel: number;
  nextLevelExp: number | null;
  isMaxLevel: boolean;
  unlockFlags: string[];
}

export interface UserGrowthBalance {
  carbonTotalGrams: number;
  carbonBalanceGrams: number;
  seedCount: number;
  plantCount: number;
  treeCount: number;
  version: number;
  updatedAt: string;
}

export interface UserProgress {
  id: string;
  displayName: string;
  stars: number;
  energy: number;
  resources: UserResources;
  growth: UserGrowthBalance;
  enrollments: MissionEnrollment[];
  latestRewardEvent?: RewardEvent;
}

export interface RewardSummary {
  stars: number;
  energy: number;
  energyOverflow: number;
  exp: number;
  carbonGrams: number;
}

export interface GrowthSummary {
  generatedSeeds: number;
  generatedPlants: number;
  generatedTrees: number;
  seedCount: number;
  plantCount: number;
  treeCount: number;
  carbonTotalGrams: number;
  carbonBalanceGrams: number;
}

export interface LevelSummary {
  previousLevel: number;
  currentLevel: number;
  levelsGained: number;
  rewards: Array<{ level: number; stars: number; maxEnergyIncrease: number; unlockFlags: string[] }>;
}

export interface Redemption {
  id: string;
  idempotencyKey: string;
  userId: string;
  missionId: string;
  merchantId: string;
  starsGranted: number;
  energyGranted: number;
  expGranted: number;
  carbonGrams: number;
  rewardEventId?: string;
  createdAt: string;
}

export interface SettlementResult {
  redemption: Redemption;
  user: UserProgress;
  rewardSummary: RewardSummary;
  growthSummary: GrowthSummary;
  levelSummary: LevelSummary;
  ruleSnapshot?: SettlementRuleSnapshot;
  replayed: boolean;
}

export interface ResourceTransaction {
  id: string;
  userId: string;
  resourceType: ResourceType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  transactionKind: ResourceTransactionKind;
  conversionId: string;
  conversionType: ResourceConversionType;
  sourceType: RewardSourceType;
  sourceId: string;
  idempotencyKey: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface RewardEvent {
  id: string;
  sourceType: RewardSourceType;
  sourceId: string;
  userId: string;
  merchantId?: string;
  missionId?: string;
  idempotencyKey: string;
  rewardPayload: RewardSummary;
  growthSummary: GrowthSummary;
  levelSummary: LevelSummary;
  ruleVersion?: string;
  ruleSnapshot?: SettlementRuleSnapshot;
  createdAt: string;
}

export interface SettlementRuleSnapshot {
  ruleVersion: string;
  occurredAt: string;
  merchantTimezone: string;
  merchantLocalDate: string;
  merchantRewardCategory: MerchantRewardCategory;
  isMonday: boolean;
  lunarDay: number;
  isDesignatedDate: boolean;
  stars: number;
  exp: number;
  energy: number;
  carbonGrams: number;
  gramsPerSeed: number;
  seedsPerPlant: number;
  plantsPerTree: number;
  levelBefore: number;
  levelAfter: number;
  levelsCrossed: number[];
  levelRewards: Array<{
    level: number;
    requiredTotalExp: number;
    rewardStars: number;
    maxEnergy: number;
    unlockFlags: string[];
  }>;
}

export interface PlantGrowthLog {
  id: string;
  userId: string;
  sourceType: RewardSourceType;
  sourceId: string;
  eventType: "seed_generated" | "seeds_combined_to_plant" | "plants_combined_to_tree";
  conversionId: string;
  quantity: number;
  beforeCount: number;
  afterCount: number;
  createdAt: string;
}

export interface EconomySettings {
  vegetarianCarbonGrams: number;
  carbonGramsPerSeed: number;
  seedsPerPlant: number;
  plantsPerTree: number;
  redemptionEnergy: number;
  redemptionExp: number;
  energyRegenIntervalSeconds: number;
  energyOverflowMultiplier: number;
}

export interface EconomySettingsRecord extends EconomySettings {
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export interface EconomySettingsUpdateInput extends EconomySettings {
  expectedVersion?: number;
  updatedBy: string;
}

export interface EconomySettingsUpdateResult {
  settings: EconomySettingsRecord;
  changed: boolean;
}

export interface MerchantPlanDefinition {
  plan: MerchantPlan;
  label: string;
  rewardStarAmount: number;
}

export interface LevelDefinition {
  level: number;
  requiredTotalExp: number;
  rewardStars: number;
  maxEnergyIncrease: number;
  unlockFlags: string[];
}

export interface AuditEvent {
  id: string;
  actorRole: UserRole;
  actorId: string;
  action:
    | "merchant.application_submitted"
    | "merchant.application_approved"
    | "merchant.application_rejected"
    | "merchant.application_revision_requested"
    | "merchant.branch_created"
    | "merchant.membership_created"
    | "identity.account_created"
    | "mission.accepted"
    | "redemption.created"
    | "redemption.replayed"
    | "resource.energy_regenerated"
    | "economy.settings_updated"
    | "task_code_submission.confirmed"
    | "task_code_submission.rejected"
    | "task_code_submission.settled";
  entityType: "account" | "merchant_application" | "merchant" | "merchant_operator_membership" | "mission_enrollment" | "redemption" | "resource_transaction" | "economy_settings" | "task_code_submission";
  entityId: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface AdminOverview {
  users: UserProgress[];
  merchants: MerchantProfile[];
  merchantApplications: MerchantApplication[];
  missions: Mission[];
  redemptions: Redemption[];
  auditEvents: AuditEvent[];
  resourceTransactions: ResourceTransaction[];
  rewardEvents: RewardEvent[];
  plantGrowthLogs: PlantGrowthLog[];
  economySettings: EconomySettingsRecord;
  merchantPlans: MerchantPlanDefinition[];
  levelDefinitions: LevelDefinition[];
  metrics: {
    totalUsers: number;
    activeMerchants: number;
    pendingMerchantApplications: number;
    awaitingVerification: number;
    completedMissions: number;
    starsGranted: number;
    energyGranted: number;
    expGranted: number;
    carbonTotalGrams: number;
    seedCount: number;
    plantCount: number;
    treeCount: number;
  };
}
