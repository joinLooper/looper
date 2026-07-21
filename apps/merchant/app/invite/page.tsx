"use client";

import { useEffect, useState } from "react";
import { invitationRedeemRequest, removeInvitationToken } from "../merchant-session-flow";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function InvitePage() {
  const [message, setMessage] = useState("正在兌換邀請...");
  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token");
    if (!token) {
      setMessage("邀請連結無效。");
      return;
    }
    fetch(`${API_URL}/auth/invitations/redeem`, invitationRedeemRequest(token))
      .then(async (response) => {
        if (response.ok) {
          window.history.replaceState(null, "", removeInvitationToken(url));
          setMessage("登入成功，正在前往店家首頁...");
          window.location.assign("/");
          return;
        }
        if (response.status === 409) {
          const text = await response.text();
          setMessage(text.includes("逾期") ? "邀請已過期。" : text.includes("撤銷") ? "邀請已撤銷。" : "邀請已使用。");
          return;
        }
        setMessage("邀請兌換失敗。");
      })
      .catch(() => setMessage("網路錯誤，請使用同一邀請連結重試。"));
  }, []);
  return <main className="merchant-shell status-layout"><section className="status-card"><h1>Looper 店家登入</h1><p className="message-box">{message}</p></section></main>;
}
