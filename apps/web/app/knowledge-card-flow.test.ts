import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APPROVED_MVP_KNOWLEDGE_QUESTION,
  KNOWLEDGE_REWARD_LABEL,
  initialKnowledgeCardState,
  reduceKnowledgeCard,
} from "./knowledge-card-flow";

function readyState() {
  return reduceKnowledgeCard(
    reduceKnowledgeCard(initialKnowledgeCardState, { type: "load" }),
    { type: "loaded", question: APPROVED_MVP_KNOWLEDGE_QUESTION },
  );
}

test("knowledge card loads the approved MVP question and answer choices", () => {
  const loading = reduceKnowledgeCard(initialKnowledgeCardState, {
    type: "load",
  });
  assert.equal(loading.phase, "loading");
  const ready = reduceKnowledgeCard(loading, {
    type: "loaded",
    question: APPROVED_MVP_KNOWLEDGE_QUESTION,
  });
  assert.equal(ready.phase, "ready");
  assert.equal(ready.question?.answers.length, 3);
});

test("knowledge card selects one answer and produces correct feedback", () => {
  const selected = reduceKnowledgeCard(readyState(), {
    type: "select",
    answerId: "reusable-container",
  });
  assert.equal(selected.phase, "selected");
  const submitted = reduceKnowledgeCard(selected, { type: "submit" });
  assert.equal(submitted.phase, "selected");
  assert.equal(submitted.rewardStatus, "pending");
  const answered = reduceKnowledgeCard(submitted, {
    type: "answer_succeeded",
    isCorrect: true,
  });
  assert.equal(answered.phase, "correct");
});

test("knowledge card produces restrained incorrect feedback", () => {
  const selected = reduceKnowledgeCard(readyState(), {
    type: "select",
    answerId: "extra-bag",
  });
  const submitted = reduceKnowledgeCard(selected, { type: "submit" });
  assert.equal(submitted.phase, "selected");
  assert.equal(submitted.rewardStatus, "pending");
  assert.equal(
    reduceKnowledgeCard(submitted, {
      type: "answer_succeeded",
      isCorrect: false,
    }).phase,
    "incorrect",
  );
});

test("knowledge card prevents duplicate answer submission", () => {
  const selected = reduceKnowledgeCard(readyState(), {
    type: "select",
    answerId: "reusable-container",
  });
  const submitted = reduceKnowledgeCard(selected, { type: "submit" });
  assert.equal(reduceKnowledgeCard(submitted, { type: "submit" }), submitted);
  const answered = reduceKnowledgeCard(submitted, {
    type: "answer_succeeded",
    isCorrect: true,
  });
  assert.equal(
    reduceKnowledgeCard(answered, { type: "select", answerId: "extra-bag" }),
    answered,
  );
});

test("knowledge card represents reward pending completed unavailable and error states", () => {
  const selected = reduceKnowledgeCard(readyState(), {
    type: "select",
    answerId: "reusable-container",
  });
  const pending = reduceKnowledgeCard(selected, { type: "submit" });
  const answered = reduceKnowledgeCard(pending, {
    type: "answer_succeeded",
    isCorrect: true,
  });
  assert.equal(
    reduceKnowledgeCard(answered, { type: "reward_completed" }).rewardStatus,
    "completed",
  );
  assert.equal(
    reduceKnowledgeCard(pending, { type: "reward_unavailable" }).rewardStatus,
    "unavailable",
  );
  const failed = reduceKnowledgeCard(pending, {
    type: "reward_failed",
    message: "暫時無法入帳",
  });
  assert.equal(failed.rewardStatus, "error");
  assert.equal(failed.errorMessage, "暫時無法入帳");
});

test("knowledge card exposes load error and retry states", () => {
  const failed = reduceKnowledgeCard(initialKnowledgeCardState, {
    type: "load_failed",
    message: "題目載入失敗",
  });
  assert.equal(failed.phase, "error");
  assert.equal(reduceKnowledgeCard(failed, { type: "retry" }).phase, "loading");
});

