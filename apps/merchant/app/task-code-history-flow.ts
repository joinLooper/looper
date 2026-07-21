import type {
  MerchantTaskCodeHistoryItem,
  MerchantTaskCodeHistoryStatus,
} from "@looper/types";
import type { MerchantBranchContext } from "./merchant-session-flow";

export type HistoryBranchContext = MerchantBranchContext & { timezone?: string };

export type TaskCodeHistoryFilters = {
  merchantId?: string;
  status?: MerchantTaskCodeHistoryStatus;
};

export const TASK_CODE_HISTORY_STATUS_OPTIONS: Array<{ value: MerchantTaskCodeHistoryStatus; label: string }> = [
  { value: "settled", label: "已完成" },
  { value: "rejected", label: "已拒絕" },
  { value: "expired", label: "已逾時" },
];

export function taskCodeHistoryStatusLabel(status: MerchantTaskCodeHistoryStatus): string {
  return TASK_CODE_HISTORY_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function authorizedHistoryMerchant(
  branches: HistoryBranchContext[],
  preferredMerchantId: string | null,
): string | null {
  if (branches.length === 1) return branches[0].merchantId;
  return preferredMerchantId && branches.some((branch) => branch.merchantId === preferredMerchantId)
    ? preferredMerchantId
    : null;
}

export function buildTaskCodeHistoryQuery(filters: TaskCodeHistoryFilters, cursor?: string | null): string {
  const params = new URLSearchParams();
  if (filters.merchantId) params.set("merchantId", filters.merchantId);
  if (filters.status) params.set("status", filters.status);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

export function appendUniqueTaskCodeHistory(
  current: MerchantTaskCodeHistoryItem[],
  incoming: MerchantTaskCodeHistoryItem[],
): MerchantTaskCodeHistoryItem[] {
  const seen = new Set(current.map((item) => item.submissionId));
  return [...current, ...incoming.filter((item) => {
    if (seen.has(item.submissionId)) return false;
    seen.add(item.submissionId);
    return true;
  })];
}

export function resetTaskCodeHistoryPage(): { items: MerchantTaskCodeHistoryItem[]; nextCursor: null } {
  return { items: [], nextCursor: null };
}

export function nullDisplay(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export function merchantTimezone(branches: HistoryBranchContext[], merchantId: string): string | null {
  return branches.find((branch) => branch.merchantId === merchantId)?.timezone ?? null;
}

export function formatMerchantHistoryTime(
  value: string | null | undefined,
  timezone: string | null,
): { text: string; iso: string | undefined; timezoneLabel: string } {
  if (!value) return { text: "—", iso: undefined, timezoneLabel: timezone ?? "時區未提供" };
  if (!timezone) return { text: `${value}（時區未提供）`, iso: value, timezoneLabel: "時區未提供" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { text: value, iso: value, timezoneLabel: timezone };
  try {
    const formatted = new Intl.DateTimeFormat("zh-TW", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
    return { text: `${formatted}（${timezone}）`, iso: value, timezoneLabel: timezone };
  } catch {
    return { text: `${value}（時區未提供）`, iso: value, timezoneLabel: "時區未提供" };
  }
}

export function storedMerchantSettlement(item: MerchantTaskCodeHistoryItem): MerchantTaskCodeHistoryItem["settlementSummary"] {
  return item.status === "settled" ? item.settlementSummary : null;
}

export function unsettledHistoryReason(status: MerchantTaskCodeHistoryStatus): string | null {
  if (status === "rejected") return "店家已拒絕，本筆未結算";
  if (status === "expired") return "確認期限已過，本筆未結算";
  return null;
}
