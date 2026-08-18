"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { resolveReducedMotionPreference, type PlayerPresentationPreference, type PlayerSessionContext, type ResidentMissionBoardState, type ResidentMissionClaimResult, type UserProgress } from "@looper/types";
import { ForestLogicalRuntime } from "../forest-logical-runtime";
import { establishLinePlayerSession, LiffBootstrapError, type LiffBootstrapDiagnostic, type LiffClient } from "../player-session-flow";
import { GlobalHud } from "./global-hud";
import { INITIAL_GLOBAL_FOCUS_STATE, globalFocusReducer, type PrimaryFocusOwner } from "./focus-manager";
import {
  CoreTreeOverlay,
  DialogueOverlay,
  KnowledgeBoardOverlay,
  MissionBoardOverlay,
  RestaurantOverlay,
  SettingsOverlay,
  StarsSummaryOverlay,
  TreehousePreviewOverlay,
  type DialogueContentSlot,
  type MissionClaimUiState,
} from "./primary-overlay";
import { TreehouseScene } from "./treehouse-scene";
import { answerDailyKnowledge, claimResidentMission, fetchPlayerSession, fetchResidentRuntime, logoutResident, recordCoreTreeOpen, RUNTIME_API_URL, updatePresentationPreference } from "./runtime-api";
import type { DialogueCharacter, KnowledgeRuntimeState, ResidentPreferenceState, RuntimeScene, SessionGateState } from "./runtime-types";

const LIFF_ID = process.env.NEXT_PUBLIC_LINE_LIFF_ID;

const LIFF_DIAGNOSTIC_MESSAGES: Record<LiffBootstrapDiagnostic, string> = {
  LIFF_SDK_UNAVAILABLE: "LINE 服務尚未載入，請稍後再試。",
  LIFF_INIT_FAILED: "LINE 初始化暫時無法完成，請重新開啟 Looper。",
  LIFF_BROWSER_NOT_AUTHENTICATED: "LINE 尚未完成居民身分驗證，請重新開啟正式 LIFF。",
  LIFF_OPENID_TOKEN_UNAVAILABLE: "LINE 登入憑證無法取得，請重新開啟 Looper。",
  LINE_PLAYER_SESSION_FAILED: "居民登入暫時無法完成，請稍後再試。",
};

const DIALOGUE_CONTENT_SLOTS: Record<DialogueCharacter, DialogueContentSlot> = {
  rabbit: {
    speaker: "兔兔",
    lines: ["歡迎回來。", "可以從森林裡的世界物件繼續今天的旅程。"],
    authorityStatus: "runtime_dynamic_slot",
  },
  marmot: {
    speaker: "土撥鼠",
    lines: ["居民紀錄由系統保存。", "慢慢看看森林和樹屋吧。"],
    authorityStatus: "runtime_dynamic_slot",
  },
};

function reconcileClaimedMission(state: ResidentMissionBoardState, result: ResidentMissionClaimResult): ResidentMissionBoardState {
  return {
    ...state,
    today: state.today.map((mission) => mission.id === "resident-daily-core-tree-check"
      ? {
          ...mission,
          state: "CLAIMED",
          status: "claimed",
          completionState: "COMPLETED",
          completedAt: result.missionInstance.completedAt,
          claimable: false,
          claimed: true,
          claimedAt: result.missionInstance.claimedAt,
          claimInteractionEligibility: false,
        }
      : mission),
  };
}

function reconcileClaimedProfile(profile: UserProgress, result: ResidentMissionClaimResult): UserProgress {
  return {
    ...profile,
    resources: {
      ...profile.resources,
      starBalance: result.authoritativeStarsBalance,
    },
  };
}

function playerView(profile: UserProgress) {
  const growth = profile.growth;
  const stage = growth.treeCount > 0 ? ["🌳", "森林夥伴"] : growth.plantCount > 0 ? ["🪴", "成長中的植物"] : growth.seedCount > 0 ? ["🌱", "新芽"] : ["🌰", "等待第一個行動"];
  return {
    level: profile.resources.currentLevel,
    exp: profile.resources.currentExp,
    nextLevelExp: profile.resources.nextLevelExp,
    isMaxLevel: profile.resources.isMaxLevel,
    stars: profile.resources.starBalance,
    growth: {
      stageIcon: stage[0],
      stageLabel: stage[1],
      carbonTotalKg: growth.carbonTotalGrams / 1000,
      carbonBalanceKg: growth.carbonBalanceGrams / 1000,
      seedCount: growth.seedCount,
      plantCount: growth.plantCount,
      treeCount: growth.treeCount,
    },
  };
}

function systemPrefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function persistedPreferenceState(preference: PlayerPresentationPreference): ResidentPreferenceState {
  return {
    reducedMotion: resolveReducedMotionPreference(preference.reducedMotion, systemPrefersReducedMotion()),
    backendReducedMotion: preference.reducedMotion,
    updatedAt: preference.updatedAt,
    persistenceStatus: preference.reducedMotion === null ? "system_default" : "persisted",
  };
}

export function ResidentGame() {
  const [gate, setGate] = useState<SessionGateState>("checking");
  const [session, setSession] = useState<PlayerSessionContext | null>(null);
  const [profile, setProfile] = useState<UserProgress | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeRuntimeState | null>(null);
  const [missions, setMissions] = useState<ResidentMissionBoardState | null>(null);
  const [scene, setScene] = useState<RuntimeScene>("forest");
  const [dialogueCharacter, setDialogueCharacter] = useState<DialogueCharacter>("rabbit");
  const [focus, dispatchFocus] = useReducer(globalFocusReducer, INITIAL_GLOBAL_FOCUS_STATE);
  const [preference, setPreference] = useState<ResidentPreferenceState>({
    reducedMotion: false,
    backendReducedMotion: null,
    updatedAt: null,
    persistenceStatus: "system_default",
  });
  const [knowledgeBusy, setKnowledgeBusy] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState("");
  const [coreTreeCompletionError, setCoreTreeCompletionError] = useState("");
  const [missionClaimUiState, setMissionClaimUiState] = useState<MissionClaimUiState>("idle");
  const [missionClaimError, setMissionClaimError] = useState("");
  const [starsReceived, setStarsReceived] = useState<number | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [gateError, setGateError] = useState("");
  const [isLiffClient, setIsLiffClient] = useState(false);
  const [replayEpoch, setReplayEpoch] = useState(0);
  const missionClaimAttemptRef = useRef<{ instanceId: string; idempotencyKey: string } | null>(null);
  const missionClaimInFlightRef = useRef(false);

  const refreshRuntime = useCallback(async (synchronizePresentationPreference = false) => {
    const runtime = await fetchResidentRuntime();
    setProfile(runtime.profile);
    setKnowledge(runtime.knowledge);
    setMissions(runtime.missions);
    if (synchronizePresentationPreference) setPreference(persistedPreferenceState(runtime.presentationPreference));
    return runtime;
  }, []);

  const beginLineLogin = useCallback(async (client?: LiffClient) => {
    setGate("checking");
    setGateError("");
    try {
      const liff = client ?? (window as Window & { liff?: LiffClient }).liff;
      const nextSession = await establishLinePlayerSession(RUNTIME_API_URL, liff, LIFF_ID);
      if (!nextSession) return;
      const runtime = await refreshRuntime(true);
      setSession(nextSession);
      setProfile(runtime.profile);
      setGate("authenticated");
    } catch (error) {
      const diagnostic = error instanceof LiffBootstrapError ? error.diagnostic : "LINE_PLAYER_SESSION_FAILED";
      console.error(`[LIFF_BOOTSTRAP] ${diagnostic}`);
      setGate("unauthenticated");
      setGateError(LIFF_DIAGNOSTIC_MESSAGES[diagnostic]);
    }
  }, [refreshRuntime]);

  useEffect(() => {
    let active = true;
    void fetchPlayerSession()
      .then(async (nextSession) => {
        if (!active) return;
        if (!nextSession) {
          const liff = (window as Window & { liff?: LiffClient }).liff;
          if (liff?.isInClient() === true) {
            setIsLiffClient(true);
            await beginLineLogin(liff);
          } else {
            setGate("unauthenticated");
          }
          return;
        }
        const runtime = await refreshRuntime(true);
        if (!active) return;
        setSession(nextSession);
        setProfile(runtime.profile);
        setGate("authenticated");
      })
      .catch(() => active && setGate("error"));
    return () => { active = false; };
  }, [beginLineLogin, refreshRuntime]);

  const claimFocus = useCallback((owner: PrimaryFocusOwner) => {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (active && !active.id) active.id = `focus-return-${owner}-${Date.now()}`;
    dispatchFocus({ type: "claim", owner, triggerId: active?.id ?? null });
  }, []);

  const releaseFocus = useCallback(() => {
    const triggerId = focus.triggerId;
    dispatchFocus({ type: "release" });
    if (triggerId) window.requestAnimationFrame(() => document.getElementById(triggerId)?.focus());
  }, [focus.triggerId]);

  const transitionScene = useCallback((nextScene: RuntimeScene) => {
    dispatchFocus({ type: "scene_transition" });
    setScene(nextScene);
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(nextScene === "forest" ? "#forest-logical-title" : "#treehouse-title")?.focus());
  }, []);

  async function submitKnowledge(input: Parameters<typeof answerDailyKnowledge>[0]) {
    setKnowledgeBusy(true);
    setKnowledgeError("");
    try {
      const result = await answerDailyKnowledge(input);
      setProfile(result.user);
      setKnowledge((current) => current ? { ...current, completed: true, result } : current);
      return result;
    } catch (error) {
      setKnowledgeError(error instanceof Error ? error.message : "作答暫時無法送出");
      throw error;
    } finally {
      setKnowledgeBusy(false);
    }
  }

  function openCoreTree() {
    setCoreTreeCompletionError("");
    claimFocus("core_tree");
    void recordCoreTreeOpen()
      .then(() => refreshRuntime())
      .catch((error) => setCoreTreeCompletionError(error instanceof Error ? error.message : "核心樹互動暫時無法同步"));
  }

  async function claimMission(instanceId: string) {
    if (missionClaimInFlightRef.current) return;
    const mission = missions?.today.find((item) => item.id === "resident-daily-core-tree-check");
    if (!mission || mission.instanceId !== instanceId || !mission.claimable || !mission.claimInteractionEligibility || mission.claimed) return;

    missionClaimInFlightRef.current = true;
    const attempt = missionClaimAttemptRef.current?.instanceId === instanceId
      ? missionClaimAttemptRef.current
      : { instanceId, idempotencyKey: crypto.randomUUID() };
    missionClaimAttemptRef.current = attempt;
    setMissionClaimError("");
    setStarsReceived(null);
    setMissionClaimUiState("claim_request");
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    setMissionClaimUiState("claim_pending");

    try {
      const result = await claimResidentMission(instanceId, attempt.idempotencyKey);
      setMissionClaimUiState("backend_success");
      setProfile((current) => current ? reconcileClaimedProfile(current, result) : current);
      setMissions((current) => current ? reconcileClaimedMission(current, result) : current);
      missionClaimAttemptRef.current = null;
      try {
        await refreshRuntime();
      } catch {
        // The successful claim response already carries authoritative Mission and Stars truth.
      }
      setStarsReceived(result.rewardResult.starsGranted);
      setMissionClaimUiState("receiving");
    } catch (error) {
      try {
        const runtime = await refreshRuntime();
        const reconciled = runtime.missions.today.find((item) => item.id === "resident-daily-core-tree-check");
        if (reconciled?.claimed) {
          missionClaimAttemptRef.current = null;
          setMissionClaimError("");
          setMissionClaimUiState("idle");
          return;
        }
      } catch {
        // Keep the unresolved attempt key for a safe retry after connectivity returns.
      }
      setMissionClaimError(error instanceof Error ? error.message : "領取尚未完成，Backend 未變更 Stars，可安全重試。");
      setMissionClaimUiState("failure");
    } finally {
      missionClaimInFlightRef.current = false;
    }
  }

  function closeMission() {
    setStarsReceived(null);
    if (missionClaimUiState === "receiving") setMissionClaimUiState("idle");
    releaseFocus();
  }

  async function toggleReducedMotion() {
    if (settingsBusy) return;
    const selectedValue = !preference.reducedMotion;
    setSettingsBusy(true);
    setSettingsError("");
    setPreference((current) => ({ ...current, reducedMotion: selectedValue, persistenceStatus: "saving" }));
    try {
      const persisted = await updatePresentationPreference(selectedValue);
      setPreference(persistedPreferenceState(persisted));
    } catch (error) {
      setPreference((current) => ({ ...current, reducedMotion: selectedValue, persistenceStatus: "failed" }));
      setSettingsError(error instanceof Error ? `${error.message}；本次選擇僅套用於目前 Session，尚未保存。` : "本次選擇僅套用於目前 Session，尚未保存。");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function performLogout(): Promise<boolean> {
    setSettingsBusy(true);
    setSettingsError("");
    try {
      await logoutResident();
      dispatchFocus({ type: "scene_transition" });
      setSession(null);
      setProfile(null);
      setKnowledge(null);
      setMissions(null);
      missionClaimAttemptRef.current = null;
      missionClaimInFlightRef.current = false;
      setMissionClaimUiState("idle");
      setMissionClaimError("");
      setStarsReceived(null);
      setPreference({ reducedMotion: false, backendReducedMotion: null, updatedAt: null, persistenceStatus: "system_default" });
      setScene("forest");
      setGate("unauthenticated");
      return true;
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "登出暫時無法完成");
      return false;
    } finally {
      setSettingsBusy(false);
    }
  }

  const forestPlayer = useMemo(() => profile ? playerView(profile) : null, [profile]);

  if (gate !== "authenticated" || !session || !profile) {
    return (
      <main className="resident-session-gate" data-session-state={gate}>
        <section aria-live="polite">
          <span aria-hidden>🌲</span>
          <h1>Welcome First Resident</h1>
          {gate === "checking" || isLiffClient ? <p>正在進入居民森林…</p> : <p>請從 LINE 進入自己的居民森林。</p>}
          {gate !== "checking" && !isLiffClient ? <button type="button" className="ui-control" onClick={() => void beginLineLogin()}>使用 LINE 進入</button> : null}
          {gateError ? <p role="alert">{gateError}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main
      className="resident-game-runtime"
      data-scene={scene}
      data-primary-focus-owner={focus.owner ?? "none"}
      data-primary-focus-count={focus.owner ? 1 : 0}
      data-reduced-motion={preference.reducedMotion}
      data-replay-epoch={replayEpoch}
      data-resident-id={session.userId}
      data-formal-runtime-package-count="9"
    >
      <div className="resident-game-core">
        <GlobalHud profile={profile} reducedMotion={preference.reducedMotion} starsReceived={starsReceived} onOpenStars={() => claimFocus("stars_summary")} onOpenSettings={() => claimFocus("settings")} />
        {scene === "forest" ? (
          <ForestLogicalRuntime
            playerState={forestPlayer}
            missionUnread={false}
            knowledgeUnread={profile.resources.currentLevel >= 3 && !knowledge?.completed}
            onOpenMissions={() => claimFocus("mission")}
            onOpenKnowledge={() => claimFocus("knowledge")}
            onOpenRestaurant={() => claimFocus("restaurant")}
            onOpenSettings={() => claimFocus("settings")}
            onOpenDialogue={(character) => { setDialogueCharacter(character); claimFocus("dialogue"); }}
            onOpenCoreTree={openCoreTree}
            onOpenStars={() => claimFocus("stars_summary")}
            onEnterTreehouse={() => transitionScene("treehouse")}
          />
        ) : (
          <TreehouseScene
            onExit={() => transitionScene("forest")}
            onDialogue={(character) => { setDialogueCharacter(character); claimFocus("dialogue"); }}
            onStorage={() => claimFocus("treehouse_storage")}
            onStars={() => claimFocus("treehouse_star_shelf")}
          />
        )}

        {focus.owner === "dialogue" ? <DialogueOverlay character={dialogueCharacter} scene={scene} reducedMotion={preference.reducedMotion} content={DIALOGUE_CONTENT_SLOTS[dialogueCharacter]} onClose={releaseFocus} /> : null}
        {focus.owner === "mission" && missions ? <MissionBoardOverlay state={missions} claimUiState={missionClaimUiState} claimError={missionClaimError} onClaim={claimMission} onClose={closeMission} /> : null}
        {focus.owner === "knowledge" ? <KnowledgeBoardOverlay state={knowledge} profile={profile} submitting={knowledgeBusy} error={knowledgeError} onSubmit={submitKnowledge} onClose={releaseFocus} /> : null}
        {focus.owner === "stars_summary" ? <StarsSummaryOverlay profile={profile} onClose={releaseFocus} /> : null}
        {focus.owner === "core_tree" ? <CoreTreeOverlay profile={profile} reducedMotion={preference.reducedMotion} completionError={coreTreeCompletionError} onClose={releaseFocus} /> : null}
        {focus.owner === "treehouse_storage" || focus.owner === "treehouse_star_shelf" ? <TreehousePreviewOverlay owner={focus.owner} profile={profile} onClose={releaseFocus} /> : null}
        {focus.owner === "settings" ? (
          <SettingsOverlay
            preference={preference}
            busy={settingsBusy}
            error={settingsError}
            onToggleMotion={() => void toggleReducedMotion()}
            onReplay={() => { setReplayEpoch((value) => value + 1); transitionScene("forest"); }}
            onLogout={performLogout}
            onClose={releaseFocus}
          />
        ) : null}
        {focus.owner === "restaurant" ? <RestaurantOverlay onClose={releaseFocus} /> : null}
      </div>
    </main>
  );
}
