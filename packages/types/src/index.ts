export type UserRole = "user" | "merchant" | "admin";
export type MissionStatus = "available" | "awaiting_verification" | "completed";

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
  userId: string;
  missionId: string;
  merchantId: string;
  starsGranted: number;
  energyGranted: number;
  createdAt: string;
}

export interface AdminOverview {
  users: UserProgress[];
  missions: Mission[];
  redemptions: Redemption[];
  metrics: {
    totalUsers: number;
    awaitingVerification: number;
    completedMissions: number;
    starsGranted: number;
    energyGranted: number;
  };
}
