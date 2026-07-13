import cors from "@fastify/cors";
import Fastify from "fastify";
import type { EconomySettingsUpdateInput, MerchantApplicationInput, MerchantPlan, RewardSourceType, TaskCodeSubmissionStatus, UserRole } from "@looper/types";
import { MEAL_TYPES, STORE_CATEGORIES, WEEKDAYS } from "@looper/types";
import { InMemoryStore } from "./store.js";

function requireRole(headers: Record<string, unknown>, expected: UserRole): void {
  if (headers["x-looper-role"] !== expected) throw Object.assign(new Error("權限不足"), { statusCode: 403 });
}

const periodSchema = {
  type: "object",
  required: ["start", "end"],
  additionalProperties: false,
  properties: {
    start: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    end: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
  },
} as const;

export async function buildApp(store?: InMemoryStore) {
  const appStore = store ?? new InMemoryStore();
  const ownsStore = !store;
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  app.addHook("onClose", async () => {
    if (ownsStore) appStore.close();
  });

  app.get("/health", async () => ({ status: "ok", service: "looper-api" }));
  app.get("/missions", async () => appStore.missions);
  app.get("/merchants", async () => appStore.merchants.filter((item) => item.status === "active"));
  app.get<{ Params: { userId: string } }>("/users/:userId/state", async (request) => appStore.getUser(request.params.userId));

  app.post<{ Body: MerchantApplicationInput }>("/merchant-applications", {
    schema: { body: { type: "object", required: ["storeName", "contactName", "contactLineId", "phone", "email", "address", "storeCategory", "otherStoreCategory", "vegetarianOffering", "otherMealType", "businessHours"], additionalProperties: false, properties: {
      storeName: { type: "string", minLength: 2 },
      contactName: { type: "string", minLength: 2 },
      contactLineId: { type: "string", minLength: 2, maxLength: 50 },
      phone: { type: "string", minLength: 8 },
      email: { type: "string", minLength: 5 },
      address: { type: "string", minLength: 5 },
      storeCategory: { type: "string", enum: [...STORE_CATEGORIES] },
      otherStoreCategory: { type: "string", maxLength: 100 },
      vegetarianOffering: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", enum: [...MEAL_TYPES] } },
      otherMealType: { type: "string", maxLength: 100 },
      businessHours: {
        type: "array", minItems: 7, maxItems: 7,
        items: {
          type: "object", required: ["day", "closed", "periods"], additionalProperties: false,
          properties: {
            day: { type: "string", enum: WEEKDAYS.map((item) => item.key) },
            closed: { type: "boolean" },
            periods: { type: "array", maxItems: 2, items: periodSchema },
          },
        },
      },
    } } },
  }, async (request, reply) => reply.code(201).send(appStore.submitMerchantApplication(request.body)));

  app.get<{ Params: { applicationId: string } }>("/merchant-applications/:applicationId", async (request) => {
    const application = appStore.merchantApplications.find((item) => item.id === request.params.applicationId);
    if (!application) throw Object.assign(new Error("找不到店家申請"), { statusCode: 404 });
    return application;
  });

  app.get("/merchant-applications", async (request) => {
    requireRole(request.headers, "admin");
    return appStore.merchantApplications;
  });

  app.post<{ Params: { applicationId: string }; Body: { decision: "approve" | "reject" | "request_revision"; note?: string; reviewerId: string } }>("/merchant-applications/:applicationId/review", {
    schema: { body: { type: "object", required: ["decision", "reviewerId"], additionalProperties: false, properties: {
      decision: { type: "string", enum: ["approve", "reject", "request_revision"] }, note: { type: "string", maxLength: 500 }, reviewerId: { type: "string", minLength: 1 },
    } } },
  }, async (request) => {
    requireRole(request.headers, "admin");
    return appStore.reviewMerchantApplication(request.params.applicationId, request.body.decision, request.body.reviewerId, request.body.note);
  });

  app.post<{ Params: { merchantId: string }; Body: { merchantPlan: MerchantPlan } }>("/merchants/:merchantId/plan", {
    schema: { body: { type: "object", required: ["merchantPlan"], additionalProperties: false, properties: { merchantPlan: { type: "string", enum: ["sprout", "grove", "forest"] } } } },
  }, async (request) => {
    requireRole(request.headers, "admin");
    return appStore.updateMerchantPlan(request.params.merchantId, request.body.merchantPlan);
  });

  app.post<{ Params: { missionId: string }; Body: { userId: string } }>("/missions/:missionId/accept", {
    schema: { body: { type: "object", required: ["userId"], additionalProperties: false, properties: { userId: { type: "string", minLength: 1 } } } },
  }, async (request, reply) => reply.code(201).send({ enrollment: appStore.acceptMission(request.body.userId, request.params.missionId), user: appStore.getUser(request.body.userId) }));

  app.post<{ Body: { userId: string; missionId: string; merchantId: string; idempotencyKey: string } }>("/redemptions", {
    schema: { body: { type: "object", required: ["userId", "missionId", "merchantId", "idempotencyKey"], additionalProperties: false, properties: {
      userId: { type: "string", minLength: 1 }, missionId: { type: "string", minLength: 1 }, merchantId: { type: "string", minLength: 1 }, idempotencyKey: { type: "string", minLength: 8, maxLength: 128 },
    } } },
  }, async (request, reply) => {
    requireRole(request.headers, "merchant");
    const result = appStore.redeem(request.body);
    return reply.code(result.replayed ? 200 : 201).send(result);
  });

  app.get<{ Querystring: { merchantId: string } }>("/merchant/task-code/current", {
    schema: { querystring: { type: "object", required: ["merchantId"], additionalProperties: false, properties: {
      merchantId: { type: "string", minLength: 1 },
    } } },
  }, async (request) => {
    requireRole(request.headers, "merchant");
    const current = appStore.getCurrentTaskCode(request.query.merchantId);
    return {
      windowId: current.id,
      merchantId: current.merchantId,
      code: current.code,
      codeLength: current.codeLength,
      validFrom: current.validFrom,
      validUntil: current.validUntil,
      status: current.status,
    };
  });

  app.post<{ Body: { userId: string; missionId: string; merchantId: string; code: string; idempotencyKey: string } }>("/task-code-submissions", {
    schema: { body: { type: "object", required: ["userId", "missionId", "merchantId", "code", "idempotencyKey"], additionalProperties: false, properties: {
      userId: { type: "string", minLength: 1 },
      missionId: { type: "string", minLength: 1 },
      merchantId: { type: "string", minLength: 1 },
      code: { type: "string", minLength: 4, maxLength: 6 },
      idempotencyKey: { type: "string", minLength: 8, maxLength: 128 },
    } } },
  }, async (request, reply) => {
    const result = appStore.submitTaskCode(request.body);
    return reply.code(result.replayed ? 200 : 201).send(result.submission);
  });

  app.get<{ Querystring: { merchantId: string; status?: TaskCodeSubmissionStatus } }>("/merchant/task-code-submissions", {
    schema: { querystring: { type: "object", required: ["merchantId"], additionalProperties: false, properties: {
      merchantId: { type: "string", minLength: 1 },
      status: { type: "string", enum: ["pending", "confirmed", "rejected", "expired"] },
    } } },
  }, async (request) => {
    requireRole(request.headers, "merchant");
    return appStore.listMerchantTaskCodeSubmissions(request.query.merchantId, request.query.status);
  });

  app.post<{ Body: { userId: string; sourceType: RewardSourceType; sourceId: string; idempotencyKey: string; stars: number; energy?: number; exp: number } }>("/admin/reward-events", {
    schema: { body: { type: "object", required: ["userId", "sourceType", "sourceId", "idempotencyKey", "stars", "exp"], additionalProperties: false, properties: {
      userId: { type: "string", minLength: 1 },
      sourceType: { type: "string", enum: ["task_completion", "event_checkin", "daily_login", "level_up", "admin_adjustment"] },
      sourceId: { type: "string", minLength: 1 },
      idempotencyKey: { type: "string", minLength: 8, maxLength: 128 },
      stars: { type: "number", minimum: 0 },
      energy: { type: "number", minimum: 0 },
      exp: { type: "number", minimum: 0 },
    } } },
  }, async (request) => {
    requireRole(request.headers, "admin");
    return appStore.settleActivityReward(request.body);
  });

  app.get("/merchant/redemptions", async (request) => {
    requireRole(request.headers, "merchant");
    return appStore.redemptions;
  });

  app.get("/admin/overview", async (request) => {
    requireRole(request.headers, "admin");
    return appStore.overview();
  });

  app.get("/admin/economy", async (request) => {
    requireRole(request.headers, "admin");
    return {
      settings: appStore.economySettings,
      merchantPlans: appStore.merchantPlans,
      levelDefinitions: appStore.levelDefinitions,
    };
  });

  app.put<{ Body: EconomySettingsUpdateInput }>("/admin/economy-settings", {
    schema: { body: { type: "object", required: ["vegetarianCarbonGrams", "carbonGramsPerSeed", "seedsPerPlant", "plantsPerTree", "redemptionEnergy", "redemptionExp", "energyRegenIntervalSeconds", "energyOverflowMultiplier", "updatedBy"], additionalProperties: false, properties: {
      vegetarianCarbonGrams: { type: "integer", minimum: 1, maximum: 100000 },
      carbonGramsPerSeed: { type: "integer", minimum: 1, maximum: 100000 },
      seedsPerPlant: { type: "integer", minimum: 1, maximum: 1000 },
      plantsPerTree: { type: "integer", minimum: 1, maximum: 1000 },
      redemptionEnergy: { type: "integer", minimum: 0, maximum: 10000 },
      redemptionExp: { type: "integer", minimum: 0, maximum: 100000 },
      energyRegenIntervalSeconds: { type: "integer", minimum: 1, maximum: 86400 },
      energyOverflowMultiplier: { type: "number", minimum: 1, maximum: 10 },
      expectedVersion: { type: "integer", minimum: 1 },
      updatedBy: { type: "string", minLength: 1, maxLength: 100 },
    } } },
  }, async (request) => {
    requireRole(request.headers, "admin");
    return appStore.updateEconomySettings(request.body);
  });

  app.setErrorHandler((error: unknown, _request, reply) => {
    const normalized = error instanceof Error ? error : new Error("未知錯誤");
    const status = error as { statusCode?: unknown };
    if (String(normalized.message).includes("database is locked")) {
      reply.code(503).send({ message: "資料庫暫時忙碌，請稍後再試" });
      return;
    }
    if ((error as { code?: unknown }).code === "ERR_SQLITE_CONSTRAINT") {
      reply.code(409).send({ message: "資料已存在或違反資料一致性限制" });
      return;
    }
    reply.code(typeof status.statusCode === "number" ? status.statusCode : 500).send({ message: normalized.message });
  });

  return app;
}
