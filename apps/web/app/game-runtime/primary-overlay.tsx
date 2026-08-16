"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { KnowledgeCardAnswerInput, KnowledgeCardAnswerResult, ResidentMissionBoardState, UserProgress } from "@looper/types";
import { UNIFIED_RUNTIME_ASSETS } from "./asset-routes";
import type { PrimaryFocusOwner } from "./focus-manager";
import type { DialogueCharacter, KnowledgeRuntimeState, ResidentPreferenceState } from "./runtime-types";

function OverlayFrame({
  owner,
  label,
  onClose,
  children,
  className = "",
  closeAsset,
  showDefaultClose = true,
}: {
  owner: PrimaryFocusOwner;
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  closeAsset?: string;
  showDefaultClose?: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (showDefaultClose) closeRef.current?.focus();
    else sectionRef.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, showDefaultClose]);
  return (
    <div className={`game-primary-overlay game-primary-overlay--${owner} ${className}`} data-focus-owner={owner}>
      <section ref={sectionRef} className="game-primary-overlay__content" role="dialog" aria-modal="true" aria-label={label}>
        {showDefaultClose ? (
          <button ref={closeRef} type="button" className="game-primary-overlay__close ui-control" onClick={onClose} aria-label={`關閉${label}`}>
            {closeAsset ? <Image src={closeAsset} alt="" fill sizes="45px" unoptimized aria-hidden /> : <span aria-hidden>×</span>}
          </button>
        ) : null}
        {children}
      </section>
    </div>
  );
}

export interface DialogueContentSlot {
  speaker: string;
  lines: readonly string[];
  authorityStatus: "runtime_dynamic_slot";
}

export type MissionClaimUiState = "idle" | "claim_request" | "claim_pending" | "backend_success" | "receiving" | "failure";

const DIALOGUE_ATTACHMENTS = {
  forest: {
    rabbit: { anchor: "forest_rabbit_anchor", x: 148, y: 448, orientation: "left", sourceOffset: "0,-198" },
    marmot: { anchor: "forest_mole_anchor", x: 275, y: 530, orientation: "right", sourceOffset: "4,-184" },
  },
  treehouse: {
    rabbit: { anchor: "anchor_rabbit_dialogue", x: 121.5, y: 474, orientation: "right", sourceOffset: "0,0" },
    marmot: { anchor: "anchor_mole_dialogue", x: 276, y: 491, orientation: "left", sourceOffset: "0,0" },
  },
} as const;

function dialogueAttachmentStyle(scene: "forest" | "treehouse", character: DialogueCharacter): CSSProperties {
  const attachment = DIALOGUE_ATTACHMENTS[scene][character];
  const logicalWidth = 320;
  const logicalHeight = logicalWidth * 362 / 640;
  const left = Math.max(12, Math.min(390 - logicalWidth - 12, attachment.x - logicalWidth / 2));
  const top = Math.max(112, Math.min(844 - logicalHeight - 16, attachment.y - logicalHeight));
  return {
    left: `${left / 3.9}%`,
    top: `${top / 8.44}%`,
    width: `${logicalWidth / 3.9}%`,
  };
}

