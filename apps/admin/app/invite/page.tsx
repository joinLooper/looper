"use client";

import { Button } from "@looper/ui";
import { useCallback, useEffect, useState } from "react";
import { classifyInvitationFailure, invitationRedeemRequest, removeInvitationToken, type InvitationFailure } from "../admin-session-flow";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type InviteStatus = "missing" | "redeeming" | "success" | InvitationFailure | "network";

const messages: Record<InviteStatus, { title: string; message: string }> = {
  missing: { title: "邀請連結無效", message: "此連結缺少必要的邀請資訊，請向平台管理員索取新連結。" },
  redeeming: { title: "正在驗證邀請", message: "正在安全登入 Looper 平台後台，請稍候。" },
  success: { title: "登入成功", message: "平台身分已確認，正在前往後台。" },
  expired: { title: "邀請已過期", message: "此邀請已超過有效期限，請向平台管理員索取新連結。" },
  redeemed: { title: "邀請已使用", message: "此邀請已使用或目前不可用，請向平台管理員確認。" },
  revoked: { title: "邀請已撤銷", message: "此邀請已由平台撤銷，請向平台管理員索取新連結。" },
  origin: { title: "無法使用此邀請", message: "請從正式的 Looper 平台後台網址開啟邀請連結。" },
  error: { title: "邀請驗證失敗", message: "目前無法完成登入，請稍後再試或向平台管理員確認。" },
  network: { title: "網路連線中斷", message: "尚未完成登入，請確認網路後使用同一邀請連結重試。" },
};

export default function InvitePage() {
  const [status, setStatus] = useState<InviteStatus>("redeeming");
  const [attempt, setAttempt] = useState(0);

  const redeem = useCallback(async () => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token");
    if (!token) {
      setStatus("missing");
      return;
    }
    setStatus("redeeming");
    try {
      const response = await fetch(`${API_URL}/auth/invitations/redeem`, invitationRedeemRequest(token));
      if (response.ok) {
        window.history.replaceState(null, "", removeInvitationToken(url));
        setStatus("success");
        window.location.replace("/");
        return;
      }
      const body = await response.json().catch(() => ({})) as { message?: unknown };
      setStatus(classifyInvitationFailure(response.status, typeof body.message === "string" ? body.message : ""));
    } catch {
      setStatus("network");
    }
  }, [attempt]);

  useEffect(() => { void redeem(); }, [redeem]);
  const content = messages[status];
  return <main className="admin-auth-shell">
    <section className="admin-auth-card invite-card" aria-live="polite">
      <p className="admin-auth-eyebrow">Looper Admin Center</p>
      <h1>{content.title}</h1>
      <p>{content.message}</p>
      {status === "network" ? <Button className="admin-auth-action" type="button" onClick={() => setAttempt((value) => value + 1)}>重試登入</Button> : null}
    </section>
  </main>;
}
