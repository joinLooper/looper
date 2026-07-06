"use client";

import type { Mission, UserProgress } from "@looper/types";
import { Button } from "@looper/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const USER_ID = "user-demo";

function statusCopy(status?: string) {
  if (status === "completed") return "已完成";
  if (status === "awaiting_verification") return "等待店家確認";
  return "可接取";
}

export default function Page() {
  const [mission, setMission] = useState<Mission | null>(null);
  const [user, setUser] = useState<UserProgress | null>(null);
  const [message, setMessage] = useState("正在喚醒森林…");
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState<"accepted" | "completed" | null>(null);

  const refresh = useCallback(async () => {
    const [missionsResponse, userResponse] = await Promise.all([
      fetch(`${API_URL}/missions`),
      fetch(`${API_URL}/users/${USER_ID}/state`),
    ]);
    if (!missionsResponse.ok || !userResponse.ok) throw new Error("目前無法進入森林");

    const missions = (await missionsResponse.json()) as Mission[];
    const nextUser = (await userResponse.json()) as UserProgress;
    const nextMission = missions[0] ?? null;
    const previousEnrollment = user?.enrollments.find((item) => item.missionId === nextMission?.id);
    const nextEnrollment = nextUser.enrollments.find((item) => item.missionId === nextMission?.id);

    if (previousEnrollment?.status !== "completed" && nextEnrollment?.status === "completed") {
      setFeedback("completed");
    }

    setMission(nextMission);
    setUser(nextUser);
    setMessage(missions.length
      ? "森林已經準備好了。今天也完成一件小事吧！"
      : "附近還沒有合作夥伴，Looper 正在邀請更多店家加入。");
  }, [user?.enrollments]);

  useEffect(() => {
    refresh().catch(() => setMessage("森林正在休息，請確認 Looper API 已啟動。"));
  }, [refresh]);

  async function acceptMission() {
    if (!mission || isBusy) return;
    setIsBusy(true);
    setFeedback(null);
    setMessage("正在把任務放進背包…");
    try {
      const response = await fetch(`${API_URL}/missions/${mission.id}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: USER_ID }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.message ?? "任務沒有成功接取，請再試一次。");
        return;
      }
      setUser(data.user);
      setFeedback("accepted");
      setMessage("任務已放進背包！完成蔬食餐點後，請合作店家幫你確認。");
    } catch {
      setMessage("目前無法接取任務，請稍後再試。");
    } finally {
      setIsBusy(false);
    }
  }

  async function syncProgress() {
    setIsBusy(true);
    setFeedback(null);
    setMessage("正在看看森林有沒有新的變化…");
    try {
      await refresh();
    } catch {
      setMessage("暫時找不到最新進度，等一下再看看吧。");
    } finally {
      setIsBusy(false);
    }
  }

  const enrollment = user?.enrollments.find((item) => item.missionId === mission?.id);
  const status = enrollment?.status;
  const energy = Math.min(user?.energy ?? 0, 100);
  const growthStage = useMemo(() => {
    if ((user?.energy ?? 0) >= 80) return "森林正在茂盛生長";
    if ((user?.energy ?? 0) >= 40) return "新的枝葉長出來了";
    if ((user?.energy ?? 0) > 0) return "小樹苗開始發芽";
    return "等待第一道綠色能量";
  }, [user?.energy]);

  return (
    <main className="mobile-shell">
      <header className="mobile-header">
        <div>
          <p className="mobile-brand">🌱 Looper Forest</p>
          <p className="mobile-tagline">每一個小行動，都在森林裡留下改變</p>
        </div>
      </header>

      <section className="mobile-resource-board" aria-label="旅人資源">
        <div className="resource-card"><span>⭐ 星星</span><strong>{user?.stars ?? 0}</strong></div>
        <div className="resource-card"><span>⚡ 能量</span><strong>{user?.energy ?? 0}</strong></div>
        <div className="energy-compact">
          <div className="energy-head"><strong>森林成長</strong><span>{energy} / 100</span></div>
          <div className="energy-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={energy}>
            <div className="energy-fill" style={{ width: `${energy}%` }} />
          </div>
        </div>
      </section>

      {mission ? (
        <section className={`mobile-card mobile-mission-card status-${status ?? "available"}`}>
          <div className="mobile-card-head"><span>今日任務</span><span className="status-chip">{statusCopy(status)}</span></div>
          <h2>{mission.title}</h2>
          <p>{mission.description}</p>
          <div className="reward-row"><span className="reward-chip">⭐ +{mission.starReward}</span><span className="reward-chip">⚡ +{mission.energyReward}</span></div>
          <Button type="button" className="primary-button" onClick={acceptMission} disabled={!mission || Boolean(enrollment) || isBusy}>
            {status === "completed" ? "任務完成" : status === "awaiting_verification" ? "等待店家確認" : isBusy ? "接取中…" : "接取任務"}
          </Button>
          {status === "awaiting_verification" ? <div className="mission-feedback accepted-feedback">✓ 已放進背包，完成後請店家確認</div> : null}
          {status === "completed" ? <div className="mission-feedback completion-banner"><strong>森林收到新的能量了！</strong><span>⭐ +{mission.starReward}　⚡ +{mission.energyReward}</span></div> : null}
        </section>
      ) : (
        <section className="mobile-card mobile-empty-card">
          <div className="mobile-empty-icon">🏪</div>
          <p className="card-kicker">合作店家</p>
          <h2>附近還沒有合作夥伴</h2>
          <p>平台目前沒有已通過審核的合作店家，因此還沒有可以接取的任務。</p>
          <p className="mobile-empty-note">店家加入並通過平台審核後，新的蔬食任務就會出現在這裡。</p>
          <Button type="button" className="secondary-button" onClick={syncProgress} disabled={isBusy}>{isBusy ? "更新中…" : "重新看看"}</Button>
        </section>
      )}

      {feedback === "accepted" ? <div className="floating-feedback">🎒 任務已接取</div> : null}
      {feedback === "completed" ? <div className="floating-feedback reward-feedback">✨ 獎勵已入帳</div> : null}

      <section className="mobile-world-card" aria-label="Looper Forest 森林場景">
        <div className="mobile-world-copy">
          <div><p className="eyebrow">你的 Looper Space</p><h1>從一餐蔬食，養出一座森林。</h1></div>
          <p>土撥鼠和兔兔會陪著每一次真實行動，一點一點把這裡變得更好。</p>
        </div>
        <div className="mobile-scene">
          <div className="mobile-tree mobile-tree-left">🌳</div>
          <div className="mobile-companions"><span className="mobile-marmot">•ᴥ•</span><span className="mobile-rabbit">ᵔᴗᵔ</span></div>
          <div className="mobile-camp">⛺ 🔥</div>
        </div>
        <div className="mobile-growth">🌿 {growthStage}</div>
      </section>

      <p className="mobile-message" aria-live="polite">{message}</p>

      <nav className="mobile-nav" aria-label="主要導覽">
        <button type="button" className="active"><span>⌂</span>首頁</button>
        <button type="button"><span>✓</span>任務</button>
        <button type="button"><span>♣</span>森林</button>
        <button type="button"><span>⌂</span>店家</button>
      </nav>
    </main>
  );
}
