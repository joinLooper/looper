"use client";

import type { AdminOverview, MerchantApplication } from "@looper/types";
import { Button } from "@looper/ui";
import { useCallback, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const adminHeaders = { "x-looper-role": "admin" };

export default function Page() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [message, setMessage] = useState("正在更新資料…");

  const refresh = useCallback(async () => {
    const response = await fetch(`${API_URL}/admin/overview`, { headers: adminHeaders });
    if (!response.ok) throw new Error("同步失敗");
    setOverview(await response.json());
    setMessage("已更新");
  }, []);

  useEffect(() => { refresh().catch(() => setMessage("目前無法連線")); }, [refresh]);

  async function review(application: MerchantApplication, decision: "approve" | "reject" | "request_revision") {
    const response = await fetch(`${API_URL}/merchant-applications/${application.id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json", ...adminHeaders },
      body: JSON.stringify({
        decision,
        reviewerId: "admin-demo",
        note: decision === "request_revision" ? "請補充蔬食供應內容。" : "",
      }),
    });
    const data = await response.json();
    setMessage(response.ok ? "店家申請已更新。" : data.message ?? "操作失敗");
    await refresh();
  }

  const metrics = overview?.metrics;
  const cards = [
    ["合作店家", metrics?.activeMerchants ?? 0],
    ["待審店家", metrics?.pendingMerchantApplications ?? 0],
    ["玩家", metrics?.totalUsers ?? 0],
    ["待核銷", metrics?.awaitingVerification ?? 0],
    ["完成任務", metrics?.completedMissions ?? 0],
  ];

  return <main style={{ maxWidth: 1080, margin: "36px auto", padding: 24, fontFamily: "sans-serif" }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <div><p>Looper Admin Center</p><h1>平台營運總覽</h1></div>
      <Button type="button" onClick={refresh}>更新資料</Button>
    </header>
    <p aria-live="polite">{message}</p>

    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
      {cards.map(([label, value]) => <article key={label} style={{ border: "1px solid #ddd", borderRadius: 14, padding: 16 }}><p>{label}</p><strong style={{ fontSize: 28 }}>{value}</strong></article>)}
    </section>

    <section style={{ marginTop: 32 }}>
      <h2>店家申請</h2>
      {overview?.merchantApplications.length ? overview.merchantApplications.map((application) => <article key={application.id} style={{ borderTop: "1px solid #ddd", padding: "16px 0" }}>
        <strong>{application.storeName}</strong>
        <p>{application.storeType}・{application.address}</p>
        <p>蔬食內容：{application.vegetarianOffering}</p>
        <p>狀態：{application.status}</p>
        {application.status !== "approved" ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button type="button" onClick={() => review(application, "approve")}>通過並啟用</Button>
          <Button type="button" onClick={() => review(application, "request_revision")}>請店家補件</Button>
          <Button type="button" onClick={() => review(application, "reject")}>不通過</Button>
        </div> : <p>已建立店家與玩家任務。</p>}
      </article>) : <p>目前沒有店家申請。</p>}
    </section>

    <section style={{ marginTop: 32 }}>
      <h2>已啟用合作店家</h2>
      {overview?.merchants.length ? overview.merchants.map((merchant) => <p key={merchant.id}>{merchant.storeName}・{merchant.address}・可核銷</p>) : <p>平台目前尚無合作店家。</p>}
    </section>
  </main>;
}
