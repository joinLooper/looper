import { REPORTING_TIMEZONE } from "./reporting-month.js";

export * from "./reporting-month.js";

export type UserRole = "user" | "merchant" | "admin";
export type MissionStatus = "available" | "awaiting_verification" | "completed";
export type MerchantApplicationStatus = "pending" | "needs_revision" | "approved" | "rejected";
export type MerchantPlan = "sprout" | "grove" | "forest";
export type MerchantRewardCategory = "general" | "star";
export type MerchantBrandStatus = "active" | "suspended";
export type MerchantOperatorRole = "brand_owner" | "brand_manager" | "branch_manager" | "branch_staff";
export type MerchantOperatorStatus = "active" | "suspended" | "left";
export const PLATFORM_OPERATOR_ROLES = ["operations_admin", "finance_admin", "super_admin"] as const;
export type PlatformOperatorRole = (typeof PLATFORM_OPERATOR_ROLES)[number];
export const PLATFORM_OPERATOR_STATUSES = ["active", "suspended", "left"] as const;
export type PlatformOperatorStatus = (typeof PLATFORM_OPERATOR_STATUSES)[number];
export const ACCOUNT_INVITATION_PURPOSES = ["merchant_operator", "platform_operator"] as const;
export type AccountInvitationPurpose = (typeof ACCOUNT_INVITATION_PURPOSES)[number];
export const PLATFORM_PERMISSIONS = [
  "platform.reporting.read",
  "platform.audit.read",
  "platform.merchant_application.read",
  "platform.merchant_application.review",
  "platform.merchant_plan.read",
  "platform.merchant_plan.manage",
  "platform.economy.read",
  "platform.economy.manage",
  "platform.reversal.request",
  "platform.reversal.review",
  "platform.reversal.apply",
  "platform.identity.manage",
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];
export const PLATFORM_ROLE_PERMISSIONS: Readonly<Record<PlatformOperatorRole, readonly PlatformPermission[]>> = {
  operations_admin: [
    "platform.reporting.read",
    "platform.audit.read",
    "platform.merchant_application.read",
    "platform.merchant_application.review",
    "platform.merchant_plan.read",
    "platform.economy.read",
    "platform.reversal.request",
  ],
  finance_admin: [
    "platform.reporting.read",
    "platform.audit.read",
    "platform.merchant_plan.read",
    "platform.merchant_plan.manage",
    "platform.economy.read",
    "platform.economy.manage",
    "platform.reversal.review",
    "platform.reversal.apply",
  ],
  super_admin: PLATFORM_PERMISSIONS,
};

export function platformPermissionsForRole(role: PlatformOperatorRole): PlatformPermission[] {
  return [...PLATFORM_ROLE_PERMISSIONS[role]];
}
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

export type MerchantApplicationReviewDecision = "approve" | "reject" | "request_revision";

