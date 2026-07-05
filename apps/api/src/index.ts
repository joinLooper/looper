import cors from "@fastify/cors";
import Fastify from "fastify";
import type {
  AdminOverview,
  Mission,
  MissionEnrollment,
  Redemption,
  UserProgress,
} from "@looper/types";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const missions: Mission[] = [
  {
    id: "mission-vegetarian-meal",
    title: "完成一餐蔬食",
    description: "到合作店家完成一餐蔬食，請店家協助核銷。",
    starReward: 10,
    energyReward: 20,
  },
];

const users = new Map<string, UserProgress>([
  [
    "user-demo",
    {
      id: "user-demo",
      displayName: "Looper 測試旅人",
      stars: 0,
      energy: 0,
      enrollments: [],
    },
  ],
]);

const redemptions: Redemption[] = [];

function getUser(userId: string): UserProgress {
  const user = users.get(userId);
  if (!user) {
    throw Object.assign(new Error("找不到使用者"), { statusCode: 404 });
  }
  return user;
}

function getMission(missionId: string): Mission {
  const mission = missions.find((item) => item.id === missionId);
  if (!mission) {
    throw Object.assign(new Error("找不到任務"), { statusCode: 404 });
  }
  return mission;
}

app.get("/health", async () => ({ status: "ok", service: "looper-api" }));
app.get("/missions", async () => missions);

app.get<{ Params: { userId: string } }>("/users/:userId/state", async (request) => {
  return getUser(request.params.userId);
});

app.post<{
  Params: { missionId: string };
  Body: { userId: string };
}>("/missions/:missionId/accept", async (request, reply) => {
  const user = getUser(request.body.userId);
  getMission(request.params.missionId);

  const existing = user.enrollments.find(
    (item) => item.missionId === request.params.missionId,
  );
  if (existing) {
    return { enrollment: existing, user };
  }

  const enrollment: MissionEnrollment = {
    userId: user.id,
    missionId: request.params.missionId,
    status: "awaiting_verification",
    acceptedAt: new Date().toISOString(),
  };
  user.enrollments.push(enrollment);
  return reply.code(201).send({ enrollment, user });
});

app.post<{
  Body: { userId: string; missionId: string; merchantId: string };
}>("/redemptions", async (request, reply) => {
  const { userId, missionId, merchantId } = request.body;
  const user = getUser(userId);
  const mission = getMission(missionId);
  const enrollment = user.enrollments.find((item) => item.missionId === missionId);

  if (!enrollment) {
    return reply.code(409).send({ message: "使用者尚未接取此任務" });
  }
  if (enrollment.status === "completed") {
    return reply.code(409).send({ message: "此任務已完成核銷" });
  }

  enrollment.status = "completed";
  enrollment.completedAt = new Date().toISOString();
  user.stars += mission.starReward;
  user.energy += mission.energyReward;

  const redemption: Redemption = {
    id: `redemption-${redemptions.length + 1}`,
    userId,
    missionId,
    merchantId,
    starsGranted: mission.starReward,
    energyGranted: mission.energyReward,
    createdAt: enrollment.completedAt,
  };
  redemptions.push(redemption);

  return reply.code(201).send({ redemption, user });
});

app.get("/merchant/redemptions", async () => redemptions);

app.get("/admin/overview", async (): Promise<AdminOverview> => {
  const userList = Array.from(users.values());
  const enrollments = userList.flatMap((user) => user.enrollments);
  return {
    users: userList,
    missions,
    redemptions,
    metrics: {
      totalUsers: userList.length,
      awaitingVerification: enrollments.filter(
        (item) => item.status === "awaiting_verification",
      ).length,
      completedMissions: enrollments.filter((item) => item.status === "completed").length,
      starsGranted: redemptions.reduce((sum, item) => sum + item.starsGranted, 0),
      energyGranted: redemptions.reduce((sum, item) => sum + item.energyGranted, 0),
    },
  };
});

app.setErrorHandler((error: unknown, _request, reply) => {
  const normalizedError = error instanceof Error ? error : new Error("未知錯誤");
  const statusCandidate = error as { statusCode?: unknown };
  const statusCode = typeof statusCandidate.statusCode === "number"
    ? statusCandidate.statusCode
    : 500;

  reply.code(statusCode).send({ message: normalizedError.message });
});

const port = Number(process.env.API_PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
