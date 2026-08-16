"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import type { PlayerSessionContext, ResidentMissionBoardState, UserProgress } from "@looper/types";
import { ForestLogicalRuntime } from "../forest-logical-runtime";
import { obtainVerifiedLiffCredential, playerMutationRequest, type LiffClient } from "../player-session-flow";
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
} from "./primary-overlay";
import { TreehouseScene } from "./treehouse-scene";
import { answerDailyKnowledge, fetchPlayerSession, fetchResidentRuntime, logoutResident, RUNTIME_API_URL } from "./runtime-api";
import type { DialogueCharacter, KnowledgeRuntimeState, ResidentPreferenceState, RuntimeScene, SessionGateState } from "./runtime-types";

const LIFF_ID = process.env.NEXT_PUBLIC_LINE_LIFF_ID;

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

export function ResidentGame() {
  const [gate, setGate] = useState<SessionGateState>("checking");
  const [session, setSession] = useState<PlayerSessionContext | null>(null);
  const [profile, setProfile] = useState<UserProgress | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeRuntimeState | null>(null);
  const [missions, setMissions] = useState<ResidentMissionBoardState | null>(null);
  const [scene, setScene] = useState<RuntimeScene>("forest");
  const [dialogueCharacter, setDialogueCharacter] = useState<DialogueCharacter>("rabbit");
  const [focus, dispatchFocus] = useReducer(globalFocusReducer, INITIAL_GLOBAL_FOCUS_STATE);
  const [preference, setPreference] = useState<ResidentPreferenceState>({ reducedMotion: false, persistenceStatus: "pending" });
  const [knowledgeBusy, setKnowledgeBusy] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [gateError, setGateError] = useState("");
  const [replayEpoch, setReplayEpoch] = useState(0);

  const refreshRuntime = useCallback(async () => {
    const runtime = await fetchResidentRuntime();
    setProfile(runtime.profile);
    setKnowledge(runtime.knowledge);
    setMissions(runtime.missions);
  }, []);

  useEffect(() => {
    let active = true;
    void fetchPlayerSession()
      .then(async (nextSession) => {
        if (!active) return;
        if (!nextSession) {
          setGate("unauthenticated");
          return;
        }
        setSession(nextSession);
        setPreference({ reducedMotion: false, persistenceStatus: "pending" });
        setProfile(nextSession.profile);
        setGate("authenticated");
        await refreshRuntime();
      })
      .catch(() => active && setGate("error"));
    return () => { active = false; };
  }, [refreshRuntime]);

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

  async function beginLineLogin() {
    setGateError("");
    try {
      const liff = (window as Window & { liff?: LiffClient }).liff;
      const idToken = await obtainVerifiedLiffCredential(liff, LIFF_ID);
      if (!idToken) return;
      const response = await fetch(`${RUNTIME_API_URL}/auth/player/line/session`, playerMutationRequest({ idToken }));
      const body = await response.json() as PlayerSessionContext & { message?: string };
      if (!response.ok) throw new Error(body.message ?? "LINE 登入失敗");
      setSession(body);
      setPreference({ reducedMotion: false, persistenceStatus: "pending" });
      setProfile(body.profile);
      setGate("authenticated");
      await refreshRuntime();
    } catch (error) {
      setGate("unauthenticated");
      setGateError(error instanceof Error ? error.message : "LINE 登入暫時無法完成");
    }
  }

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
      setPreference({ reducedMotion: false, persistenceStatus: "pending" });
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
          {gate === "checking" ? <p>正在確認你的居民身分…</p> : <p>請從 LINE 進入自己的居民森林。</p>}
          {gate !== "checking" ? <button type="button" className="ui-control" onClick={() => void beginLineLogin()}>使用 LINE 進入</button> : null}
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
        <GlobalHud profile={profile} reducedMotion={preference.reducedMotion} onOpenStars={() => claimFocus("stars_summary")} onOpenSettings={() => claimFocus("settings")} />
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
            onOpenCoreTree={() => claimFocus("core_tree")}
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
        {focus.owner === "mission" && missions ? <MissionBoardOverlay state={missions} onClose={releaseFocus} /> : null}
        {focus.owner === "knowledge" ? <KnowledgeBoardOverlay state={knowledge} profile={profile} submitting={knowledgeBusy} error={knowledgeError} onSubmit={submitKnowledge} onClose={releaseFocus} /> : null}
        {focus.owner === "stars_summary" ? <StarsSummaryOverlay profile={profile} onClose={releaseFocus} /> : null}
        {focus.owner === "core_tree" ? <CoreTreeOverlay profile={profile} reducedMotion={preference.reducedMotion} onClose={releaseFocus} /> : null}
        {focus.owner === "treehouse_storage" || focus.owner === "treehouse_star_shelf" ? <TreehousePreviewOverlay owner={focus.owner} profile={profile} onClose={releaseFocus} /> : null}
        {focus.owner === "settings" ? (
          <SettingsOverlay
            preference={preference}
            busy={settingsBusy}
            error={settingsError}
            onToggleMotion={() => setPreference((current) => ({ ...current, reducedMotion: !current.reducedMotion }))}
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
