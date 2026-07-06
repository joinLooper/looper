export type UserRole = "user" | "merchant" | "admin";
export type MissionStatus = "available" | "awaiting_verification" | "completed";
export type MerchantApplicationStatus = "pending" | "needs_revision" | "approved" | "rejected";

export interface MerchantApplicationInput {
  storeName: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  storeType: string;
  vegetarianOffering: string;
  businessHours: string;
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
  storeType: string;
  vegetarianOffering: string;
  businessHours: string;
  status: "active" | "suspended";
  canRedeem: boolean;
  createdAt: string;
}

export interface Mission {
  id: string;
  merchantId: string;
  title: string;
  description: string;
  starReward: number;
  energyReward: number;
}

export interface MissionEnrollment {
  userId: string;
  missionId: string;
  status: Exclude<MissionStatus, "available">;
  acceptedAt: string;
  completedAt?: string;
}

export interface UserProgress {
  id: string;
  displayName: string;
  stars: number;
  energy: number;
  enrollments: MissionEnrollment[];
}

export interface Redemption {
  id: string;
  idempotencyKey: string;
  userId: string;
  missionId: string;
  merchantId: string;
  starsGranted: number;
  energyGranted: number;
  createdAt: string;
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
    | "mission.accepted"
    | "redemption.created"
    | "redemption.replayed";
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
  metrics: {
    totalUsers: number;
    activeMerchants: number;
    pendingMerchantApplications: number;
    awaitingVerification: number;
    completedMissions: number;
    starsGranted: number;
    energyGranted: number;
  };
}