export function DialogueOverlay({
  character,
  scene,
  reducedMotion,
  content,
  onClose,
}: {
  character: DialogueCharacter;
  scene: "forest" | "treehouse";
  reducedMotion: boolean;
  content: DialogueContentSlot;
  onClose: () => void;
}) {
  const [line, setLine] = useState(0);
  const isRabbit = character === "rabbit";
  const lines = content.lines;
  const attachment = DIALOGUE_ATTACHMENTS[scene][character];
  const bubble = reducedMotion
    ? UNIFIED_RUNTIME_ASSETS.dialogue.reduced
    : isRabbit
      ? scene === "forest" ? UNIFIED_RUNTIME_ASSETS.dialogue.rabbitLeft : UNIFIED_RUNTIME_ASSETS.dialogue.rabbitRight
      : scene === "forest" ? UNIFIED_RUNTIME_ASSETS.dialogue.marmotRight : UNIFIED_RUNTIME_ASSETS.dialogue.marmotLeft;
  return (
    <OverlayFrame owner="dialogue" label={`${content.speaker}對話`} onClose={onClose} className="dialogue-native-overlay" showDefaultClose={false}>
      <div
        className="dialogue-native-overlay__attachment"
        style={dialogueAttachmentStyle(scene, character)}
        data-character-anchor={attachment.anchor}
        data-bubble-offset={attachment.sourceOffset}
        data-orientation={attachment.orientation}
        data-responsive-transform="logical-core-safe-clamp"
        data-content-authority={content.authorityStatus}
      >
      <Image src={bubble} alt="" fill sizes="(max-width: 780px) 82vw, 320px" unoptimized aria-hidden />
      <Image src={UNIFIED_RUNTIME_ASSETS.dialogue.close} alt="" fill sizes="(max-width: 780px) 82vw, 320px" unoptimized aria-hidden />
      <Image src={UNIFIED_RUNTIME_ASSETS.dialogue.continue} alt="" fill sizes="(max-width: 780px) 82vw, 320px" unoptimized aria-hidden />
      <div className="dialogue-native-overlay__copy" aria-live="polite">
        <small>{content.speaker}</small>
        <p>{lines[line]}</p>
      </div>
      {line < lines.length - 1 ? (
        <button type="button" className="dialogue-native-overlay__continue ui-control" onClick={() => setLine((value) => value + 1)}>繼續</button>
      ) : (
        <button type="button" className="dialogue-native-overlay__continue ui-control" onClick={onClose}>好</button>
      )}
      <button type="button" className="dialogue-native-overlay__close ui-control" onClick={onClose} aria-label={`關閉${content.speaker}對話`} />
      </div>
    </OverlayFrame>
  );
}

