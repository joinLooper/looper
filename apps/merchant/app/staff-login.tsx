"use client";
import { useEffect, useRef, useState } from "react";
import { clearProtectedMerchantStorage } from "./merchant-session-flow";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const messages: Record<string, string> = {
  LINE_STAFF_DISABLED: "店員 LINE 登入尚未開放，請聯絡 Looper。",
  STAFF_INVITATION_EXPIRED: "邀請已過期，請聯絡管理者重新取得分店邀請。",
  STAFF_INVITATION_UNAVAILABLE: "邀請已使用、撤銷或無效，請聯絡管理者確認。",
  STAFF_INVITATION_REQUIRED:
    "尚未取得店員邀請，請先開啟管理者提供的分店邀請連結。",
  STAFF_MEMBERSHIP_UNAVAILABLE:
    "分店人員資格已失效、停權或撤銷，請聯絡管理者。",
  STAFF_SESSION_INVALID: "登入已失效，請重新驗證或聯絡管理者。",
  STAFF_PROVENANCE_INVALID: "店員授權已撤銷，請聯絡管理者。",
  STAFF_SCOPE_INVALID: "此登入只能操作已授權的分店。",
  STAFF_BRANCH_REQUIRED: "你有多間分店資格，請填寫要登入的分店識別碼。",
  ACCOUNT_LINK_CONFLICT:
    "這個 LINE 帳號與邀請帳號不符。為保障資料安全，請聯絡 Looper 處理，系統不會合併帳號。",
  LINE_STATE_INVALID: "登入驗證不符，請由店員登入入口重新開始。",
  LINE_CHALLENGE_EXPIRED_OR_REPLAYED: "登入驗證已過期或已使用，請重新開始。",
  LINE_INVALID_CREDENTIAL: "LINE 身分驗證未通過，請重新登入。",
  LINE_PROVIDER_UNAVAILABLE: "LINE 暫時無法連線，請稍後重新開始。",
  STAFF_COMMIT_OUTCOME_UNKNOWN:
    "登入結果尚待確認，請聯絡 Looper；請勿重複送出。",
};
type Branch = {
  merchantId: string;
  storeName: string;
  branchCode?: string;
  brandDisplayName?: string;
};
async function request(path: string, body?: unknown) {
  const response = await fetch(`${API}${path}`, {
    credentials: "include",
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(
        messages[data.code ?? data.message] ??
          "沒有可用的分店權限，請聯絡管理者。",
      ),
      { code: data.code ?? data.message, operationId: data.operationId },
    );
  return data;
}
export default function StaffLogin() {
  const [message, setMessage] = useState("正在確認店員登入…");
  const [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState(false),
    [unknown, setUnknown] = useState(false);
  const [branch, setBranch] = useState<Branch | null>(null),
    [merchantId, setMerchantId] = useState(""),
    [operationId, setOperationId] = useState("");
  const invite = useRef<string | null>(null);
  const startup = useRef<Promise<{
    enabled: boolean;
    branch?: Branch;
    success?: boolean;
  }> | null>(null);
  const callbackAttempt = useRef(false);
  const fail = (error: unknown) => {
    const e = error as {
      message?: string;
      code?: string;
      operationId?: string;
    };
    const unresolved =
      e.code === "STAFF_COMMIT_OUTCOME_UNKNOWN" ||
      (callbackAttempt.current && error instanceof TypeError);
    setUnknown(unresolved);
    setOperationId(e.operationId ?? "");
    setMessage(
      unresolved
        ? messages.STAFF_COMMIT_OUTCOME_UNKNOWN
        : error instanceof TypeError
          ? "網路連線失敗，請稍後重試。"
          : (e.message ?? "登入失敗，請聯絡管理者。"),
    );
  };
  useEffect(() => {
    let cancelled = false;
    if (!startup.current) {
      const url = new URL(window.location.href),
        fragment = new URLSearchParams(url.hash.slice(1));
      invite.current = fragment.get("invite") ?? url.searchParams.get("token");
      const code = url.searchParams.get("code"),
        state = url.searchParams.get("state"),
        denied = url.searchParams.get("error");
      for (const key of [
        "code",
        "state",
        "token",
        "error",
        "error_description",
      ])
        url.searchParams.delete(key);
      url.hash = "";
      window.history.replaceState(null, "", url.pathname + url.search);
      startup.current = (async () => {
        const config = await request("/auth/merchant/line/config");
        if (!config.enabled) return { enabled: false };
        if (denied) throw new Error("已取消 LINE 登入，可重新開始。");
        if (code || state) {
          if (!code || !state)
            throw new Error("登入回傳資料不完整，請重新開始。");
          callbackAttempt.current = true;
          await request("/auth/merchant/line/session", { code, state });
          const context = await request("/merchant/context");
          if (
            context.branches.length !== 1 ||
            context.branches[0].role !== "branch_staff"
          )
            throw new Error("分店登入範圍不符，請聯絡 Looper。");
          const selected = context.branches[0];
          window.localStorage.setItem(
            "looper.staff.branch",
            selected.merchantId,
          );
          return { enabled: true, branch: selected, success: true };
        }
        if (invite.current)
          return {
            enabled: true,
            branch: await request("/auth/merchant/line/invitation", {
              invitationToken: invite.current,
            }),
          };
        return { enabled: true };
      })();
    }
    startup.current
      .then((result) => {
        if (cancelled) return;
        setEnabled(result.enabled);
        setSuccess(Boolean(result.success));
        setBranch(result.branch ?? null);
        setMerchantId(
          result.branch?.merchantId ??
            window.localStorage.getItem("looper.staff.branch") ??
            "",
        );
        setMessage(
          !result.enabled
            ? messages.LINE_STAFF_DISABLED
            : result.success
              ? "登入成功，僅能操作以下授權分店。"
              : result.branch
                ? "邀請有效，請使用自己的 LINE 帳號驗證。"
                : "使用 LINE 登入已授權的分店。首次登入請先開啟邀請連結。",
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setEnabled(true);
          fail(error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function login() {
    if (busy || unknown) return;
    setBusy(true);
    setMessage("正在前往 LINE 驗證…");
    try {
      const result = await request("/auth/merchant/line/challenge", {
        ...(invite.current ? { invitationToken: invite.current } : {}),
        ...(merchantId ? { merchantId } : {}),
      });
      const url = new URL(result.authorizationUrl);
      if (
        url.origin !== "https://access.line.me" ||
        url.pathname !== "/oauth2/v2.1/authorize"
      )
        throw new Error("登入位址無效，請聯絡 Looper。");
      window.location.assign(url.href);
    } catch (error) {
      fail(error);
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await request("/auth/logout", {});
      clearProtectedMerchantStorage(window.localStorage);
      setSuccess(false);
      setBranch(null);
      setMessage("已安全登出。");
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="staff-login-shell">
      <section className="staff-login-card" aria-labelledby="staff-heading">
        <p className="staff-eyebrow">Looper 店家後台</p>
        <h1 id="staff-heading">分店店員登入</h1>
        <p>用 LINE 驗證身分，安心開始今天的服務。</p>
        {branch ? (
          <div className="staff-branch">
            <span>授權分店</span>
            <h2>{branch.storeName}</h2>
            {branch.brandDisplayName ? <p>{branch.brandDisplayName}</p> : null}
          </div>
        ) : null}
        <p className="staff-message" role="status" aria-live="polite">
          {message}
        </p>
        {operationId ? (
          <p className="staff-reference">查詢編號：{operationId}</p>
        ) : null}
        {success ? (
          <div className="staff-actions">
            <a className="staff-primary" href="/">
              前往分店工作台
            </a>
            <button type="button" disabled={busy} onClick={logout}>
              安全登出
            </button>
          </div>
        ) : enabled && !unknown ? (
          <div className="staff-actions">
            {!invite.current ? (
              <label>
                分店識別碼（只有多分店時需填寫）
                <input
                  value={merchantId}
                  onChange={(event) => setMerchantId(event.target.value)}
                  autoComplete="off"
                  maxLength={160}
                />
              </label>
            ) : null}
            <button
              className="staff-primary"
              type="button"
              disabled={busy}
              onClick={login}
            >
              使用 LINE 登入
            </button>
          </div>
        ) : null}
        <p className="staff-note">
          僅限有效分店人員。登入不會建立玩家資源，也不會合併其他帳號。
        </p>
        <a className="staff-back" href="/login">
          店家管理者登入
        </a>
      </section>
    </main>
  );
}
