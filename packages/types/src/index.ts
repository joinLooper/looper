export type UserRole = "user" | "merchant" | "admin";
export type MissionStatus = "available" | "awaiting_verification" | "completed";
export type MerchantApplicationStatus = "pending" | "needs_revision" | "approved" | "rejected";

export const MEAL_TYPES = [
  "火鍋", "自助餐", "咖哩飯", "拉麵", "麵食", "飯類", "便當", "早餐／早午餐",
  "咖啡廳／甜點", "義大利麵／披薩", "漢堡／輕食", "小吃／滷味", "中式合菜",
  "日式料理", "韓式料理", "東南亞料理", "異國料理", "純素料理", "其他",
] as const;

export const STORE_CATEGORIES = [
  "餐廳", "咖啡廳", "早餐／早午餐店", "甜點／烘焙店", "小吃店", "飲料店",
  "自助餐", "市集／攤位", "食品零售", "其他",
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
  storeName: string;
  address: string;
  storeCategory: StoreCategory;
  otherStoreCategory: string;
  vegetarianOffering: MealType[];
  otherMealType: string;
  businessHours: WeeklyBusinessHours;
  status: "active" | "suspended";
  canRedeem: boolean;
  createdAt: string;
}

export interface Mission { id: string; merchantId: string; title: string; description: string; starReward: number; energyReward: number; }
export interface MissionEnrollment { userId: string; missionId: string; status: Exclude<MissionStatus, "available">; acceptedAt: string; completedAt?: string; }
export interface UserProgress { id: string; displayName: string; stars: number; energy: number; enrollments: MissionEnrollment[]; }
export interface Redemption { id: string; idempotencyKey: string; userId: string; missionId: string; merchantId: string; starsGranted: number; energyGranted: number; createdAt: string; }

export interface AuditEvent {
  id: string;
  actorRole: UserRole;
  actorId: string;
  action: "merchant.application_submitted" | "merchant.application_approved" | "merchant.application_rejected" | "merchant.application_revision_requested" | "mission.accepted" | "redemption.created" | "redemption.replayed";
  entityType: "merchant_application" | "merchant" | "mission_enrollment" | "redemption";
  entityId: string;
  createdAt: string;
  metadata: Record<string, string | number | boolean>;
}

export interface AdminOverview {
  users: UserProgress[];
  merchants: MerchantProfile[];
  merchantApplications: MerchantApplication[];
  missions: Mission[];
  redemptions: Redemption[];
  auditEvents: AuditEvent[];
  metrics: { totalUsers: number; activeMerchants: number; pendingMerchantApplications: number; awaitingVerification: number; completedMissions: number; starsGranted: number; energyGranted: number; };
}
