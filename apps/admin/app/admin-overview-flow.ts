import type { PlatformOperatorContext, PlatformPermission } from "@looper/types";
import { hasPlatformPermission } from "./admin-session-flow";

export const ADMIN_OVERVIEW_PERMISSIONS = ["platform.reporting.read", "platform.audit.read"] as const satisfies readonly PlatformPermission[];

export const adminOverviewRequest: RequestInit = {
  credentials: "include",
  cache: "no-store",
};

export function canLoadAdminOverview(context: PlatformOperatorContext | null): boolean {
  return ADMIN_OVERVIEW_PERMISSIONS.every((permission) => hasPlatformPermission(context, permission));
}

export type AdminOverviewError = "unauthenticated" | "forbidden" | "network" | "unknown";

export function classifyAdminOverviewError(status: number | null): AdminOverviewError {
  if (status === null) return "network";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  return "unknown";
}

export function adminOverviewErrorMessage(error: AdminOverviewError): string {
  if (error === "forbidden") return "目前帳號沒有此區塊權限。";
  if (error === "network") return "無法連線到 Looper API。";
  if (error === "unauthenticated") return "登入狀態已失效，正在重新確認平台身分。";
  return "暫時無法讀取平台營運資料。";
}
