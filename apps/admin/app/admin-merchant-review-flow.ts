import type { MerchantApplicationReviewDecision, MerchantApplicationReviewInput, PlatformOperatorContext } from "@looper/types";
import { hasPlatformPermission } from "./admin-session-flow";

export function canReadMerchantApplications(context: PlatformOperatorContext | null): boolean {
  return hasPlatformPermission(context, "platform.merchant_application.read");
}

export function canReviewMerchantApplications(context: PlatformOperatorContext | null): boolean {
  return hasPlatformPermission(context, "platform.merchant_application.review");
}

export function merchantApplicationReviewRequest(
  decision: MerchantApplicationReviewDecision,
  note?: string,
): RequestInit {
  const body: MerchantApplicationReviewInput = note === undefined ? { decision } : { decision, note };
  return {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export type MerchantReviewError = "unauthenticated" | "forbidden" | "stale" | "invalid" | "network" | "unknown";

export function classifyMerchantReviewError(status: number | null): MerchantReviewError {
  if (status === null) return "network";
  if (status === 400) return "invalid";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404 || status === 409) return "stale";
  return "unknown";
}

export function merchantReviewErrorMessage(error: MerchantReviewError): string {
  if (error === "unauthenticated") return "登入狀態已失效，正在重新確認平台身分。";
  if (error === "forbidden") return "目前帳號沒有店家申請審核權限。";
  if (error === "stale") return "申請狀態已更新，請依最新資料重新確認。";
  if (error === "invalid") return "審核內容格式不正確。";
  if (error === "network") return "審核操作未確認完成，請先重新整理正式狀態。";
  return "暫時無法完成店家申請審核。";
}
