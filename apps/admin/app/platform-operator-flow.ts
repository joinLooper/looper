import type {
  AccountStatus,
  PlatformOperatorCreateInput,
  PlatformOperatorListItem,
  PlatformOperatorRole,
  PlatformOperatorRoleUpdateInput,
  PlatformOperatorStatus,
  PlatformOperatorStatusUpdateInput,
} from "@looper/types";

export const platformOperatorRequest = { credentials: "include" as const };

export type PlatformOperatorApiError = "validation" | "unauthenticated" | "forbidden" | "not_found" | "conflict" | "unknown" | "network";

export type OneTimeInvitation = {
  token: string;
  expiresAt: string;
  displayName: string;
};

export function accountStatusLabel(status: AccountStatus): string {
  if (status === "active") return "啟用中";
  if (status === "suspended") return "帳號已停權";
  return "帳號已關閉";
}

export function membershipStatusLabel(status: PlatformOperatorStatus): string {
  if (status === "active") return "啟用中";
  if (status === "suspended") return "已停權";
  return "已離職";
}

export function invitationStatusLabel(item: PlatformOperatorListItem): string {
  return item.pendingInvitationId ? "待接受邀請" : "邀請已失效或目前沒有待接受邀請";
}

export function classifyPlatformOperatorError(status: number | null): PlatformOperatorApiError {
  if (status === null) return "network";
  if (status === 400) return "validation";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  return "unknown";
}

export function platformOperatorErrorMessage(error: PlatformOperatorApiError): string {
  if (error === "validation") return "欄位內容不合法，請檢查後再送出。";
  if (error === "unauthenticated") return "登入狀態已失效，請重新使用平台邀請連結登入。";
  if (error === "forbidden") return "你沒有管理平台人員的權限。";
  if (error === "not_found") return "目標資料已不存在，列表將重新載入。";
  if (error === "conflict") return "目前狀態已變更或操作發生衝突，請依最新列表重試。";
  if (error === "network") return "網路連線中斷，可使用同一操作內容安全重試。";
  return "操作暫時無法完成，請稍後再試。";
}

function jsonRequest(body: object): RequestInit {
  return {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function createPlatformOperatorRequest(input: PlatformOperatorCreateInput): RequestInit {
  return jsonRequest({ displayName: input.displayName, role: input.role, idempotencyKey: input.idempotencyKey });
}

export function resendPlatformInvitationRequest(idempotencyKey: string): RequestInit {
  return jsonRequest({ idempotencyKey });
}

export function updatePlatformOperatorStatusRequest(input: PlatformOperatorStatusUpdateInput): RequestInit {
  return jsonRequest({ status: input.status, reason: input.reason, idempotencyKey: input.idempotencyKey });
}

export function updatePlatformOperatorRoleRequest(input: PlatformOperatorRoleUpdateInput): RequestInit {
  return jsonRequest({ role: input.role, reason: input.reason, idempotencyKey: input.idempotencyKey });
}

export function nextIdempotencyKey(randomUuid: () => string): string {
  return randomUuid();
}

export function isValidReason(reason: string): boolean {
  const length = Array.from(reason.trim()).length;
  return length >= 1 && length <= 500;
}

export function invitationUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/invite?token=${encodeURIComponent(token)}`;
}

export function oneTimeInvitationFromResponse(
  value: { invitationToken?: string; tokenRevealed: boolean; invitation?: { expiresAt: string } | null },
  displayName: string,
): OneTimeInvitation | null {
  if (!value.tokenRevealed || typeof value.invitationToken !== "string" || !value.invitation) return null;
  return { token: value.invitationToken, expiresAt: value.invitation.expiresAt, displayName };
}

export function canSuspendPlatformOperator(item: PlatformOperatorListItem): boolean {
  return item.accountStatus === "active" && item.membershipStatus === "active";
}

export function canReactivatePlatformOperator(item: PlatformOperatorListItem): boolean {
  return item.accountStatus === "active" && item.membershipStatus === "suspended";
}

export function canChangePlatformOperatorRole(item: PlatformOperatorListItem): boolean {
  return item.accountStatus === "active" && item.membershipStatus === "active";
}

export function canResendPlatformInvitation(item: PlatformOperatorListItem): boolean {
  return item.accountStatus === "active" && item.membershipStatus === "active";
}

export function isDifferentRole(current: PlatformOperatorRole, next: PlatformOperatorRole): boolean {
  return current !== next;
}
