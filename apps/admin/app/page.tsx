"use client";

import type { AdminOverview, EconomySettings, MerchantApplication, MerchantApplicationReviewDecision, MerchantPlan, MerchantProfile } from "@looper/types";
import { WEEKDAYS } from "@looper/types";
import { Button } from "@looper/ui";
import Link from "next/link";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminOverviewErrorMessage, adminOverviewRequest, canLoadAdminOverview, classifyAdminOverviewError } from "./admin-overview-flow";
import { canReadMerchantApplications, canReviewMerchantApplications, classifyMerchantReviewError, merchantApplicationReviewRequest, merchantReviewErrorMessage } from "./admin-merchant-review-flow";
import { hasPlatformPermission } from "./admin-session-flow";
import { useAdminSession } from "./admin-session-gate";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const legacyAdminMutationHeaders = { "x-looper-role": "admin" };
type SettingKey = keyof EconomySettings;
const settingFields: Array<{ key: SettingKey; label: string; unit: string; step?: string }> = [
  { key: "vegetarianCarbonGrams", label: "蔬食核銷減碳", unit: "g" },
  { key: "carbonGramsPerSeed", label: "產生一顆種子", unit: "g" },
  { key: "seedsPerPlant", label: "種子合成植物", unit: "顆" },
  { key: "plantsPerTree", label: "植物合成樹", unit: "株" },
  { key: "redemptionEnergy", label: "核銷能量", unit: "⚡" },
  { key: "redemptionExp", label: "核銷經驗", unit: "EXP" },
  { key: "energyRegenIntervalSeconds", label: "自然恢復間隔", unit: "秒" },
  { key: "energyOverflowMultiplier", label: "能量溢出倍率", unit: "倍", step: "0.1" },
];

function statusLabel(status: MerchantApplication["status"]) {
  if (status === "approved") return "已通過";
  if (status === "needs_revision") return "需補件";
  if (status === "rejected") return "未通過";
  return "待審核";
}

function statusClass(status: MerchantApplication["status"]) {
  if (status === "approved") return "approved";
  if (status === "needs_revision") return "revision";
  if (status === "rejected") return "rejected";
  return "";
}

function actionLabel(action: string) {
  if (action === "merchant.application_submitted") return "店家送出申請";
  if (action === "merchant.application_approved") return "店家通過審核";
  if (action === "merchant.application_rejected") return "店家未通過";
  if (action === "merchant.application_revision_requested") return "請店家補件";
  if (action === "mission.accepted") return "玩家接取任務";
  if (action === "redemption.created") return "店家完成核銷";
  if (action === "redemption.replayed") return "核銷重送被攔截";
  if (action === "resource.energy_regenerated") return "能量自然恢復";
  if (action === "economy.settings_updated") return "經濟設定更新";
  return action;
}

function categoryLabel(item: MerchantApplication | MerchantProfile) {
  return item.storeCategory === "其他" && item.otherStoreCategory ? `其他：${item.otherStoreCategory}` : item.storeCategory;
}

function hoursSummary(application: MerchantApplication) {
  return application.businessHours.map((day) => {
    const label = WEEKDAYS.find((item) => item.key === day.day)?.label ?? day.day;
    return `${label} ${day.closed ? "公休" : day.periods.map((period) => `${period.start}-${period.end}`).join("、")}`;
  }).join("；");
}

function kg(grams: number) {
  return (grams / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 1 });
}

