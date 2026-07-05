import cors from "@fastify/cors";
import Fastify from "fastify";
import type { AdminOverview, UserRole } from "@looper/types";
import { InMemoryStore } from "./store.js";

function requireRole(headers: Record<string, unknown>, expected: UserRole): void {
  if (headers["x-looper-role"] !== expected) {
    throw Object.assign(new Error("權限不足"), { statusCode: 403 });
  }
}

export async function buildApp(store = new InMemoryStore()) {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ status: "ok", service: "looper-api" }));
  app.get("/missions", async () => store.missions);
  app.get<{ Params: { userId: string } }>("/users/:userId/state", async (request) => store.getUser(request.params.userId));

  app.post<{ Params: { missionId: string }; Body: { userId: string } }>("/missions/:missionId/accept", {
    schema: { body: { type: "object", required: ["userId"], additionalProperties: false, properties: { userId: { type: "string", minLength: 1 } } } },
  }, async (request, reply) => {
    const enrollment = store.acceptMission(request.body.userId, request.params.missionId);
    return reply.code(201).send({ enrollment, user: store.getUser(request.body.userId) });
  });

  app.post<{ Body: { userId: string; missionId: string; merchantId: string; idempotencyKey: string } }>("/redemptions", {
    schema: { body: { type: "object", required: ["userId", "missionId", "merchantId", "idempotencyKey"], additionalProperties: false, properties: {
      userId: { type: "string", minLength: 1 }, missionId: { type: "string", minLength: 1 }, merchantId: { type: "string", minLength: 1 }, idempotencyKey: { type: "string", minLength: 8, maxLength: 128 },
    } } },
  }, async (request, reply) => {
    requireRole(request.headers, "merchant");
    const result = store.redeem(request.body);
    return reply.code(result.replayed ? 200 : 201).send({ ...result, user: store.getUser(request.body.userId) });
  });

  app.get("/merchant/redemptions", async (request) => {
    requireRole(request.headers, "merchant");
    return store.redemptions;
  });

  app.get("/admin/overview", async (request): Promise<AdminOverview> => {
    requireRole(request.headers, "admin");
    const users = Array.from(store.users.values());
    const enrollments = users.flatMap((user) => user.enrollments);
    return {
      users,
      missions: store.missions,
      redemptions: store.redemptions,
      auditEvents: store.auditEvents,
      metrics: {
        totalUsers: users.length,
        awaitingVerification: enrollments.filter((item) => item.status === "awaiting_verification").length,
        completedMissions: enrollments.filter((item) => item.status === "completed").length,
        starsGranted: store.redemptions.reduce((sum, item) => sum + item.starsGranted, 0),
        energyGranted: store.redemptions.reduce((sum, item) => sum + item.energyGranted, 0),
      },
    };
  });

  app.setErrorHandler((error: unknown, _request, reply) => {
    const normalized = error instanceof Error ? error : new Error("未知錯誤");
    const status = error as { statusCode?: unknown };
    reply.code(typeof status.statusCode === "number" ? status.statusCode : 500).send({ message: normalized.message });
  });

  return app;
}
