"use client";

import type { MerchantProfile, Mission, TaskCodeSubmission, TaskCodeSubmissionPlayerResult, UserProgress } from "@looper/types";
import { TASK_CODE_LENGTH } from "@looper/types";
import { Button } from "@looper/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getOrCreateSubmissionKey, normalizeTaskCode, settledDisplay, shouldPollSubmission, validateTaskCode, type PlayerTaskCodeAttempt } from "./task-code-flow";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const USER_ID = "user-demo";
const SUBMISSION_STORAGE_KEY = `looper.web.taskCodeSubmission.${USER_ID}`;

function statusCopy(status?: string) {
  if (status === "settled" || status === "completed") return "已完成";
  if (status === "pending" || status === "awaiting_verification") return "等待店員確認";
  if (status === "rejected") return "已拒絕";
  if (status === "expired") return "已逾時";
  return "可提交";
}

function kg(grams = 0) {
  return (grams / 1000).toLocaleString("zh-TW", { maximumFractionDigits: 1 });
}

function remainingText(expiresAt?: string, now = Date.now()) {
  if (!expiresAt) return "";
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function loadStoredAttempt(): PlayerTaskCodeAttempt | null {
  try {
    const raw = window.localStorage.getItem(SUBMISSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) as PlayerTaskCodeAttempt : null;
  } catch {
    return null;
  }
}

function saveStoredAttempt(attempt: PlayerTaskCodeAttempt | null) {
  if (!attempt) {
    window.localStorage.removeItem(SUBMISSION_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(SUBMISSION_STORAGE_KEY, JSON.stringify(attempt));
}

function SettlementPanel({ result }: { result?: TaskCodeSubmissionPlayerResult | null }) {
  if (!result || result.status !== "settled") return null;
  const display = settledDisplay(result);
  return (
    <div className="settlement-panel" aria-live="polite">
      <strong>核銷完成</strong>
      <div className="settlement-grid">
        <span>基礎⭐ +{display.stars}</span>
        <span>寶箱⭐ +{display.chestStars}</span>
        <span>⚡ +{display.energy}</span>
        <span>EXP +{display.exp}</span>
        <span>減碳 +{kg(display.carbonGrams)} kg</span>
        <span>LV.{display.levelBefore} → LV.{display.levelAfter}</span>
      </div>
      {display.resources ? <p>結算後：⭐ {display.resources.starBalance}｜⚡ {display.resources.currentEnergy}/{display.resources.maxEnergy}｜EXP {display.resources.currentExp}</p> : null}
      {result.growthResult ? <p>森林：🌱 {result.growthResult.seedCount}｜🪴 {result.growthResult.plantCount}｜🌳 {result.growthResult.treeCount}</p> : null}
    </div>
  );
}

export default function Page() {
  const [mission, setMission] = useState<Mission | null>(null);
  const [merchant, setMerchant] = useState<MerchantProfile | null>(null);
  const [user, setUser] = useState<UserProgress | null>(null);
  const [taskCode, setTaskCode] = useState("");
  const [attempt, setAttempt] = useState<PlayerTaskCodeAttempt | null>(null);
  const [submissionResult, setSubmissionResult] = useState<TaskCodeSubmissionPlayerResult | null>(null);
  const [message, setMessage] = useState("正在喚醒 Looper Forest...");
  const [isBusy, setIsBusy] = useState(false);
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);
  const [now, setNow] = useState(Date.now());
  const hydrated = useRef(false);

  const refresh = useCallback(async () => {
    const [missionsResponse, merchantsResponse, userResponse] = await Promise.all([
      fetch(`${API_URL}/missions`),
      fetch(`${API_URL}/merchants`),
      fetch(`${API_URL}/users/${USER_ID}/state`),
    ]);
    if (!missionsResponse.ok || !merchantsResponse.ok || !userResponse.ok) throw new Error("無法讀取 Looper 資料");

    const missions = (await missionsResponse.json()) as Mission[];
    const merchants = (await merchantsResponse.json()) as MerchantProfile[];
    const nextUser = (await userResponse.json()) as UserProgress;
    const nextMission = missions[0] ?? null;

    setMission(nextMission);
    setMerchant(nextMission ? merchants.find((item) => item.id === nextMission.merchantId) ?? null : null);
    setUser(nextUser);
    setMessage(missions.length
      ? "任務與資源已同步，任務碼結果會由後端 settlement 回傳。"
      : "附近還沒有合作夥伴，等店家審核通過後任務會出現在這裡。");
  }, []);

  const fetchSubmissionResult = useCallback(async (submissionId: string) => {
    const response = await fetch(`${API_URL}/task-code-submissions/${submissionId}?userId=${USER_ID}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "查詢任務碼結果失敗");
    const result = data as TaskCodeSubmissionPlayerResult;
    setSubmissionResult(result);
    if (result.status === "settled") {
      const nextAttempt = { missionId: result.missionId, merchantId: result.merchantId, submissionId: result.submissionId, idempotencyKey: attempt?.idempotencyKey ?? "", status: "settled" as const };
      setAttempt(nextAttempt);
      saveStoredAttempt(nextAttempt);
      setMessage("核銷完成，獎勵與資源已由後端入帳。");
      await refresh();
    } else if (result.status === "rejected" || result.status === "expired") {
      setAttempt(null);
      saveStoredAttempt(null);
      setMessage(result.status === "rejected" ? "店員已拒絕這次核銷，請確認後重新提交。" : "等待確認時間已逾時，請重新提交任務碼。");
    } else if (result.status === "pending") {
      setMessage("等待店員確認。");
    }
    return result;
  }, [attempt?.idempotencyKey, refresh]);

  useEffect(() => {
    refresh().catch(() => setMessage("目前無法連線到 Looper API。"));
  }, [refresh]);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const stored = loadStoredAttempt();
    if (!stored) return;
    setAttempt(stored);
    if (stored.submissionId) {
      fetchSubmissionResult(stored.submissionId).catch(() => setMessage("已恢復待確認任務，但暫時無法同步結果。"));
    }
  }, [fetchSubmissionResult]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!attempt?.submissionId || !shouldPollSubmission(attempt.status)) return undefined;
    const poll = window.setInterval(() => {
      fetchSubmissionResult(attempt.submissionId!).catch(() => setMessage("查詢任務碼結果失敗，稍後會再試一次。"));
    }, 3000);
    return () => window.clearInterval(poll);
  }, [attempt, fetchSubmissionResult]);

  async function submitTaskCode() {
    if (!mission || isSubmittingCode) return;
    const error = validateTaskCode(taskCode);
    if (error) {
      setMessage(error);
      return;
    }
    const idempotencyKey = getOrCreateSubmissionKey(attempt?.missionId === mission.id ? attempt.idempotencyKey : undefined, () => crypto.randomUUID());
    const optimisticAttempt: PlayerTaskCodeAttempt = { missionId: mission.id, merchantId: mission.merchantId, idempotencyKey, status: "idle" };
    setAttempt(optimisticAttempt);
    saveStoredAttempt(optimisticAttempt);
    setIsSubmittingCode(true);
    setMessage("正在送出任務碼...");
    try {
      const response = await fetch(`${API_URL}/task-code-submissions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: USER_ID, missionId: mission.id, merchantId: mission.merchantId, code: taskCode, idempotencyKey }),
      });
      const data = await response.json();
      if (!response.ok) {
        setAttempt(null);
        saveStoredAttempt(null);
        setMessage(data.message ?? "任務碼提交失敗，請重新確認。");
        return;
      }
      const submission = data as TaskCodeSubmission;
      const nextAttempt: PlayerTaskCodeAttempt = { missionId: mission.id, merchantId: mission.merchantId, submissionId: submission.id, idempotencyKey, status: submission.status };
      setAttempt(nextAttempt);
      saveStoredAttempt(nextAttempt);
      setSubmissionResult({
        submissionId: submission.id,
        status: submission.status,
        merchantId: submission.merchantId,
        missionId: submission.missionId,
        submittedAt: submission.submittedAt,
        confirmationExpiresAt: submission.confirmationExpiresAt,
      });
      setMessage("等待店員確認。");
    } catch {
      setMessage("網路中斷，請按送出重試；系統會沿用同一個提交 key。");
    } finally {
      setIsSubmittingCode(false);
    }
  }

  async function syncProgress() {
    setIsBusy(true);
    setMessage("正在同步後端帳本...");
    try {
      await refresh();
      if (attempt?.submissionId) await fetchSubmissionResult(attempt.submissionId);
    } catch {
      setMessage("同步失敗，請稍後再試。");
    } finally {
      setIsBusy(false);
    }
  }

  const resources = user?.resources;
  const growth = user?.growth;
  const displayedStatus = submissionResult?.status ?? attempt?.status;
  const carbonProgress = useMemo(() => Math.min(100, ((growth?.carbonBalanceGrams ?? 0) / 2000) * 100), [growth?.carbonBalanceGrams]);
  const expProgress = useMemo(() => {
    if (!resources) return 0;
    if (resources.isMaxLevel || resources.nextLevelExp === null) return 100;
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
          <div className="energy-head"><strong>EXP</strong><span>{resources?.isMaxLevel ? "已達目前最高等級" : `${resources?.currentExp ?? 0} / ${resources?.nextLevelExp ?? 500}`}</span></div>
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
        <section className={`mobile-card mobile-mission-card status-${displayedStatus ?? "available"}`}>
          <div className="mobile-card-head"><span>今日任務</span><span className="status-chip">{statusCopy(displayedStatus)}</span></div>
          <h2>{mission.title}</h2>
          <p>{merchant?.storeName ? `${merchant.storeName}｜` : ""}{mission.description}</p>
          <div className="reward-row">
            <span className="reward-chip">⭐ 依店家規則</span>
            <span className="reward-chip">⚡ +{mission.energyReward}</span>
            <span className="reward-chip">EXP +{mission.expReward}</span>
            <span className="reward-chip">CO₂ {kg(mission.carbonGrams)} kg</span>
          </div>
          <div className="task-code-panel">
            <label className="task-code-field">
              <span>輸入店家4碼任務碼</span>
              <input inputMode="numeric" pattern="[0-9]*" maxLength={TASK_CODE_LENGTH} placeholder="0000" value={taskCode} onChange={(event) => setTaskCode(normalizeTaskCode(event.target.value))} disabled={isSubmittingCode || shouldPollSubmission(displayedStatus)} />
            </label>
            <Button type="button" className="primary-button" onClick={submitTaskCode} disabled={!mission || isSubmittingCode || shouldPollSubmission(displayedStatus)}>
              {isSubmittingCode ? "送出中..." : shouldPollSubmission(displayedStatus) ? "等待店員確認" : "送出任務碼"}
            </Button>
            {submissionResult?.status === "pending" ? <div className="mission-feedback accepted-feedback">等待店員確認，剩餘 {remainingText(submissionResult.confirmationExpiresAt, now)}</div> : null}
            {submissionResult?.status === "rejected" ? <div className="mission-feedback error-feedback">店員已拒絕，請確認後重新提交。</div> : null}
            {submissionResult?.status === "expired" ? <div className="mission-feedback error-feedback">確認時間已逾時，請重新提交。</div> : null}
          </div>
          <SettlementPanel result={submissionResult} />
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
        <button type="button" className="active"><span>✓</span>任務</button>
        <button type="button"><span>♣</span>森林</button>
        <button type="button"><span>⌂</span>店家</button>
      </nav>
    </main>
  );
}
