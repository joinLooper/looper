export type UserRole = "user" | "merchant" | "admin";
export type MissionStatus = "available" | "awaiting_verification" | "completed";
export type LedgerAsset = "star" | "energy";
export type LedgerReason = "mission_reward" | "admin_adjustment" | "reversal";

export interface Mission {
  id: string;
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

export interface LedgerEntry {
  id: string;
  userId: string;
  asset: LedgerAsset;
  amount: number;
  reason: LedgerReason;
  referenceType: "redemption" | "admin_operation";
  referenceId: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actorRole: UserRole;
  actorId: string;
  action: "mission.accepted" | "redemption.created" | "redemption.replayed";
  entityType: "mission_enrollment" | "redemption";
  entityId: string;
  createdAt: string;
  metadata: Record<string, string | number | boolean>;
}

export interface AdminOverview {
  users: UserProgress[];
  missions: Mission[];
  redemptions: Redemption[];
  ledgerEntries: LedgerEntry[];
  auditEvents: AuditEvent[];
  metrics: {
    totalUsers: number;
    awaitingVerification: number;
    completedMissions: number;
    starsGranted: number;
    energyGranted: number;
  };
}
