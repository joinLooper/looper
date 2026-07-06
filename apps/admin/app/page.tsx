"use client";

import type { AdminOverview, MerchantApplication } from "@looper/types";
import { Button } from "@looper/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const adminHeaders = { "x-looper-role": "admin" };

function statusLabel(status: MerchantApplication["status"]) {
  if (status === "approved") return "已通過";
  if (status === "needs_revision") return "需要補件";
  if (status === "rejected") return "未通過";
  return "等待審核";
}

function statusClass(status: MerchantApplication["status"]) {
  if (status === "approved") return "approved";
  if (status === "needs_revision") return "revision";
  if (status === "rejected") return "rejected";
  return "";
}

function actionLabel(action: string) {
  if (action === "merchant.application_submitted") return "店家送出合作申請";
  if (action === "merchant.application_approved") return "店家申請已通過";
  if (action === "merchant.application_rejected") return "店家申請未通過";
  if (action === "merchant.application_revision_requested") return "平台要求店家補件";
  if (action === "mission.accepted") return "玩家接取任務";
  if (action === "redemption.created") return "店家完成任務核銷";
  if (action === "redemption.replayed") return "核銷請求重送";
  return action;
}

export default function Page() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [message, setMessage] = useState("正在更新資料…");
  const [isBusy, setIsBusy] = useState(false);

  const refresh = useCallback(async () => {
    setIsBusy(true);
    try {
      const response = await fetch(`${API_URL}/admin/overview`, { headers: adminHeaders });
      if (!response.ok) throw new Error("同步失敗");
      setOverview(await response.json());
      setMessage(`已更新：${new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}`);
    } catch {
      setMessage("目前無法連線到 Looper API。");
    } finally {
      setIsBusy(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function review(application: MerchantApplication, decision: "approve" | "reject" | "request_revision") {
    if (isBusy) return;
    setIsBusy(true);
    setMessage("正在更新店家申請…");
    try {
      const response = await fetch(`${API_URL}/merchant-applications/${application.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json", ...adminHeaders },
        body: JSON.stringify({
          decision,
          reviewerId: "admin-demo",
          note: decision === "request_revision" ? "請確認並補充餐點類型。" : "",
        }),
      });
      const data = await response.json();
      setMessage(response.ok ? "店家申請已更新。" : data.message ?? "操作失敗");
      if (response.ok) {
        const overviewResponse = await fetch(`${API_URL}/admin/overview`, { headers: adminHeaders });
        if (overviewResponse.ok) setOverview(await overviewResponse.json());
      }
    } catch {
      setMessage("目前無法完成審核，請稍後再試。");
    } finally {
      setIsBusy(false);
    }
  }

  const metrics = overview?.metrics;
  const cards = [
    { label: "合作店家", value: metrics?.activeMerchants ?? 0 },
    { label: "待審店家", value: metrics?.pendingMerchantApplications ?? 0, attention: Boolean(metrics?.pendingMerchantApplications) },
    { label: "玩家", value: metrics?.totalUsers ?? 0 },
    { label: "待核銷", value: metrics?.awaitingVerification ?? 0, attention: Boolean(metrics?.awaitingVerification) },
    { label: "完成任務", value: metrics?.completedMissions ?? 0 },
  ];

  const pendingApplications = useMemo(
    () => overview?.merchantApplications.filter((item) => item.status !== "approved") ?? [],
    [overview?.merchantApplications],
  );
  const recentActivities = useMemo(
    () => [...(overview?.auditEvents ?? [])].reverse().slice(0, 8),
    [overview?.auditEvents],
  );

  return <main className="admin-shell">
    <header className="admin-topbar">
      <div>
        <p className="admin-brand">🌱 Looper Admin Center</p>
        <h1>平台營運工作台</h1>
        <p className="admin-subtitle">集中處理店家審核、合作店家、玩家任務與核銷活動。需要處理的項目會優先顯示。</p>
      </div>
      <Button className="refresh-button" type="button" onClick={refresh} disabled={isBusy}>{isBusy ? "更新中…" : "更新資料"}</Button>
    </header>

    <p className="admin-message" aria-live="polite">{message}</p>

    <section className="metric-grid" aria-label="平台關鍵指標">
      {cards.map((card) => <article className={`metric-card ${card.attention ? "attention" : ""}`} key={card.label}>
        <p>{card.label}</p>
        <strong>{card.value}</strong>
      </article>)}
    </section>

    <div className="workspace-grid">
      <section className="panel">
        <div className="panel-header">
          <h2>待處理店家申請</h2>
          <span className="panel-count">{pendingApplications.length} 筆</span>
        </div>
        <div className="panel-body">
          {pendingApplications.length ? pendingApplications.map((application) => <article className="application-card" key={application.id}>
            <div className="application-head">
              <div>
                <h3>{application.storeName}</h3>
                <p className="meta">{application.storeType}・{application.address}</p>
              </div>
              <span className={`status-pill ${statusClass(application.status)}`}>{statusLabel(application.status)}</span>
            </div>
            <p className="meta">聯絡人：{application.contactName}・{application.phone}・{application.email}</p>
            <div className="tag-row">{application.vegetarianOffering.map((item) => <span key={item}>{item}</span>)}</div>
            {application.reviewNote ? <p className="meta">平台留言：{application.reviewNote}</p> : null}
            {application.status !== "rejected" ? <div className="action-row">
              <Button className="action-primary" type="button" onClick={() => review(application, "approve")} disabled={isBusy}>通過並啟用</Button>
              <Button className="action-secondary" type="button" onClick={() => review(application, "request_revision")} disabled={isBusy}>請店家補件</Button>
              <Button className="action-danger" type="button" onClick={() => review(application, "reject")} disabled={isBusy}>不通過</Button>
            </div> : null}
          </article>) : <div className="empty-state"><strong>目前沒有待處理申請</strong><span>新的店家申請會出現在這裡。</span></div>}
        </div>
      </section>

      <div style={{ display: "grid", gap: 18 }}>
        <section className="panel">
          <div className="panel-header"><h2>已啟用合作店家</h2><span className="panel-count">{overview?.merchants.length ?? 0} 家</span></div>
          <div className="panel-body">
            {overview?.merchants.length ? <div className="merchant-list">{overview.merchants.map((merchant) => <article className="merchant-row" key={merchant.id}>
              <div><strong>{merchant.storeName}</strong><br /><small>{merchant.address}<br />{merchant.vegetarianOffering.join("、")}</small></div>
              <span className="merchant-state">可核銷</span>
            </article>)}</div> : <div className="empty-state"><strong>尚無合作店家</strong><span>店家通過審核後會出現在這裡。</span></div>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header"><h2>最近平台活動</h2><span className="panel-count">{recentActivities.length} 筆</span></div>
          <div className="panel-body">
            {recentActivities.length ? <div className="activity-list">{recentActivities.map((event) => <article className="activity-item" key={event.id}>
              <strong>{actionLabel(event.action)}</strong>
              <span>{new Date(event.createdAt).toLocaleString("zh-TW")}・{event.entityId}</span>
            </article>)}</div> : <div className="empty-state"><strong>目前沒有活動紀錄</strong><span>申請、任務與核銷事件會依時間顯示。</span></div>}
          </div>
        </section>
      </div>
    </div>
  </main>;
}
