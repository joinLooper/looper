import type { AuditEvent, Mission, MissionEnrollment, Redemption, UserProgress } from "@looper/types";

export class InMemoryStore {
  readonly missions: Mission[] = [{
    id: "mission-vegetarian-meal",
    title: "完成一餐蔬食",
    description: "到合作店家完成一餐蔬食，請店家協助核銷。",
    starReward: 10,
    energyReward: 20,
  }];

  readonly users = new Map<string, UserProgress>([["user-demo", {
    id: "user-demo",
    displayName: "Looper 測試旅人",
    stars: 0,
    energy: 0,
    enrollments: [],
  }]]);

  readonly redemptions: Redemption[] = [];
  readonly auditEvents: AuditEvent[] = [];
  private readonly redemptionByKey = new Map<string, Redemption>();

  getUser(userId: string): UserProgress {
    const user = this.users.get(userId);
    if (!user) throw Object.assign(new Error("找不到使用者"), { statusCode: 404 });
    return user;
  }

  getMission(missionId: string): Mission {
    const mission = this.missions.find((item) => item.id === missionId);
    if (!mission) throw Object.assign(new Error("找不到任務"), { statusCode: 404 });
    return mission;
  }

  acceptMission(userId: string, missionId: string): MissionEnrollment {
    const user = this.getUser(userId);
    this.getMission(missionId);
    const existing = user.enrollments.find((item) => item.missionId === missionId);
    if (existing) return existing;

    const enrollment: MissionEnrollment = {
      userId,
      missionId,
      status: "awaiting_verification",
      acceptedAt: new Date().toISOString(),
    };
    user.enrollments.push(enrollment);
    this.audit("user", userId, "mission.accepted", "mission_enrollment", `${userId}:${missionId}`, { missionId });
    return enrollment;
  }

  redeem(input: { userId: string; missionId: string; merchantId: string; idempotencyKey: string }): { redemption: Redemption; replayed: boolean } {
    const existingRedemption = this.redemptionByKey.get(input.idempotencyKey);
    if (existingRedemption) {
      const sameRequest = existingRedemption.userId === input.userId
        && existingRedemption.missionId === input.missionId
        && existingRedemption.merchantId === input.merchantId;
      if (!sameRequest) throw Object.assign(new Error("冪等鍵已被其他請求使用"), { statusCode: 409 });
      this.audit("merchant", input.merchantId, "redemption.replayed", "redemption", existingRedemption.id, { idempotencyKey: input.idempotencyKey });
      return { redemption: existingRedemption, replayed: true };
    }

    const user = this.getUser(input.userId);
    const mission = this.getMission(input.missionId);
    const enrollment = user.enrollments.find((item) => item.missionId === input.missionId);
    if (!enrollment) throw Object.assign(new Error("使用者尚未接取此任務"), { statusCode: 409 });
    if (enrollment.status === "completed") throw Object.assign(new Error("此任務已完成核銷"), { statusCode: 409 });

    const completedAt = new Date().toISOString();
    enrollment.status = "completed";
    enrollment.completedAt = completedAt;
    user.stars += mission.starReward;
    user.energy += mission.energyReward;

    const redemption: Redemption = {
      id: `redemption-${this.redemptions.length + 1}`,
      idempotencyKey: input.idempotencyKey,
      userId: input.userId,
      missionId: input.missionId,
      merchantId: input.merchantId,
      starsGranted: mission.starReward,
      energyGranted: mission.energyReward,
      createdAt: completedAt,
    };
    this.redemptions.push(redemption);
    this.redemptionByKey.set(input.idempotencyKey, redemption);
    this.audit("merchant", input.merchantId, "redemption.created", "redemption", redemption.id, { starsGranted: mission.starReward, energyGranted: mission.energyReward });
    return { redemption, replayed: false };
  }

  private audit(actorRole: AuditEvent["actorRole"], actorId: string, action: AuditEvent["action"], entityType: AuditEvent["entityType"], entityId: string, metadata: AuditEvent["metadata"]): void {
    this.auditEvents.push({
      id: `audit-${this.auditEvents.length + 1}`,
      actorRole,
      actorId,
      action,
      entityType,
      entityId,
      createdAt: new Date().toISOString(),
      metadata,
    });
  }
}