export default function Page() {
  const adminSession = useAdminSession();
  const canManagePlatformIdentity = hasPlatformPermission(adminSession?.context ?? null, "platform.identity.manage");
  const canLoadOverview = canLoadAdminOverview(adminSession?.context ?? null);
  const canReadApplications = canReadMerchantApplications(adminSession?.context ?? null);
  const contextCanReviewApplications = canReviewMerchantApplications(adminSession?.context ?? null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [settingsForm, setSettingsForm] = useState<Record<SettingKey, string> | null>(null);
  const [message, setMessage] = useState("正在讀取平台營運資料...");
  const [isBusy, setIsBusy] = useState(false);
  const [reviewPermissionBlocked, setReviewPermissionBlocked] = useState(false);
  const overviewRequestVersion = useRef(0);
  const reviewRequestVersion = useRef(0);
  const canReviewApplications = contextCanReviewApplications && !reviewPermissionBlocked;

  const refresh = useCallback(async (): Promise<boolean> => {
    if (!adminSession || !canLoadOverview) {
      setOverview(null);
      setSettingsForm(null);
      setMessage("目前帳號沒有此區塊權限。");
      return false;
    }
    const version = ++overviewRequestVersion.current;
    setIsBusy(true);
    setOverview(null);
    setSettingsForm(null);
    try {
      const response = await fetch(`${API_URL}/admin/overview`, adminOverviewRequest);
      if (version !== overviewRequestVersion.current) return false;
      if (!response.ok) {
        const error = classifyAdminOverviewError(response.status);
        setMessage(adminOverviewErrorMessage(error));
        if (error === "unauthenticated") adminSession.invalidateSession("unauthenticated");
        return false;
      }
      const data = await response.json() as AdminOverview;
      setOverview(canReadApplications ? data : { ...data, merchantApplications: [] });
      setMessage(`已同步 ${new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}`);
      return true;
    } catch {
      if (version === overviewRequestVersion.current) setMessage(adminOverviewErrorMessage("network"));
      return false;
    } finally {
      if (version === overviewRequestVersion.current) setIsBusy(false);
    }
  }, [adminSession, canLoadOverview, canReadApplications]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => () => { overviewRequestVersion.current += 1; reviewRequestVersion.current += 1; }, []);
  useEffect(() => {
    reviewRequestVersion.current += 1;
    setReviewPermissionBlocked(false);
    if (!canReadApplications) {
      setOverview((current) => current ? { ...current, merchantApplications: [] } : current);
    }
  }, [adminSession?.context.accountId, canReadApplications, contextCanReviewApplications]);
  useEffect(() => {
    if (!overview?.economySettings) return;
    setSettingsForm(Object.fromEntries(settingFields.map((field) => [field.key, String(overview.economySettings[field.key])])) as Record<SettingKey, string>);
  }, [overview?.economySettings?.version]);

  async function review(application: MerchantApplication, decision: MerchantApplicationReviewDecision) {
    if (isBusy || !adminSession || !canReviewApplications) return;
    const version = ++reviewRequestVersion.current;
    setIsBusy(true);
    setMessage("正在更新店家申請...");
    try {
      const response = await fetch(
        `${API_URL}/merchant-applications/${application.id}/review`,
        merchantApplicationReviewRequest(decision, decision === "request_revision" ? "請補充店家資訊。" : ""),
      );
      if (version !== reviewRequestVersion.current) return;
      if (response.ok) {
        const refreshed = await refresh();
        if (version === reviewRequestVersion.current) setMessage(refreshed ? "店家申請已更新。" : "操作已完成，但資料更新失敗。");
        return;
      }
      const error = classifyMerchantReviewError(response.status);
      if (error === "unauthenticated") {
        setOverview(null);
        setSettingsForm(null);
        adminSession.invalidateSession("unauthenticated");
      } else if (error === "forbidden") {
        setOverview((current) => current ? { ...current, merchantApplications: [] } : current);
        setReviewPermissionBlocked(true);
      } else if (error === "stale") {
        await refresh();
      }
      if (version === reviewRequestVersion.current) setMessage(merchantReviewErrorMessage(error));
    } catch {
      if (version === reviewRequestVersion.current) setMessage(merchantReviewErrorMessage("network"));
    } finally {
      if (version === reviewRequestVersion.current) setIsBusy(false);
    }
  }

  async function updatePlan(merchantId: string, merchantPlan: MerchantPlan) {
    setIsBusy(true);
    try {
      const response = await fetch(`${API_URL}/merchants/${merchantId}/plan`, {
        method: "POST",
        headers: { "content-type": "application/json", ...legacyAdminMutationHeaders },
        body: JSON.stringify({ merchantPlan }),
      });
      setMessage(response.ok ? "店家方案已更新，新核銷會採用新星星額度。" : "店家方案更新失敗");
      await refresh();
    } finally {
      setIsBusy(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview || !settingsForm || isBusy) return;
    setIsBusy(true);
    setMessage("正在儲存經濟設定...");
    try {
      const payload = Object.fromEntries(settingFields.map((field) => [field.key, Number(settingsForm[field.key])])) as unknown as EconomySettings;
      const response = await fetch(`${API_URL}/admin/economy-settings`, {
        method: "PUT",
        headers: { "content-type": "application/json", ...legacyAdminMutationHeaders },
        body: JSON.stringify({ ...payload, expectedVersion: overview.economySettings.version, updatedBy: "admin-demo" }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(response.status === 409 ? "設定版本已更新，請重新整理後再修改。" : data.message ?? "經濟設定儲存失敗");
        return;
      }
      setMessage(data.changed === false ? "設定沒有變更。" : `經濟設定已更新到 v${data.settings.version}。`);
      await refresh();
    } catch {
      setMessage("經濟設定儲存失敗，請稍後再試。");
    } finally {
      setIsBusy(false);
    }
  }

  const metrics = overview?.metrics;
  const cards = [
    { label: "合作店家", value: metrics?.activeMerchants ?? 0 },
    { label: "待審店家", value: metrics?.pendingMerchantApplications ?? 0, attention: Boolean(metrics?.pendingMerchantApplications) },
    { label: "待核銷", value: metrics?.awaitingVerification ?? 0, attention: Boolean(metrics?.awaitingVerification) },
    { label: "完成任務", value: metrics?.completedMissions ?? 0 },
    { label: "平台減碳 kg", value: kg(metrics?.carbonTotalGrams ?? 0) },
    { label: "⭐ 發放", value: metrics?.starsGranted ?? 0 },
    { label: "⚡ 發放", value: metrics?.energyGranted ?? 0 },
    { label: "EXP 發放", value: metrics?.expGranted ?? 0 },
    { label: "🌱 種子", value: metrics?.seedCount ?? 0 },
    { label: "🪴 植物", value: metrics?.plantCount ?? 0 },
    { label: "🌳 樹", value: metrics?.treeCount ?? 0 },
  ];

  const pendingApplications = useMemo(() => canReadApplications ? overview?.merchantApplications.filter((item) => item.status !== "approved") ?? [] : [], [canReadApplications, overview?.merchantApplications]);
  const recentActivities = useMemo(() => [...(overview?.auditEvents ?? [])].reverse().slice(0, 8), [overview?.auditEvents]);
  const recentTransactions = useMemo(() => [...(overview?.resourceTransactions ?? [])].reverse().slice(0, 12), [overview?.resourceTransactions]);

  return <main className="admin-shell">
    <header className="admin-topbar"><div><p className="admin-brand">🌱 Looper Admin Center</p><h1>平台營運工作台</h1><p className="admin-subtitle">資源、減碳、EXP、等級與植物成長都由後端 transaction 與帳本驅動。</p></div>{canLoadOverview ? <Button className="refresh-button" type="button" onClick={refresh} disabled={isBusy}>{isBusy ? "同步中..." : "更新資料"}</Button> : null}</header>
    <p className="admin-message" aria-live="polite">{message}</p>
    <nav className="admin-navigation panel" aria-label="平台功能">
      <div className="admin-navigation-heading"><p>任務與核銷</p><span>中央交易查詢</span></div>
      <Link className="admin-navigation-link" href="/task-code-submissions"><strong>核銷交易</strong><span>查詢任務碼提交、確認狀態與資源結算</span><b aria-hidden="true">前往 →</b></Link>
      {canManagePlatformIdentity ? <Link className="admin-navigation-link admin-navigation-link-wide" href="/platform-operators"><strong>平台人員管理</strong><span>建立邀請、查看角色及管理平台後台存取</span><b aria-hidden="true">前往 →</b></Link> : null}
    </nav>
    {canLoadOverview ? <>
      <section className="metric-grid economy-grid" aria-label="平台關鍵指標">{cards.map((card) => <article className={`metric-card ${card.attention ? "attention" : ""}`} key={card.label}><p>{card.label}</p><strong>{card.value}</strong></article>)}</section>

    <section className="panel settings-panel">
      <div className="panel-header"><h2>核心經濟設定</h2><span className="panel-count">v{overview?.economySettings.version ?? "-"}・{overview?.economySettings.updatedBy ?? "system"}</span></div>
      <form className="settings-form" onSubmit={saveSettings}>
        <p className="settings-meta">最後更新：{overview?.economySettings.updatedAt ? new Date(overview.economySettings.updatedAt).toLocaleString("zh-TW") : "尚未同步"}</p>
        <div className="settings-field-grid">
          {settingFields.map((field) => <label className="settings-field" key={field.key}><span>{field.label}<small>{field.unit}</small></span><input type="number" step={field.step ?? "1"} value={settingsForm?.[field.key] ?? ""} onChange={(event) => setSettingsForm((current) => current ? { ...current, [field.key]: event.target.value } : current)} disabled={isBusy || !overview} /></label>)}
        </div>
        <div className="settings-actions"><Button className="action-primary" type="submit" disabled={isBusy || !overview || !settingsForm}>{isBusy ? "儲存中..." : "儲存經濟設定"}</Button></div>
      </form>
      <div className="settings-grid">
        {overview?.merchantPlans.map((plan) => <span key={plan.plan}>{plan.label}: ⭐{plan.rewardStarAmount}</span>)}
      </div>
      <div className="settings-grid">
        {overview?.levelDefinitions.map((level) => <span key={level.level}>LV.{level.level}: total EXP {level.requiredTotalExp}, ⭐{level.rewardStars}, max_energy +{level.maxEnergyIncrease}</span>)}
      </div>
    </section>

    <div className="workspace-grid">
      {canReadApplications ? <section className="panel">
        <div className="panel-header"><h2>待處理店家申請</h2><span className="panel-count">{pendingApplications.length} 筆</span></div>
        <div className="panel-body">
          {pendingApplications.length ? pendingApplications.map((application) => <article className="application-card" key={application.id}>
            <div className="application-head"><div><h3>{application.storeName}</h3><p className="meta">{categoryLabel(application)}・{application.address}</p></div><span className={`status-pill ${statusClass(application.status)}`}>{statusLabel(application.status)}</span></div>
            <p className="meta">聯絡人：{application.contactName}・{application.phone}・LINE ID：{application.contactLineId}・{application.email}</p>
            <p className="meta">營業時間：{hoursSummary(application)}</p>
            <div className="tag-row">{application.vegetarianOffering.map((item) => <span key={item}>{item === "其他" && application.otherMealType ? `其他：${application.otherMealType}` : item}</span>)}</div>
            {application.reviewNote ? <p className="meta">平台備註：{application.reviewNote}</p> : null}
            {application.status !== "rejected" && canReviewApplications ? <div className="action-row"><Button className="action-primary" type="button" onClick={() => review(application, "approve")} disabled={isBusy}>通過並啟用</Button><Button className="action-secondary" type="button" onClick={() => review(application, "request_revision")} disabled={isBusy}>請補件</Button><Button className="action-danger" type="button" onClick={() => review(application, "reject")} disabled={isBusy}>不通過</Button></div> : null}
          </article>) : <div className="empty-state"><strong>目前沒有待審申請</strong><span>店家送出申請後會顯示在這裡。</span></div>}
        </div>
      </section> : <section className="panel"><div className="panel-header"><h2>店家申請</h2></div><div className="empty-state"><strong>目前帳號沒有店家申請讀取權限</strong><span>申請人與單筆申請資料不會傳送或顯示。</span></div></section>}

      <div style={{ display: "grid", gap: 18 }}>
        <section className="panel"><div className="panel-header"><h2>已啟用合作店家</h2><span className="panel-count">{overview?.merchants.length ?? 0} 家</span></div><div className="panel-body">{overview?.merchants.length ? <div className="merchant-list">{overview.merchants.map((merchant) => <article className="merchant-row" key={merchant.id}><div><strong>{merchant.storeName}</strong><br /><small>{categoryLabel(merchant)}・{merchant.address}<br />方案：{merchant.merchantPlan}・每次 ⭐{merchant.rewardStarAmount}・CO₂ 固定 800g</small></div><select value={merchant.merchantPlan} onChange={(event) => updatePlan(merchant.id, event.target.value as MerchantPlan)} disabled={isBusy}>{overview.merchantPlans.map((plan) => <option value={plan.plan} key={plan.plan}>{plan.label}</option>)}</select></article>)}</div> : <div className="empty-state"><strong>尚無合作店家</strong><span>通過審核後會建立任務與店家後台。</span></div>}</div></section>
        <section className="panel"><div className="panel-header"><h2>最近平台活動</h2><span className="panel-count">{recentActivities.length} 筆</span></div><div className="panel-body">{recentActivities.length ? <div className="activity-list">{recentActivities.map((event) => <article className="activity-item" key={event.id}><strong>{actionLabel(event.action)}</strong><span>{new Date(event.createdAt).toLocaleString("zh-TW")}・{event.entityId}</span></article>)}</div> : <div className="empty-state"><strong>尚無活動</strong><span>申請、審核、接任務與核銷會出現在這裡。</span></div>}</div></section>
      </div>
    </div>

      <section className="panel ledger-panel"><div className="panel-header"><h2>資源帳本</h2><span className="panel-count">{overview?.resourceTransactions.length ?? 0} 筆</span></div><div className="ledger-list">{recentTransactions.map((tx) => <article className="ledger-row" key={tx.id}><strong>{tx.resourceType}</strong><span>{tx.amount > 0 ? "+" : ""}{tx.amount}</span><small>{tx.balanceBefore} → {tx.balanceAfter}</small><small>{tx.transactionKind}{tx.conversionType !== "none" ? `・${tx.conversionType}` : ""}</small><small>{tx.sourceType}・{tx.sourceId}</small></article>)}</div></section>
    </> : <section className="panel overview-permission-state"><div className="empty-state"><strong>目前帳號沒有此區塊權限</strong><span>平台營運摘要需要正式報表與稽核讀取權限。</span></div></section>}
  </main>;
}
