import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createSession, reducer, QUESTIONS, qaEnabled, taipeiDay, type Session, type Action } from "../src/knowledge-book/flow";
import { createQaStore } from "../src/knowledge-book/store";
const start = (level = 3) => createSession("2026-10-25", level);
const run = (state: Session, ...actions: Action[]) => actions.reduce(reducer, state);
const answer = (state: Session, option: number) => run(state, { type: "select", option }, { type: "submit" });
const first = () => reducer(start(), { type: "open" });

test("QA gate rejects production without exact explicit opt-in", () => {
  assert.equal(qaEnabled(false), false); assert.equal(qaEnabled(false, "true"), false);
  assert.equal(qaEnabled(true), true); assert.equal(qaEnabled(false, "1"), true);
});
test("Lv1 is locked and cannot answer, Lv3 can open", () => {
  let state = run(start(1), { type: "open" }, { type: "select", option: 0 }, { type: "submit" });
  assert.equal(state.stage, "level-locked"); assert.equal(state.receipts.length, 0);
  state = run(state, { type: "level", level: 3 }, { type: "open" }); assert.equal(state.stage, "unanswered");
});
test("all five paper states occur and answers/explanations remain data", () => {
  const a = first(); const b = reducer(a, { type: "select", option: 0 }); const c = reducer(b, { type: "submit" });
  const d = reducer(c, { type: "complete" }); const wrong = answer(first(), 1);
  assert.deepEqual([a.stage, b.stage, c.stage, wrong.stage, d.stage], ["unanswered", "selected", "correct", "incorrect", "completed"]);
  for (const q of QUESTIONS) { assert.equal(q.options.length, 4); assert.ok(q.explanation); assert.ok(q.answer < 4); }
});
test("question 1 correct, question 2 wrong, question 3 pauses with exactly two receipts", () => {
  let state = answer(first(), 0); assert.equal(state.stage, "correct");
  state = run(state, { type: "complete" }, { type: "next" }); assert.equal(state.questionId, QUESTIONS[1].id);
  state = answer(state, 0); assert.equal(state.stage, "incorrect");
  state = run(state, { type: "complete" }, { type: "next" }); assert.equal(state.stage, "ENERGY_POLICY_PENDING");
  const pending = state; state = run(state, { type: "select", option: 0 }, { type: "submit" }, { type: "next" });
  assert.deepEqual(state, pending); assert.equal(state.receipts.length, 2);
});
test("double submit, double complete and double next do not double count or skip", () => {
  let state = run(first(), { type: "select", option: 0 }, { type: "submit" }, { type: "submit" }, { type: "submit" });
  assert.equal(state.receipts.length, 1);
  state = run(state, { type: "complete" }, { type: "complete" }, { type: "next" }, { type: "next" });
  assert.equal(state.questionId, QUESTIONS[1].id); assert.equal(state.stage, "unanswered");
});
test("close/reopen and repeated same-question answers retain one receipt", () => {
  let state = run(answer(first(), 0), { type: "close" }, { type: "open" });
  assert.equal(state.stage, "completed"); assert.equal(state.selected, 0);
  state = run(state, { type: "select", option: 2 }, { type: "submit" }); assert.equal(state.receipts.length, 1); assert.equal(state.selected, 0);
});
test("no selection, invalid selection and next before completion are inert", () => {
  const state = first();
  for (const action of [{ type: "submit" }, { type: "next" }, { type: "select", option: -1 }, { type: "select", option: 4 }, { type: "select", option: NaN }, { type: "select", option: 0.5 }] as Action[]) assert.equal(reducer(state, action), state);
});
test("level changes cannot clear receipts or unlock third question", () => {
  let state = run(answer(first(), 0), { type: "complete" }, { type: "next" }); state = answer(state, 0);
  state = run(state, { type: "level", level: 1 }, { type: "open" }); assert.equal(state.stage, "level-locked");
  state = run(state, { type: "level", level: 3 }, { type: "open", questionId: QUESTIONS[2].id });
  assert.equal(state.stage, "ENERGY_POLICY_PENDING"); assert.equal(state.receipts.length, 2);
});
test("completed question remains reviewable after allowance is used", () => {
  let state = run(answer(first(), 0), { type: "complete" }, { type: "next" }); state = answer(state, 0);
  state = reducer(state, { type: "open", questionId: QUESTIONS[0].id }); assert.equal(state.stage, "completed"); assert.equal(state.receipts.length, 2);
});
test("third question deep selection never guesses cost, even with no answers", () => { assert.equal(reducer(start(), { type: "open", questionId: QUESTIONS[2].id }).stage, "ENERGY_POLICY_PENDING"); });
test("Taipei midnight, same-day revisit and next day reset", () => {
  assert.equal(taipeiDay(new Date("2026-10-24T15:59:59Z")), "2026-10-24");
  assert.equal(taipeiDay(new Date("2026-10-24T16:00:00Z")), "2026-10-25");
  const state = answer(first(), 0); assert.equal(reducer(state, { type: "day", day: state.day }), state);
  const next = reducer(state, { type: "day", day: "2026-10-26" }); assert.equal(next.receipts.length, 0); assert.equal(next.stage, "intro");
});
test("external store survives route subscriptions and applies rapid actions synchronously", () => {
  const store = createQaStore(start()); let notifications = 0; const stop = store.subscribe(() => notifications++);
  store.dispatch({ type: "open" }); store.dispatch({ type: "select", option: 0 }); store.dispatch({ type: "submit" }); store.dispatch({ type: "submit" }); stop();
  const snapshot = store.getSnapshot(); store.subscribe(() => {} )(); assert.equal(store.getSnapshot(), snapshot);
  assert.equal(snapshot.receipts.length, 1); assert.equal(notifications, 3);
});
test("isolated source has no API, network, shared dispatch or persistent ledger dependencies", () => {
  const directory = resolve(import.meta.dirname, "../src/knowledge-book");
  const text = readdirSync(directory).filter(name => /\.tsx?$/.test(name)).map(name => readFileSync(resolve(directory, name), "utf8")).join("\n");
  assert.doesNotMatch(text, /\b(fetch|XMLHttpRequest|AsyncStorage|localStorage|axios)\b|\/player\/|requestedEnergy|\.\/state|\.\.\/state|\.\.\/model/);
  const route = readFileSync(resolve(import.meta.dirname, "../app/knowledge-book-qa.tsx"), "utf8"); assert.doesNotMatch(route, /\bdispatch\b|\bfetch\b/);
});
test("manifest preserves unknown policy, unknown Knowledge and original art block", () => {
  const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, "../src/knowledge-book/state_manifest.json"), "utf8"));
  assert.equal(manifest.economyWrites, false); assert.equal(manifest.energyCost, null); assert.equal(manifest.dailyMaximum, null); assert.equal(manifest.knowledge, null);
  assert.equal(manifest.bookMasterStatus, "ART_BLOCKED_NATIVE_BOOK_LAYERS_MISSING"); assert.equal(manifest.sourceFingerprint, null);
});
