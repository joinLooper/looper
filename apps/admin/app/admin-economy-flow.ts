import type { EconomySettings, MerchantPlan, PlatformOperatorContext, PlatformPermission } from "@looper/types";
import { hasPlatformPermission } from "./admin-session-flow";

export const ADMIN_ECONOMY_READ_PERMISSIONS = [
  "platform.merchant_plan.read",
  "platform.economy.read",
] as const satisfies readonly PlatformPermission[];

export const adminEconomyRequest: RequestInit = {
  credentials: "include",
  cache: "no-store",
};

export function canReadAdminEconomy(context: PlatformOperatorContext | null): boolean {
  return ADMIN_ECONOMY_READ_PERMISSIONS.every((permission) => hasPlatformPermission(context, permission));
}

export function canManageMerchantPlans(context: PlatformOperatorContext | null): boolean {
  return hasPlatformPermission(context, "platform.merchant_plan.manage");
}

export function canManageEconomySettings(context: PlatformOperatorContext | null): boolean {
  return hasPlatformPermission(context, "platform.economy.manage");
}

export function merchantPlanUpdateRequest(merchantPlan: MerchantPlan): RequestInit {
  return {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ merchantPlan }),
  };
}

export function economySettingsUpdateRequest(settings: EconomySettings, expectedVersion: number): RequestInit {
  return {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...settings, expectedVersion }),
  };
}

export type AdminEconomyError = "unauthenticated" | "forbidden" | "not_found" | "conflict" | "network" | "unknown";

export function classifyAdminEconomyError(status: number | null): AdminEconomyError {
  if (status === null) return "network";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  return "unknown";
}