export function MissionBoardOverlay({
  state,
  claimUiState,
  claimError,
  onClaim,
  onClose,
}: {
  state: ResidentMissionBoardState;
  claimUiState: MissionClaimUiState;
  claimError: string;
  onClaim: (instanceId: string) => Promise<void>;
  onClose: () => void;
}) {
  const coreTree = state.today.find((mission) => mission.id === "resident-daily-core-tree-check");
  const claimPending = claimUiState === "claim_request" || claimUiState === "claim_pending" || claimUiState === "backend_success";
  const claimable = Boolean(coreTree?.claimable && coreTree.claimInteractionEligibility && !coreTree.claimed);
  const claimControlVisible = claimable || claimPending;
  const missionState = coreTree?.claimed
    ? "CLAIMED"
    : claimPending
      ? "CLAIM_PENDING"
      : coreTree?.claimable
        ? "CLAIMABLE"
        : coreTree?.completionState === "COMPLETED"
          ? "COMPLETED"
          : "AVAILABLE";
  const missionStateAsset = missionState === "CLAIMED"
    ? UNIFIED_RUNTIME_ASSETS.mission.claimed
    : missionState === "CLAIM_PENDING"
      ? UNIFIED_RUNTIME_ASSETS.mission.pending
      : missionState === "CLAIMABLE"
        ? UNIFIED_RUNTIME_ASSETS.mission.claimable
        : missionState === "COMPLETED"
          ? UNIFIED_RUNTIME_ASSETS.mission.completed
          : UNIFIED_RUNTIME_ASSETS.mission.available;
  return (
    <OverlayFrame owner="mission" label="森林任務" onClose={onClose} className="mission-native-overlay" closeAsset={UNIFIED_RUNTIME_ASSETS.mission.close}>
      <Image src={UNIFIED_RUNTIME_ASSETS.mission.boardShadow} alt="" fill sizes="(max-width: 780px) 96vw, 600px" loading="eager" unoptimized aria-hidden />
      <Image src={UNIFIED_RUNTIME_ASSETS.mission.boardBase} alt="" fill sizes="(max-width: 780px) 96vw, 600px" unoptimized aria-hidden />
      <Image src={UNIFIED_RUNTIME_ASSETS.mission.boardFrame} alt="" fill sizes="(max-width: 780px) 96vw, 600px" unoptimized aria-hidden />
      <Image src={UNIFIED_RUNTIME_ASSETS.mission.todaySection} alt="" fill sizes="(max-width: 780px) 96vw, 600px" unoptimized aria-hidden />
      <Image src={UNIFIED_RUNTIME_ASSETS.mission.weeklySection} alt="" fill sizes="(max-width: 780px) 96vw, 600px" unoptimized aria-hidden />
      <Image src={UNIFIED_RUNTIME_ASSETS.mission.paperShadow} alt="" fill sizes="(max-width: 780px) 96vw, 600px" unoptimized aria-hidden />
      <Image src={UNIFIED_RUNTIME_ASSETS.mission.paper} alt="" fill sizes="(max-width: 780px) 96vw, 600px" unoptimized aria-hidden />
      <Image className="mission-native-overlay__state-layer" src={missionStateAsset} alt="" fill sizes="(max-width: 780px) 96vw, 600px" unoptimized aria-hidden />
      {claimControlVisible ? <Image className="mission-native-overlay__claim-layer" src={UNIFIED_RUNTIME_ASSETS.mission.claimButton} alt="" fill sizes="(max-width: 780px) 96vw, 600px" unoptimized aria-hidden /> : null}
      {claimPending ? <Image className="mission-native-overlay__indicator-layer" src={UNIFIED_RUNTIME_ASSETS.mission.claimIndicator} alt="" fill sizes="(max-width: 780px) 96vw, 600px" unoptimized aria-hidden /> : null}
      {coreTree?.claimed ? <Image className="mission-native-overlay__stamp-layer" src={UNIFIED_RUNTIME_ASSETS.mission.claimedStamp} alt="" fill sizes="(max-width: 780px) 96vw, 600px" unoptimized aria-hidden /> : null}
      <div
        className="mission-native-overlay__body"
        data-mission-claim-authority="FROZEN"
        data-mission-claim-backend-binding="PASSED"
        data-mission-claim-executable-route="1"
        data-mission-claim-ui-state={claimUiState}
        data-mission-backend-state={missionState}
        data-claimed-stamp-visible={coreTree?.claimed ? "true" : "false"}
        data-stamp-backend-gated="true"
      >
        <h2 className="sr-only">森林任務</h2>
        <article className="mission-native-overlay__today" data-mission-today-slot="1" aria-label="Today Slot 1：今日來訪，已完成，獎勵零，不可 Claim">
          <small>Today Slot 1 · {state.businessDate.slice(5)}</small>
          <h3>{state.today[0].name}</h3>
          <p>居民 Session 已確認。</p>
          <p className="mission-native-overlay__zero">{state.today[0].reward.stars}⭐ · EXP {state.today[0].reward.exp} · Energy {state.today[0].reward.energy} · CO₂e {state.today[0].reward.carbonGrams}</p>
          <span className="sr-only">今日來訪維持 completed、不可 Claim、獎勵零。</span>
        </article>
        {coreTree ? (
          <article className="mission-native-overlay__core-tree" data-mission-today-slot="2" data-mission-instance-id={coreTree.instanceId} aria-label={`Today Slot 2：${coreTree.name}，${missionState}`}>
            <small>Today Slot 2 · {coreTree.businessDate.slice(5)}</small>
            <h3>{coreTree.name}</h3>
            <p>{missionState === "AVAILABLE" ? "正式開啟核心樹即可完成。" : missionState === "CLAIM_PENDING" ? "正在由 Backend 確認領取…" : missionState === "CLAIMED" ? "Backend 已確認領取。" : "已完成，可領取正式獎勵。"}</p>
            <p className="mission-native-overlay__reward"><span>10⭐ · EXP 0 · Energy 0</span><span>CO₂e 0 · Item 0</span></p>
            {claimUiState === "failure" && claimError ? <p className="mission-native-overlay__claim-error" role="alert">{claimError}</p> : null}
          </article>
        ) : null}
        <article className="mission-native-overlay__weekly" aria-label="Weekly：預覽，目前沒有進度">
          <small>Weekly</small>
          <h3>每週旅程準備中</h3>
          <p>Backend Authority pending · 進度／獎勵 0</p>
        </article>
      </div>
      {coreTree && claimControlVisible ? (
        <button
          type="button"
          className="mission-native-overlay__claim ui-control"
          disabled={claimPending}
          onClick={() => void onClaim(coreTree.instanceId)}
          aria-label={claimPending ? "Mission Claim 處理中" : claimUiState === "failure" ? "安全重試領取 10 Stars" : "領取 10 Stars"}
          data-mission-claim-control="formal"
          data-mission-claim-disabled={claimPending ? "true" : "false"}
        >
          <span className="sr-only">{claimPending ? "處理中" : claimUiState === "failure" ? "重試領取" : "領取"}</span>
        </button>
      ) : null}
    </OverlayFrame>
  );
}

