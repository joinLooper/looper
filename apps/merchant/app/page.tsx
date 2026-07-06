"use client";

import type { MerchantApplication, Redemption } from "@looper/types";
import { WEEKDAYS } from "@looper/types";
import { Button } from "@looper/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const merchantHeaders = { "x-looper-role": "merchant" };
const APPLICATION_STORAGE_KEY = "looper.merchant.applicationId";

function statusLabel(status: MerchantApplication["status"]) {
  if (status === "approved") return "已通過";
  if (status === "needs_revision") return "需要補件";
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
    return `${label}：${day.closed ? "公休" : day.periods.map((period) => `${period.start}–${period.end}`).join("、")}`;
  });
}

export default function Page() {
  const [application, setApplication] = useState<MerchantApplication | null>(null);
  const [records, setRecords] = useState<Redemption[]>([]);
  const [message, setMessage] = useState("正在讀取店家資料…");
  const [isBusy, setIsBusy] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);

  const refreshRecords = useCallback(async () => {
    const response = await fetch(`${API_URL}/merchant/redemptions`, { headers: merchantHeaders });
    if (response.ok) setRecords(await response.json());
  }, []);

  const loadApplication = useCallback(async (id: string) => {
    const response = await fetch(`${API_URL}/merchant-applications/${id}`);
    if (response.status === 404) {
      window.localStorage.removeItem(APPLICATION_STORAGE_KEY);
      setApplication(null);
      setMessage("找不到先前的申請資料。可前往公開申請頁重新提出申請。");
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "無法讀取店家資料");
    setApplication(data);
    setMessage(data.status === "approved" ? "申請已通過，核銷功能已啟用。" : "店家申請狀態已更新。");
  }, []);

  useEffect(() => {
    const id = window.localStorage.getItem(APPLICATION_STORAGE_KEY);
    if (!id) {
      setMessage("這台裝置尚未連結店家申請。公開申請頁仍可隨時使用。");
      setIsRestoring(false);
      return;
    }
    Promise.all([loadApplication(id), refreshRecords()])
      .catch(() => setMessage("目前無法連線到 Looper API。"))
      .finally(() => setIsRestoring(false));
  }, [loadApplication, refreshRecords]);

  async function refreshApplication() {
    const id = window.localStorage.getItem(APPLICATION_STORAGE_KEY);
    if (!id || isBusy) return;
    setIsBusy(true);
    try { await loadApplication(id); await refreshRecords(); }
    catch { setMessage("目前無法更新審核狀態，請稍後再試。"); }
    finally { setIsBusy(false); }
  }

  async function redeem() {
    if (!application?.merchantId || isBusy) return setMessage("店家尚未通過審核，暫時不能核銷。");
    setIsBusy(true);
    try {
      const response = await fetch(`${API_URL}/redemptions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...merchantHeaders },
        body: JSON.stringify({
          userId: "user-demo",
          missionId: `mission-${application.merchantId}-vegetarian-meal`,
          merchantId: application.merchantId,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await response.json();
      setMessage(response.ok ? "核銷成功，獎勵已發放。" : data.message ?? "核銷失敗");
      await refreshRecords();
    } catch { setMessage("目前無法完成核銷，請稍後再試。"); }
    finally { setIsBusy(false); }
  }

  if (isRestoring) return <main className="merchant-shell status-layout"><section className="status-card"><p className="merchant-brand">🌱 Looper Merchant Center</p><h1>正在恢復店家資料</h1><p className="message-box">請稍候，正在確認先前的申請與審核狀態…</p></section></main>;

  if (!application) return <main className="merchant-shell status-layout">
    <header className="merchant-header"><div><p className="merchant-brand">🌱 Looper Merchant Center</p><h1>店家後台</h1><p className="merchant-subtitle">這裡用於查看申請狀態、核銷與合作紀錄。公開合作申請表是獨立頁面，不會因這台裝置申請過而消失。</p></div></header>
    <section className="status-card"><h2>尚未連結店家資料</h2><p className="message-box">{message}</p><div className="button-row"><Link className="primary-action link-action" href="/apply">前往公開合作申請頁</Link></div></section>
  </main>;

  const storeCategory = application.storeCategory === "其他" && application.otherStoreCategory ? `其他：${application.otherStoreCategory}` : application.storeCategory;

  return <main className="merchant-shell status-layout">
    <header className="merchant-header"><div><p className="merchant-brand">🌱 Looper Merchant Center</p><h1>{application.storeName}</h1><p className="merchant-subtitle">店家後台・申請狀態與合作功能</p></div><span className={`status-badge ${statusClass(application.status)}`}>{statusLabel(application.status)}</span></header>
    <section className="status-card">
      <div className="dashboard-links"><Link href="/apply">公開合作申請頁</Link></div>
      <h2>店家資料</h2>
      <p><strong>店家業態：</strong>{storeCategory}</p>
      <p><strong>地址：</strong>{application.address}</p>
      <p><strong>聯絡人 LINE ID：</strong>{application.contactLineId}</p>
      <div className="hours-summary">{formatHours(application).map((line) => <span key={line}>{line}</span>)}</div>
      <div className="selected-types">{application.vegetarianOffering.map((item) => <span key={item}>{item === "其他" && application.otherMealType ? `其他：${application.otherMealType}` : item}</span>)}</div>
      {application.reviewNote ? <p className="message-box">平台留言：{application.reviewNote}</p> : null}
      <div className="button-row"><Button className="secondary-action" type="button" onClick={refreshApplication} disabled={isBusy}>{isBusy ? "更新中…" : "更新審核狀態"}</Button><Button className="primary-action" type="button" onClick={redeem} disabled={application.status !== "approved" || isBusy}>確認玩家任務核銷</Button></div>
      <p className="message-box">{message}</p>
    </section>
    <section className="records-card"><h2>核銷紀錄</h2>{records.length ? records.map((record) => <p key={record.id}>{record.userId}・+{record.starsGranted} 星星・+{record.energyGranted} 能量</p>) : <p>尚無核銷紀錄。</p>}</section>
  </main>;
}
