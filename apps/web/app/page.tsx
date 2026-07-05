"use client";

import type { Mission, UserProgress } from "@looper/types";
import { Button } from "@looper/ui";
import { useCallback, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const USER_ID = "user-demo";

export default function Page() {
  const [mission, setMission] = useState<Mission | null>(null);
  const [user, setUser] = useState<UserProgress | null>(null);
  const [message, setMessage] = useState("正在讀取 Looper 狀態…");

  const refresh = useCallback(async () => {
    const [missionsResponse, userResponse] = await Promise.all([
      fetch(`${API_URL}/missions`),
      fetch(`${API_URL}/users/${USER_ID}/state`),
    ]);
    const missions = (await missionsResponse.json()) as Mission[];
    const nextUser = (await userResponse.json()) as UserProgress;
    setMission(missions[0] ?? null);
    setUser(nextUser);
    setMessage("資料已同步");
  }, []);

  useEffect(() => {
    refresh().catch(() => setMessage("API 尚未啟動，請先執行 pnpm dev"));
  }, [refresh]);

  async function acceptMission() {
    if (!mission) return;
    setMessage("正在接取任務…");
    const response = await fetch(`${API_URL}/missions/${mission.id}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: USER_ID }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.message ?? "接取任務失敗");
      return;
    }
    setUser(data.user);
    setMessage("任務已接取，請到店家完成核銷");
  }

  const enrollment = user?.enrollments.find((item) => item.missionId === mission?.id);

  return (
    <main style={{ maxWidth: 720, margin: "48px auto", padding: 24, fontFamily: "sans-serif" }}>
      <p>Looper Web</p>
      <h1>今日任務</h1>
      <section style={{ border: "1px solid #ddd", borderRadius: 16, padding: 24 }}>
        <h2>{mission?.title ?? "讀取中"}</h2>
        <p>{mission?.description}</p>
        <p>獎勵：{mission?.starReward ?? 0} ⭐／{mission?.energyReward ?? 0} 能量</p>
        <p>狀態：{enrollment?.status ?? "available"}</p>
        <Button type="button" onClick={acceptMission} disabled={!mission || Boolean(enrollment)}>
          {enrollment ? "已接取" : "接取任務"}
        </Button>
      </section>
      <section style={{ marginTop: 24 }}>
        <h2>旅人狀態</h2>
        <p>星星：{user?.stars ?? 0}</p>
        <p>能量：{user?.energy ?? 0}</p>
        <Button type="button" onClick={() => refresh()}>重新同步</Button>
      </section>
      <p aria-live="polite">{message}</p>
    </main>
  );
}
