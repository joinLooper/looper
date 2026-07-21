import type { TaskCodeSubmissionDecision } from "@looper/types";

export type MerchantDecisionState = {
  key: string;
  decision: TaskCodeSubmissionDecision;
  loading: boolean;
};

export function getOrCreateDecisionKey(currentKey: string | undefined, submissionId: string, decision: TaskCodeSubmissionDecision, createId: () => string): string {
  return currentKey ?? `task-code-decision:${submissionId}:${decision}:${createId()}`;
}

export function decisionConflictMessage(): string {
  return "已由其他店員處理";
}

export function shouldKeepDecisionKey(statusCode: number): boolean {
  return statusCode === 0 || statusCode >= 500;
}
