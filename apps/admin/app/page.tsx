"use client";

import type { AdminOverview } from "@looper/types";
import { Button } from "@looper/ui";
import { useCallback, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const metricDefinitions = [
  {
    key: "totalUsers",
    label: "使用者",
    source: "使用者主檔",
    effect: "影響任務、玩家成長與營運統計",
  },
  {
    key: "awaitingVerification",
    label: "待核銷",
    source: "已接取但尚未完成的任務",
    effect: "店家核銷後會減少，完成任務會增加",
  },
  {
    key: "completedMissions",
    label: "完成任務",
    source: "核銷成功的任務紀錄",
    effect: "影響玩家歷程、獎勵與後續成長",
  },
  {
    key: "starsGranted",
    label: "已發星星",
    source: "星星帳本加總",
    effect: "只影響遊戲內可用星星，不代表現金",
  },
  {
    key: "energyGranted",
    label: "已發能量",
    source: "能量帳本加總",
    effect: "影響遊戲行動與世界成長，不代表現金",
  },
] as const;

const auditLabels: Record<string, string> = {
  "mission.accepted": "玩家接取任務",
  "redemption.created": "店家完成核銷並發放獎勵",
  "redemption.replayed": "重送請求已安全回放，沒有重複發獎勵",
};

export default function Page() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [message, setMessage] = useState("正在同步平台資料…");

  const refresh = useCallback(async () => {
    const response = await fetch(`${API_URL}/admin/overview`, {
      headers: { "x-looper-role": "admin" },
    });
    if (!response.ok) throw new Error("同步失敗");
    setOverview(await response.json());
    setMessage("資料已同步");
  }, []);

  useEffect(() => {
    refresh().catch(() => setMessage("API 尚未啟動"));
  }, [refresh]);

  const metrics = overview?.metrics;

  return (
    <main style={{ maxWidth: 1080, margin: "40px auto", padding: 24, fontFamily: "sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-start" }}>
        <div>
          <p>Looper Admin Center</p>
          <h1>平台資料控制台</h1>
          <p>先看數字代表什麼，再看數字是多少。</p>
        </div>
        <Button type="button" onClick={() => refresh()}>重新同步</Button>
      </header>

      <p aria-live="polite">{message}</p>

      <section style={{ marginTop: 28 }}>
        <h2>目前狀態</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {metricDefinitions.map((definition) => {
            const value = metrics?.[definition.key] ?? 0;
            return (
              <article key={definition.key} style={{ border: "1px solid #ddd", borderRadius: 14, padding: 18 }}>
                <p style={{ margin: 0 }}>{definition.label}</p>
                <strong style={{ fontSize: 30 }}>{value}</strong>
                <p><b>從哪裡來：</b>{definition.source}</p>
                <p><b>動到哪裡：</b>{definition.effect}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section style={{ marginTop: 32, border: "2px solid #222", borderRadius: 14, padding: 20 }}>
        <h2>真實現金區</h2>
        <p><b>目前尚未接入正式金流。</b></p>
        <p>現金收入、退款、店家請款與平台費用將使用獨立金流帳本，不與星星、能量或玩家等級互相換算。</p>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>一個核銷會改變什麼？</h2>
        <ol>
          <li>待核銷任務減少 1 筆。</li>
          <li>完成任務增加 1 筆。</li>
          <li>星星帳本新增一筆任務獎勵。</li>
          <li>能量帳本新增一筆任務獎勵。</li>
          <li>玩家畫面同步新的星星與能量。</li>
          <li>留下核銷與操作審計紀錄。</li>
          <li>真實現金不會因此自動改變。</li>
        </ol>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>玩家成長資料</h2>
        <p>等級、經驗值、下一級門檻與升等來源會獨立呈現。經驗值公式尚未定案前，不以星星或能量代替，避免玩家帳目混淆。</p>
        {overview?.users.map((user) => (
          <article key={user.id} style={{ borderTop: "1px solid #ddd", padding: "14px 0" }}>
            <strong>{user.displayName}</strong>
            <p>星星：{user.stars}｜能量：{user.energy}｜完成／進行中任務：{user.enrollments.length}</p>
            <p>等級與經驗值：尚未接入正式升等規則</p>
          </article>
        ))}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>操作紀錄</h2>
        {overview?.auditEvents.length ? overview.auditEvents.slice().reverse().map((event) => (
          <article key={event.id} style={{ borderTop: "1px solid #ddd", padding: "12px 0" }}>
            <strong>{auditLabels[event.action] ?? event.action}</strong>
            <p>操作者：{event.actorRole}／{event.actorId}</p>
            <p>影響資料：{event.entityType}／{event.entityId}</p>
          </article>
        )) : <p>尚無操作紀錄</p>}
      </section>
    </main>
  );
}
