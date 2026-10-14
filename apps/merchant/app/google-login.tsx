"use client";
import { useEffect, useRef, useState } from "react";
import {
  invitationRedeemRequest,
  removeInvitationToken,
} from "./merchant-session-flow";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type GoogleApi = {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        nonce: string;
        auto_select: boolean;
        callback: (response: { credential: string }) => void;
      }): void;
      renderButton(
        element: HTMLElement,
        options: Record<string, string | number>,
      ): void;
    };
  };
};
declare global {
  interface Window {
    google?: GoogleApi;
  }
}
const messages: Record<string, string> = {
  INVITATION_EXPIRED: "邀請已過期，請聯絡 Looper 重新取得邀請。",
  INVITATION_UNAVAILABLE: "邀請無效、已使用或已撤銷，請聯絡 Looper。",
  GOOGLE_ACCOUNT_CONFLICT:
    "這個 Google 帳號與邀請帳號不符，請聯絡 Looper 確認。",
  MERCHANT_INVITATION_REQUIRED:
    "尚未取得店家權限，請先使用 Looper 的有效邀請連結。",
  MERCHANT_PERMISSION_REQUIRED: "尚未取得店家管理權限，請聯絡 Looper。",
  GOOGLE_PROVIDER_UNAVAILABLE: "Google 暫時無法連線，請稍後重試。",
  GOOGLE_COMMIT_OUTCOME_UNKNOWN:
    "登入結果尚待確認，請聯絡 Looper；請勿重複送出。",
};
async function checked(response: Response) {
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      messages[body.code ?? body.message] ??
        (response.status === 403
          ? "登入驗證或權限已失效，請重試或聯絡 Looper。"
          : "無法完成登入，請重新驗證或聯絡 Looper。"),
    );
  return body;
}
let scriptPromise: Promise<void> | undefined;
function loadGoogle() {
  if (window.google) return Promise.resolve();
  if (!scriptPromise)
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client?hl=zh-TW";
      script.async = true;
      script.referrerPolicy = "no-referrer";
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        scriptPromise = undefined;
        reject(new Error("Google 暫時無法載入，請檢查網路後重試。"));
      };
      document.head.appendChild(script);
    });
  return scriptPromise;
}
export default function GoogleLogin({
  invitation = false,
}: {
  invitation?: boolean;
}) {
  const [message, setMessage] = useState("正在確認登入方式…");
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const [success, setSuccess] = useState(false);
  const target = useRef<HTMLDivElement>(null);
  const invitationToken = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    if (invitationToken.current === undefined) {
      const url = new URL(window.location.href);
      invitationToken.current = invitation
        ? url.searchParams.get("token")
        : null;
      window.history.replaceState(null, "", removeInvitationToken(url));
    }
    const request = (path: string, body: unknown) =>
      fetch(`${API}${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      }).then(checked);
    const fail = (error: unknown) => {
      if (cancelled) return;
      setMessage(
        error instanceof TypeError
          ? "網路連線失敗，請檢查網路後重試。"
          : error instanceof Error
            ? error.message
            : "登入失敗，請重試。",
      );
      setFailed(true);
      target.current?.replaceChildren();
    };
    async function start() {
      setFailed(false);
      setMessage("正在確認登入方式…");
      const config = await fetch(`${API}/auth/merchant/google/config`, {
        signal: controller.signal,
      }).then(checked);
      if (cancelled) return;
      if (!config.enabled) {
        if (!invitationToken.current) {
          setMessage("請使用 Looper 邀請連結登入。");
          return;
        }
        await fetch(`${API}/auth/invitations/redeem`, {
          ...invitationRedeemRequest(invitationToken.current),
          signal: controller.signal,
        }).then(checked);
        if (!cancelled) {
          setSuccess(true);
          setMessage("登入成功，正在前往店家首頁…");
          window.location.assign("/");
        }
        return;
      }
      if (invitation && !invitationToken.current)
        throw new Error("邀請連結無效，請使用完整邀請連結。");
      const challenge = await request(
        "/auth/merchant/google/challenge",
        invitationToken.current
          ? { invitationToken: invitationToken.current }
          : {},
      );
      await loadGoogle();
      if (cancelled || !target.current || !window.google) return;
      setMessage(
        invitation
          ? "邀請已驗證。請使用要綁定的 Google 帳號繼續。"
          : "請使用已綁定的 Google 帳號登入。",
      );
      window.google.accounts.id.initialize({
        client_id: config.clientId,
        nonce: challenge.nonce,
        auto_select: false,
        callback: ({ credential }) => {
          if (cancelled) return;
          setMessage("正在確認身分與店家權限…");
          target.current?.replaceChildren();
          void request("/auth/merchant/google/session", {
            credential,
            state: challenge.state,
          })
            .then(() => {
              if (!cancelled) {
                setSuccess(true);
                setMessage("登入成功，歡迎回到 Looper 店家後台。");
              }
            })
            .catch(fail);
        },
      });
      target.current.replaceChildren();
      window.google.accounts.id.renderButton(target.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "signin_with",
        locale: "zh_TW",
        width: Math.min(320, target.current.clientWidth),
      });
    }
    void start().catch(fail);
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [invitation, retry]);
  return (
    <main className="merchant-google-shell">
      <section className="merchant-google-card" aria-labelledby="login-title">
        <p className="merchant-brand">Looper 店家服務</p>
        <h1 id="login-title">歡迎回來</h1>
        <p>一個帳號，安心管理您的店家。</p>
        <div
          className="merchant-google-status"
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
        <div ref={target} className="merchant-google-button" />
        {failed && !message.includes("請勿重複送出") ? (
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            重新驗證
          </button>
        ) : null}
        {success ? (
          <a className="merchant-google-continue" href="/">
            進入店家後台
          </a>
        ) : null}
        <p className="merchant-google-note">
          首次登入需持有有效邀請。Google 僅驗證身分，店家權限由 Looper 管理。
        </p>
      </section>
    </main>
  );
}
