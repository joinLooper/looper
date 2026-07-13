import { TASK_CODE_LENGTH, type TaskCodeSubmissionPlayerResult, type TaskCodeSubmissionStatus } from "@looper/types";

export type PlayerTaskCodeAttempt = {
  missionId: string;
  merchantId: string;
  submissionId?: string;
  idempotencyKey: string;
  status: TaskCodeSubmissionStatus | "idle";
};

export type PlayerTaskCodePersistedAttempt = PlayerTaskCodeAttempt & {
  code?: string;
};

export function normalizeTaskCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, TASK_CODE_LENGTH);
}

export function validateTaskCode(value: string): string | undefined {
  if (!value.trim()) return "請輸入店家提供的4碼任務碼。";
  if (!new RegExp(`^\\d{${TASK_CODE_LENGTH}}$`).test(value)) return "任務碼必須是4碼數字。";
  return undefined;
}

export function getOrCreateSubmissionKey(currentKey: string | undefined, createId: () => string): string {
  return currentKey ?? `task-code-ui:${createId()}`;
}

export function shouldPollSubmission(status?: TaskCodeSubmissionStatus | "idle"): boolean {
  return status === "pending";
}

export function shouldPersistAttempt(status?: TaskCodeSubmissionStatus | "idle"): boolean {
  return status === "pending" || status === "settled";
}

export function settledDisplay(result: TaskCodeSubmissionPlayerResult) {
  const base = result.baseReward;
  return {
    stars: base?.stars ?? 0,
    exp: base?.exp ?? 0,
    energy: base?.energy ?? 0,
    carbonGrams: base?.carbonGrams ?? 0,
    chestStars: result.chestStars ?? 0,
    levelBefore: result.levelBefore ?? 1,
    levelAfter: result.levelAfter ?? result.levelBefore ?? 1,
    resources: result.resources,
  };
}
