"use client";

import type { MerchantApplication, MerchantProfile, Redemption, SettlementResult } from "@looper/types";
import { WEEKDAYS } from "@looper/types";
import { Button } from "@looper/ui";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const merchantHeaders = { "x-looper-role": "merchant" };
const APPLICATION_STORAGE_KEY = "looper.merchant.applicationId";

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

export default function Page() {
  const [application, setApplication] = useState<MerchantApplication | null>(null);
  const [merchant, setMerchant] = useState<MerchantProfile | null>(null);
  const [records, setRecords] = useState<Redemption[]>([]);
  const [lastSettlement, setLastSettlement] = useState<SettlementResult | null>(null);
  const [message, setMessage] = useState("正在讀取店家資料...");
  const [isBusy, setIsBusy] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);

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
    setMessage(data.status === "approved" ? "申請已通過，可以協助玩家核銷。" : "申請資料已恢復，請等待平台審核。");
  }, [refreshMerchant]);

  useEffect(() => {
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

  async function redeem() {
    if (!application?.merchantId || isBusy) return setMessage("店家尚未通過審核，不能核銷。");
    setIsBusy(true);
    setLastSettlement(null);
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
      if (response.ok) {
        setLastSettlement(data as SettlementResult);
        setMessage("核銷成功，獎勵與減碳已由後端 transaction 入帳。");
      } else {
        setMessage(data.message ?? "核銷失敗");
      }
      await refreshRecords();
    } catch {
      setMessage("核銷失敗，請確認 Looper API 是否啟動。");
    } finally {
      setIsBusy(false);
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
      {merchant ? <div className="plan-card"><strong>店家方案：{merchant.merchantPlan}</strong><span>每次蔬食核銷發放 ⭐{merchant.rewardStarAmount}、⚡30、EXP 100、減碳 0.8 kg</span></div> : null}
      <div className="hours-summary">{formatHours(application).map((line) => <span key={line}>{line}</span>)}</div>
      <div className="selected-types">{application.vegetarianOffering.map((item) => <span key={item}>{item === "其他" && application.otherMealType ? `其他：${application.otherMealType}` : item}</span>)}</div>
      {application.reviewNote ? <p className="message-box">平台備註：{application.reviewNote}</p> : null}
      <div className="button-row"><Button className="secondary-action" type="button" onClick={refreshApplication} disabled={isBusy}>{isBusy ? "更新中..." : "更新審核狀態"}</Button><Button className="primary-action" type="button" onClick={redeem} disabled={application.status !== "approved" || isBusy}>確認玩家任務核銷</Button></div>
      <p className="message-box">{message}</p>
      {lastSettlement ? <div className="settlement-card"><h3>本次核銷結算</h3><p>⭐ +{lastSettlement.rewardSummary.stars}</p><p>⚡ +{lastSettlement.rewardSummary.energy}</p><p>EXP +{lastSettlement.rewardSummary.exp}</p><p>減碳 +{kg(lastSettlement.rewardSummary.carbonGrams)} kg</p></div> : null}
    </section>
    <section className="records-card"><h2>核銷紀錄</h2>{records.length ? records.map((record) => <p key={record.id}>{record.userId}・⭐{record.starsGranted}・⚡{record.energyGranted}・EXP {record.expGranted}・CO₂ {kg(record.carbonGrams)} kg</p>) : <p>尚無核銷紀錄。</p>}</section>
  </main>;
}
