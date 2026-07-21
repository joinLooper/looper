import type { AdminTaskCodeSubmission, TaskCodeSubmissionStatus } from "@looper/types";

export type TaskCodeSubmissionFilters = {
  status?: TaskCodeSubmissionStatus;
  brandId?: string;
  merchantId?: string;
  missionId?: string;
};

export const TASK_CODE_STATUS_OPTIONS: Array<{ value: TaskCodeSubmissionStatus; label: string }> = [
  { value: "pending", label: "待確認" },
  { value: "confirmed", label: "已確認" },
  { value: "rejected", label: "已拒絕" },
  { value: "expired", label: "已逾時" },
  { value: "settled", label: "已完成" },
];

export function taskCodeStatusLabel(status: TaskCodeSubmissionStatus): string {
  return TASK_CODE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function buildTaskCodeSubmissionQuery(filters: TaskCodeSubmissionFilters, cursor?: string | null): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.brandId) params.set("brandId", filters.brandId);
  if (filters.merchantId) params.set("merchantId", filters.merchantId);
  if (filters.missionId) params.set("missionId", filters.missionId);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

export function appendUniqueTaskCodeSubmissions(current: AdminTaskCodeSubmission[], incoming: AdminTaskCodeSubmission[]): AdminTaskCodeSubmission[] {
  const seen = new Set(current.map((item) => item.submissionId));
  return [...current, ...incoming.filter((item) => {
    if (seen.has(item.submissionId)) return false;
    seen.add(item.submissionId);
    return true;
  })];
}

export function resetTaskCodeSubmissionPage(): { items: AdminTaskCodeSubmission[]; nextCursor: null } {
  return { items: [], nextCursor: null };
}

export function nullDisplay(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export function formatTaskCodeSubmissionTime(value: string | null | undefined): { text: string; iso: string | undefined } {
  if (!value) return { text: "—", iso: undefined };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { text: "—", iso: value };
  const formatted = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
  return { text: `${formatted}（Asia/Taipei）`, iso: value };
}

export function storedSettlementDisplay(item: AdminTaskCodeSubmission): AdminTaskCodeSubmission["settlementSummary"] {
  return item.status === "settled" ? item.settlementSummary : null;
}
