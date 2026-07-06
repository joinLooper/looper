import type {
  AuditEvent,
  MerchantApplication,
  MerchantApplicationInput,
  MerchantProfile,
  Mission,
  MissionEnrollment,
  Redemption,
  UserProgress,
} from "@looper/types";

export class InMemoryStore {
  readonly merchants: MerchantProfile[] = [];
  readonly merchantApplications: MerchantApplication[] = [];
  readonly missions: Mission[] = [];

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

  getMerchant(merchantId: string): MerchantProfile {
    const merchant = this.merchants.find((item) => item.id === merchantId);
    if (!merchant) throw Object.assign(new Error("找不到合作店家"), { statusCode: 404 });
    return merchant;
  }

  submitMerchantApplication(input: MerchantApplicationInput): MerchantApplication {
    const existing = this.merchantApplications.find(
      (item) => item.email.toLowerCase() === input.email.toLowerCase() && item.status !== "rejected",
    );
    if (existing) throw Object.assign(new Error("這個 Email 已有申請紀錄"), { statusCode: 409 });
    if (input.vegetarianOffering.includes("其他") && !input.otherMealType.trim()) {
      throw Object.assign(new Error("選擇其他餐點類型時，請填寫補充內容"), { statusCode: 400 });
    }

    const application: MerchantApplication = {
      id: `merchant-application-${this.merchantApplications.length + 1}`,
      ...input,
      otherMealType: input.otherMealType.trim(),
      status: "pending",
      submittedAt: new Date().toISOString(),
    };
    this.merchantApplications.push(application);
    this.audit("merchant", application.email, "merchant.application_submitted", "merchant_application", application.id, { storeName: application.storeName });
    return application;
  }

  reviewMerchantApplication(applicationId: string, decision: "approve" | "reject" | "request_revision", reviewerId: string, note = ""): MerchantApplication {
    const application = this.merchantApplications.find((item) => item.id === applicationId);
    if (!application) throw Object.assign(new Error("找不到店家申請"), { statusCode: 404 });
    if (application.status === "approved") throw Object.assign(new Error("此店家已完成審核"), { statusCode: 409 });

    application.reviewedAt = new Date().toISOString();
    application.reviewNote = note;

    if (decision === "reject") {
      application.status = "rejected";
      this.audit("admin", reviewerId, "merchant.application_rejected", "merchant_application", application.id, { note });
      return application;
    }
    if (decision === "request_revision") {
      application.status = "needs_revision";
      this.audit("admin", reviewerId, "merchant.application_revision_requested", "merchant_application", application.id, { note });
      return application;
    }

    const merchant: MerchantProfile = {
      id: `merchant-${this.merchants.length + 1}`,
      applicationId: application.id,
      storeName: application.storeName,
      address: application.address,
      storeType: application.storeType,
      vegetarianOffering: application.vegetarianOffering,
      otherMealType: application.otherMealType,
      businessHours: application.businessHours,
      status: "active",
      canRedeem: true,
      createdAt: application.reviewedAt,
    };
    this.merchants.push(merchant);

    const mission: Mission = {
      id: `mission-${merchant.id}-vegetarian-meal`,
      merchantId: merchant.id,
      title: "完成一餐蔬食",
      description: `到 ${merchant.storeName} 完成一餐蔬食，請店家協助核銷。`,
      starReward: 10,
      energyReward: 20,
    };
    this.missions.push(mission);

    application.status = "approved";
    application.merchantId = merchant.id;
    this.audit("admin", reviewerId, "merchant.application_approved", "merchant", merchant.id, { applicationId: application.id, missionId: mission.id });
    return application;
  }

  acceptMission(userId: string, missionId: string): MissionEnrollment {
    const user = this.getUser(userId);
    this.getMission(missionId);
    const existing = user.enrollments.find((item) => item.missionId === missionId);
    if (existing) return existing;
    const enrollment: MissionEnrollment = { userId, missionId, status: "awaiting_verification", acceptedAt: new Date().toISOString() };
    user.enrollments.push(enrollment);
    this.audit("user", userId, "mission.accepted", "mission_enrollment", `${userId}:${missionId}`, { missionId });
    return enrollment;
  }

  redeem(input: { userId: string; missionId: string; merchantId: string; idempotencyKey: string }): { redemption: Redemption; replayed: boolean } {
    const merchant = this.getMerchant(input.merchantId);
    if (merchant.status !== "active" || !merchant.canRedeem) throw Object.assign(new Error("此店家目前無法核銷"), { statusCode: 409 });
    const existingRedemption = this.redemptionByKey.get(input.idempotencyKey);
    if (existingRedemption) {
      const sameRequest = existingRedemption.userId === input.userId && existingRedemption.missionId === input.missionId && existingRedemption.merchantId === input.merchantId;
      if (!sameRequest) throw Object.assign(new Error("冪等鍵已被其他請求使用"), { statusCode: 409 });
      this.audit("merchant", input.merchantId, "redemption.replayed", "redemption", existingRedemption.id, { idempotencyKey: input.idempotencyKey });
      return { redemption: existingRedemption, replayed: true };
    }

    const user = this.getUser(input.userId);
    const mission = this.getMission(input.missionId);
    if (mission.merchantId !== input.merchantId) throw Object.assign(new Error("此任務不屬於目前店家"), { statusCode: 403 });
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
    this.auditEvents.push({ id: `audit-${this.auditEvents.length + 1}`, actorRole, actorId, action, entityType, entityId, createdAt: new Date().toISOString(), metadata });
  }
}
