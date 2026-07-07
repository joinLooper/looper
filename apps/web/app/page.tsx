"use client";

import type { Mission, RewardEvent, UserProgress } from "@looper/types";
import { Button } from "@looper/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const USER_ID = "user-demo";

function statusCopy(status?: string) {
  if (status === "completed") return "已完成";
  if (status === "awaiting_verification") return "等待店家確認";
  return "可接取";
}

function kg(grams = 0) {
  return (grams / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 1 });
}

function SettlementPanel({ event }: { event?: RewardEvent }) {
  if (!event) return null;
  const reward = event.rewardPayload;
  const growth = event.growthSummary;
  const level = event.levelSummary;
  return (
    <div className="settlement-panel" aria-live="polite">
      <strong>本次結算已入帳</strong>
      <div className="settlement-grid">
        <span>本次減碳 +{kg(reward.carbonGrams)} kg</span>
        <span>⭐ +{reward.stars}</span>
        <span>⚡ +{reward.energy}</span>
        <span>EXP +{reward.exp}</span>
      </div>
      {growth.generatedSeeds ? <p>🌱 產生 {growth.generatedSeeds} 顆種子</p> : null}
      {growth.generatedPlants ? <p>🪴 10 顆種子已合成 {growth.generatedPlants} 株植物</p> : null}
      {growth.generatedTrees ? <p>🌳 10 株植物已合成 {growth.generatedTrees} 棵樹</p> : null}
      {level.levelsGained ? <p>升級至 LV.{level.currentLevel}，max energy 已提升並補滿。</p> : null}
    </div>
  );
}

