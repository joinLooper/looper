"use client";

import type { AdminOverview } from "@looper/types";
import { Button } from "@looper/ui";
import { useCallback, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const auditLabels: Record<string, string> = {
  "mission.accepted": "玩家接取了任務",
  "redemption.created": "店家完成核銷，獎勵已發放",
  "redemption.replayed": "重複請求已自動忽略，獎勵沒有重複發放",
};

export default function Page() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [message, setMessage] = useState("正在更新資料…");

  const refresh = useCallback(async () => {
    const response = await fetch(`${API_URL}/admin/overview`, {
      headers: { "x-looper-role": "admin" },
    });
    if (!response.ok) throw new Error("同步失敗");
    setOverview(await response.json());
    setMessage("已更新");
  }, []);

  useEffect(() => {
    refresh().catch(() => setMessage("目前無法連線，請稍後再試"));
  }, [refresh]);

  const metrics = overview?.metrics;

  const summaryCards = [
    { label: "總玩家", value: metrics?.totalUsers ?? 0 },
    { label: "等待店家確認", value: metrics?.awaitingVerification ?? 0 },
    { label: "已完成任務", value: metrics?.completedMissions ?? 0 },
    { label: "本期發放星星", value: metrics?.starsGranted ?? 0 },
    { label: "本期發放能量", value: metrics?.energyGranted ?? 0 },
  ];

  return (
    <main style={{ maxWidth: 1080, margin: "40px auto", padding: 24, fontFamily: "sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-start" }}>
        <div>
          <p>Looper Admin Center</p>
          <h1>營運總覽</h1>
          <p>查看玩家、任務與核銷的最新狀態。</p>
        </div>
        <Button type="button" onClick={() => refresh()}>更新資料</Button>
      </header>

      <p aria-live="polite">{message}</p>

      <section style={{ marginTop: 28 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {summaryCards.map((card) => (
            <article key={card.label} style={{ border: "1px solid #ddd", borderRadius: 14, padding: 18 }}>
              <p style={{ margin: 0 }}>{card.label}</p>
              <strong style={{ fontSize: 30 }}>{card.value}</strong>
            </article>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>玩家進度</h2>
        {overview?.users.length ? overview.users.map((user) => (
          <article key={user.id} style={{ borderTop: "1px solid #ddd", padding: "14px 0" }}>
            <strong>{user.displayName}</strong>
            <p>{user.stars} 星星・{user.energy} 能量・{user.enrollments.length} 個任務紀錄</p>
          </article>
        )) : <p>目前還沒有玩家資料。</p>}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>最近動態</h2>
        {overview?.auditEvents.length ? overview.auditEvents.slice().reverse().map((event) => (
          <article key={event.id} style={{ borderTop: "1px solid #ddd", padding: "12px 0" }}>
            <strong>{auditLabels[event.action] ?? "系統已更新資料"}</strong>
            <p>{event.actorRole === "merchant" ? "店家端" : event.actorRole === "user" ? "玩家端" : "管理端"}・{event.createdAt}</p>
          </article>
        )) : <p>目前沒有新的動態。</p>}
      </section>
    </main>
  );
}