test("knowledge card uses approved reward copy blank side fields and no reward border", () => {
  const component = readFileSync(
    new URL("./knowledge-card.tsx", import.meta.url),
    "utf8",
  );
  const css = readFileSync(new URL("./mobile.css", import.meta.url), "utf8");
  assert.equal(KNOWLEDGE_REWARD_LABEL, "+30 EXP");
  assert.match(
    component,
    /knowledge-reward-row[\s\S]*?<span aria-hidden="true" \/>[\s\S]*?knowledge-reward[\s\S]*?<span aria-hidden="true" \/>/,
  );
  assert.match(css, /\.knowledge-reward\s*\{[\s\S]*?border:\s*0/);
  assert.doesNotMatch(component, /🌿|小花|reward-events|\/redemptions/);
});

test("knowledge card CSS keeps a narrow responsive layout without horizontal overflow", () => {
  const css = readFileSync(new URL("./mobile.css", import.meta.url), "utf8");
  assert.match(
    css,
    /\.knowledge-card\s*\{[\s\S]*?width:\s*min\(calc\(100% - 1\.5rem\),\s*30rem\)/,
  );
  assert.match(css, /\.knowledge-card__answers\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
});

// The mounted Unified Runtime owns requests; the page remains a composition root.
test("Unified Runtime wires knowledge through the canonical runtime API", () => {
  const read = (path: string) =>
    readFileSync(new URL(path, import.meta.url), "utf8");
  const page = read("./page.tsx");
  const game = read("./game-runtime/resident-game.tsx");
  const overlays = read("./game-runtime/primary-overlay.tsx");
  assert.match(
    page,
    /import \{ ResidentGame \} from "\.\/game-runtime\/resident-game"/,
  );
  assert.match(page, /<ResidentGame\s*\/>/);
  assert.doesNotMatch(
    page,
    /fetch\(|restaurantExperienceEnabled|RuntimeAssemblyRenderer/,
  );
  assert.match(
    game,
    /import \{[^}]*answerDailyKnowledge[^}]*fetchResidentRuntime[^}]*\} from "\.\/runtime-api"/,
  );
  assert.match(
    game,
    /await answerDailyKnowledge\(input\);\s*setProfile\(result\.user\)/,
  );
  assert.match(game, /<KnowledgeBoardOverlay[^>]*onSubmit=\{submitKnowledge\}/);
  const knowledge = overlays.slice(
    overlays.indexOf("export function KnowledgeBoardOverlay"),
    overlays.indexOf("export function RestaurantOverlay"),
  );
  assert.match(
    knowledge,
    /if \(!selected \|\| !state \|\| !unlocked \|\| completed \|\| submitting\) return/,
  );
  assert.match(knowledge, /disabled=\{completed \|\| submitting\}/);
  assert.doesNotMatch(
    game.slice(
      game.indexOf("async function submitKnowledge"),
      game.indexOf("function openCoreTree"),
    ),
    /currentExp\s*[+:=]|starBalance\s*[+:=]|reward-events|redemptions/,
  );
});

test("runtime API reads canonical resident state and knowledge with the player session", async (t) => {
  const { fetchResidentRuntime, RUNTIME_API_URL } =
    await import("./game-runtime/runtime-api");
  const responses = {
    "/player/state": { id: "resident-a" },
    "/player/knowledge-cards/sustainable-takeaway-container-v1": {
      completed: false,
    },
    "/player/missions/runtime": { today: [] },
    "/player/preferences/presentation": { reducedMotion: null },
  };
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(init.credentials, "include");
    assert.equal(init.cache, "no-store");
    assert.equal(init.method, undefined);
    assert.ok(url.startsWith(RUNTIME_API_URL));
    const route = url.slice(RUNTIME_API_URL.length);
    assert.ok(
      Object.hasOwn(responses, route),
      "unexpected runtime route: " + route,
    );
    requests.push(route);
    return Response.json(responses[route as keyof typeof responses]);
  });
  const runtime = await fetchResidentRuntime();
  assert.deepEqual(requests.sort(), Object.keys(responses).sort());
  assert.deepEqual(runtime.profile, responses["/player/state"]);
  assert.deepEqual(
    runtime.knowledge,
    responses["/player/knowledge-cards/sustainable-takeaway-container-v1"],
  );
});

test("runtime knowledge adapter preserves backend idempotency without duplicate Stars or EXP", async (t) => {
  const { answerDailyKnowledge, fetchResidentRuntime } =
    await import("./game-runtime/runtime-api");
  const { buildApp } = await import("../../api/src/app");
  const { InMemoryStore } = await import("../../api/src/store");
  const store = new InMemoryStore(":memory:");
  const app = await buildApp(store, { playerAppUrl: "http://player.test" });
  t.after(async () => {
    await app.close();
    store.close();
  });
  const session = store.createPlayerSession(
    {
      provider: "line",
      providerSubject: "qa-frontend-knowledge",
      displayName: "QA",
    },
    3600,
  );
  store.setUserResourcesForTest(session.context.userId, {
    currentLevel: 3,
    currentExp: 150,
    currentEnergy: 80,
    maxEnergy: 120,
    nextLevelExp: 330,
    unlockFlags: ["knowledge_card"],
  });
  const writes: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(init.credentials, "include");
    const route = new URL(url).pathname;
    if (init.method === "POST") {
      writes.push(route);
      assert.equal(
        route,
        "/player/knowledge-cards/sustainable-takeaway-container-v1/answers",
      );
      assert.equal(
        new Headers(init.headers).get("content-type"),
        "application/json",
      );
    }
    const response = await app.inject({
      method: (init.method ?? "GET") as "GET" | "POST",
      url: route,
      headers: {
        origin: "http://player.test",
        cookie: "looper_player_session=" + session.sessionToken,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      ...(init.body ? { payload: String(init.body) } : {}),
    });
    return new Response(response.body, {
      status: response.statusCode,
      headers: { "content-type": "application/json" },
    });
  });
  const input = {
    selectedOptionId: "reusable-container",
    cardVersion: "v1",
    idempotencyKey: "frontend-knowledge-retry-key",
  };
  const first = await answerDailyKnowledge(input);
  const replay = await answerDailyKnowledge(input);
  const duplicateCycle = await answerDailyKnowledge({
    ...input,
    idempotencyKey: "frontend-knowledge-new-key",
  });
  assert.equal(first.user.resources.currentExp, 200);
  assert.equal(first.user.resources.starBalance, 100);
  for (const result of [replay, duplicateCycle]) {
    assert.equal(result.replayed, true);
    assert.equal(result.user.resources.currentExp, 200);
    assert.equal(result.user.resources.starBalance, 100);
  }
  await assert.rejects(
    answerDailyKnowledge({ ...input, selectedOptionId: "extra-bag" }),
    (error: unknown) => (error as { status: number }).status === 409,
  );
  const runtime = await fetchResidentRuntime();
  assert.equal(runtime.knowledge?.completed, true);
  assert.equal(runtime.profile.resources.currentExp, 200);
  assert.equal(runtime.profile.resources.starBalance, 100);
  assert.equal(
    store
      .listResourceTransactions()
      .filter(
        (item) =>
          item.resourceType === "exp" &&
          item.sourceId.startsWith("knowledge-card-attempt-"),
      ).length,
    1,
  );
  assert.equal(store.listRewardEvents().length, 1);
  assert.equal(writes.length, 4);
});