const KNOWLEDGE_OPTIONS = [
  { id: "reusable-container", label: "自備可重複使用的餐盒" },
  { id: "extra-bag", label: "多拿一個一次性塑膠袋" },
  { id: "extra-cutlery", label: "多拿一套餐具備用" },
] as const;

export function KnowledgeBoardOverlay({
  state,
  profile,
  submitting,
  error,
  onSubmit,
  onClose,
}: {
  state: KnowledgeRuntimeState | null;
  profile: UserProgress;
  submitting: boolean;
  error: string;
  onSubmit: (input: KnowledgeCardAnswerInput) => Promise<KnowledgeCardAnswerResult>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<KnowledgeCardAnswerResult | null>(state?.result ?? null);
  const unlocked = profile.resources.currentLevel >= 3 && Boolean(state?.unlocked);
  const completed = Boolean(result ?? state?.completed);
  async function submit() {
    if (!selected || !state || !unlocked || completed || submitting) return;
    try {
      const response = await onSubmit({ selectedOptionId: selected, cardVersion: state.cardVersion, idempotencyKey: crypto.randomUUID() });
      setResult(response);
    } catch {
      // Parent state owns the resident-safe error presentation.
    }
  }
  return (
    <OverlayFrame owner="knowledge" label="每日永續小知識" onClose={onClose} className="knowledge-native-overlay">
      <Image src={UNIFIED_RUNTIME_ASSETS.knowledge.background} alt="" fill sizes="(max-width: 780px) 100vw, 640px" unoptimized aria-hidden />
      <Image className="knowledge-native-overlay__shadow" src={UNIFIED_RUNTIME_ASSETS.knowledge.shadow} alt="" width={375} height={477} unoptimized aria-hidden />
      <Image className="knowledge-native-overlay__board" src={UNIFIED_RUNTIME_ASSETS.knowledge.board} alt="" width={344} height={448} unoptimized aria-hidden />
      <Image className="knowledge-native-overlay__title" src={UNIFIED_RUNTIME_ASSETS.knowledge.title} alt="" width={188} height={58} unoptimized aria-hidden />
      <Image className="knowledge-native-overlay__vines" src={UNIFIED_RUNTIME_ASSETS.knowledge.vines} alt="" width={323} height={367} unoptimized aria-hidden />
      <div className="knowledge-native-overlay__body">
        <h2 className="sr-only">每日永續小知識</h2>
        {!unlocked ? (
          <div className="knowledge-native-overlay__locked" role="status"><Image src={UNIFIED_RUNTIME_ASSETS.knowledge.paper} alt="" fill sizes="320px" unoptimized aria-hidden /><Image className="knowledge-native-overlay__state-ink" src={UNIFIED_RUNTIME_ASSETS.knowledge.locked} alt="" fill sizes="320px" unoptimized aria-hidden /><div className="sr-only"><strong>Lv.3 解鎖</strong><p>到達 Lv.3 後，這張世界看板才會建立互動目標。</p></div></div>
        ) : (
          <>
            <div className="knowledge-native-overlay__question"><Image src={UNIFIED_RUNTIME_ASSETS.knowledge.paper} alt="" fill sizes="320px" unoptimized aria-hidden /><p>外帶餐點時，哪個做法更能減少一次性垃圾？</p></div>
            <div className="knowledge-native-overlay__options" role="radiogroup" aria-label="三個固定答案">
              {KNOWLEDGE_OPTIONS.map((option, index) => {
                const isSelected = selected === option.id;
                const isCorrect = result ? option.id === "reusable-container" : false;
                const isWrong = result ? result.selectedOptionId === option.id && !result.isCorrect : false;
                const optionState = isCorrect ? "correct" : isWrong ? "wrong" : isSelected ? "selected" : "idle";
                const optionAsset = optionState === "correct"
                  ? UNIFIED_RUNTIME_ASSETS.knowledge.optionCorrect[index]
                  : optionState === "wrong"
                    ? UNIFIED_RUNTIME_ASSETS.knowledge.optionWrong[index]
                    : optionState === "selected"
                      ? UNIFIED_RUNTIME_ASSETS.knowledge.optionSelected[index]
                      : UNIFIED_RUNTIME_ASSETS.knowledge.optionIdle[index];
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={completed || submitting}
                    className="knowledge-native-overlay__option ui-control"
                    onClick={() => setSelected(option.id)}
                    data-option-state={optionState}
                  >
                    <Image src={optionAsset} alt="" fill sizes="300px" unoptimized aria-hidden />
                    <span>{index + 1}</span><strong>{option.label}</strong>
                  </button>
                );
              })}
            </div>
            {result ? (
              <div className="knowledge-native-overlay__result" role="status" aria-live="polite">
                <Image src={UNIFIED_RUNTIME_ASSETS.knowledge.paper} alt="" fill sizes="320px" unoptimized aria-hidden />
                {result.isCorrect
                  ? <Image className="knowledge-native-overlay__result-ink knowledge-native-overlay__result-ink--correct" style={{ width: "56%", height: "auto" }} src={UNIFIED_RUNTIME_ASSETS.knowledge.correctStamp} alt="" width={149} height={32} unoptimized aria-hidden />
                  : <Image className="knowledge-native-overlay__result-ink" style={{ width: "65%", height: "auto" }} src={UNIFIED_RUNTIME_ASSETS.knowledge.completed} alt="" width={174} height={14} unoptimized aria-hidden />}
                <div><strong>{result.isCorrect ? "答對了" : "今天的作答已完成"}</strong>
                <p>{result.isCorrect ? `100 Stars · 50 EXP · Energy +${result.appliedEnergy}` : "30 EXP · Stars 0 · Energy 0"}</p>
                {result.energyFull ? <p>能量已滿</p> : null}</div>
              </div>
            ) : (
              <button type="button" className="knowledge-native-overlay__submit ui-control" disabled={!selected || submitting} onClick={() => void submit()}><Image src={selected ? UNIFIED_RUNTIME_ASSETS.knowledge.submit : UNIFIED_RUNTIME_ASSETS.knowledge.submitDisabled} alt="" fill sizes="160px" unoptimized aria-hidden /><span>{submitting ? "送出中…" : "確認答案"}</span></button>
            )}
            {error ? <p className="knowledge-native-overlay__error" role="alert">{error}</p> : null}
          </>
        )}
      </div>
    </OverlayFrame>
  );
}

