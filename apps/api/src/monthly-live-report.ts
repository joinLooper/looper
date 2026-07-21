import type {
  TaskCodeMonthlyLiveReport,
  TaskCodeMonthlyLiveReportScope,
  TaskCodeReportingIssueCode,
  TaskCodeSubmissionStatus,
} from "@looper/types";
import {
  REPORTING_TIMEZONE,
  TASK_CODE_MONTHLY_LIVE_CALCULATION_VERSION,
  TASK_CODE_REPORTING_ISSUE_CODES,
  isTimestampInReportingMonth,
  parseReportingMonth,
} from "@looper/types";
import type { DatabaseSync } from "node:sqlite";
import {
  evaluateTaskCodeReportingEligibility,
  hasStoredJsonEvidence,
  parseStoredTaskCodeRewardPayload,
} from "./reporting-eligibility.js";

type Row = Record<string, unknown>;

export type TaskCodeMonthlyLiveScopeFilter = {
  match: "all" | "any";
  brandIds: string[];
  merchantIds: string[];
};

export type QueryLiveTaskCodeMonthlyReportInput = {
  reportMonth: string;
  cutoffAt: string;
  scope: TaskCodeMonthlyLiveReportScope;
  scopeFilter?: TaskCodeMonthlyLiveScopeFilter;
};

function reportError(message: string, statusCode: number, errorCode: string): Error {
  return Object.assign(new Error(message), { statusCode, errorCode });
}

function timestampOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

function isAtOrBefore(timestamp: string | null, cutoffMilliseconds: number): boolean {
  return timestamp !== null && Date.parse(timestamp) <= cutoffMilliseconds;
}

function isInReportWindow(
  timestamp: string | null,
  startMilliseconds: number,
  endMilliseconds: number,
  cutoffMilliseconds: number,
): boolean {
  if (timestamp === null) return false;
  const value = Date.parse(timestamp);
  return value >= startMilliseconds && value < endMilliseconds && value <= cutoffMilliseconds;
}

function terminalTimestamp(status: TaskCodeSubmissionStatus, row: Row): string | null {
  if (status === "settled") return timestampOrNull(row.settled_at);
  if (status === "rejected") return timestampOrNull(row.rejected_at);
  if (status === "expired") return timestampOrNull(row.expired_at);
  return null;
}

function emptyIssueCounts(): Record<TaskCodeReportingIssueCode, number> {
  return Object.fromEntries(TASK_CODE_REPORTING_ISSUE_CODES.map((code) => [code, 0])) as Record<TaskCodeReportingIssueCode, number>;
}

function scopeWhere(filter: TaskCodeMonthlyLiveScopeFilter | undefined): { sql: string; params: string[] } {
  if (!filter) return { sql: "", params: [] };
  const clauses: string[] = [];
  const params: string[] = [];
  if (filter.brandIds.length) {
    clauses.push(`scope.brand_id IN (${filter.brandIds.map(() => "?").join(", ")})`);
    params.push(...filter.brandIds);
  }
  if (filter.merchantIds.length) {
    clauses.push(`scope.merchant_id IN (${filter.merchantIds.map(() => "?").join(", ")})`);
    params.push(...filter.merchantIds);
  }
  if (!clauses.length) return { sql: "WHERE 1 = 0", params: [] };
  return { sql: `WHERE (${clauses.join(filter.match === "all" ? " AND " : " OR ")})`, params };
}

