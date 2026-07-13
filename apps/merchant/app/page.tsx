"use client";

import type { CurrentTaskCodeWindow, MerchantApplication, MerchantProfile, MerchantTaskCodeSubmission, Redemption, TaskCodeSubmissionDecision } from "@looper/types";
import { WEEKDAYS } from "@looper/types";
import { Button } from "@looper/ui";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { decisionConflictMessage, getOrCreateDecisionKey, shouldKeepDecisionKey } from "./task-code-flow";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const merchantHeaders = { "x-looper-role": "merchant" };
const APPLICATION_STORAGE_KEY = "looper.merchant.applicationId";
const DECISION_KEYS_STORAGE_KEY = "looper.merchant.taskCodeDecisionKeys";
const ACTOR_ID = "merchant-demo-staff";

type DecisionKeys = Record<string, string>;
type DecisionResult = MerchantTaskCodeSubmission & {
  settlement?: {
    redemptionId?: string;
    rewardEventId?: string;
    settledAt?: string;
  };
};

function statusLabel(status: MerchantApplication["status"]) {
  if (status === "approved") return "已通過";
  if (status === "needs_revision") return "需補件";
  if (status === "rejected") return "未通過";
  return "等待平台審核";
}

function statusClass(status: MerchantApplication["status"]) {
  if (status === "approved") return "approved";
  if (status === "needs_revision") return "revision";
  if (status === "rejected") return "rejected";
  return "";
}

function formatHours(application: MerchantApplication) {
  return application.businessHours.map((day) => {
    const label = WEEKDAYS.find((item) => item.key === day.day)?.label ?? day.day;
    return `${label}: ${day.closed ? "公休" : day.periods.map((period) => `${period.start}-${period.end}`).join("、")}`;
  });
}

function kg(grams: number) {
  return (grams / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 1 });
}