export function StarsSummaryOverlay({ profile, onClose }: { profile: UserProgress; onClose: () => void }) {
  return (
    <OverlayFrame owner="stars_summary" label="星星摘要" onClose={onClose} className="stars-native-overlay">
      <Image src={UNIFIED_RUNTIME_ASSETS.starsSummary.base} alt="" fill sizes="(max-width: 780px) 92vw, 480px" unoptimized aria-hidden />
      <div><small>居民星星</small><h2>{profile.resources.starBalance} ⭐</h2><p>此處只讀取 Backend 星星餘額，不提供商店、兌換或花費 Route。</p></div>
    </OverlayFrame>
  );
}

export function CoreTreeOverlay({
  profile,
  reducedMotion,
  completionError = "",
  presentationState = "progress",
  onClose,
}: {
  profile: UserProgress;
  reducedMotion: boolean;
  completionError?: string;
  presentationState?: "progress" | "receiving";
  onClose: () => void;
}) {
  const growth = profile.growth;
  const hasGrowth = growth.carbonTotalGrams > 0 || growth.seedCount > 0 || growth.plantCount > 0 || growth.treeCount > 0;
  const worldState = reducedMotion ? "reduced_motion" : hasGrowth ? presentationState : "empty";
  return (
    <OverlayFrame owner="core_tree" label="核心樹成長狀態" onClose={onClose} className="core-tree-native-overlay" showDefaultClose={false}>
      <div className="core-tree-native-overlay__world" data-growth-world-state={worldState} data-growth-truth="backend-confirmed">
        <Image src={UNIFIED_RUNTIME_ASSETS.growth.treeRingBase} alt="" fill sizes="(max-width: 780px) 100vw, 462px" unoptimized aria-hidden />
        {worldState === "receiving" ? <><Image src={UNIFIED_RUNTIME_ASSETS.growth.treeRingReceiving} alt="" fill sizes="(max-width: 780px) 100vw, 462px" unoptimized aria-hidden /><Image src={UNIFIED_RUNTIME_ASSETS.growth.receiving} alt="" fill sizes="(max-width: 780px) 100vw, 462px" unoptimized aria-hidden /></> : null}
        {worldState === "progress" ? <><Image src={UNIFIED_RUNTIME_ASSETS.growth.treeRingProgress} alt="" fill sizes="(max-width: 780px) 100vw, 462px" unoptimized aria-hidden /><Image src={UNIFIED_RUNTIME_ASSETS.growth.focus} alt="" fill sizes="(max-width: 780px) 100vw, 462px" unoptimized aria-hidden /></> : null}
        {worldState === "reduced_motion" ? <Image src={UNIFIED_RUNTIME_ASSETS.growth.treeRingReducedMotion} alt="" fill sizes="(max-width: 780px) 100vw, 462px" unoptimized aria-hidden /> : null}
        {worldState === "empty" ? <Image src={UNIFIED_RUNTIME_ASSETS.growth.empty} alt="" fill sizes="(max-width: 780px) 100vw, 462px" unoptimized aria-hidden /> : null}
        <Image src={UNIFIED_RUNTIME_ASSETS.growth.recentPaper} alt="" fill sizes="(max-width: 780px) 100vw, 462px" unoptimized aria-hidden />
        {!hasGrowth ? <Image src={UNIFIED_RUNTIME_ASSETS.growth.recentEmpty} alt="" fill sizes="(max-width: 780px) 100vw, 462px" unoptimized aria-hidden /> : null}
        <Image src={UNIFIED_RUNTIME_ASSETS.growth.close} alt="" fill sizes="(max-width: 780px) 100vw, 462px" unoptimized aria-hidden />
        <div className="core-tree-native-overlay__values" aria-live="polite">
          <strong>核心樹</strong>
          <span>{(growth.carbonTotalGrams / 1000).toFixed(1)} kg CO₂e</span>
          <small>種子 {growth.seedCount} · 植物 {growth.plantCount} · 樹 {growth.treeCount}</small>
        </div>
        <p className="sr-only">成長資料只讀取 Backend confirmed growth；本互動不建立 CO₂e，也不建立第二套摘要 UI。</p>
        {completionError ? <p className="sr-only" role="alert">{completionError}</p> : null}
        <button type="button" className="core-tree-native-overlay__close ui-control" onClick={onClose} aria-label="關閉核心樹成長狀態" />
      </div>
    </OverlayFrame>
  );
}

