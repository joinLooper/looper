"use client";

import type { Redemption } from "@looper/types";
import { Button } from "@looper/ui";
import { useCallback, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const headers = { "x-looper-role": "merchant" };

export default function Page() {
  const [records, setRecords] = useState<Redemption[]>([]);
  const [message, setMessage] = useState("等待核銷");

  const refresh = useCallback(async () => {
    const response = await fetch(`${API_URL}/merchant/redemptions`, { headers });
    setRecords(await response.json());
  }, []);

  useEffect(() => { refresh().catch(() => setMessage("API 尚未啟動")); }, [refresh]);

  async function redeem() {
    setMessage("核銷處理中…");
    const response = await fetch(`${API_URL}/redemptions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ userId: "user-demo", missionId: "mission-vegetarian-meal", merchantId: "merchant-demo", idempotencyKey: crypto.randomUUID() }),
    });
    const data = await response.json();
    setMessage(response.ok ? (data.replayed ? "重送請求已安全回放" : "核銷成功，獎勵已發放") : data.message ?? "核銷失敗");
    await refresh();
  }

  return <main style={{ maxWidth: 720, margin: "48px auto", padding: 24, fontFamily: "sans-serif" }}>
    <p>Looper Merchant Center</p><h1>店家核銷</h1>
    <section style={{ border: "1px solid #ddd", borderRadius: 16, padding: 24 }}><p>測試使用者：user-demo</p><p>任務：完成一餐蔬食</p><Button type="button" onClick={redeem}>確認核銷</Button></section>
    <p aria-live="polite">{message}</p><h2>核銷紀錄</h2>
    {records.length === 0 ? <p>尚無紀錄</p> : records.map((record) => <article key={record.id} style={{ borderTop: "1px solid #ddd", padding: "12px 0" }}><strong>{record.id}</strong><p>{record.userId}｜+{record.starsGranted} ⭐｜+{record.energyGranted} 能量</p></article>)}
  </main>;
}
