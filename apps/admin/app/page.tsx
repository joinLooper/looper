"use client";

import type { AdminOverview } from "@looper/types";
import { Button } from "@looper/ui";
import { useCallback, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function Page() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [message, setMessage] = useState("正在同步平台資料…");
  const refresh = useCallback(async () => {
    const response = await fetch(`${API_URL}/admin/overview`, { headers: { "x-looper-role": "admin" } });
    if (!response.ok) throw new Error("同步失敗");
    setOverview(await response.json());
    setMessage("資料已同步");
  }, []);
  useEffect(() => { refresh().catch(() => setMessage("API 尚未啟動")); }, [refresh]);
  const metrics = overview?.metrics;
  return <main style={{ maxWidth: 900, margin: "48px auto", padding: 24, fontFamily: "sans-serif" }}>
    <p>Looper Admin Center</p><h1>平台核心監控</h1><Button type="button" onClick={() => refresh()}>重新同步</Button><p aria-live="polite">{message}</p>
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>{[["使用者", metrics?.totalUsers ?? 0], ["待核銷", metrics?.awaitingVerification ?? 0], ["完成任務", metrics?.completedMissions ?? 0], ["已發星星", metrics?.starsGranted ?? 0], ["已發能量", metrics?.energyGranted ?? 0]].map(([label, value]) => <article key={label} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}><p>{label}</p><strong>{value}</strong></article>)}</section>
    <h2>審計紀錄</h2>{overview?.auditEvents.length ? overview.auditEvents.slice().reverse().map((event) => <article key={event.id} style={{ borderTop: "1px solid #ddd", padding: "10px 0" }}><strong>{event.action}</strong><p>{event.actorRole}:{event.actorId}｜{event.entityType}:{event.entityId}</p></article>) : <p>尚無審計事件</p>}
  </main>;
}