export function TreehousePreviewOverlay({ owner, profile, onClose }: { owner: "treehouse_storage" | "treehouse_star_shelf"; profile: UserProgress; onClose: () => void }) {
  const shelf = owner === "treehouse_star_shelf";
  return (
    <OverlayFrame owner={owner} label={shelf ? "星星收藏架" : "樹屋收納櫃"} onClose={onClose} className="treehouse-preview-overlay">
      <h2>{shelf ? "星星收藏架" : "樹屋收納櫃"}</h2>
      <p>{shelf ? `目前有 ${profile.resources.starBalance} 顆星星。這裡只有摘要預覽。` : "收納功能仍在未來旅程；本次僅顯示 Locked／Preview 狀態。"}</p>
      <strong>Preview · Read-only</strong>
    </OverlayFrame>
  );
}

export function SettingsOverlay({
  preference,
  busy,
  error,
  onToggleMotion,
  onReplay,
  onLogout,
  onClose,
}: {
  preference: ResidentPreferenceState;
  busy: boolean;
  error: string;
  onToggleMotion: () => void;
  onReplay: () => void;
  onLogout: () => Promise<boolean>;
  onClose: () => void;
}) {
  const [view, setView] = useState<"root" | "logout_confirm" | "logout_processing" | "logout_failure">("root");

  async function confirmLogout() {
    setView("logout_processing");
    const completed = await onLogout();
    if (!completed) setView("logout_failure");
  }

  function closeOrBack() {
    if (view === "logout_processing") return;
    if (view === "root") onClose();
    else setView("root");
  }

  const rootStateAsset = preference.reducedMotion ? UNIFIED_RUNTIME_ASSETS.settings.rootOn : UNIFIED_RUNTIME_ASSETS.settings.rootOff;
  return (
    <OverlayFrame owner="settings" label="設定" onClose={closeOrBack} className="settings-native-overlay" showDefaultClose={false}>
      <div className="settings-native-overlay__formal-state" data-settings-state={view} data-settings-dynamic-text="runtime">
        {view === "root" ? (
          <>
            <Image src={rootStateAsset} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden />
            <Image src={UNIFIED_RUNTIME_ASSETS.settings.replayEntry} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden />
            <Image src={UNIFIED_RUNTIME_ASSETS.settings.supportEntry} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden />
            <Image src={UNIFIED_RUNTIME_ASSETS.settings.logoutEntry} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden />
            <Image src={UNIFIED_RUNTIME_ASSETS.settings.formalClose} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden />
            <h2 className="settings-native-overlay__title">設定</h2>
            <div className="settings-native-overlay__root-actions">
              <button type="button" className="settings-native-overlay__hotspot settings-native-overlay__hotspot--motion ui-control" onClick={onToggleMotion} aria-pressed={preference.reducedMotion}><span>減少動態效果</span><strong>{preference.reducedMotion ? "開" : "關"}</strong><small className="sr-only">帳號層保存：PENDING</small></button>
              <button type="button" className="settings-native-overlay__hotspot settings-native-overlay__hotspot--replay ui-control" onClick={onReplay}><span>Replay</span><strong>只重播呈現</strong></button>
              <button type="button" className="settings-native-overlay__hotspot settings-native-overlay__hotspot--support ui-control" disabled><span>Customer Support</span><strong>準備中</strong><small className="sr-only">provider = null · url = null · external_open = false</small></button>
              <button type="button" className="settings-native-overlay__hotspot settings-native-overlay__hotspot--logout ui-control" disabled={busy} onClick={() => setView("logout_confirm")}><span>登出</span><strong>確認後離開</strong></button>
            </div>
            <button type="button" className="settings-native-overlay__close ui-control" onClick={onClose} aria-label="關閉設定" />
          </>
        ) : (
          <>
            <Image src={UNIFIED_RUNTIME_ASSETS.settings.overlayShadow} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden />
            <Image src={UNIFIED_RUNTIME_ASSETS.settings.overlayBase} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden />
            <Image src={UNIFIED_RUNTIME_ASSETS.settings.overlayBorder} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden />
            <Image src={UNIFIED_RUNTIME_ASSETS.settings.focusScrim} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden />
            <Image src={UNIFIED_RUNTIME_ASSETS.settings.confirmPanel} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden />
            {view === "logout_confirm" ? <><Image src={UNIFIED_RUNTIME_ASSETS.settings.logoutConfirmation} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden /><Image src={UNIFIED_RUNTIME_ASSETS.settings.logoutCancel} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden /></> : null}
            {view === "logout_processing" ? <><Image src={UNIFIED_RUNTIME_ASSETS.settings.logoutProcessing} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden /><Image src={UNIFIED_RUNTIME_ASSETS.settings.processingIndicator} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden /></> : null}
            {view === "logout_failure" ? <><Image src={UNIFIED_RUNTIME_ASSETS.settings.logoutFailure} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden /><Image src={UNIFIED_RUNTIME_ASSETS.settings.failureIndicator} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden /><Image src={UNIFIED_RUNTIME_ASSETS.settings.logoutRetry} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden /><Image src={UNIFIED_RUNTIME_ASSETS.settings.logoutCancel} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden /></> : null}
            <div className="settings-native-overlay__logout-copy" aria-live="assertive">
              {view === "logout_confirm" ? <><h2>要登出居民世界嗎？</h2><p>登出不會刪除居民狀態或旅程紀錄。</p><div><button type="button" className="ui-control" onClick={() => void confirmLogout()}>確認登出</button><button type="button" className="ui-control" onClick={() => setView("root")}>取消</button></div></> : null}
              {view === "logout_processing" ? <><h2>正在登出</h2><p>正在由正式 Auth Authority 關閉 Session…</p></> : null}
              {view === "logout_failure" ? <><h2>登出未完成</h2><p role="alert">{error || "Session 仍保持登入，請重試或取消。"}</p><div><button type="button" className="ui-control" onClick={() => void confirmLogout()}>重試</button><button type="button" className="ui-control" onClick={() => setView("root")}>取消</button></div></> : null}
            </div>
            {view !== "logout_processing" ? <button type="button" className="settings-native-overlay__back ui-control" onClick={() => setView("root")} aria-label="返回設定" /> : null}
          </>
        )}
      </div>
    </OverlayFrame>
  );
}

