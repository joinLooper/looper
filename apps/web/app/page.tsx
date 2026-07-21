"use client";

import type {
  MerchantProfile,
  Mission,
  PlayerEventNextResult,
  PlayerEventQueueItem,
  PlayerEventResolutionOutcome,
  PlayerEventResolveResult,
  TaskCodeSubmission,
  TaskCodeSubmissionPlayerResult,
  UserProgress,
} from "@looper/types";
import { TASK_CODE_LENGTH } from "@looper/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AssetButton,
  AssetSurface,
  FocusAsset,
  ProgressMeter,
  ResourceChip,
  UiIcon,
} from "./ui-primitives";
import { type UiAssetId, uiAssetPath } from "./ui-assets";
import { RuntimeAssemblyRenderer } from "./runtime-assembly-renderer";
import { KnowledgeCard } from "./knowledge-card";
import {
  getOrCreateResolutionState,
  loadResolutionState,
  playerEventCard,
  reconcileResolutionState,
  saveResolutionState,
  type PlayerEventResolutionState,
} from "./player-event-flow";
import {
  getOrCreateSubmissionKey,
  normalizeTaskCode,
  settledDisplay,
  shouldPollSubmission,
  validateTaskCode,
  type PlayerTaskCodeAttempt,
} from "./task-code-flow";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const USER_ID = "user-demo";
const SUBMISSION_STORAGE_KEY = `looper.web.taskCodeSubmission.${USER_ID}`;

type Screen = "home" | "missions" | "exchange" | "forest" | "settings";
type ConnectionState = "loading" | "connected" | "offline";
type TaskVisualState =
  | "loading"
  | "available"
  | "in_progress"
  | "completed"
  | "claimed"
  | "unavailable"
  | "expired";

interface PlayerViewModel {
  id: string;
  displayName: string;
  level: number;
  exp: number;
  nextLevelExp: number;
  stars: number;
  carbonKg: number;
  carbonTargetKg: number;
}

const emptyPlayer: PlayerViewModel = {
  id: USER_ID,
  displayName: "Looper 旅人",
  level: 1,
  exp: 0,
  nextLevelExp: 1,
  stars: 0,
  carbonKg: 0,
  carbonTargetKg: 1,
};

interface TaskCardModel {
  id: string;
  title: string;
  description: string;
  reward: string;
  icon: UiAssetId;
  state: TaskVisualState;
  actionLabel: string;
}

const forestActions = [
  { label: "澆水", state: "靜態預覽", icon: "ui_icon_water" as UiAssetId },
  { label: "整理樹屋", state: "靜態預覽", icon: "ui_icon_tidy" as UiAssetId },
  { label: "準備點心", state: "靜態預覽", icon: "ui_icon_snack" as UiAssetId },
] as const;

const knowledgeTask: TaskCardModel = {
  id: "approved-sustainable-knowledge-card",
  title: "永續小知識",
  description: "回答一題永續生活問題；EXP 尚待正式入帳。",
  reward: "+30 EXP",
  icon: "ui_icon_knowledge",
  state: "available",
  actionLabel: "開始作答",
};

function IconButton({
  icon,
  label,
  onClick,
  selected = false,
}: {
  icon: UiAssetId;
  label: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      className="asset-icon-button ui-control"
      aria-label={label}
      aria-pressed={selected || undefined}
      onClick={onClick}
    >
      <img
        className="asset-icon-button__art"
        src={uiAssetPath("ui_icon_button", selected ? "selected" : "default")}
        alt=""
        aria-hidden="true"
      />
      <UiIcon assetId={icon} />
      <FocusAsset />
    </button>
  );
}

function TaskCard({
  task,
  onAction,
}: {
  task: TaskCardModel;
  onAction: () => void;
}) {
  const actionLabel = task.actionLabel;
  return (
    <AssetSurface
      assetId="ui_task_card"
      state={task.state}
      className="task-card"
      as="article"
      label={`${task.title}，${actionLabel}`}
    >
      <div className="task-card__icon">
        <UiIcon assetId={task.icon} />
      </div>
      <div className="task-card__copy">
        <div className="task-card__title-row">
          <h3>{task.title}</h3>
          <span className={`task-state task-state--${task.state}`}>
            {task.state === "claimed" || task.state === "completed"
              ? "已完成"
              : task.state === "in_progress"
                ? "進行中"
                : "可進行"}
          </span>
        </div>
        <p>{task.description}</p>
        <strong className="task-card__reward">{task.reward}</strong>
      </div>
      <button
        type="button"
        className="task-card__action ui-control"
        onClick={onAction}
        disabled={task.state === "claimed" || task.state === "completed" || task.state === "loading"}
      >
        {actionLabel}
        <UiIcon
          assetId={
            task.state === "claimed" || task.state === "completed" ? "ui_icon_success" : "ui_icon_chevron"
          }
        />
      </button>
    </AssetSurface>
  );
}

function loadStoredAttempt(): PlayerTaskCodeAttempt | null {
  try {
    const raw = window.localStorage.getItem(SUBMISSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PlayerTaskCodeAttempt) : null;
  } catch {
    return null;
  }
}