export default function Page() {
  const [mission, setMission] = useState<Mission | null>(null);
  const [user, setUser] = useState<UserProgress | null>(null);
  const [message, setMessage] = useState("正在喚醒 Looper Forest...");
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState<"accepted" | null>(null);
  const [latestSettlement, setLatestSettlement] = useState<RewardEvent | undefined>();
  const previousStatus = useRef<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    const [missionsResponse, userResponse] = await Promise.all([
      fetch(`${API_URL}/missions`),
      fetch(`${API_URL}/users/${USER_ID}/state`),
    ]);
    if (!missionsResponse.ok || !userResponse.ok) throw new Error("無法讀取 Looper 資料");

    const missions = (await missionsResponse.json()) as Mission[];
    const nextUser = (await userResponse.json()) as UserProgress;
    const nextMission = missions[0] ?? null;
    const nextEnrollment = nextUser.enrollments.find((item) => item.missionId === nextMission?.id);

    if (previousStatus.current === "awaiting_verification" && nextEnrollment?.status === "completed") {
      setLatestSettlement(nextUser.latestRewardEvent);
    }
    previousStatus.current = nextEnrollment?.status;

    setMission(nextMission);
    setUser(nextUser);
    setMessage(missions.length
      ? "任務與資源已同步，所有資源都來自後端帳本。"
      : "附近還沒有合作夥伴，等店家審核通過後任務會出現在這裡。");
  }, []);

  useEffect(() => {
    refresh().catch(() => setMessage("目前無法連線到 Looper API。"));
  }, [refresh]);

  async function acceptMission() {
    if (!mission || isBusy) return;
    setIsBusy(true);
    setFeedback(null);
    setLatestSettlement(undefined);
    setMessage("正在接取任務...");
    try {
      const response = await fetch(`${API_URL}/missions/${mission.id}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: USER_ID }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.message ?? "接取任務失敗，請稍後再試。");
        return;
      }
      setUser(data.user);
      previousStatus.current = "awaiting_verification";
      setFeedback("accepted");
      setMessage("任務已放進背包，完成蔬食餐點後請合作店家確認。");
    } catch {
      setMessage("接取任務失敗，請確認 Looper API 是否啟動。");
    } finally {
      setIsBusy(false);
    }
  }

  async function syncProgress() {
    setIsBusy(true);
    setFeedback(null);
    setMessage("正在同步後端帳本...");
    try {
      await refresh();
    } catch {
      setMessage("同步失敗，請稍後再試。");
    } finally {
      setIsBusy(false);
    }
  }

  const enrollment = user?.enrollments.find((item) => item.missionId === mission?.id);
  const status = enrollment?.status;
  const resources = user?.resources;
  const growth = user?.growth;
  const carbonProgress = useMemo(() => Math.min(100, ((growth?.carbonBalanceGrams ?? 0) / 2000) * 100), [growth?.carbonBalanceGrams]);
  const expProgress = useMemo(() => {
    if (!resources) return 0;
    const previousThreshold = resources.currentLevel <= 1 ? 0 : resources.nextLevelExp - 500;
    const levelSpan = Math.max(1, resources.nextLevelExp - previousThreshold);
    return Math.min(100, ((resources.currentExp - previousThreshold) / levelSpan) * 100);
  }, [resources]);

  return (
    <main className="mobile-shell">
      <header className="mobile-header">
        <div>
          <p className="mobile-brand">🌱 Looper Forest</p>
          <p className="mobile-tagline">每一次蔬食核銷，都會寫入資源帳本與植物帳本。</p>
        </div>
      </header>

      <section className="mobile-resource-board" aria-label="玩家資源">
        <div className="resource-card"><span>⭐ 星星</span><strong>{resources?.starBalance ?? 0}</strong></div>
        <div className="resource-card"><span>⚡ 能量</span><strong>{resources?.currentEnergy ?? 0} / {resources?.maxEnergy ?? 100}</strong></div>
        <div className="resource-card"><span>LV</span><strong>{resources?.currentLevel ?? 1}</strong></div>
        <div className="resource-card"><span>累積減碳</span><strong>{kg(growth?.carbonTotalGrams)} kg</strong></div>
        <div className="energy-compact">
          <div className="energy-head"><strong>EXP</strong><span>{resources?.currentExp ?? 0} / {resources?.nextLevelExp ?? 500}</span></div>
          <div className="energy-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(expProgress)}>
            <div className="energy-fill exp-fill" style={{ width: `${expProgress}%` }} />
          </div>
        </div>
        <div className="energy-compact">
          <div className="energy-head"><strong>減碳進度</strong><span>{kg(growth?.carbonBalanceGrams)} / 2 kg</span></div>
          <div className="energy-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(carbonProgress)}>
            <div className="energy-fill carbon-fill" style={{ width: `${carbonProgress}%` }} />
          </div>
          <p className="resource-note">距離下一顆種子還差 {kg(Math.max(0, 2000 - (growth?.carbonBalanceGrams ?? 0)))} kg</p>
        </div>
        <div className="growth-counts">
          <span>🌱 {growth?.seedCount ?? 0}</span>
          <span>🪴 {growth?.plantCount ?? 0}</span>
          <span>🌳 {growth?.treeCount ?? 0}</span>
        </div>
      </section>

      {mission ? (
        <section className={`mobile-card mobile-mission-card status-${status ?? "available"}`}>
          <div className="mobile-card-head"><span>今日任務</span><span className="status-chip">{statusCopy(status)}</span></div>
          <h2>{mission.title}</h2>
          <p>{mission.description}</p>
          <div className="reward-row">
            <span className="reward-chip">⭐ +{mission.starReward}</span>
            <span className="reward-chip">⚡ +{mission.energyReward}</span>
            <span className="reward-chip">EXP +{mission.expReward}</span>
            <span className="reward-chip">CO₂ {kg(mission.carbonGrams)} kg</span>
          </div>
          <Button type="button" className="primary-button" onClick={acceptMission} disabled={!mission || Boolean(enrollment) || isBusy}>
            {status === "completed" ? "任務完成" : status === "awaiting_verification" ? "等待店家確認" : isBusy ? "處理中..." : "接取任務"}
          </Button>
          {status === "awaiting_verification" ? <div className="mission-feedback accepted-feedback">✓ 已放進背包，完成後請店家確認</div> : null}
          {feedback === "accepted" ? <div className="mission-feedback accepted-feedback">🎒 任務已接取</div> : null}
          {status === "completed" ? <SettlementPanel event={latestSettlement ?? user?.latestRewardEvent} /> : null}
        </section>
      ) : (
        <section className="mobile-card mobile-empty-card">
          <div className="mobile-empty-icon">🌿</div>
          <p className="card-kicker">合作店家</p>
          <h2>附近還沒有合作夥伴</h2>
          <p>店家通過審核後，蔬食任務會出現在這裡。</p>
          <Button type="button" className="secondary-button" onClick={syncProgress} disabled={isBusy}>{isBusy ? "同步中..." : "重新同步"}</Button>
        </section>
      )}

      <section className="mobile-world-card" aria-label="Looper Forest">
        <div className="mobile-world-copy">
          <div><p className="eyebrow">你的 Looper Space</p><h1>從真實減碳，養出一座森林。</h1></div>
          <p>森林狀態由後端 carbon settlement 與植物成長帳本決定，不再用能量條推算。</p>
        </div>
        <div className="mobile-scene">
          <div className="mobile-tree mobile-tree-left">🌳</div>
          <div className="mobile-companions"><span className="mobile-marmot">•ᴥ•</span><span className="mobile-rabbit">ᵔᴗᵔ</span></div>
          <div className="mobile-camp">⛺ 🔥</div>
        </div>
        <div className="mobile-growth">🌿 種子 {growth?.seedCount ?? 0}｜植物 {growth?.plantCount ?? 0}｜樹 {growth?.treeCount ?? 0}</div>
      </section>

      <p className="mobile-message" aria-live="polite">{message}</p>

      <nav className="mobile-nav" aria-label="底部導覽">
        <button type="button" className="active"><span>⌂</span>首頁</button>
        <button type="button"><span>✓</span>任務</button>
        <button type="button"><span>♣</span>森林</button>
        <button type="button"><span>⌂</span>店家</button>
      </nav>
    </main>
  );
}
