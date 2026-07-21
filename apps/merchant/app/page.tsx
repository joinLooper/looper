"use client";

import type { CurrentTaskCodeWindow, MerchantTaskCodeSubmission, TaskCodeSubmissionDecision } from "@looper/types";
import { Button } from "@looper/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { decisionConflictMessage, getOrCreateDecisionKey, shouldKeepDecisionKey } from "./task-code-flow";
import { authenticatedFetchOptions, MERCHANT_PREFERENCE_KEY, selectAuthorizedMerchant, type MerchantBranchContext } from "./merchant-session-flow";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const DECISION_KEYS_STORAGE_KEY = "looper.merchant.taskCodeDecisionKeys";

export default function Page() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [branches, setBranches] = useState<MerchantBranchContext[]>([]);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [currentCode, setCurrentCode] = useState<CurrentTaskCodeWindow | null>(null);
  const [pending, setPending] = useState<MerchantTaskCodeSubmission[]>([]);
  const [message, setMessage] = useState("正在確認登入狀態...");

  const refresh = useCallback(async (selected: string) => {
    const [code, submissions] = await Promise.all([
      fetch(`${API_URL}/merchant/task-code/current?merchantId=${selected}`, authenticatedFetchOptions),
      fetch(`${API_URL}/merchant/task-code-submissions?merchantId=${selected}&status=pending`, authenticatedFetchOptions),
    ]);
    if (!code.ok || !submissions.ok) throw new Error("讀取任務碼失敗");
    setCurrentCode(await code.json());
    setPending(await submissions.json());
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/auth/session`, authenticatedFetchOptions)
      .then((response) => response.json())
      .then(async (session) => {
        if (!session.authenticated) {
          setAuthenticated(false);
          setMessage("請使用 Looper 邀請連結登入");
          return;
        }
        const response = await fetch(`${API_URL}/merchant/context`, authenticatedFetchOptions);
        if (!response.ok) throw new Error("無法取得店家權限");
        const context = await response.json() as { branches: MerchantBranchContext[] };
        const preferred = window.localStorage.getItem(MERCHANT_PREFERENCE_KEY);
        const selected = selectAuthorizedMerchant(context.branches, preferred);
        if (preferred && !context.branches.some((branch) => branch.merchantId === preferred)) window.localStorage.removeItem(MERCHANT_PREFERENCE_KEY);
        setBranches(context.branches);
        setMerchantId(selected);
        setAuthenticated(true);
        if (selected) await refresh(selected);
        setMessage(selected ? "店家資料已載入。" : "請選擇分店。");
      })
      .catch(() => setMessage("無法連線到 Looper API。"));
  }, [refresh]);

  async function chooseMerchant(value: string) {
    setMerchantId(value);
    window.localStorage.setItem(MERCHANT_PREFERENCE_KEY, value);
    await refresh(value);
  }

  async function decide(submission: MerchantTaskCodeSubmission, decision: TaskCodeSubmissionDecision) {
    if (!merchantId) return;
    const storage = JSON.parse(window.localStorage.getItem(DECISION_KEYS_STORAGE_KEY) ?? "{}") as Record<string, string>;
    const keyName = `${submission.id}:${decision}`;
    const idempotencyKey = getOrCreateDecisionKey(storage[keyName], submission.id, decision, () => crypto.randomUUID());
    storage[keyName] = idempotencyKey;
    window.localStorage.setItem(DECISION_KEYS_STORAGE_KEY, JSON.stringify(storage));
    try {
      const response = await fetch(`${API_URL}/merchant/task-code-submissions/${submission.id}/decision`, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ merchantId, decision, idempotencyKey }),
      });
      if (!response.ok) {
        setMessage(response.status === 409 ? decisionConflictMessage() : "操作失敗");
        if (!shouldKeepDecisionKey(response.status)) delete storage[keyName];
      } else delete storage[keyName];
      window.localStorage.setItem(DECISION_KEYS_STORAGE_KEY, JSON.stringify(storage));
      await refresh(merchantId);
    } catch {
      setMessage("網路中斷，請重試；系統會沿用同一個操作 key。");
    }
  }

  async function logout() {
    await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => undefined);
    window.localStorage.removeItem(MERCHANT_PREFERENCE_KEY);
    setAuthenticated(false);
    setMerchantId(null);
    setMessage("請使用 Looper 邀請連結登入");
  }

  if (authenticated !== true) return <main className="merchant-shell status-layout"><section className="status-card"><h1>Looper 店家後台</h1><p className="message-box">{message}</p></section></main>;
  return <main className="merchant-shell status-layout">
    <header className="merchant-header"><div><h1>Looper 店家後台</h1><p>{message}</p></div><Button type="button" onClick={logout}>登出</Button></header>
    <section className="status-card merchant-history-entry"><div><h2>核銷紀錄</h2><p>查詢已完成、已拒絕與已逾時的任務碼紀錄</p></div><Link className="primary-action link-action" href="/task-code-history">前往核銷紀錄</Link></section>
    <section className="status-card">
      {branches.length > 1 ? <label>分店<select value={merchantId ?? ""} onChange={(event) => chooseMerchant(event.target.value)}><option value="">請選擇</option>{branches.map((branch) => <option key={branch.merchantId} value={branch.merchantId}>{branch.brandDisplayName}－{branch.storeName}</option>)}</select></label> : null}
      <h2>目前4碼任務碼</h2><strong>{currentCode?.code ?? "----"}</strong>
      <Button type="button" onClick={() => merchantId && refresh(merchantId)}>更新</Button>
    </section>
    <section className="status-card"><h2>待確認核銷</h2>{pending.map((submission) => <article key={submission.id}><strong>{submission.user.displayName}</strong><Button type="button" onClick={() => decide(submission, "confirm")}>確認核銷</Button><Button type="button" onClick={() => decide(submission, "reject")}>拒絕</Button></article>)}</section>
  </main>;
}