function saveStoredAttempt(attempt: PlayerTaskCodeAttempt | null) {
  if (!attempt) window.localStorage.removeItem(SUBMISSION_STORAGE_KEY);
  else window.localStorage.setItem(SUBMISSION_STORAGE_KEY, JSON.stringify(attempt));
}

function loadStoredResolution(): PlayerEventResolutionState | null {
  try {
    return loadResolutionState(window.localStorage, USER_ID);
  } catch {
    return null;
  }
}

function saveStoredResolution(state: PlayerEventResolutionState | null) {
  try {
    saveResolutionState(window.localStorage, USER_ID, state);
  } catch {
    // Backend queue remains canonical when storage is unavailable.
  }
}

function SettlementPanel({ result, onViewEvents }: { result: TaskCodeSubmissionPlayerResult | null; onViewEvents: () => void }) {
  if (!result || result.status !== "settled") return null;
  const display = settledDisplay(result);
  return (
    <AssetSurface assetId="ui_settlement_card" state="settled" className="settlement-card settlement-card--complete" as="section" label="任務核銷已完成">
      <UiIcon assetId="ui_icon_success" />
      <div>
        <h2>核銷完成</h2>
        <div className="settlement-summary">
          <span>基礎⭐ +{display.stars}</span>
          <span>寶箱⭐ +{display.chestStars}</span>
          <span>EXP +{display.exp}</span>
          <span>⚡ +{display.energy}</span>
          <span>CO₂e +{display.carbonGrams} g</span>
          <span>Lv.{display.levelBefore} → Lv.{display.levelAfter}</span>
        </div>
        {display.resources ? <p>結算後：⭐ {display.resources.starBalance}｜⚡ {display.resources.currentEnergy}/{display.resources.maxEnergy}｜EXP {display.resources.currentExp}</p> : null}
        {result.growthResult ? <p>森林：🌱 {result.growthResult.seedCount}｜🪴 {result.growthResult.plantCount}｜🌳 {result.growthResult.treeCount}</p> : null}
        <button type="button" className="inline-link ui-control" onClick={onViewEvents}>查看升級與解鎖</button>
      </div>
    </AssetSurface>
  );
}

