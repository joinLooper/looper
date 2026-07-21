import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { decisionConflictMessage, getOrCreateDecisionKey, shouldKeepDecisionKey } from "./task-code-flow";

test("merchant task code flow reuses decision key for network retry", () => {
  let count = 0;
  const createId = () => `id-${++count}`;
  const first = getOrCreateDecisionKey(undefined, "submission-1", "confirm", createId);
  const retry = getOrCreateDecisionKey(first, "submission-1", "confirm", createId);
  assert.equal(first, "task-code-decision:submission-1:confirm:id-1");
  assert.equal(retry, first);
  assert.equal(count, 1);
});

test("merchant task code flow shows handled-by-other-staff message for conflict", () => {
  assert.equal(decisionConflictMessage(), "已由其他店員處理");
});

test("merchant task code flow keeps idempotency key only for retryable network or server failures", () => {
  assert.equal(shouldKeepDecisionKey(0), true);
  assert.equal(shouldKeepDecisionKey(503), true);
  assert.equal(shouldKeepDecisionKey(409), false);
  assert.equal(shouldKeepDecisionKey(200), false);
});

test("merchant task code UI does not expose QR camera diamond hash or secret", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.equal(/QR|相機|鏡頭|💎|codeHash|code_hash|secret/i.test(source), false);
});
