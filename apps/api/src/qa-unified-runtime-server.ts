import { buildApp } from "./app.js";
import type { PlayerIdentityVerifier } from "./player-identity.js";
import { InMemoryStore } from "./store.js";

const playerAppUrl = "http://localhost:3000";
const verifier: PlayerIdentityVerifier = {
  async verifyIdToken(idToken) {
    const [providerSubject, displayName = "QA Resident"] = idToken.split("|", 2);
    if (!providerSubject?.startsWith("qa-")) throw Object.assign(new Error("invalid QA identity"), { statusCode: 401 });
    return { provider: "line", providerSubject, displayName };
  },
};

const store = new InMemoryStore(":memory:");
const app = await buildApp(store, {
  playerAppUrl,
  merchantAppUrl: "http://localhost:3001",
  adminAppUrl: "http://localhost:3002",
  playerIdentityVerifier: verifier,
});

function setQaLevel(userId: string, level: 1 | 2 | 3, energy?: number) {
  const canonical = level === 1
    ? { currentExp: 0, maxEnergy: 0, nextLevelExp: 50, unlockFlags: [] as string[] }
    : level === 2
      ? { currentExp: 50, maxEnergy: 0, nextLevelExp: 150, unlockFlags: [] as string[] }
      : { currentExp: 150, maxEnergy: 120, nextLevelExp: 330, unlockFlags: ["knowledge_card", "energy", "treehouse_furniture_preview"] };
  store.setUserResourcesForTest(userId, {
    currentLevel: level,
    currentEnergy: level === 3 ? (energy ?? 80) : 0,
    energyOverflowPending: 0,
    ...canonical,
  });
  return store.getUser(userId);
}

app.post<{ Body: { userId: string; level: 1 | 2 | 3; energy?: number } }>("/__qa/player-resources", async (request, reply) => {
  if (request.headers.origin !== playerAppUrl) return reply.code(403).send({ message: "QA origin rejected" });
  const { userId, level, energy } = request.body;
  return { profile: setQaLevel(userId, level, energy) };
});

app.get<{ Querystring: { subject?: string; level?: string; energy?: string } }>("/__qa/login", async (request, reply) => {
  const subject = request.query.subject?.startsWith("qa-") ? request.query.subject : "qa-browser-a";
  const level = request.query.level === "2" ? 2 : request.query.level === "3" ? 3 : 1;
  const energy = request.query.energy === undefined ? undefined : Number(request.query.energy);
  const session = store.createPlayerSession({ provider: "line", providerSubject: subject, displayName: `QA ${subject}` }, 60 * 60);
  setQaLevel(session.context.userId, level, Number.isFinite(energy) ? energy : undefined);
  reply.header("set-cookie", `looper_player_session=${session.sessionToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=3600`);
  return reply.redirect(playerAppUrl);
});

await app.listen({ port: 4000, host: "127.0.0.1" });
console.log("Unified runtime QA API listening on http://127.0.0.1:4000");

const close = async () => {
  await app.close();
  store.close();
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