function remainingText(expiresAt?: string, now = Date.now()) {
  if (!expiresAt) return "";
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function loadDecisionKeys(): DecisionKeys {
  try {
    const raw = window.localStorage.getItem(DECISION_KEYS_STORAGE_KEY);
    return raw ? JSON.parse(raw) as DecisionKeys : {};
  } catch {
    return {};
  }
}

function saveDecisionKeys(keys: DecisionKeys) {
  window.localStorage.setItem(DECISION_KEYS_STORAGE_KEY, JSON.stringify(keys));
}

export default function Page() {
  const [application, setApplication] = useState<MerchantApplication | null>(null);
  const [merchant, setMerchant] = useState<MerchantProfile | null>(null);
  const [records, setRecords] = useState<Redemption[]>([]);
  const [currentCode, setCurrentCode] = useState<CurrentTaskCodeWindow | null>(null);
  const [pendingSubmissions, setPendingSubmissions] = useState<MerchantTaskCodeSubmission[]>([]);
  const [lastDecision, setLastDecision] = useState<DecisionResult | null>(null);
  const [decisionKeys, setDecisionKeys] = useState<DecisionKeys>({});
  const [decisionLoading, setDecisionLoading] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("正在讀取店家資料...");
  const [taskCodeMessage, setTaskCodeMessage] = useState("正在讀取任務碼...");
  const [isBusy, setIsBusy] = useState(false);
  const [isTaskCodeLoading, setIsTaskCodeLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [now, setNow] = useState(Date.now());

  const refreshRecords = useCallback(async () => {
    const response = await fetch(`${API_URL}/merchant/redemptions`, { headers: merchantHeaders });
    if (response.ok) setRecords(await response.json());
  }, []);

  const refreshMerchant = useCallback(async (merchantId?: string) => {
    if (!merchantId) {
      setMerchant(null);
      return;
    }
    const response = await fetch(`${API_URL}/merchants`);
    if (!response.ok) return;
    const merchants = (await response.json()) as MerchantProfile[];
    setMerchant(merchants.find((item) => item.id === merchantId) ?? null);
  }, []);

  const refreshTaskCode = useCallback(async (merchantId?: string) => {
    if (!merchantId) return;
    setIsTaskCodeLoading(true);
    try {
      const [codeResponse, pendingResponse] = await Promise.all([
        fetch(`${API_URL}/merchant/task-code/current?merchantId=${merchantId}`, { headers: merchantHeaders }),
        fetch(`${API_URL}/merchant/task-code-submissions?merchantId=${merchantId}&status=pending`, { headers: merchantHeaders }),
      ]);
      if (!codeResponse.ok || !pendingResponse.ok) throw new Error("讀取任務碼失敗");
      setCurrentCode(await codeResponse.json());
      setPendingSubmissions(await pendingResponse.json());
      setTaskCodeMessage("任務碼與待確認清單已更新。");
    } catch {
      setTaskCodeMessage("無法讀取任務碼或待確認清單，請稍後重試。");
    } finally {
      setIsTaskCodeLoading(false);
    }
  }, []);

  const loadApplication = useCallback(async (id: string) => {
    const response = await fetch(`${API_URL}/merchant-applications/${id}`);
    if (response.status === 404) {
      window.localStorage.removeItem(APPLICATION_STORAGE_KEY);
      setApplication(null);
      setMerchant(null);
      setMessage("找不到原申請資料，可以重新送出合作申請。");
      return;
    }
    const data = (await response.json()) as MerchantApplication;
    if (!response.ok) throw new Error((data as unknown as { message?: string }).message ?? "讀取申請失敗");
    setApplication(data);
    await refreshMerchant(data.merchantId);
    if (data.status === "approved") await refreshTaskCode(data.merchantId);
    setMessage(data.status === "approved" ? "申請已通過，可以協助玩家核銷。" : "申請資料已恢復，請等待平台審核。");
  }, [refreshMerchant, refreshTaskCode]);

  useEffect(() => {
    setDecisionKeys(loadDecisionKeys());
    const id = window.localStorage.getItem(APPLICATION_STORAGE_KEY);
    if (!id) {
      setMessage("尚未找到店家申請資料，可以前往公開合作申請頁。");
      setIsRestoring(false);
      return;
    }
    Promise.all([loadApplication(id), refreshRecords()])
      .catch(() => setMessage("無法連線到 Looper API。"))
      .finally(() => setIsRestoring(false));
  }, [loadApplication, refreshRecords]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (application?.status !== "approved" || !application.merchantId) return undefined;
    const poll = window.setInterval(() => refreshTaskCode(application.merchantId), 5000);
    return () => window.clearInterval(poll);
  }, [application?.merchantId, application?.status, refreshTaskCode]);

  async function refreshApplication() {
    const id = window.localStorage.getItem(APPLICATION_STORAGE_KEY);
    if (!id || isBusy) return;
    setIsBusy(true);
    try {
      await loadApplication(id);
      await refreshRecords();
    } catch {
      setMessage("更新審核狀態失敗，請稍後再試。");
    } finally {
      setIsBusy(false);
    }
  }

  async function decideSubmission(submission: MerchantTaskCodeSubmission, decision: TaskCodeSubmissionDecision) {
    if (!application?.merchantId || decisionLoading[submission.id]) return;
    const storageKey = `${submission.id}:${decision}`;
    const idempotencyKey = getOrCreateDecisionKey(decisionKeys[storageKey], submission.id, decision, () => crypto.randomUUID());
    const nextKeys = { ...decisionKeys, [storageKey]: idempotencyKey };
    setDecisionKeys(nextKeys);
    saveDecisionKeys(nextKeys);
    setDecisionLoading((current) => ({ ...current, [submission.id]: true }));
    setTaskCodeMessage(decision === "confirm" ? "正在確認核銷..." : "正在拒絕核銷...");
    try {
      const response = await fetch(`${API_URL}/merchant/task-code-submissions/${submission.id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json", ...merchantHeaders },
        body: JSON.stringify({ merchantId: application.merchantId, decision, actorId: ACTOR_ID, idempotencyKey }),
      });
      const data = await response.json();
      if (response.ok) {
        setLastDecision(data as DecisionResult);
        setTaskCodeMessage(decision === "confirm" ? "核銷完成。" : "已拒絕這筆核銷。");
        const cleaned = { ...nextKeys };
        delete cleaned[storageKey];
        setDecisionKeys(cleaned);
        saveDecisionKeys(cleaned);
        await refreshTaskCode(application.merchantId);
        await refreshRecords();
        return;
      }
      setTaskCodeMessage(response.status === 409 ? decisionConflictMessage() : data.message ?? "操作失敗");
      if (!shouldKeepDecisionKey(response.status)) {
        const cleaned = { ...nextKeys };
        delete cleaned[storageKey];
        setDecisionKeys(cleaned);
        saveDecisionKeys(cleaned);
      }
      await refreshTaskCode(application.merchantId);
    } catch {
      setTaskCodeMessage("網路中斷，請重試；系統會沿用同一個操作 key。");
    } finally {
      setDecisionLoading((current) => ({ ...current, [submission.id]: false }));
    }
  }

  const storeCategory = useMemo(() => {
    if (!application) return "";
    return application.storeCategory === "其他" && application.otherStoreCategory ? `其他：${application.otherStoreCategory}` : application.storeCategory;
  }, [application]);

  if (isRestoring) return <main className="merchant-shell status-layout"><section className="status-card"><p className="merchant-brand">🌱 Looper Merchant Center</p><h1>正在恢復店家資料</h1><p className="message-box">請稍候，正在讀取申請與核銷狀態。</p></section></main>;

  if (!application) return <main className="merchant-shell status-layout">
    <header className="merchant-header"><div><p className="merchant-brand">🌱 Looper Merchant Center</p><h1>店家後台</h1><p className="merchant-subtitle">這裡顯示審核後的店家狀態。公開合作申請表永遠在 /apply。</p></div></header>
    <section className="status-card"><h2>尚未連結申請資料</h2><p className="message-box">{message}</p><div className="button-row"><Link className="primary-action link-action" href="/apply">前往公開合作申請</Link></div></section>
  </main>;

  return <main className="merchant-shell status-layout">
    <header className="merchant-header"><div><p className="merchant-brand">🌱 Looper Merchant Center</p><h1>{application.storeName}</h1><p className="merchant-subtitle">店家後台只顯示核銷必要資訊，不顯示玩家完整資產。</p></div><span className={`status-badge ${statusClass(application.status)}`}>{statusLabel(application.status)}</span></header>
    <section className="status-card">
      <div className="dashboard-links"><Link href="/apply">公開合作申請頁</Link></div>
      <h2>店家資料</h2>
      <p><strong>店家業態：</strong>{storeCategory}</p>
      <p><strong>地址：</strong>{application.address}</p>
      <p><strong>聯絡人 LINE ID：</strong>{application.contactLineId}</p>
      {merchant ? <div className="plan-card"><strong>店家方案：{merchant.merchantPlan}</strong><span>任務碼核銷依後端正式規則與 settlement snapshot 入帳。</span></div> : null}
      <div className="hours-summary">{formatHours(application).map((line) => <span key={line}>{line}</span>)}</div>
      <div className="selected-types">{application.vegetarianOffering.map((item) => <span key={item}>{item === "其他" && application.otherMealType ? `其他：${application.otherMealType}` : item}</span>)}</div>
      {application.reviewNote ? <p className="message-box">平台備註：{application.reviewNote}</p> : null}
      <div className="button-row"><Button className="secondary-action" type="button" onClick={refreshApplication} disabled={isBusy}>{isBusy ? "更新中..." : "更新審核狀態"}</Button></div>
      <p className="message-box">{message}</p>
    </section>

    {application.status === "approved" ? <section className="status-card task-code-card">
      <div className="task-code-head">
        <div><h2>任務碼核銷</h2><p>玩家輸入當期任務碼後，會出現在待確認清單。</p></div>
        <Button className="secondary-action compact-action" type="button" onClick={() => refreshTaskCode(application.merchantId)} disabled={isTaskCodeLoading}>{isTaskCodeLoading ? "更新中..." : "更新"}</Button>
      </div>
      <div className="current-code-box">
        <span>目前4碼任務碼</span>
        <strong>{currentCode?.code ?? "----"}</strong>
        <small>有效期限：{currentCode?.validUntil ? new Date(currentCode.validUntil).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }) : "--:--"}｜更新倒數 {remainingText(currentCode?.validUntil, now)}</small>
      </div>
      <p className="message-box">{taskCodeMessage}</p>
      <div className="pending-list">
        <h3>待確認核銷</h3>
        {pendingSubmissions.length ? pendingSubmissions.map((submission) => (
          <article className="pending-item" key={submission.id}>
            <div>
              <strong>{submission.user.displayName}</strong>
              <p>{submission.mission.title}｜提交 {new Date(submission.submittedAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}｜剩餘 {remainingText(submission.confirmationExpiresAt, now)}</p>
            </div>
            <div className="pending-actions">
              <Button className="primary-action" type="button" onClick={() => decideSubmission(submission, "confirm")} disabled={Boolean(decisionLoading[submission.id])}>{decisionLoading[submission.id] ? "處理中..." : "確認核銷"}</Button>
              <Button className="secondary-action" type="button" onClick={() => decideSubmission(submission, "reject")} disabled={Boolean(decisionLoading[submission.id])}>拒絕</Button>
            </div>
          </article>
        )) : <p>目前沒有待確認核銷。</p>}
      </div>
      {lastDecision?.status === "settled" ? <div className="settlement-card"><h3>核銷完成</h3><p>submission：{lastDecision.id}</p><p>redemption：{lastDecision.settlement?.redemptionId}</p><p>reward event：{lastDecision.settlement?.rewardEventId}</p></div> : null}
      {lastDecision?.status === "rejected" ? <div className="settlement-card"><h3>已拒絕</h3><p>{lastDecision.user.displayName} 的核銷已拒絕。</p></div> : null}
    </section> : null}

    <section className="records-card"><h2>核銷紀錄</h2>{records.length ? records.map((record) => <p key={record.id}>{record.userId}・⭐{record.starsGranted}・⚡{record.energyGranted}・EXP {record.expGranted}・CO₂ {kg(record.carbonGrams)} kg</p>) : <p>尚無核銷紀錄。</p>}</section>
  </main>;
}
