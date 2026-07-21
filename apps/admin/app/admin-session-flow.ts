import type { PlatformOperatorContext, PlatformOperatorRole } from "@looper/types";

export const authenticatedRequest = { credentials: "include" as const };

export type AdminSessionResult =
  | { status: "authenticated"; context: PlatformOperatorContext }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "error" };

export type InvitationFailure = "expired" | "redeemed" | "revoked" | "origin" | "error";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export function invitationRedeemRequest(token: string): RequestInit {
  return {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  };
}

export function removeInvitationToken(url: URL): string {
  const sanitized = new URL(url.toString());
  sanitized.searchParams.delete("token");
  return `${sanitized.pathname}${sanitized.search}${sanitized.hash}`;
}

export function classifyInvitationFailure(status: number, message: string): InvitationFailure {
  if (status === 403 || /origin/i.test(message)) return "origin";
  if (/逾期|過期|expired/i.test(message)) return "expired";
  if (/撤銷|revoked/i.test(message)) return "revoked";
  if (/已使用|已兌換|被兌換|redeemed|不可用/i.test(message)) return "redeemed";
  return "error";
}

export async function loadAdminSession(fetcher: Fetcher, apiUrl: string): Promise<AdminSessionResult> {
  try {
    const sessionResponse = await fetcher(`${apiUrl}/auth/session`, authenticatedRequest);
    if (sessionResponse.status === 401) return { status: "unauthenticated" };
    if (!sessionResponse.ok) return { status: "error" };
    const session = await sessionResponse.json() as { authenticated?: boolean };
    if (session.authenticated !== true) return { status: "unauthenticated" };

    const contextResponse = await fetcher(`${apiUrl}/admin/context`, authenticatedRequest);
    if (contextResponse.status === 401) return { status: "unauthenticated" };
    if (contextResponse.status === 403) return { status: "forbidden" };
    if (!contextResponse.ok) return { status: "error" };
    return { status: "authenticated", context: await contextResponse.json() as PlatformOperatorContext };
  } catch {
    return { status: "error" };
  }
}

export function hasPlatformPermission(context: PlatformOperatorContext | null, permission: string): boolean {
  return context?.permissions.some((value) => value === permission) ?? false;
}

export function platformRoleLabel(role: PlatformOperatorRole): string {
  if (role === "operations_admin") return "營運管理員";
  if (role === "finance_admin") return "財務管理員";
  return "最高管理員";
}

export function logoutRequest(): RequestInit {
  return { method: "POST", credentials: "include" };
}

export async function requestAdminLogout(fetcher: Fetcher, apiUrl: string): Promise<void> {
  await fetcher(`${apiUrl}/auth/logout`, logoutRequest());
}
