import type {
  TaskCodeReportingEligibility,
  TaskCodeReportingIssueCode,
  TaskCodeSubmissionStatus,
} from "@looper/types";
import { TASK_CODE_REPORTING_ISSUE_CODES } from "@looper/types";

export type TaskCodeReportingEvidence = {
  status: TaskCodeSubmissionStatus;
  hasScopeSnapshot: boolean;
  submittedAt: string | null;
  settledAt: string | null;
  rejectedAt: string | null;
  expiredAt: string | null;
  redemptionId: string | null;
  rewardEventId: string | null;
  hasRewardPayload: boolean;
  ruleVersion: string | null;
  hasRewardRuleSnapshot: boolean;
};

function isPresent(value: string | null): boolean {
  return typeof value === "string" && value.length > 0;
}

export function evaluateTaskCodeReportingEligibility(
  evidence: TaskCodeReportingEvidence,
): TaskCodeReportingEligibility {
  const issues = new Set<TaskCodeReportingIssueCode>();
  if (!evidence.hasScopeSnapshot) issues.add("legacy_missing_scope_snapshot");
  if (!isPresent(evidence.submittedAt)) issues.add("missing_submitted_at");

  const eligibleForSubmittedFlow = evidence.hasScopeSnapshot && isPresent(evidence.submittedAt);
  let eligibleForTerminalFlow: boolean | null = null;
  let eligibleForSettlement: boolean | null = null;

  if (evidence.status === "settled") {
    if (!isPresent(evidence.settledAt)) issues.add("missing_settled_at");
    eligibleForTerminalFlow = evidence.hasScopeSnapshot && isPresent(evidence.settledAt);

    if (!isPresent(evidence.redemptionId)) issues.add("missing_redemption_link");
    if (!isPresent(evidence.rewardEventId)) issues.add("missing_reward_event_link");
    if (!evidence.hasRewardPayload) issues.add("missing_reward_payload");
    if (!isPresent(evidence.ruleVersion)) issues.add("missing_reward_rule_version");
    if (!evidence.hasRewardRuleSnapshot) issues.add("missing_reward_rule_snapshot");
    eligibleForSettlement = eligibleForTerminalFlow
      && isPresent(evidence.redemptionId)
      && isPresent(evidence.rewardEventId)
      && evidence.hasRewardPayload
      && isPresent(evidence.ruleVersion)
      && evidence.hasRewardRuleSnapshot;
  } else if (evidence.status === "rejected") {
    if (!isPresent(evidence.rejectedAt)) issues.add("missing_rejected_at");
    eligibleForTerminalFlow = evidence.hasScopeSnapshot && isPresent(evidence.rejectedAt);
  } else if (evidence.status === "expired") {
    if (!isPresent(evidence.expiredAt)) issues.add("missing_expired_at");
    eligibleForTerminalFlow = evidence.hasScopeSnapshot && isPresent(evidence.expiredAt);
  }

  return {
    eligibleForSubmittedFlow,
    eligibleForTerminalFlow,
    eligibleForSettlement,
    issueCodes: TASK_CODE_REPORTING_ISSUE_CODES.filter((code) => issues.has(code)),
  };
}