export function RestaurantOverlay({ onClose }: { onClose: () => void }) {
  return (
    <OverlayFrame owner="restaurant" label="蔬食餐廳區施工公告" onClose={onClose} className="restaurant-native-overlay" showDefaultClose={false}>
      <div className="restaurant-native-overlay__attachment" data-source-world-object="forest_restaurant_construction" data-attachment-anchor="forest_restaurant_entry_anchor" data-logical-notice-rect="208,420,166,60" data-browser-center-positioning="0" data-safe-clamp="true">
        <Image src={UNIFIED_RUNTIME_ASSETS.restaurant.noticeShadow} alt="" fill sizes="166px" unoptimized aria-hidden />
        <Image src={UNIFIED_RUNTIME_ASSETS.restaurant.noticeBase} alt="" fill sizes="166px" unoptimized aria-hidden />
        <Image src={UNIFIED_RUNTIME_ASSETS.restaurant.noticeBorder} alt="" fill sizes="166px" unoptimized aria-hidden />
        <Image src={UNIFIED_RUNTIME_ASSETS.restaurant.preview} alt="" fill sizes="166px" unoptimized aria-hidden />
        <Image src={UNIFIED_RUNTIME_ASSETS.restaurant.close} alt="" fill sizes="166px" unoptimized aria-hidden />
        <span>蔬食餐廳區 · 施工中</span>
        <button type="button" className="restaurant-native-overlay__close ui-control" onClick={onClose} aria-label="關閉蔬食餐廳區施工公告" />
      </div>
      <p className="sr-only">Locked World Object。交易 0 · 任務碼 0 · 獎勵 0 · CO₂e 0。公告依 forest_restaurant_entry_anchor 附著，不使用瀏覽器置中。</p>
    </OverlayFrame>
  );
}