export function queryLiveTaskCodeMonthlyReport(
  db: DatabaseSync,
  input: QueryLiveTaskCodeMonthlyReportInput,
): TaskCodeMonthlyLiveReport {
  let period;
  try {
    period = parseReportingMonth(input.reportMonth);
  } catch {
    throw reportError("reportMonth 格式必須為 YYYY-MM", 400, "INVALID_REPORT_MONTH");
  }
  if (!Number.isFinite(Date.parse(input.cutoffAt))) {
    throw reportError("報表產生時間無效", 500, "INVALID_REPORT_CUTOFF");
  }
  if (!isTimestampInReportingMonth(input.cutoffAt, period)) {
    throw reportError("僅能查詢目前尚未封存的台灣月份", 409, "REPORT_MONTH_NOT_LIVE");
  }

  const where = scopeWhere(input.scopeFilter);
  const rows = db.prepare(`SELECT
      submission.id AS submission_id,
      submission.status,
      submission.submitted_at,
      submission.rejected_at,
      submission.expired_at,
      submission.settled_at,
      submission.redemption_id,
      submission.reward_event_id,
      scope.submission_id AS scope_submission_id,
      reward.reward_payload_json,
      reward.rule_version,
      reward.rule_snapshot_json
    FROM task_code_submissions submission
    LEFT JOIN task_code_submission_scope_snapshots scope ON scope.submission_id = submission.id
    LEFT JOIN reward_events reward ON reward.id = submission.reward_event_id
    ${where.sql}
    ORDER BY submission.id`).all(...where.params) as Row[];

  const summary: TaskCodeMonthlyLiveReport["summary"] = {
    submittedCount: 0,
    openPendingAtCutoff: 0,
    settledCount: 0,
    rejectedCount: 0,
    expiredCount: 0,
    gross: { baseStars: 0, exp: 0, energy: 0, carbonGrams: 0 },
  };
  const dataQuality: TaskCodeMonthlyLiveReport["dataQuality"] = {
    excludedSubmittedCount: 0,
    excludedTerminalCount: 0,
    excludedSettlementCount: 0,
    issueCounts: emptyIssueCounts(),
  };
  const startMilliseconds = Date.parse(period.startAtInclusive);
  const endMilliseconds = Date.parse(period.endAtExclusive);
  const cutoffMilliseconds = Date.parse(input.cutoffAt);

  for (const row of rows) {
    const status = String(row.status) as TaskCodeSubmissionStatus;
    const submittedAt = timestampOrNull(row.submitted_at);
    const settledAt = timestampOrNull(row.settled_at);
    const rejectedAt = timestampOrNull(row.rejected_at);
    const expiredAt = timestampOrNull(row.expired_at);
    const redemptionId = typeof row.redemption_id === "string" && row.redemption_id ? row.redemption_id : null;
    const rewardEventId = typeof row.reward_event_id === "string" && row.reward_event_id ? row.reward_event_id : null;
    const rewardPayload = parseStoredTaskCodeRewardPayload(row.reward_payload_json);
    const eligibility = evaluateTaskCodeReportingEligibility({
      status,
      hasScopeSnapshot: Boolean(row.scope_submission_id),
      submittedAt,
      settledAt,
      rejectedAt,
      expiredAt,
      redemptionId,
      rewardEventId,
      hasRewardPayload: rewardPayload !== null,
      ruleVersion: typeof row.rule_version === "string" && row.rule_version ? row.rule_version : null,
      hasRewardRuleSnapshot: hasStoredJsonEvidence(row.rule_snapshot_json),
    });

    const submittedInWindow = isInReportWindow(submittedAt, startMilliseconds, endMilliseconds, cutoffMilliseconds);
    const terminalAt = terminalTimestamp(status, row);
    const terminalInWindow = isInReportWindow(terminalAt, startMilliseconds, endMilliseconds, cutoffMilliseconds);
    const relevantForQuality = submittedInWindow || terminalInWindow;

    if (submittedInWindow) {
      if (eligibility.eligibleForSubmittedFlow) summary.submittedCount += 1;
      else dataQuality.excludedSubmittedCount += 1;
    }

    const openAtCutoff = status === "pending" || status === "confirmed"
      ? true
      : terminalAt !== null && Date.parse(terminalAt) > cutoffMilliseconds;
    if (
      eligibility.eligibleForSubmittedFlow
      && isAtOrBefore(submittedAt, cutoffMilliseconds)
      && openAtCutoff
    ) summary.openPendingAtCutoff += 1;

    if (terminalInWindow) {
      if (status === "settled") {
        if (eligibility.eligibleForTerminalFlow === false) dataQuality.excludedTerminalCount += 1;
        if (eligibility.eligibleForSettlement && rewardPayload) {
          summary.settledCount += 1;
          summary.gross.baseStars += rewardPayload.baseStars;
          summary.gross.exp += rewardPayload.exp;
          summary.gross.energy += rewardPayload.energy;
          summary.gross.carbonGrams += rewardPayload.carbonGrams;
        } else {
          dataQuality.excludedSettlementCount += 1;
        }
      } else if (status === "rejected") {
        if (eligibility.eligibleForTerminalFlow) summary.rejectedCount += 1;
        else dataQuality.excludedTerminalCount += 1;
      } else if (status === "expired") {
        if (eligibility.eligibleForTerminalFlow) summary.expiredCount += 1;
        else dataQuality.excludedTerminalCount += 1;
      }
    }

    if (relevantForQuality) {
      for (const code of eligibility.issueCodes) dataQuality.issueCounts[code] += 1;
    }
  }

  return {
    ...period,
    generatedAt: input.cutoffAt,
    cutoffAt: input.cutoffAt,
    mode: "live",
    status: "open",
    calculationVersion: TASK_CODE_MONTHLY_LIVE_CALCULATION_VERSION,
    scope: input.scope,
    summary,
    dataQuality,
  };
}
