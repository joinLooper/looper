"use client";

import type {
  MerchantProfile,
  Mission,
  PlayerEventNextResult,
  PlayerEventQueueItem,
  PlayerEventResolutionOutcome,
  PlayerEventResolveResult,
  PlayerSessionContext,
  TaskCodeSubmission,
  TaskCodeSubmissionPlayerResult,
  UserProgress,
} from "@looper/types";
import { TASK_CODE_LENGTH } from "@looper/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import {
  AssetButton,
  AssetSurface,
  FocusAsset,
  ProgressMeter,
  ResourceChip,
  UiIcon,
} from "./ui-primitives";
import { type UiAssetId, uiAssetPath } from "./ui-assets";
import { ForestLogicalRuntime } from "./forest-logical-runtime";
import { preloadForestInitialCriticalAssets } from "./forest-runtime";
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
import {
  authenticatedPlayerRequest,
  clearProtectedPlayerStorage,
  loadPlayerSession,
  obtainVerifiedLiffCredential,
  playerMutationRequest,
  type LiffClient,
} from "./player-session-flow";
import {
  RESIDENT_PREVIEW_MODE,
  residentPreviewNotice,
  restaurantExperienceEnabled,
  type ResidentPreviewNotice,
  type ResidentPreviewNoticeId,
} from "./resident-preview";
import {
  buildResidentGrowthView,
  EMPTY_RESIDENT_GROWTH,
  type ResidentGrowthView,
} from "./resident-content";
import { ResidentGuidanceDialog } from "./resident-guidance-dialog";
import {
  RESIDENT_GUIDANCE_STEPS,
  hasCompletedResidentGuidance,
  markResidentGuidanceFinished,
  shouldAutoStartResidentGuidance,
  type ResidentGuidanceState,
} from "./resident-guidance";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const LIFF_ID = process.env.NEXT_PUBLIC_LINE_LIFF_ID;

type Screen = "home" | "missions" | "exchange" | "forest" | "settings";
type ConnectionState = "loading" | "connected" | "offline";
type PlayerSessionState = "checking" | "authenticated" | "unauthenticated" | "error";
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
  nextLevelExp: number | null;
  isMaxLevel: boolean;
  stars: number;
  growth: ResidentGrowthView;
}