function PlayerEventPanel({ event, loading, error, resolving, onRefresh, onResolve }: {
  event: PlayerEventQueueItem | null;
  loading: boolean;
  error: string;
  resolving: boolean;
  onRefresh: () => void;
  onResolve: (outcome: PlayerEventResolutionOutcome) => void;
}) {
  const card = playerEventCard(event);
  if (!card.visible && !loading && !error) return null;
  return (
    <AssetSurface assetId="ui_dialog" state={error ? "error" : loading ? "loading" : "default"} className="player-event-card" as="section" label="升級與解鎖事件">
      {loading ? <p>正在讀取升級與解鎖...</p> : null}
      {error ? <><p>{error}</p><button type="button" className="inline-link ui-control" onClick={onRefresh}>重試</button></> : null}
      {card.visible ? <div>
        <h2>{card.title}</h2>
        {card.description ? <p>{card.description}</p> : null}
        {card.details.length ? <div className="event-details">{card.details.map((detail) => <span key={detail}>{detail}</span>)}</div> : null}
        <div className="event-actions">
          <AssetButton onClick={() => onResolve("completed")} disabled={resolving}>{resolving ? "處理中..." : card.primaryAction}</AssetButton>
          <AssetButton assetId="ui_button_tertiary" onClick={() => onResolve("skipped")} disabled={resolving}>{card.secondaryAction}</AssetButton>
        </div>
      </div> : null}
    </AssetSurface>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  action,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow ? <span>{eyebrow}</span> : null}
        <h2 id={id}>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export default function Page() {
  const [screen, setScreen] = useState<Screen>("home");
  const [connection, setConnection] = useState<ConnectionState>("loading");
  const [mission, setMission] = useState<Mission | null>(null);
  const [merchant, setMerchant] = useState<MerchantProfile | null>(null);
  const [remoteUser, setRemoteUser] = useState<UserProgress | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [taskCodeOpen, setTaskCodeOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [taskCode, setTaskCode] = useState("");
  const [attempt, setAttempt] = useState<PlayerTaskCodeAttempt | null>(null);
  const [submissionResult, setSubmissionResult] = useState<TaskCodeSubmissionPlayerResult | null>(null);
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);
  const [playerEvent, setPlayerEvent] = useState<PlayerEventQueueItem | null>(null);
  const [eventError, setEventError] = useState("");
  const [isEventLoading, setIsEventLoading] = useState(false);
  const [isResolvingEvent, setIsResolvingEvent] = useState(false);
  const [resolutionState, setResolutionState] = useState<PlayerEventResolutionState | null>(null);
  const [inventoryTab, setInventoryTab] = useState<
    "items" | "vouchers" | "memories"
  >("items");
  const [toast, setToast] = useState("");
  const [reduceMotion, setReduceMotion] = useState(false);
  const hydrated = useRef(false);

  const player = useMemo<PlayerViewModel>(() => {
    if (!remoteUser) return emptyPlayer;
    const resources = remoteUser.resources;
    const carbonKg = remoteUser.growth.carbonBalanceGrams / 1000;
    return {
      id: remoteUser.id,
      displayName: remoteUser.displayName,
      level: resources.currentLevel,
      exp: resources.currentExp,
      nextLevelExp: resources.nextLevelExp ?? Math.max(resources.currentExp, 1),
      stars: resources.starBalance,
      carbonKg,
      carbonTargetKg: Math.max(1, carbonKg),
    };
  }, [remoteUser]);

  const pendingCode = attempt?.status === "pending" || submissionResult?.status === "pending";

  const refreshPlayer = useCallback(async () => {
    setConnection("loading");
    try {
      const [missionsResponse, merchantsResponse, userResponse] = await Promise.all([
        fetch(`${API_URL}/missions`),
        fetch(`${API_URL}/merchants`),
        fetch(`${API_URL}/users/${USER_ID}/state`),
      ]);
      if (!missionsResponse.ok || !merchantsResponse.ok || !userResponse.ok)
        throw new Error("API unavailable");
      const missions = (await missionsResponse.json()) as Mission[];
      const merchants = (await merchantsResponse.json()) as MerchantProfile[];
      const user = (await userResponse.json()) as UserProgress;
      const nextMission = missions[0] ?? null;
      setMission(nextMission);
      setMerchant(nextMission ? merchants.find((item) => item.id === nextMission.merchantId) ?? null : null);
      setRemoteUser(user);
      setConnection("connected");
    } catch {
      setMission(null);
      setMerchant(null);
      setRemoteUser(null);
      setConnection("offline");
    }
  }, []);

  const fetchNextPlayerEvent = useCallback(async () => {
    setIsEventLoading(true);
    setEventError("");
    try {
      const response = await fetch(`${API_URL}/player/events/next?userId=${USER_ID}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "無法取得升級與解鎖事件");
      const nextEvent = (data as PlayerEventNextResult).event;
      setPlayerEvent(nextEvent);
      setResolutionState((current) => {
        const reconciled = reconcileResolutionState(current, nextEvent);
        saveStoredResolution(reconciled);
        return reconciled;
      });
      return nextEvent;
    } catch (error) {
      setEventError(error instanceof Error ? error.message : "無法取得升級與解鎖事件");
      throw error;
    } finally {
      setIsEventLoading(false);
    }
  }, []);

  const fetchSubmissionResult = useCallback(async (submissionId: string) => {
    const response = await fetch(`${API_URL}/task-code-submissions/${submissionId}?userId=${USER_ID}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "查詢任務碼結果失敗");
    const result = data as TaskCodeSubmissionPlayerResult;
    setSubmissionResult(result);
    if (result.status === "settled") {
      const nextAttempt: PlayerTaskCodeAttempt = {
        missionId: result.missionId,
        merchantId: result.merchantId,
        submissionId: result.submissionId,
        idempotencyKey: attempt?.idempotencyKey ?? "",
        status: "settled",
      };
      setAttempt(nextAttempt);
      saveStoredAttempt(nextAttempt);
      setTaskCodeOpen(false);
      setToast("核銷完成，獎勵與資源已由後端入帳。");
      await refreshPlayer();
      await fetchNextPlayerEvent().catch(() => undefined);
    } else if (result.status === "rejected" || result.status === "expired") {
      setAttempt(null);
      saveStoredAttempt(null);
      setTaskCodeOpen(false);
      setToast(result.status === "rejected" ? "店員已拒絕這次核銷。" : "等待確認時間已逾時，請重新提交任務碼。");
    } else if (result.status === "pending") {
      setToast("等待店員確認。");
    }
    return result;
  }, [attempt?.idempotencyKey, fetchNextPlayerEvent, refreshPlayer]);

  useEffect(() => {
    void refreshPlayer();
    void fetchNextPlayerEvent().catch(() => undefined);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(media.matches);
    const handleChange = (event: MediaQueryListEvent) =>
      setReduceMotion(event.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [fetchNextPlayerEvent, refreshPlayer]);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const storedResolution = loadStoredResolution();
    if (storedResolution) setResolutionState(storedResolution);
    const stored = loadStoredAttempt();
    if (!stored) return;
    setAttempt(stored);
    if (stored.submissionId) void fetchSubmissionResult(stored.submissionId).catch(() => setToast("已恢復待確認任務，但暫時無法同步結果。"));
  }, [fetchSubmissionResult]);

  useEffect(() => {
    if (!attempt?.submissionId || !shouldPollSubmission(attempt.status)) return undefined;
    const timer = window.setInterval(() => {
      void fetchSubmissionResult(attempt.submissionId!).catch(() => setToast("查詢任務碼結果失敗，稍後會再試一次。"));
    }, 3000);
    return () => window.clearInterval(timer);
  }, [attempt, fetchSubmissionResult]);

  useEffect(() => {
    if (!taskCodeOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTaskCodeOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [taskCodeOpen]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const activeEnrollment = useMemo(
    () =>
      remoteUser?.enrollments.find((item) => item.missionId === mission?.id),
    [mission?.id, remoteUser?.enrollments],
  );

  const missionTask = useMemo<TaskCardModel | null>(() => {
    if (!mission) return null;
    const terminalStatus = submissionResult?.status;
    const state: TaskVisualState = terminalStatus === "settled"
      ? "completed"
      : pendingCode || activeEnrollment
        ? "in_progress"
        : "available";
    return {
      id: mission.id,
      title: mission.title,
      description: `${mission.description}${merchant ? `・${merchant.brandDisplayName} ${merchant.storeName}` : ""}`,
      reward: "實際獎勵由店家確認後的後端結算提供",
      icon: "ui_icon_task_code",
      state,
      actionLabel: terminalStatus === "settled" ? "查看結算" : pendingCode ? "查看等待狀態" : activeEnrollment ? "輸入任務碼" : "接受任務",
    };
  }, [activeEnrollment, merchant, mission, pendingCode, submissionResult?.status]);

  async function acceptRemoteMission() {
    if (!mission || isBusy || activeEnrollment) {
      setTaskCodeOpen(true);
      return;
    }
    setIsBusy(true);
    try {
      const response = await fetch(`${API_URL}/missions/${mission.id}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: USER_ID }),
      });
      if (!response.ok) throw new Error("accept failed");
      const result = (await response.json()) as { user: UserProgress };
      setRemoteUser(result.user);
      setToast("任務已加入，完成後請輸入店家提供的 4 碼");
      setTaskCodeOpen(true);
    } catch {
      setToast("目前離線，已保留畫面狀態；連線後再重試");
    } finally {
      setIsBusy(false);
    }
  }

  async function submitTaskCode() {
    if (!mission || !merchant || isSubmittingCode) return;
    const validationError = validateTaskCode(taskCode);
    if (validationError) {
      setToast(validationError);
      return;
    }
    const idempotencyKey = getOrCreateSubmissionKey(
      attempt?.missionId === mission.id ? attempt.idempotencyKey : undefined,
      () => crypto.randomUUID(),
    );
    const optimistic: PlayerTaskCodeAttempt = {
      missionId: mission.id,
      merchantId: merchant.id,
      idempotencyKey,
      status: "pending",
    };
    setAttempt(optimistic);
    saveStoredAttempt(optimistic);
    setIsSubmittingCode(true);
    try {
      const response = await fetch(`${API_URL}/task-code-submissions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: USER_ID,
          missionId: mission.id,
          merchantId: merchant.id,
          code: normalizeTaskCode(taskCode),
          idempotencyKey,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "任務碼提交失敗");
      const submission = data as TaskCodeSubmission;
      const nextAttempt: PlayerTaskCodeAttempt = {
        ...optimistic,
        submissionId: submission.id,
        status: submission.status,
      };
      setAttempt(nextAttempt);
      saveStoredAttempt(nextAttempt);
      setSubmissionResult(null);
      setTaskCode("");
      setToast("任務碼已送出，等待店家確認。");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "任務碼提交失敗，請重試。");
    } finally {
      setIsSubmittingCode(false);
    }
  }

  async function resolvePlayerEvent(outcome: PlayerEventResolutionOutcome) {
    if (!playerEvent || isResolvingEvent) return;
    const nextResolution = getOrCreateResolutionState(resolutionState, playerEvent.id, outcome, () => crypto.randomUUID());
    setResolutionState(nextResolution);
    saveStoredResolution(nextResolution);
    setIsResolvingEvent(true);
    setEventError("");
    try {
      const response = await fetch(`${API_URL}/player/events/${playerEvent.id}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: USER_ID, outcome, idempotencyKey: nextResolution.idempotencyKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "處理玩家事件失敗");
      const resolved = (data as PlayerEventResolveResult).event;
      setPlayerEvent(null);
      setResolutionState(reconcileResolutionState(nextResolution, null));
      saveStoredResolution(null);
      setToast(resolved.eventName ? `${resolved.eventName}已記錄。` : "升級與解鎖已記錄。");
      await fetchNextPlayerEvent().catch(() => undefined);
    } catch (error) {
      setEventError(error instanceof Error ? error.message : "處理玩家事件失敗");
    } finally {
      setIsResolvingEvent(false);
    }
  }

  function goTo(nextScreen: Screen) {
    setScreen(nextScreen);
    window.requestAnimationFrame(() =>
      document.querySelector<HTMLElement>("#screen-title")?.focus(),
    );
  }

  const renderHome = () => (
    <>
      <h1 id="screen-title" className="sr-only" tabIndex={-1}>
        首頁
      </h1>
      <section className="home-summary" aria-label="玩家進度摘要">
        <div className="summary-row">
          <ResourceChip label={`等級 ${player.level}`}>
            <span>Lv.</span>
            <strong>{player.level}</strong>
          </ResourceChip>
          <ResourceChip
            label={`星星 ${player.stars}`}
            state={player.stars > 0 ? "gain" : "default"}
          >
            <span aria-hidden="true">★</span>
            <strong>{player.stars.toLocaleString("zh-TW")}</strong>
          </ResourceChip>
        </div>
        <ProgressMeter
          assetId="ui_exp_progress"
          tone="exp"
          label="EXP"
          value={player.exp}
          max={player.nextLevelExp}
          displayValue={`${player.exp} / ${player.nextLevelExp}`}
        />
      </section>

      <section
        className="forest-overview"
        aria-labelledby="forest-overview-title"
      >
        <div className="forest-overview__scene" aria-hidden="true">
          <div className="canopy canopy--left" />
          <div className="canopy canopy--right" />
          <div className="young-tree">
            <span />
            <i />
            <b />
          </div>
          <div className="forest-floor" />
        </div>
        <div className="forest-overview__content">
          <span className="eyebrow">我的森林・幼樹階段</span>
          <h2 id="forest-overview-title">今天也長出了一片新葉</h2>
          <p>完成有效蔬食核銷，真實減碳才會推進森林成長。</p>
          <ProgressMeter
            assetId="ui_carbon_progress"
            tone="carbon"
            label="減碳進度"
            value={player.carbonKg}
            max={player.carbonTargetKg}
            displayValue={`${player.carbonKg.toFixed(1)} / ${player.carbonTargetKg.toFixed(1)} kg CO₂e`}
          />
          <button
            type="button"
            className="inline-link ui-control"
            onClick={() => goTo("forest")}
          >
            <UiIcon assetId="ui_icon_forest_view" />
            進入我的森林
            <UiIcon assetId="ui_icon_chevron" />
          </button>
        </div>
      </section>

      <section className="content-section" aria-labelledby="today-title">
        <SectionHeading
          id="today-title"
          eyebrow={mission ? "中央任務已同步" : "等待任務資料"}
          title="今日任務"
          action={
            <button
              type="button"
              className="text-action ui-control"
              onClick={() => goTo("missions")}
            >
              查看全部
            </button>
          }
        />
        <div className="task-list">
          {missionTask ? (
            <TaskCard task={missionTask} onAction={acceptRemoteMission} />
          ) : (
            <AssetSurface assetId="ui_empty_state" state="no_data" className="empty-panel">
              <UiIcon assetId="ui_icon_task_code" />
              <h3>目前沒有可進行的任務</h3>
              <p>中央任務資料同步後會顯示在這裡。</p>
            </AssetSurface>
          )}
          <TaskCard task={knowledgeTask} onAction={() => setKnowledgeOpen(true)} />
        </div>
      </section>
      <SettlementPanel result={submissionResult} onViewEvents={() => void fetchNextPlayerEvent().catch(() => undefined)} />
      <PlayerEventPanel event={playerEvent} loading={isEventLoading} error={eventError} resolving={isResolvingEvent} onRefresh={() => void fetchNextPlayerEvent().catch(() => undefined)} onResolve={(outcome) => void resolvePlayerEvent(outcome)} />
    </>
  );

  const renderMissions = () => (
    <>
      <h1 id="screen-title" className="screen-title" tabIndex={-1}>
        任務
      </h1>
      <p className="screen-intro">
        每日與本週進度由中央任務實例計算，完成後再由正式結算入帳。
      </p>
      <AssetButton
        className="task-code-button"
        onClick={() => setTaskCodeOpen(true)}
        busy={isBusy}
      >
        <UiIcon assetId="ui_icon_task_code" />
        輸入 4 碼任務碼
      </AssetButton>
      <section className="content-section" aria-labelledby="daily-task-title">
        <SectionHeading
          id="daily-task-title"
          eyebrow="每日更新"
          title="今日任務"
        />
        <div className="task-list">
          {missionTask ? (
            <TaskCard task={missionTask} onAction={acceptRemoteMission} />
          ) : (
            <AssetSurface assetId="ui_empty_state" state="no_data" className="empty-panel">
              <UiIcon assetId="ui_icon_task_code" />
              <h3>目前沒有可進行的任務</h3>
              <p>中央任務資料同步後會顯示在這裡。</p>
            </AssetSurface>
          )}
          <TaskCard task={knowledgeTask} onAction={() => setKnowledgeOpen(true)} />
        </div>
      </section>
      {pendingCode ? (
        <AssetSurface
          assetId="ui_settlement_card"
          state="pending"
          className="settlement-card"
          as="section"
          label="核銷等待店家確認"
        >
          <UiIcon assetId="ui_icon_timer" />
          <div>
            <h2>等待店家確認</h2>
            <p>任務與獎勵尚未永久入帳，可安全離開後再回來查詢。</p>
          </div>
          <UiIcon assetId="ui_icon_sync" />
        </AssetSurface>
      ) : null}
      <SettlementPanel result={submissionResult} onViewEvents={() => void fetchNextPlayerEvent().catch(() => undefined)} />
      <PlayerEventPanel event={playerEvent} loading={isEventLoading} error={eventError} resolving={isResolvingEvent} onRefresh={() => void fetchNextPlayerEvent().catch(() => undefined)} onResolve={(outcome) => void resolvePlayerEvent(outcome)} />
      <button
        type="button"
        className="source-link ui-control"
        onClick={() => setToast("來源：Looper MVP v1.0 Master Spec")}
      >
        <UiIcon assetId="ui_icon_source" />
        查看任務與獎勵來源
      </button>
    </>
  );

  const renderExchange = () => (
    <>
      <h1 id="screen-title" className="screen-title" tabIndex={-1}>
        星星兌換
      </h1>
      <p className="screen-intro">
        只顯示目前持有星星與券價；兌換前可查看接受分店與最低使用保障。
      </p>
      <div className="exchange-balance">
        <ResourceChip label={`可用星星 ${player.stars}`} state="full">
          <span aria-hidden="true">★</span>
          <strong>{player.stars.toLocaleString("zh-TW")}</strong>
          <small>可用星星</small>
        </ResourceChip>
      </div>
      <section className="voucher-grid" aria-label="可兌換平台通用券">
        {[
          { amount: 50, price: 10000, available: false },
          { amount: 100, price: 20000, available: false },
        ].map((voucher) => (
          <AssetSurface
            key={voucher.amount}
            assetId="ui_inventory_card"
            state={voucher.available ? "owned" : "locked"}
            className="voucher-card"
            as="article"
            label={`${voucher.amount} 元平台通用券，${voucher.price} 星星`}
          >
            <UiIcon
              assetId={voucher.available ? "ui_icon_coupon" : "ui_icon_lock"}
              className="voucher-card__icon"
            />
            <span>平台通用券</span>
            <h2>NT$ {voucher.amount}</h2>
            <strong>{voucher.price.toLocaleString("zh-TW")} 星星</strong>
            <AssetButton
              assetId="ui_button_secondary"
              disabled={!voucher.available}
            >
              {voucher.available ? "確認兌換" : "星星不足"}
            </AssetButton>
          </AssetSurface>
        ))}
      </section>
      <AssetSurface
        assetId="ui_speech_bubble_system"
        state="warning"
        className="exchange-note"
        label="兌換提醒"
      >
        <UiIcon assetId="ui_icon_warning" />
        <p>兌換完成後才建立正式持有券；畫面動畫不控制玩家權益。</p>
      </AssetSurface>
      <button
        type="button"
        className="list-row ui-control"
        onClick={() => setToast("我的券已開啟")}
      >
        <UiIcon assetId="ui_icon_vouchers" />
        <span>
          <strong>我的券</strong>
          <small>可用、使用中與歷史紀錄</small>
        </span>
        <UiIcon assetId="ui_icon_chevron" />
      </button>
    </>
  );

  const renderForest = () => (
    <>
      <h1 id="screen-title" className="screen-title" tabIndex={-1}>
        我的森林
      </h1>
      <div className="forest-toolbar" aria-label="森林編輯工具">
        <IconButton icon="ui_icon_preview" label="預覽森林" />
        <IconButton icon="ui_icon_rotate" label="左右轉向" />
        <IconButton icon="ui_icon_save" label="保存配置" selected />
      </div>
      <RuntimeAssemblyRenderer />
      <section
        className="content-section"
        aria-labelledby="forest-actions-title"
      >
        <SectionHeading
          id="forest-actions-title"
          eyebrow="MVP 僅開放靜態預覽"
          title="日常照料動作"
        />
        <div className="action-grid">
          {forestActions.map((action) => (
            <button
              type="button"
              className="action-tile ui-control"
              key={action.label}
              onClick={() =>
                setToast(`${action.label}目前為靜態預覽，動態遮擋仍待完成`)
              }
            >
              <UiIcon assetId={action.icon} />
              <strong>{action.label}</strong>
              <span>{action.state}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="inventory-section" aria-labelledby="inventory-title">
        <SectionHeading
          id="inventory-title"
          title="物品庫"
          action={
            <div className="inventory-shortcuts">
              <IconButton icon="ui_icon_backpack" label="背包" selected />
              <IconButton icon="ui_icon_toolbox" label="道具箱" />
            </div>
          }
        />
        <div className="inventory-tabs" role="tablist" aria-label="物品庫分類">
          {(
            [
              ["items", "小物", "ui_icon_backpack"],
              ["vouchers", "我的券", "ui_icon_vouchers"],
              ["memories", "回憶", "ui_icon_memory"],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              id={`inventory-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={inventoryTab === id}
              aria-controls="inventory-panel"
              className="inventory-tab ui-control"
              onClick={() => setInventoryTab(id)}
            >
              <img
                src={uiAssetPath(
                  "ui_inventory_tab",
                  inventoryTab === id ? "selected" : "default",
                )}
                alt=""
                aria-hidden="true"
              />
              <span>
                <UiIcon assetId={icon} />
                {label}
              </span>
            </button>
          ))}
        </div>
        <div
          id="inventory-panel"
          role="tabpanel"
          aria-labelledby={`inventory-tab-${inventoryTab}`}
          className="inventory-list"
        >
          <AssetSurface
            assetId="ui_empty_state"
            state="no_data"
            className="empty-panel"
          >
            <UiIcon
              assetId={
                inventoryTab === "vouchers"
                  ? "ui_icon_vouchers"
                  : inventoryTab === "memories"
                    ? "ui_icon_memory"
                    : "ui_icon_backpack"
              }
            />
            <h3>
              {inventoryTab === "vouchers"
                ? "目前沒有可用券"
                : inventoryTab === "memories"
                  ? "回憶會留在這裡"
                  : "持有物將在中央資料接線後顯示"}
            </h3>
            <p>完成對應內容後，中央持有紀錄會在這裡顯示。</p>
          </AssetSurface>
        </div>
      </section>
    </>
  );

  const renderSettings = () => (
    <>
      <h1 id="screen-title" className="screen-title" tabIndex={-1}>
        設定
      </h1>
      <p className="screen-intro">
        顯示、動態與輔助功能只影響介面呈現，不改變正式交易或玩家權益。
      </p>
      <section className="settings-group" aria-labelledby="accessibility-title">
        <SectionHeading id="accessibility-title" title="輔助使用" />
        <label className="setting-row">
          <UiIcon assetId={reduceMotion ? "ui_icon_lock" : "ui_icon_unlock"} />
          <span>
            <strong>減少動態效果</strong>
            <small>停用非必要位移、閃爍與循環動畫</small>
          </span>
          <input
            type="checkbox"
            checked={reduceMotion}
            onChange={(event) => setReduceMotion(event.target.checked)}
          />
        </label>
        <div className="setting-row">
          <UiIcon assetId="ui_icon_info" />
          <span>
            <strong>文字大小</strong>
            <small>跟隨 iOS Dynamic Type 或 Android 系統字級</small>
          </span>
          <UiIcon assetId="ui_icon_chevron" />
        </div>
        <div className="setting-row">
          <UiIcon assetId="ui_icon_question" />
          <span>
            <strong>輔助說明</strong>
            <small>VoiceOver 與 TalkBack 操作提示</small>
          </span>
          <UiIcon assetId="ui_icon_chevron" />
        </div>
      </section>
      <section className="settings-group" aria-labelledby="connection-title">
        <SectionHeading id="connection-title" title="資料與連線" />
        <div className="setting-row">
          <UiIcon
            assetId={
              connection === "connected"
                ? "ui_icon_success"
                : connection === "loading"
                  ? "ui_icon_loading"
                  : "ui_icon_offline"
            }
            className={connection === "loading" ? "spinning-icon" : ""}
          />
          <span>
            <strong>
              {connection === "connected"
                ? "已連上中央資料"
                : connection === "loading"
                  ? "正在同步"
                  : "離線預覽"}
            </strong>
            <small>
              {connection === "offline"
                ? "顯示規格預覽資料，不會寫入正式帳本"
                : "玩家資源由後端回傳"}
            </small>
          </span>
          <button
            type="button"
            className="retry-button ui-control"
            onClick={() => void refreshPlayer()}
          >
            <UiIcon assetId="ui_icon_retry" />
            <span className="sr-only">重新同步</span>
          </button>
        </div>
        <button
          type="button"
          className="setting-row setting-row--button ui-control"
          onClick={() => setToast("同步狀態已更新")}
        >
          <UiIcon assetId="ui_icon_sync" />
          <span>
            <strong>上次同步</strong>
            <small>剛剛</small>
          </span>
          <UiIcon assetId="ui_icon_chevron" />
        </button>
      </section>
      {connection === "offline" ? (
        <AssetSurface
          assetId="ui_empty_state"
          state="offline"
          className="offline-panel"
          label="離線預覽"
        >
          <UiIcon assetId="ui_icon_error" />
          <div>
            <h2>中央 API 尚未連線</h2>
            <p>目前可檢查完整玩家介面；正式資源與交易動作維持唯讀。</p>
          </div>
        </AssetSurface>
      ) : connection === "loading" ? (
        <AssetSurface
          assetId="ui_skeleton"
          state={reduceMotion ? "reduced_motion" : "static"}
          className="loading-panel"
        >
          <span className="sr-only">正在載入設定資料</span>
        </AssetSurface>
      ) : null}
      <AssetButton
        assetId="ui_button_tertiary"
        onClick={() => setToast("客服與必要說明已開啟")}
      >
        <UiIcon assetId="ui_icon_menu" />
        必要說明與客服
      </AssetButton>
    </>
  );

  const screens: Record<Screen, () => React.ReactNode> = {
    home: renderHome,
    missions: renderMissions,
    exchange: renderExchange,
    forest: renderForest,
    settings: renderSettings,
  };
  const navigation = [
    {
      id: "missions" as const,
      label: "任務",
      icon: "ui_icon_nav_mission" as UiAssetId,
    },
    {
      id: "exchange" as const,
      label: "星星兌換",
      icon: "ui_icon_nav_exchange" as UiAssetId,
    },
    {
      id: "forest" as const,
      label: "我的森林",
      icon: "ui_icon_nav_forest" as UiAssetId,
    },
    {
      id: "settings" as const,
      label: "設定",
      icon: "ui_icon_nav_settings" as UiAssetId,
    },
  ];

  return (
    <main className={`player-shell ${reduceMotion ? "reduce-motion" : ""}`}>
      <div
        className="player-app"
        aria-hidden={taskCodeOpen || knowledgeOpen || undefined}
        inert={taskCodeOpen || knowledgeOpen || undefined}
      >
        {connection !== "connected" ? (
          <div
            className={`connection-banner connection-banner--${connection}`}
            role="status"
          >
            <UiIcon
              assetId={
                connection === "loading" ? "ui_icon_loading" : "ui_icon_offline"
              }
              className={connection === "loading" ? "spinning-icon" : ""}
            />
            <span>
              {connection === "loading"
                ? "正在同步中央資料"
                : "離線預覽・正式交易維持唯讀"}
            </span>
          </div>
        ) : null}
        <header className="player-header">
          <button
            type="button"
            className="profile-home ui-control"
            aria-label="返回首頁"
            onClick={() => goTo("home")}
          >
            <UiIcon assetId="ui_icon_profile" className="profile-icon" />
            <span>
              <small>早安</small>
              <strong>{player.displayName}</strong>
            </span>
            <UiIcon assetId="ui_icon_home" className="home-mark" />
          </button>
          <IconButton icon="ui_icon_notification" label="通知" />
        </header>

        <div className="screen-content">{screens[screen]()}</div>

        <nav className="bottom-navigation" aria-label="主要導覽">
          {navigation.map((item) => {
            const selected = screen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className="bottom-navigation__item ui-control"
                aria-current={selected ? "page" : undefined}
                onClick={() => goTo(item.id)}
              >
                <img
                  className="bottom-navigation__art"
                  src={uiAssetPath(
                    "ui_bottom_nav_item",
                    selected ? "selected" : "default",
                  )}
                  alt=""
                  aria-hidden="true"
                />
                <span>
                  <UiIcon
                    assetId={item.icon}
                    state={selected ? "focused" : "default"}
                  />
                  <small>{item.label}</small>
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {taskCodeOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setTaskCodeOpen(false);
          }}
        >
          <AssetSurface
            assetId="ui_dialog"
            state={pendingCode ? "loading" : "default"}
            className="task-code-dialog"
            labelledBy="task-code-title"
            role="dialog"
            ariaModal
          >
            <div className="dialog-actions">
              <button
                type="button"
                className="dialog-icon-button ui-control"
                aria-label="返回"
                onClick={() => setTaskCodeOpen(false)}
              >
                <UiIcon assetId="ui_icon_back" />
              </button>
              <button
                type="button"
                className="dialog-icon-button ui-control"
                aria-label="關閉"
                onClick={() => setTaskCodeOpen(false)}
              >
                <UiIcon assetId="ui_icon_close" />
              </button>
            </div>
            <UiIcon
              assetId={pendingCode ? "ui_icon_timer" : "ui_icon_task_code"}
              className="dialog-hero-icon"
            />
            <h2 id="task-code-title">
              {pendingCode ? "等待店家確認" : "輸入店家提供的 4 碼"}
            </h2>
            <p id="task-code-help">
              送出後會建立 merchant pending；正式獎勵會在店家確認並完成 settled
              後入帳。
            </p>
            {pendingCode ? (
              <AssetSurface
                assetId="ui_settlement_card"
                state="pending"
                className="dialog-pending"
              >
                <UiIcon assetId="ui_icon_sync" className="spinning-icon" />
                <span>可以安全離開，稍後回來查詢原結果。</span>
              </AssetSurface>
            ) : (
              <>
                <label className="task-code-label" htmlFor="task-code">
                  4 碼任務碼
                </label>
                <input
                  id="task-code"
                  className="task-code-input"
                  value={taskCode}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={TASK_CODE_LENGTH}
                  aria-describedby="task-code-help"
                  autoFocus
                  onChange={(event) => setTaskCode(normalizeTaskCode(event.target.value))}
                />
                <AssetButton
                  onClick={submitTaskCode}
                  busy={isSubmittingCode}
                  disabled={Boolean(validateTaskCode(taskCode)) || !mission || !merchant}
                >
                  送出任務碼
                </AssetButton>
                <AssetButton
                  assetId="ui_button_tertiary"
                  onClick={() => {
                    setTaskCode("");
                    setTaskCodeOpen(false);
                  }}
                >
                  <UiIcon assetId="ui_icon_cancel" />
                  取消
                </AssetButton>
              </>
            )}
          </AssetSurface>
        </div>
      ) : null}

      {knowledgeOpen ? <KnowledgeCard onClose={() => setKnowledgeOpen(false)} /> : null}

      {toast ? (
        <AssetSurface
          assetId="ui_toast"
          state={connection === "offline" ? "warning" : "success"}
          className="live-toast"
          label="狀態通知"
        >
          <UiIcon
            assetId={
              connection === "offline" ? "ui_icon_warning" : "ui_icon_success"
            }
          />
          <span role="status" aria-live="polite">
            {toast}
          </span>
        </AssetSurface>
      ) : (
        <span className="sr-only" role="status" aria-live="polite" />
      )}
    </main>
  );
}