export interface MerchantApplicationReviewInput {
  decision: MerchantApplicationReviewDecision;
  note?: string;
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

export interface PlatformOperatorMembership {
  membershipId: string;
  accountId: string;
  role: PlatformOperatorRole;
  status: PlatformOperatorStatus;
  grantedByAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformOperatorContext {
  accountId: string;
  displayName: string;
  accountStatus: "active";
  membershipId: string;
  role: PlatformOperatorRole;
  membershipStatus: "active";
  permissions: PlatformPermission[];
}

export interface PlatformAdminBootstrapResult {
  accountId: string;
  membershipId: string;
  role: "super_admin";
  invitationId: string;
  expiresAt: string;
  invitationToken: string;
}

export interface PlatformOperatorInvitationMetadata {
  invitationId: string;
  purpose: "platform_operator";
  status: "pending" | "redeemed" | "revoked" | "expired";
  expiresAt: string;
  createdAt: string;
}

export interface PlatformOperatorCreateInput {
  displayName: string;
  role: PlatformOperatorRole;
  idempotencyKey: string;
}

export interface PlatformOperatorCreateResult {
  account: Account;
  membership: PlatformOperatorMembership;
  invitation: PlatformOperatorInvitationMetadata;
  invitationToken?: string;
  tokenRevealed: boolean;
  replayed: boolean;
}

export interface PlatformOperatorInvitationResendResult {
  accountId: string;
  membershipId: string;
  invitation: PlatformOperatorInvitationMetadata;
  invitationToken?: string;
  tokenRevealed: boolean;
  replayed: boolean;
}

export interface PlatformOperatorListItem {
  accountId: string;
  displayName: string;
  accountStatus: AccountStatus;
  membershipId: string;
  role: PlatformOperatorRole;
  membershipStatus: PlatformOperatorStatus;
  membershipCreatedAt: string;
  membershipUpdatedAt: string;
  grantedByAccountId: string | null;
  pendingInvitationId: string | null;
  pendingInvitationExpiresAt: string | null;
  lastInvitationCreatedAt: string | null;
}

export interface PlatformOperatorQuery {
  role?: PlatformOperatorRole;
  status?: PlatformOperatorStatus;
  displayNameQuery?: string;
  limit?: number;
  cursor?: string;
}

export interface PlatformOperatorPage {
  items: PlatformOperatorListItem[];
  nextCursor: string | null;
}

export interface PlatformOperatorStatusTransition {
  transitionId: string;
  membershipId: string;
  targetAccountId: string;
  actorAccountId: string;
  fromStatus: "active" | "suspended";
  toStatus: "active" | "suspended";
  reason: string;
  revokedPlatformSessionCount: number;
  invitationId: string | null;
  createdAt: string;
}

export interface PlatformOperatorStatusUpdateInput {
  status: "active" | "suspended";
  reason: string;
  idempotencyKey: string;
}

export interface PlatformOperatorStatusUpdateResult {
  membership: PlatformOperatorMembership;
  transition: PlatformOperatorStatusTransition;
  invitation: PlatformOperatorInvitationMetadata | null;
  invitationToken?: string;
  tokenRevealed: boolean;
  replayed: boolean;
}

export interface PlatformOperatorRoleTransition {
  transitionId: string;
  membershipId: string;
  targetAccountId: string;
  actorAccountId: string;
  fromRole: PlatformOperatorRole;
  toRole: PlatformOperatorRole;
  reason: string;
  revokedPlatformSessionCount: number;
  invitationId: string;
  createdAt: string;
}

export interface PlatformOperatorRoleUpdateInput {
  role: PlatformOperatorRole;
  reason: string;
  idempotencyKey: string;
}

export interface PlatformOperatorRoleUpdateResult {
  membership: PlatformOperatorMembership;
  transition: PlatformOperatorRoleTransition;
  invitation: PlatformOperatorInvitationMetadata;
  invitationToken?: string;
  tokenRevealed: boolean;
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
  expiredAt?: string;
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
  expiredAt: string | null;
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

export interface AdminTaskCodeSubmissionQuery {
  status?: TaskCodeSubmissionStatus;
  brandId?: string;
  merchantId?: string;
  missionId?: string;
  limit?: number;
  cursor?: string;
}

export interface AdminTaskCodeSubmissionSettlementSummary {
  baseStars: number;
  exp: number;
  energy: number;
  carbonGrams: number;
  chestStars: number;
  levelBefore: number;
  levelAfter: number;
  ruleVersion: string | null;
}

export const TASK_CODE_REPORTING_ISSUE_CODES = [
  "legacy_missing_scope_snapshot",
  "missing_submitted_at",
  "missing_settled_at",
  "missing_rejected_at",
  "missing_expired_at",
  "missing_redemption_link",
  "missing_reward_event_link",
  "missing_reward_payload",
  "missing_reward_rule_version",
  "missing_reward_rule_snapshot",
] as const;

export type TaskCodeReportingIssueCode = typeof TASK_CODE_REPORTING_ISSUE_CODES[number];

export interface TaskCodeReportingScope {
  snapshotVersion: string;
  capturedAt: string;
  reportingTimezone: string;
  brandId: string;
  brandDisplayName: string;
  merchantId: string;
  branchCode: string;
  branchDisplayName: string;
}

export interface TaskCodeReportingEligibility {
  eligibleForSubmittedFlow: boolean;
  eligibleForTerminalFlow: boolean | null;
  eligibleForSettlement: boolean | null;
  issueCodes: TaskCodeReportingIssueCode[];
}

export type TaskCodeDisplayScopeSource = "snapshot" | "current_fallback";

export const TASK_CODE_MONTHLY_LIVE_CALCULATION_VERSION = "task-code-monthly-live-v1" as const;

export interface TaskCodeMonthlyLiveReportQuery {
  reportMonth: string;
  brandId?: string;
  merchantId?: string;
}

export interface MerchantTaskCodeMonthlyLiveReportQuery {
  reportMonth: string;
  merchantId?: string;
}

export interface TaskCodeMonthlyLiveReportScope {
  kind: "platform" | "brand" | "merchant" | "authorized";
  brandIds: string[];
  merchantIds: string[];
}

export interface TaskCodeMonthlyLiveGross {
  baseStars: number;
  exp: number;
  energy: number;
  carbonGrams: number;
}

export interface TaskCodeMonthlyLiveSummary {
  submittedCount: number;
  openPendingAtCutoff: number;
  settledCount: number;
  rejectedCount: number;
  expiredCount: number;
  gross: TaskCodeMonthlyLiveGross;
}

export interface TaskCodeMonthlyLiveDataQuality {
  excludedSubmittedCount: number;
  excludedTerminalCount: number;
  excludedSettlementCount: number;
  issueCounts: Record<TaskCodeReportingIssueCode, number>;
}

export interface TaskCodeMonthlyLiveReport {
  reportMonth: string;
  timezone: typeof REPORTING_TIMEZONE;
  startAtInclusive: string;
  endAtExclusive: string;
  generatedAt: string;
  cutoffAt: string;
  mode: "live";
  status: "open";
  calculationVersion: typeof TASK_CODE_MONTHLY_LIVE_CALCULATION_VERSION;
  scope: TaskCodeMonthlyLiveReportScope;
  summary: TaskCodeMonthlyLiveSummary;
  dataQuality: TaskCodeMonthlyLiveDataQuality;
}

export interface AdminTaskCodeSubmission {
  submissionId: string;
  status: TaskCodeSubmissionStatus;
  userId: string;
  missionId: string;
  missionTitle: string;
  brandId: string;
  brandDisplayName: string;
  merchantId: string;
  merchantStoreName: string;
  merchantBranchCode: string;
  createdAt: string;
  confirmationExpiresAt: string;
  confirmedAt: string | null;
  expiredAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  settledAt: string | null;
  redemptionId: string | null;
  rewardEventId: string | null;
  settlementSummary: AdminTaskCodeSubmissionSettlementSummary | null;
  reportingScope: TaskCodeReportingScope | null;
  reportingEligibility: TaskCodeReportingEligibility;
  displayScopeSource: TaskCodeDisplayScopeSource;
}

export interface AdminTaskCodeSubmissionPage {
  items: AdminTaskCodeSubmission[];
  nextCursor: string | null;
}

export type MerchantTaskCodeHistoryStatus = Extract<TaskCodeSubmissionStatus, "settled" | "rejected" | "expired">;

export interface MerchantTaskCodeHistoryQuery {
  merchantId?: string;
  status?: MerchantTaskCodeHistoryStatus;
  missionId?: string;
  limit?: number;
  cursor?: string;
}

export interface MerchantTaskCodeHistorySettlementSummary {
  baseStars: number;
  exp: number;
  energy: number;
  carbonGrams: number;
  ruleVersion: string | null;
}

export interface MerchantTaskCodeHistoryItem {
  submissionId: string;
  status: MerchantTaskCodeHistoryStatus;
  userId: string;
  playerDisplayName: string;
  missionId: string;
  missionTitle: string;
  brandId: string;
  brandDisplayName: string;
  merchantId: string;
  merchantStoreName: string;
  merchantBranchCode: string;
  submittedAt: string;
  confirmationExpiresAt: string;
  expiredAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  settledAt: string | null;
  redemptionId: string | null;
  rewardEventId: string | null;
  settlementSummary: MerchantTaskCodeHistorySettlementSummary | null;
  reportingScope: TaskCodeReportingScope | null;
  reportingEligibility: TaskCodeReportingEligibility;
  displayScopeSource: TaskCodeDisplayScopeSource;
}

export interface MerchantTaskCodeHistoryPage {
  items: MerchantTaskCodeHistoryItem[];
  nextCursor: string | null;
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

export interface AdminEconomyResponse {
  settings: EconomySettingsRecord;
  merchantPlans: MerchantPlanDefinition[];
  levelDefinitions: LevelDefinition[];
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
    | "identity.platform_bootstrapped"
    | "identity.platform_operator_created"
    | "identity.platform_invitation_resent"
    | "identity.platform_operator_suspended"
    | "identity.platform_operator_reactivated"
    | "identity.platform_operator_role_changed"
    | "identity.invitation_created"
    | "identity.invitation_redeemed"
    | "identity.session_logged_out"
    | "mission.accepted"
    | "redemption.created"
    | "redemption.replayed"
    | "resource.energy_regenerated"
    | "economy.settings_updated"
    | "merchant.plan_updated"
    | "task_code_submission.confirmed"
    | "task_code_submission.rejected"
    | "task_code_submission.settled";
  entityType: "account" | "account_invitation" | "account_session" | "merchant_application" | "merchant" | "merchant_operator_membership" | "platform_operator_membership" | "mission_enrollment" | "redemption" | "resource_transaction" | "economy_settings" | "task_code_submission";
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
  economySettings: EconomySettingsRecord | null;
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