const emptyPlayer: PlayerViewModel = {
  id: "",
  displayName: "Looper 居民",
  level: 1,
  exp: 0,
  nextLevelExp: null,
  isMaxLevel: false,
  stars: 0,
  growth: EMPTY_RESIDENT_GROWTH,
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

const knowledgeTask: TaskCardModel = {
  id: "approved-sustainable-knowledge-card",
  title: "永續小知識",
  description: "回答一題永續生活問題，認識自己的生活選擇。",
  reward: "+30 EXP",
  icon: "ui_icon_knowledge",
  state: "available",
  actionLabel: "開始作答",
};

const dailyArrivalTask: TaskCardModel = {
  id: "resident-daily-arrival",
  title: "今日來訪",
  description: "你已安全進入自己的居民空間，今天的旅程可以從這裡開始。",
  reward: "登入本身不會額外變更資源",
  icon: "ui_icon_profile",
  state: "completed",
  actionLabel: "已完成",
};

const restaurantPreviewTask: TaskCardModel = {
  id: "resident-preview-restaurant",
  title: "蔬食餐廳任務",
  description: "城市生活機能準備中；入口保留，正式交易尚未開放。",
  reward: "之後可累積減碳紀錄與居民獎勵",
  icon: "ui_icon_task_code",
  state: "available",
  actionLabel: "看看進度",
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

function submissionStorageKey(userId: string): string {
  return `looper.web.taskCodeSubmission.${userId}`;
}

function loadStoredAttempt(userId: string): PlayerTaskCodeAttempt | null {
  try {
    const raw = window.localStorage.getItem(submissionStorageKey(userId));
    return raw ? (JSON.parse(raw) as PlayerTaskCodeAttempt) : null;
  } catch {
    return null;
  }
}

function saveStoredAttempt(userId: string, attempt: PlayerTaskCodeAttempt | null) {
  if (!attempt) window.localStorage.removeItem(submissionStorageKey(userId));
  else window.localStorage.setItem(submissionStorageKey(userId), JSON.stringify(attempt));
}

function loadStoredResolution(userId: string): PlayerEventResolutionState | null {
  try {
    return loadResolutionState(window.localStorage, userId);
  } catch {
    return null;
  }
}

function saveStoredResolution(userId: string, state: PlayerEventResolutionState | null) {
  try {
    saveResolutionState(window.localStorage, userId, state);
  } catch {
    // Backend queue remains canonical when storage is unavailable.
  }
}

function SettlementPanel({ result, onViewEvents, onDismiss }: { result: TaskCodeSubmissionPlayerResult | null; onViewEvents: () => void; onDismiss: () => void }) {
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
        <button type="button" className="inline-link ui-control" onClick={onDismiss}>關閉結果</button>
      </div>
    </AssetSurface>
  );
}

function UnsettledTerminalPanel({ result, onDismiss }: { result: TaskCodeSubmissionPlayerResult | null; onDismiss: () => void }) {
  if (!result || (result.status !== "rejected" && result.status !== "expired")) return null;
  return (
    <AssetSurface assetId="ui_settlement_card" state="default" className="settlement-card" as="section" label="任務碼最終結果">
      <UiIcon assetId={result.status === "rejected" ? "ui_icon_error" : "ui_icon_timer"} />
      <div>
        <h2>{result.status === "rejected" ? "店家已拒絕" : "確認期限已逾時"}</h2>
        <p>{result.status === "rejected" ? "本次提交未結算，也沒有發放資源。" : "本次提交已由平台標記逾時，請取得新的任務碼後重新提交。"}</p>
        <button type="button" className="inline-link ui-control" onClick={onDismiss}>關閉結果</button>
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

function ResidentPreviewDialog({
  notice,
  onClose,
}: {
  notice: ResidentPreviewNotice;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <AssetSurface
        assetId="ui_dialog"
        state="default"
        className="task-code-dialog resident-preview-dialog"
        labelledBy="resident-preview-title"
        role="dialog"
        ariaModal
      >
        <UiIcon
          assetId={notice.icon ?? "ui_icon_home"}
          className="dialog-hero-icon"
        />
        <h2 id="resident-preview-title">{notice.title}</h2>
        <p>{notice.description}</p>
        <AssetButton onClick={onClose}>{notice.primaryAction}</AssetButton>
        <small className="resident-preview-dialog__auxiliary">{notice.auxiliary}</small>
      </AssetSurface>
    </div>
  );
}

export default function Page() {
  const [sessionState, setSessionState] = useState<PlayerSessionState>("checking");
  const [sessionError, setSessionError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [connection, setConnection] = useState<ConnectionState>("loading");
  const [mission, setMission] = useState<Mission | null>(null);
  const [merchant, setMerchant] = useState<MerchantProfile | null>(null);
  const [remoteUser, setRemoteUser] = useState<UserProgress | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [taskCodeOpen, setTaskCodeOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [previewNotice, setPreviewNotice] = useState<ResidentPreviewNoticeId | null>(null);
  const [taskCode, setTaskCode] = useState("");
  const [attempt, setAttempt] = useState<PlayerTaskCodeAttempt | null>(null);
  const [submissionResult, setSubmissionResult] = useState<TaskCodeSubmissionPlayerResult | null>(null);
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);
  const [playerEvent, setPlayerEvent] = useState<PlayerEventQueueItem | null>(null);
  const [eventError, setEventError] = useState("");
  const [isEventLoading, setIsEventLoading] = useState(false);
  const [isResolvingEvent, setIsResolvingEvent] = useState(false);
  const [resolutionState, setResolutionState] = useState<PlayerEventResolutionState | null>(null);
  const [toast, setToast] = useState("");
  const [reduceMotion, setReduceMotion] = useState(false);
  const [forestCriticalReady, setForestCriticalReady] = useState(false);
  const [residentGuidance, setResidentGuidance] =
    useState<ResidentGuidanceState | null>(null);
  const hydrated = useRef(false);
  const guidanceCheckedResident = useRef<string | null>(null);

  const clearProtectedPlayerState = useCallback(() => {
    setRemoteUser(null);
    setMission(null);
    setMerchant(null);
    setAttempt(null);
    setSubmissionResult(null);
    setPlayerEvent(null);
    setResolutionState(null);
    setTaskCodeOpen(false);
    setKnowledgeOpen(false);
    setPreviewNotice(null);
    setResidentGuidance(null);
    setForestCriticalReady(false);
    setConnection("offline");
    hydrated.current = false;
    guidanceCheckedResident.current = null;
    clearProtectedPlayerStorage(window.localStorage);
  }, []);

  const becomeUnauthenticated = useCallback(() => {
    clearProtectedPlayerState();
    setSessionState("unauthenticated");
  }, [clearProtectedPlayerState]);

  const playerFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const response = await fetch(url, { ...authenticatedPlayerRequest, ...options });
    if (response.status === 401) becomeUnauthenticated();
    return response;
  }, [becomeUnauthenticated]);

  const player = useMemo<PlayerViewModel>(() => {
    if (!remoteUser) return emptyPlayer;
    const resources = remoteUser.resources;
    return {
      id: remoteUser.id,
      displayName: remoteUser.displayName,
      level: resources.currentLevel,
      exp: resources.currentExp,
      nextLevelExp: resources.nextLevelExp,
      isMaxLevel: resources.isMaxLevel,
      stars: resources.starBalance,
      growth: buildResidentGrowthView(remoteUser.growth),
    };
  }, [remoteUser]);

  const pendingCode = attempt?.status === "pending" || submissionResult?.status === "pending";

  const refreshPlayer = useCallback(async () => {
    setConnection("loading");
    try {
      const userResponse = await playerFetch(`${API_URL}/player/state`);
      if (!userResponse.ok) throw new Error("API unavailable");
      const user = (await userResponse.json()) as UserProgress;
      if (restaurantExperienceEnabled()) {
        const [missionsResponse, merchantsResponse] = await Promise.all([
          playerFetch(`${API_URL}/missions`),
          playerFetch(`${API_URL}/merchants`),
        ]);
        if (!missionsResponse.ok || !merchantsResponse.ok) throw new Error("API unavailable");
        const missions = (await missionsResponse.json()) as Mission[];
        const merchants = (await merchantsResponse.json()) as MerchantProfile[];
        const nextMission = missions[0] ?? null;
        setMission(nextMission);
        setMerchant(nextMission ? merchants.find((item) => item.id === nextMission.merchantId) ?? null : null);
      } else {
        setMission(null);
        setMerchant(null);
      }
      setRemoteUser(user);
      setConnection("connected");
    } catch {
      setMission(null);
      setMerchant(null);
      setConnection("offline");
    }
  }, [playerFetch]);

  const fetchNextPlayerEvent = useCallback(async () => {
    setIsEventLoading(true);
    setEventError("");
    try {
      const response = await playerFetch(`${API_URL}/player/events/next`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "無法取得升級與解鎖事件");
      const nextEvent = (data as PlayerEventNextResult).event;
      setPlayerEvent(nextEvent);
      setResolutionState((current) => {
        const reconciled = reconcileResolutionState(current, nextEvent);
        if (remoteUser?.id) saveStoredResolution(remoteUser.id, reconciled);
        return reconciled;
      });
      return nextEvent;
    } catch (error) {
      setEventError(error instanceof Error ? error.message : "無法取得升級與解鎖事件");
      throw error;
    } finally {
      setIsEventLoading(false);
    }
  }, [playerFetch, remoteUser?.id]);

  const fetchSubmissionResult = useCallback(async (submissionId: string) => {
    const response = await playerFetch(`${API_URL}/task-code-submissions/${submissionId}`);
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
      if (remoteUser?.id) saveStoredAttempt(remoteUser.id, nextAttempt);
      setTaskCodeOpen(false);
      setToast("核銷完成，獎勵與資源已由後端入帳。");
      await refreshPlayer();
      await fetchNextPlayerEvent().catch(() => undefined);
    } else if (result.status === "rejected" || result.status === "expired") {
      const nextAttempt: PlayerTaskCodeAttempt = {
        missionId: result.missionId,
        merchantId: result.merchantId,
        submissionId: result.submissionId,
        idempotencyKey: attempt?.idempotencyKey ?? "",
        status: result.status,
      };
      setAttempt(nextAttempt);
      if (remoteUser?.id) saveStoredAttempt(remoteUser.id, nextAttempt);
      setTaskCodeOpen(false);
      setToast(result.status === "rejected" ? "店員已拒絕這次核銷。" : "等待確認時間已逾時，請重新提交任務碼。");
    } else if (result.status === "pending") {
      setToast("等待店員確認。");
    }
    return result;
  }, [attempt?.idempotencyKey, fetchNextPlayerEvent, playerFetch, refreshPlayer, remoteUser?.id]);

  const recoverLostSubmission = useCallback(async (stored: PlayerTaskCodeAttempt) => {
    if (!stored.code) return;
    const response = await playerFetch(`${API_URL}/task-code-submissions`, playerMutationRequest({
      missionId: stored.missionId,
      merchantId: stored.merchantId,
      code: stored.code,
      idempotencyKey: stored.idempotencyKey,
    }));
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "無法恢復先前的任務碼提交");
    const submission = data as TaskCodeSubmission;
    const recovered: PlayerTaskCodeAttempt = { ...stored, code: undefined, submissionId: submission.id, status: submission.status };
    setAttempt(recovered);
    if (remoteUser?.id) saveStoredAttempt(remoteUser.id, recovered);
    await fetchSubmissionResult(submission.id);
  }, [fetchSubmissionResult, playerFetch, remoteUser?.id]);

  useEffect(() => {
    let active = true;
    void loadPlayerSession(API_URL)
      .then(async (session) => {
        if (!active) return;
        if (!session) {
          becomeUnauthenticated();
          return;
        }
        setRemoteUser(session.profile);
        setSessionState("authenticated");
        setSessionError("");
        await refreshPlayer();
      })
      .catch((error) => {
        if (!active) return;
        clearProtectedPlayerState();
        void error;
        setSessionError("暫時無法確認登入狀態，請稍後重試。");
        setSessionState("error");
      });
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(media.matches);
    const handleChange = (event: MediaQueryListEvent) =>
      setReduceMotion(event.matches);
    media.addEventListener("change", handleChange);
    return () => {
      active = false;
      media.removeEventListener("change", handleChange);
    };
  }, [becomeUnauthenticated, clearProtectedPlayerState, refreshPlayer]);

  useEffect(() => {
    if (sessionState !== "authenticated" || !remoteUser?.id || hydrated.current) return;
    hydrated.current = true;
    if (!restaurantExperienceEnabled()) return;
    const storedResolution = loadStoredResolution(remoteUser.id);
    if (storedResolution) setResolutionState(storedResolution);
    const stored = loadStoredAttempt(remoteUser.id);
    void fetchNextPlayerEvent().catch(() => undefined);
    if (!stored) return;
    setAttempt(stored);
    if (stored.submissionId) void fetchSubmissionResult(stored.submissionId).catch(() => setToast("已恢復任務碼結果，但暫時無法同步。"));
    else if (stored.code) void recoverLostSubmission(stored).catch(() => setToast("先前提交可能已成功，請重試以安全恢復結果。"));
  }, [fetchNextPlayerEvent, fetchSubmissionResult, recoverLostSubmission, remoteUser?.id, sessionState]);

  useEffect(() => {
    if (
      sessionState !== "authenticated" ||
      connection !== "connected" ||
      !remoteUser?.id
    ) {
      return;
    }
    let active = true;
    void preloadForestInitialCriticalAssets().then(() => {
      if (active) setForestCriticalReady(true);
    });
    return () => {
      active = false;
    };
  }, [connection, remoteUser?.id, sessionState]);

  useEffect(() => {
    const residentId = remoteUser?.id;
    if (
      !residentId ||
      !forestCriticalReady ||
      guidanceCheckedResident.current === residentId ||
      !shouldAutoStartResidentGuidance({
        previewMode: RESIDENT_PREVIEW_MODE,
        sessionState,
        connection,
        residentId,
        completed: hasCompletedResidentGuidance(window.localStorage, residentId),
      })
    ) {
      return;
    }
    guidanceCheckedResident.current = residentId;
    setScreen("forest");
    setResidentGuidance({ mode: "first_run", stepIndex: 0 });
  }, [connection, forestCriticalReady, remoteUser?.id, sessionState]);

  useEffect(() => {
    if (!restaurantExperienceEnabled()) return undefined;
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
    if (!previewNotice) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewNotice(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewNotice]);

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
    if (!restaurantExperienceEnabled()) return restaurantPreviewTask;
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

  function openResidentNotice(id: ResidentPreviewNoticeId) {
    setTaskCodeOpen(false);
    setPreviewNotice(id);
  }

  function closeResidentNotice() {
    const currentNotice = previewNotice;
    setPreviewNotice(null);
    if (currentNotice === "restaurant") goTo("forest");
  }

  async function acceptRemoteMission() {
    if (!restaurantExperienceEnabled()) {
      openResidentNotice("restaurant");
      return;
    }
    if (!mission || isBusy || activeEnrollment) {
      setTaskCodeOpen(true);
      return;
    }
    setIsBusy(true);
    try {
      const response = await playerFetch(`${API_URL}/missions/${mission.id}/accept`, playerMutationRequest({}));
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
    if (!restaurantExperienceEnabled()) {
      openResidentNotice("restaurant");
      return;
    }
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
      code: normalizeTaskCode(taskCode),
      idempotencyKey,
      status: "pending",
    };
    setAttempt(optimistic);
    if (remoteUser?.id) saveStoredAttempt(remoteUser.id, optimistic);
    setIsSubmittingCode(true);
    try {
      const response = await playerFetch(`${API_URL}/task-code-submissions`, playerMutationRequest({
          missionId: mission.id,
          merchantId: merchant.id,
          code: normalizeTaskCode(taskCode),
          idempotencyKey,
        }));
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "任務碼提交失敗");
      const submission = data as TaskCodeSubmission;
      const nextAttempt: PlayerTaskCodeAttempt = {
        ...optimistic,
        code: undefined,
        submissionId: submission.id,
        status: submission.status,
      };
      setAttempt(nextAttempt);
      if (remoteUser?.id) saveStoredAttempt(remoteUser.id, nextAttempt);
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
    if (remoteUser?.id) saveStoredResolution(remoteUser.id, nextResolution);
    setIsResolvingEvent(true);
    setEventError("");
    try {
      const response = await playerFetch(`${API_URL}/player/events/${playerEvent.id}/resolve`, playerMutationRequest({ outcome, idempotencyKey: nextResolution.idempotencyKey }));
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "處理玩家事件失敗");
      const resolved = (data as PlayerEventResolveResult).event;
      setPlayerEvent(null);
      setResolutionState(reconcileResolutionState(nextResolution, null));
      if (remoteUser?.id) saveStoredResolution(remoteUser.id, null);
      setToast(resolved.eventName ? `${resolved.eventName}已記錄。` : "升級與解鎖已記錄。");
      await fetchNextPlayerEvent().catch(() => undefined);
    } catch (error) {
      setEventError(error instanceof Error ? error.message : "處理玩家事件失敗");
    } finally {
      setIsResolvingEvent(false);
    }
  }

  async function beginLineLogin() {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setSessionError("");
    try {
      const liff = (window as Window & { liff?: LiffClient }).liff;
      const idToken = await obtainVerifiedLiffCredential(liff, LIFF_ID);
      if (!idToken) return;
      const response = await fetch(`${API_URL}/auth/player/line/session`, playerMutationRequest({ idToken }));
      const data = await response.json() as PlayerSessionContext & { message?: string };
      if (!response.ok) throw new Error(data.message ?? "LINE 登入失敗");
      setRemoteUser(data.profile);
      setSessionState("authenticated");
      hydrated.current = false;
      await refreshPlayer();
    } catch (error) {
      clearProtectedPlayerState();
      setSessionState("unauthenticated");
      void error;
      setSessionError("LINE 登入暫時無法完成，請稍後重試。");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function logoutPlayer() {
    try {
      await fetch(`${API_URL}/auth/player/session`, playerMutationRequest(undefined, "DELETE"));
    } finally {
      becomeUnauthenticated();
    }
  }

  function dismissSubmissionResult() {
    setAttempt(null);
    setSubmissionResult(null);
    if (remoteUser?.id) saveStoredAttempt(remoteUser.id, null);
  }

  function goTo(nextScreen: Screen) {
    setPreviewNotice(null);
    setScreen(nextScreen);
    window.requestAnimationFrame(() =>
      document.querySelector<HTMLElement>("#screen-title")?.focus(),
    );
  }

  function replayResidentGuidance() {
    if (!RESIDENT_PREVIEW_MODE || !remoteUser?.id) return;
    setPreviewNotice(null);
    setKnowledgeOpen(false);
    setTaskCodeOpen(false);
    setScreen("forest");
    setResidentGuidance({ mode: "replay", stepIndex: 0 });
  }

  function finishResidentGuidance(outcome: "completed" | "skipped") {
    if (residentGuidance?.mode === "first_run" && remoteUser?.id) {
      markResidentGuidanceFinished(window.localStorage, remoteUser.id, outcome);
    }
    setResidentGuidance(null);
  }

  function advanceResidentGuidance() {
    if (!residentGuidance) return;
    if (residentGuidance.stepIndex >= RESIDENT_GUIDANCE_STEPS.length - 1) {
      finishResidentGuidance("completed");
      goTo("forest");
      return;
    }
    const nextStepIndex = residentGuidance.stepIndex + 1;
    goTo("forest");
    setResidentGuidance({ ...residentGuidance, stepIndex: nextStepIndex });
  }

  function backResidentGuidance() {
    if (!residentGuidance || residentGuidance.stepIndex === 0) return;
    const previousStepIndex = residentGuidance.stepIndex - 1;
    goTo("forest");
    setResidentGuidance({ ...residentGuidance, stepIndex: previousStepIndex });
  }

  const renderHome = () => (
    <>
      <h1 id="screen-title" className="sr-only" tabIndex={-1}>
        居民空間
      </h1>
      <button
        type="button"
        className="resident-profile-card ui-control"
        data-guidance-target="resident-space"
        onClick={() => goTo("forest")}
        aria-label={`${player.displayName}的居民空間，與兔兔居民夥伴一起前往森林`}
      >
        <img
          src="/runtime-assets/v005/exports/char_rabbit_right_3q_runtime.png"
          alt="兔兔居民夥伴"
          draggable={false}
        />
        <span>
          <small>Looper 居民</small>
          <strong>{player.displayName}</strong>
          <span>兔兔與土撥鼠正在居民空間等你</span>
        </span>
        <UiIcon assetId="ui_icon_chevron" />
      </button>
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
          <ResourceChip label={`累積減碳 ${player.growth.carbonTotalKg.toFixed(1)} 公斤`}>
            <span aria-hidden="true">{player.growth.stageIcon}</span>
            <strong>{player.growth.carbonTotalKg.toFixed(1)}</strong>
            <small>kg CO₂e</small>
          </ResourceChip>
        </div>
        <ProgressMeter
          assetId="ui_exp_progress"
          tone="exp"
          label="EXP"
          value={player.exp}
          max={player.nextLevelExp ?? Math.max(player.exp, 1)}
          displayValue={
            player.isMaxLevel || player.nextLevelExp === null
              ? `${player.exp} EXP・最高等級`
              : `${player.exp} / ${player.nextLevelExp}`
          }
        />
      </section>

      <section
        className="forest-overview"
        aria-labelledby="forest-overview-title"
        data-guidance-target="forest-growth"
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
          <span className="eyebrow">
            我的森林・{player.growth.stageIcon} {player.growth.stageLabel}
          </span>
          <h2 id="forest-overview-title">每一份減碳都會留在森林裡</h2>
          <p>{RESIDENT_PREVIEW_MODE ? "先在自己的空間安頓下來，城市生活機能之後會陸續開放。" : "完成有效蔬食核銷，真實減碳才會推進森林成長。"}</p>
          <div className="growth-counts" aria-label="森林成長持有數量">
            <span>🌱 種子 <strong>{player.growth.seedCount}</strong></span>
            <span>🪴 植物 <strong>{player.growth.plantCount}</strong></span>
            <span>🌳 樹木 <strong>{player.growth.treeCount}</strong></span>
          </div>
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

      <section
        className="content-section"
        aria-labelledby="today-title"
        data-guidance-target="today-tasks"
      >
        <SectionHeading
          id="today-title"
          eyebrow={RESIDENT_PREVIEW_MODE ? "居民預覽開放中" : mission ? "中央任務已同步" : "等待任務資料"}
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
          <TaskCard task={dailyArrivalTask} onAction={() => undefined} />
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
      {restaurantExperienceEnabled() ? <><SettlementPanel result={submissionResult} onViewEvents={() => void fetchNextPlayerEvent().catch(() => undefined)} onDismiss={dismissSubmissionResult} /><UnsettledTerminalPanel result={submissionResult} onDismiss={dismissSubmissionResult} /><PlayerEventPanel event={playerEvent} loading={isEventLoading} error={eventError} resolving={isResolvingEvent} onRefresh={() => void fetchNextPlayerEvent().catch(() => undefined)} onResolve={(outcome) => void resolvePlayerEvent(outcome)} /></> : null}
    </>
  );

  const renderMissions = () => (
    <>
      <h1 id="screen-title" className="screen-title" tabIndex={-1}>
        任務
      </h1>
      <p className="screen-intro">
        {RESIDENT_PREVIEW_MODE ? "先看看目前開放的居民活動；城市生活任務會在準備完成後加入。" : "每日與本週進度由中央任務實例計算，完成後再由正式結算入帳。"}
      </p>
      <div data-guidance-target="restaurant-entry">
        <AssetButton
          className="task-code-button"
          onClick={() => restaurantExperienceEnabled() ? setTaskCodeOpen(true) : openResidentNotice("restaurant")}
          busy={isBusy}
        >
          <UiIcon assetId="ui_icon_task_code" />
          {RESIDENT_PREVIEW_MODE ? "蔬食餐廳區" : "輸入 4 碼任務碼"}
        </AssetButton>
      </div>
      <section
        className="content-section"
        aria-labelledby="daily-task-title"
        data-guidance-target="today-tasks"
      >
        <SectionHeading
          id="daily-task-title"
          eyebrow="每日更新"
          title="今日任務"
        />
        <div className="task-list">
          <TaskCard task={dailyArrivalTask} onAction={() => undefined} />
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
      <section className="content-section" aria-labelledby="weekly-task-title">
        <SectionHeading id="weekly-task-title" eyebrow="之後開放" title="本週任務" />
        <AssetSurface assetId="ui_empty_state" state="maintenance" className="empty-panel">
          <UiIcon assetId="ui_icon_nav_mission" />
          <h3>本週任務正在準備中</h3>
          <p>更多居民生活內容會陸續出現在這裡。</p>
          <AssetButton assetId="ui_button_secondary" onClick={() => openResidentNotice("weekly_missions")}>查看開放進度</AssetButton>
        </AssetSurface>
      </section>
      {restaurantExperienceEnabled() && pendingCode ? (
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
      {restaurantExperienceEnabled() ? <><SettlementPanel result={submissionResult} onViewEvents={() => void fetchNextPlayerEvent().catch(() => undefined)} onDismiss={dismissSubmissionResult} /><UnsettledTerminalPanel result={submissionResult} onDismiss={dismissSubmissionResult} /><PlayerEventPanel event={playerEvent} loading={isEventLoading} error={eventError} resolving={isResolvingEvent} onRefresh={() => void fetchNextPlayerEvent().catch(() => undefined)} onResolve={(outcome) => void resolvePlayerEvent(outcome)} /></> : null}
    </>
  );

  const renderExchange = () => (
    <>
      <h1 id="screen-title" className="screen-title" tabIndex={-1}>
        星星兌換
      </h1>
      <p className="screen-intro">
        目前可查看持有星星；居民兌換會在城市生活機能開放後提供。
      </p>
      <div className="exchange-balance">
        <ResourceChip label={`可用星星 ${player.stars}`} state="full">
          <span aria-hidden="true">★</span>
          <strong>{player.stars.toLocaleString("zh-TW")}</strong>
          <small>可用星星</small>
        </ResourceChip>
      </div>
      <AssetSurface
        assetId="ui_empty_state"
        state="maintenance"
        className="empty-panel exchange-coming-soon"
        as="section"
        label="星星兌換準備中"
      >
        <UiIcon assetId="ui_icon_nav_exchange" />
        <h2>用星星收藏未來的居民生活</h2>
        <p>
          星星之後可用於居民小物與城市生活內容；正式品項與所需星星尚未公布。
        </p>
        <AssetButton
          assetId="ui_button_secondary"
          onClick={() => openResidentNotice("vouchers")}
        >
          查看開放說明
        </AssetButton>
      </AssetSurface>
      <AssetSurface
        assetId="ui_speech_bubble_system"
        state="warning"
        className="exchange-note"
        label="兌換提醒"
      >
        <UiIcon assetId="ui_icon_warning" />
        <p>星星與持有紀錄會安全保留，兌換開放前不會扣除任何資源。</p>
      </AssetSurface>
      <button
        type="button"
        className="list-row ui-control"
        onClick={() => openResidentNotice("vouchers")}
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
    <ForestLogicalRuntime
      playerState={
        connection === "connected" && remoteUser
          ? {
              level: player.level,
              exp: player.exp,
              nextLevelExp: player.nextLevelExp,
              isMaxLevel: player.isMaxLevel,
              stars: player.stars,
              growth: player.growth,
            }
          : null
      }
      missionUnread={Boolean(missionTask && missionTask.state !== "completed")}
      knowledgeUnread
      onOpenMissions={() => goTo("missions")}
      onOpenKnowledge={() => setKnowledgeOpen(true)}
      onOpenRestaurant={() => openResidentNotice("restaurant")}
      onOpenSettings={() => goTo("settings")}
    />
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
        <button
          type="button"
          className="setting-row setting-row--button ui-control"
          onClick={() => openResidentNotice("text_size")}
        >
          <UiIcon assetId="ui_icon_info" />
          <span>
            <strong>文字大小</strong>
            <small>跟隨 iOS Dynamic Type 或 Android 系統字級</small>
          </span>
          <UiIcon assetId="ui_icon_chevron" />
        </button>
        <button
          type="button"
          className="setting-row setting-row--button ui-control"
          onClick={() => openResidentNotice("accessibility_help")}
        >
          <UiIcon assetId="ui_icon_question" />
          <span>
            <strong>輔助說明</strong>
            <small>VoiceOver 與 TalkBack 操作提示</small>
          </span>
          <UiIcon assetId="ui_icon_chevron" />
        </button>
        {RESIDENT_PREVIEW_MODE ? (
          <button
            type="button"
            className="setting-row setting-row--button ui-control"
            onClick={replayResidentGuidance}
          >
            <UiIcon assetId="ui_icon_home" />
            <span>
              <strong>重新查看居民引導</strong>
              <small>再次看看居民空間、森林與今日任務</small>
            </span>
            <UiIcon assetId="ui_icon_chevron" />
          </button>
        ) : null}
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
                  : "暫時離線"}
            </strong>
            <small>
              {connection === "offline"
                ? "保留最近一次已同步的居民資料，不會寫入正式資源"
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
          onClick={() => void refreshPlayer()}
        >
          <UiIcon assetId="ui_icon_sync" />
          <span>
            <strong>重新同步居民資料</strong>
            <small>{connection === "connected" ? "目前已連上中央資料" : "點一下重新嘗試"}</small>
          </span>
          <UiIcon assetId="ui_icon_chevron" />
        </button>
      </section>
      {connection === "offline" ? (
        <AssetSurface
          assetId="ui_empty_state"
          state="offline"
          className="offline-panel"
          label="暫時離線"
        >
          <UiIcon assetId="ui_icon_error" />
          <div>
            <h2>暫時無法更新居民資料</h2>
            <p>畫面會保留最近一次已同步內容；請稍後再試。</p>
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
        onClick={() => openResidentNotice("support")}
      >
        <UiIcon assetId="ui_icon_menu" />
        必要說明與客服
      </AssetButton>
      <AssetButton assetId="ui_button_tertiary" onClick={() => void logoutPlayer()}>
        <UiIcon assetId="ui_icon_profile" />
        登出玩家帳號
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

  if (sessionState !== "authenticated") {
    return (
      <main className="player-session-shell">
        <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" strategy="afterInteractive" />
        <AssetSurface assetId="ui_dialog" state={sessionState === "error" ? "error" : sessionState === "checking" ? "loading" : "default"} className="player-session-gate" as="section">
          <UiIcon assetId={sessionState === "checking" ? "ui_icon_loading" : sessionState === "error" ? "ui_icon_error" : "ui_icon_profile"} className={sessionState === "checking" ? "spinning-icon" : ""} />
          <h1>{sessionState === "checking" ? "正在確認玩家登入狀態" : "使用 LINE 登入 Looper"}</h1>
          <p>{sessionState === "checking" ? "不會顯示上一位玩家的資料。" : sessionError || "請從 LINE 開啟 Looper，完成安全登入後繼續。"}</p>
          {sessionState !== "checking" ? <AssetButton onClick={() => void beginLineLogin()} busy={isLoggingIn}>使用 LINE 登入</AssetButton> : null}
          {sessionState === "error" ? <AssetButton assetId="ui_button_tertiary" onClick={() => window.location.reload()}>重試</AssetButton> : null}
        </AssetSurface>
      </main>
    );
  }

  return (
    <main className={`player-shell${screen === "forest" ? " player-shell--forest" : ""}${reduceMotion ? " reduce-motion" : ""}`} data-resident-preview={String(RESIDENT_PREVIEW_MODE)}>
      <div
        className={`player-app${screen === "forest" ? " player-app--forest" : ""}`}
        aria-hidden={taskCodeOpen || knowledgeOpen || Boolean(previewNotice) || Boolean(residentGuidance) || undefined}
        inert={taskCodeOpen || knowledgeOpen || Boolean(previewNotice) || Boolean(residentGuidance) || undefined}
      >
        {screen !== "forest" && RESIDENT_PREVIEW_MODE ? (
          <div className="connection-banner connection-banner--preview" role="status">
            <UiIcon assetId="ui_icon_home" />
            <span>居民預覽已開放・蔬食餐廳區仍在準備中</span>
          </div>
        ) : connection !== "connected" ? (
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
        {screen !== "forest" ? <header className="player-header">
          <button
            type="button"
            className="profile-home ui-control"
            aria-label="返回首頁"
            onClick={() => goTo("home")}
          >
            <UiIcon assetId="ui_icon_profile" className="profile-icon" />
            <span>
              <small>Looper 居民</small>
              <strong>{player.displayName}</strong>
            </span>
            <UiIcon assetId="ui_icon_home" className="home-mark" />
          </button>
          <IconButton icon="ui_icon_notification" label="通知" onClick={() => openResidentNotice("notifications")} />
        </header> : null}

        <div className={`screen-content${screen === "forest" ? " screen-content--forest" : ""}`}>{screens[screen]()}</div>

        {screen !== "forest" ? <nav className="bottom-navigation" aria-label="主要導覽">
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
        </nav> : null}
      </div>

      {restaurantExperienceEnabled() && taskCodeOpen ? (
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

      {previewNotice ? <ResidentPreviewDialog notice={residentPreviewNotice(previewNotice)} onClose={closeResidentNotice} /> : null}

      {knowledgeOpen && remoteUser ? <KnowledgeCard playerId={remoteUser.id} onClose={() => setKnowledgeOpen(false)} onAuthorizationFailure={becomeUnauthenticated} onRewardApplied={() => void refreshPlayer()} /> : null}

      {RESIDENT_PREVIEW_MODE && residentGuidance ? (
        <ResidentGuidanceDialog
          state={residentGuidance}
          displayName={remoteUser?.displayName}
          onAdvance={advanceResidentGuidance}
          onBack={backResidentGuidance}
          onDismiss={() => finishResidentGuidance("skipped")}
        />
      ) : null}

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
