"use client";

import type { Mission, UserProgress } from "@looper/types";
import { Button } from "@looper/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const USER_ID = "user-demo";

function getStatusCopy(status?: string) {
  if (status === "completed") return "已完成";
  if (status === "awaiting_verification") return "等待店家確認";
  return "可以接取";
}

export default function Page() {
  const [mission, setMission] = useState<Mission | null>(null);
  const [user, setUser] = useState<UserProgress | null>(null);
  const [message, setMessage] = useState("正在喚醒森林…");
  const [isBusy, setIsBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [missionsResponse, userResponse] = await Promise.all([
      fetch(`${API_URL}/missions`),
      fetch(`${API_URL}/users/${USER_ID}/state`),
    ]);

    if (!missionsResponse.ok || !userResponse.ok) {
      throw new Error("目前無法進入森林");
    }

    const missions = (await missionsResponse.json()) as Mission[];
    const nextUser = (await userResponse.json()) as UserProgress;
    setMission(missions[0] ?? null);
    setUser(nextUser);
    setMessage("森林已經準備好了。今天也完成一件小事吧！");
  }, []);

  useEffect(() => {
    refresh().catch(() => setMessage("森林正在休息，請確認 Looper API 已啟動。"));
  }, [refresh]);

  async function acceptMission() {
    if (!mission || isBusy) return;

    setIsBusy(true);
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
      setMessage("任務已放進背包！完成蔬食餐點後，請合作店家幫你確認。");
    } catch {
      setMessage("目前無法接取任務，請稍後再試。");
    } finally {
      setIsBusy(false);
    }
  }

  async function syncProgress() {
    setIsBusy(true);
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
    <main className="looper-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">🌱</div>
          <div className="brand-copy">
            <strong>Looper Forest</strong>
            <span>讓每一個小行動，都在森林裡留下改變</span>
          </div>
        </div>

        <div className="resource-row" aria-label="旅人資源">
          <div className="resource-pill">⭐ {user?.stars ?? 0}</div>
          <div className="resource-pill">⚡ {user?.energy ?? 0}</div>
        </div>
      </header>

      <div className="world-grid">
        <section className="world-card" aria-labelledby="world-title">
          <div className="world-sky" />
          <div className="cloud cloud-one" />
          <div className="cloud cloud-two" />

          <div className="world-header">
            <p className="eyebrow">你的 Looper Space</p>
            <h1 id="world-title">從一餐蔬食，養出一座森林。</h1>
            <p>土撥鼠和兔兔正在等你。完成現實裡的小任務，這裡就會一點一點長大。</p>
          </div>

          <div className="forest-stage" aria-label="森林成長場景">
            <div className="hill hill-back" />
            <div className="hill hill-front" />

            <div className="tree tree-left" aria-hidden="true">
              <div className="tree-crown" />
              <div className="tree-trunk" />
            </div>
            <div className="tree tree-right" aria-hidden="true">
              <div className="tree-crown" />
              <div className="tree-trunk" />
            </div>

            <div className="character-group">
              <div className="character marmot">
                <span className="character-face" aria-hidden="true">•ᴥ•</span>
                <span className="character-name">土撥鼠</span>
              </div>
              <div className="character rabbit">
                <span className="character-face" aria-hidden="true">ᵔᴗᵔ</span>
                <span className="character-name">兔兔</span>
              </div>
            </div>

            <div className="camp" aria-hidden="true">
              <div className="tent" />
              <div className="campfire">🔥</div>
            </div>

            <div className="growth-badge">🌿 {growthStage}</div>
          </div>
        </section>

        <aside className="side-stack">
          <section className="side-card status-card">
            <p className="card-kicker">旅人狀態</p>
            <h2>今天的森林能量</h2>
            <div className="energy-block">
              <div className="energy-head">
                <span>能量條</span>
                <span>{energy} / 100</span>
              </div>
              <div className="energy-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={energy}>
                <div className="energy-fill" style={{ width: `${energy}%` }} />
              </div>
            </div>
          </section>

          <section className="side-card mission-card">
            <div className="mission-copy">
              <p className="card-kicker">今日任務</p>
              <h2>{mission?.title ?? "任務準備中"}</h2>
              <p>{mission?.description ?? "森林正在整理今天的任務。"}</p>

              <div className="reward-row">
                <span className="reward-chip">⭐ +{mission?.starReward ?? 0}</span>
                <span className="reward-chip">⚡ +{mission?.energyReward ?? 0}</span>
                <span className={`status-chip ${status === "completed" ? "status-completed" : status === "awaiting_verification" ? "status-waiting" : ""}`}>
                  {getStatusCopy(status)}
                </span>
              </div>

              <Button
                type="button"
                className="primary-button"
                onClick={acceptMission}
                disabled={!mission || Boolean(enrollment) || isBusy}
              >
                {status === "completed"
                  ? "任務完成"
                  : status === "awaiting_verification"
                    ? "等待店家確認"
                    : isBusy
                      ? "放進背包中…"
                      : "接取任務"}
              </Button>

              {status === "completed" ? (
                <div className="completion-banner">森林收到新的能量了！角色和場景會隨著進度繼續成長。</div>
              ) : null}
            </div>
          </section>

          <section className="side-card">
            <p className="card-kicker">進度同步</p>
            <h3>剛完成店家確認嗎？</h3>
            <p>回到這裡更新一次，就能看到星星、能量和森林的新變化。</p>
            <Button type="button" className="secondary-button" onClick={syncProgress} disabled={isBusy}>
              {isBusy ? "更新中…" : "看看新的變化"}
            </Button>
          </section>

          <p className="message-card" aria-live="polite">{message}</p>
        </aside>
      </div>
    </main>
  );
}
