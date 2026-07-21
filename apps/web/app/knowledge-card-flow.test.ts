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
  const loading = reduceKnowledgeCard(initialKnowledgeCardState, { type: "load" });
  assert.equal(loading.phase, "loading");
  const ready = reduceKnowledgeCard(loading, { type: "loaded", question: APPROVED_MVP_KNOWLEDGE_QUESTION });
  assert.equal(ready.phase, "ready");
  assert.equal(ready.question?.answers.length, 3);
});

test("knowledge card selects one answer and produces correct feedback", () => {
  const selected = reduceKnowledgeCard(readyState(), { type: "select", answerId: "reusable-container" });
  assert.equal(selected.phase, "selected");
  const submitted = reduceKnowledgeCard(selected, { type: "submit" });
  assert.equal(submitted.phase, "selected");
  assert.equal(submitted.rewardStatus, "pending");
  const answered = reduceKnowledgeCard(submitted, { type: "answer_succeeded", isCorrect: true });
  assert.equal(answered.phase, "correct");
});

test("knowledge card produces restrained incorrect feedback", () => {
  const selected = reduceKnowledgeCard(readyState(), { type: "select", answerId: "extra-bag" });
  const submitted = reduceKnowledgeCard(selected, { type: "submit" });
  assert.equal(submitted.phase, "selected");
  assert.equal(submitted.rewardStatus, "pending");
  assert.equal(reduceKnowledgeCard(submitted, { type: "answer_succeeded", isCorrect: false }).phase, "incorrect");
});

test("knowledge card prevents duplicate answer submission", () => {
  const selected = reduceKnowledgeCard(readyState(), { type: "select", answerId: "reusable-container" });
  const submitted = reduceKnowledgeCard(selected, { type: "submit" });
  assert.equal(reduceKnowledgeCard(submitted, { type: "submit" }), submitted);
  const answered = reduceKnowledgeCard(submitted, { type: "answer_succeeded", isCorrect: true });
  assert.equal(reduceKnowledgeCard(answered, { type: "select", answerId: "extra-bag" }), answered);
});

test("knowledge card represents reward pending completed unavailable and error states", () => {
  const selected = reduceKnowledgeCard(readyState(), { type: "select", answerId: "reusable-container" });
  const pending = reduceKnowledgeCard(selected, { type: "submit" });
  const answered = reduceKnowledgeCard(pending, { type: "answer_succeeded", isCorrect: true });
  assert.equal(reduceKnowledgeCard(answered, { type: "reward_completed" }).rewardStatus, "completed");
  assert.equal(reduceKnowledgeCard(pending, { type: "reward_unavailable" }).rewardStatus, "unavailable");
  const failed = reduceKnowledgeCard(pending, { type: "reward_failed", message: "暫時無法入帳" });
  assert.equal(failed.rewardStatus, "error");
  assert.equal(failed.errorMessage, "暫時無法入帳");
});

test("knowledge card exposes load error and retry states", () => {
  const failed = reduceKnowledgeCard(initialKnowledgeCardState, { type: "load_failed", message: "題目載入失敗" });
  assert.equal(failed.phase, "error");
  assert.equal(reduceKnowledgeCard(failed, { type: "retry" }).phase, "loading");
});

test("knowledge card uses approved reward copy blank side fields and no reward border", () => {
  const component = readFileSync(new URL("./knowledge-card.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./mobile.css", import.meta.url), "utf8");
  assert.equal(KNOWLEDGE_REWARD_LABEL, "+30 EXP");
  assert.match(component, /knowledge-reward-row[\s\S]*?<span aria-hidden="true" \/>[\s\S]*?knowledge-reward[\s\S]*?<span aria-hidden="true" \/>/);
  assert.match(css, /\.knowledge-reward\s*\{[\s\S]*?border:\s*0/);
  assert.doesNotMatch(component, /🌿|小花|reward-events|\/redemptions/);
});

test("knowledge card CSS keeps a narrow responsive layout without horizontal overflow", () => {
  const css = readFileSync(new URL("./mobile.css", import.meta.url), "utf8");
  assert.match(css, /\.knowledge-card\s*\{[\s\S]*?width:\s*min\(calc\(100% - 1\.5rem\),\s*30rem\)/);
  assert.match(css, /\.knowledge-card__answers\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
});

test("knowledge card integration retains canonical player data flow", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  for (const route of ["/missions", "/merchants", "/task-code-submissions", "/player/events/next", "/player/state"]) {
    assert.equal(page.includes(route), true, `missing canonical route ${route}`);
  }
  assert.match(readFileSync(new URL("./knowledge-card.tsx", import.meta.url), "utf8"), /\/player\/knowledge-cards\/.*\/answers/);
  assert.doesNotMatch(page, /POST \/admin\/reward-events|POST \/redemptions/);
});
