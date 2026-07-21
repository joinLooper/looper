import assert from "node:assert/strict";
import test from "node:test";
import { TASK_CODE_REPORTING_ISSUE_CODES } from "@looper/types";
import { evaluateTaskCodeReportingEligibility, type TaskCodeReportingEvidence } from "./reporting-eligibility.js";

const completeSettled: TaskCodeReportingEvidence = {
  status: "settled",
  hasScopeSnapshot: true,
  submittedAt: "2026-07-01T00:00:00.000Z",
  settledAt: "2026-07-01T00:01:00.000Z",
  rejectedAt: null,
  expiredAt: null,
  redemptionId: "redemption-1",
  rewardEventId: "reward-1",
  hasRewardPayload: true,
  ruleVersion: "rule-v1",
  hasRewardRuleSnapshot: true,
};

test("legacy reporting eligibility keeps pending and confirmed terminal fields not applicable", () => {
  for (const status of ["pending", "confirmed"] as const) {
    const result = evaluateTaskCodeReportingEligibility({ ...completeSettled, status, settledAt: null, redemptionId: null, rewardEventId: null, hasRewardPayload: false, ruleVersion: null, hasRewardRuleSnapshot: false });
    assert.deepEqual(result, {
      eligibleForSubmittedFlow: true,
      eligibleForTerminalFlow: null,
      eligibleForSettlement: null,
      issueCodes: [],
    });
  }
});

test("legacy reporting eligibility accepts complete settled evidence without recalculation", () => {
  assert.deepEqual(evaluateTaskCodeReportingEligibility(completeSettled), {
    eligibleForSubmittedFlow: true,
    eligibleForTerminalFlow: true,
    eligibleForSettlement: true,
    issueCodes: [],
  });
});

test("legacy reporting eligibility identifies every missing settled evidence field", () => {
  const result = evaluateTaskCodeReportingEligibility({
    ...completeSettled,
    hasScopeSnapshot: false,
    submittedAt: null,
    settledAt: null,
    redemptionId: null,
    rewardEventId: null,
    hasRewardPayload: false,
    ruleVersion: null,
    hasRewardRuleSnapshot: false,
  });
  assert.deepEqual(result, {
    eligibleForSubmittedFlow: false,
    eligibleForTerminalFlow: false,
    eligibleForSettlement: false,
    issueCodes: [
      "legacy_missing_scope_snapshot",
      "missing_submitted_at",
      "missing_settled_at",
      "missing_redemption_link",
      "missing_reward_event_link",
      "missing_reward_payload",
      "missing_reward_rule_version",
      "missing_reward_rule_snapshot",
    ],
  });
});

test("legacy reporting eligibility uses rejectedAt and expiredAt only for terminal evidence", () => {
  const rejected = evaluateTaskCodeReportingEligibility({ ...completeSettled, status: "rejected", settledAt: null, rejectedAt: null });
  assert.equal(rejected.eligibleForTerminalFlow, false);
  assert.equal(rejected.eligibleForSettlement, null);
  assert.deepEqual(rejected.issueCodes, ["missing_rejected_at"]);

  const expired = evaluateTaskCodeReportingEligibility({ ...completeSettled, status: "expired", settledAt: null, expiredAt: null });
  assert.equal(expired.eligibleForTerminalFlow, false);
  assert.equal(expired.eligibleForSettlement, null);
  assert.deepEqual(expired.issueCodes, ["missing_expired_at"]);

  const expiredWithActualTime = evaluateTaskCodeReportingEligibility({ ...completeSettled, status: "expired", settledAt: null, expiredAt: "2026-07-01T00:02:00.000Z" });
  assert.equal(expiredWithActualTime.eligibleForTerminalFlow, true);
  assert.deepEqual(expiredWithActualTime.issueCodes, []);
});

test("legacy reporting eligibility issue codes are restricted to the fixed shared union", () => {
  const result = evaluateTaskCodeReportingEligibility({ ...completeSettled, hasScopeSnapshot: false, hasRewardRuleSnapshot: false });
  assert.ok(result.issueCodes.every((code) => TASK_CODE_REPORTING_ISSUE_CODES.includes(code)));
  assert.equal(new Set(TASK_CODE_REPORTING_ISSUE_CODES).size, TASK_CODE_REPORTING_ISSUE_CODES.length);
});
