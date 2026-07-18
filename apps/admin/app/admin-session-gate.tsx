"use client";

import type { PlatformOperatorContext } from "@looper/types";
import { Button } from "@looper/ui";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { loadAdminSession, platformRoleLabel, requestAdminLogout, type AdminSessionResult } from "./admin-session-flow";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type GateStatus = AdminSessionResult["status"] | "checking";

function GateMessage({ status, retry }: { status: Exclude<GateStatus, "authenticated">; retry: () => void }) {
  const content = status === "checking"
    ? { title: "正在確認平台身分", message: "正在向平台確認 Session 與後台權限。" }
    : status === "unauthenticated"
      ? { title: "尚未登入", message: "請使用平台邀請連結登入。" }
      : status === "forbidden"
        ? { title: "無法進入平台後台", message: "此帳號沒有有效的平台後台權限。" }
        : { title: "暫時無法確認身分", message: "無法連線到 Looper API，請稍後重試。" };
  return <main className="admin-auth-shell">
    <section className="admin-auth-card" aria-live="polite">
      <p className="admin-auth-eyebrow">Looper Admin Center</p>
      <h1>{content.title}</h1>
      <p>{content.message}</p>
      {status === "error" ? <Button className="admin-auth-action" type="button" onClick={retry}>重新確認</Button> : null}
    </section>
  </main>;
}

export default function AdminSessionGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<GateStatus>("checking");
  const [context, setContext] = useState<PlatformOperatorContext | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const checkSession = useCallback(async () => {
    setContext(null);
    setStatus("checking");
    const result = await loadAdminSession(fetch, API_URL);
    if (result.status === "authenticated") {
      setContext(result.context);
      setStatus("authenticated");
      return;
    }
    setStatus(result.status);
  }, []);

  useEffect(() => {
    if (pathname === "/invite") return;
    void checkSession();
  }, [checkSession, pathname]);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setContext(null);
    try {
      await requestAdminLogout(fetch, API_URL);
    } catch {
      // The local protected view remains cleared even if the network disappears.
    } finally {
      setStatus("unauthenticated");
      setLoggingOut(false);
    }
  }

  if (pathname === "/invite") return children;
  if (status !== "authenticated" || !context) return <GateMessage status={status === "authenticated" ? "error" : status} retry={checkSession} />;

  return <div className="admin-session-frame">
    <div className="admin-identity-bar" aria-label="平台登入身分">
      <div><span>目前登入</span><strong>{context.displayName}</strong><small>{platformRoleLabel(context.role)}</small></div>
      <Button type="button" className="admin-logout-button" onClick={logout} disabled={loggingOut}>{loggingOut ? "登出中..." : "登出"}</Button>
    </div>
    {children}
  </div>;
}
