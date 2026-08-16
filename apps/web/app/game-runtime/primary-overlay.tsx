"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
}: {
  owner: PrimaryFocusOwner;
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div className={`game-primary-overlay game-primary-overlay--${owner} ${className}`} data-focus-owner={owner}>
      <section className="game-primary-overlay__content" role="dialog" aria-modal="true" aria-label={label}>
        <button ref={closeRef} type="button" className="game-primary-overlay__close ui-control" onClick={onClose} aria-label={`關閉${label}`}>×</button>
        {children}
      </section>
    </div>
  );
}

export function DialogueOverlay({
  character,
  scene,
  reducedMotion,
  onClose,
}: {
  character: DialogueCharacter;
  scene: "forest" | "treehouse";
  reducedMotion: boolean;
  onClose: () => void;
}) {
  const [line, setLine] = useState(0);
  const isRabbit = character === "rabbit";
  const lines = isRabbit
    ? ["歡迎回來，今天也一起照顧森林吧。", "森林任務和永續小知識都在世界裡等你。"]
    : ["每一次真正完成的行動，都會留在你的居民紀錄。", "先慢慢看看樹與小屋，不用急著把旅程走完。"];
  const bubble = reducedMotion
    ? UNIFIED_RUNTIME_ASSETS.dialogue.reduced
    : isRabbit
      ? scene === "forest" ? UNIFIED_RUNTIME_ASSETS.dialogue.rabbitLeft : UNIFIED_RUNTIME_ASSETS.dialogue.rabbitRight
      : scene === "forest" ? UNIFIED_RUNTIME_ASSETS.dialogue.marmotRight : UNIFIED_RUNTIME_ASSETS.dialogue.marmotLeft;
  return (
    <OverlayFrame owner="dialogue" label={`${isRabbit ? "兔兔" : "土撥鼠"}對話`} onClose={onClose} className="dialogue-native-overlay">
      <Image src={bubble} alt="" fill sizes="(max-width: 780px) 92vw, 520px" unoptimized aria-hidden />
      <div className="dialogue-native-overlay__copy" aria-live="polite">
        <small>{isRabbit ? "兔兔" : "土撥鼠"}</small>
        <p>{lines[line]}</p>
        {line < lines.length - 1 ? (
          <button type="button" className="dialogue-native-overlay__continue ui-control" onClick={() => setLine((value) => value + 1)}>繼續</button>
        ) : (
          <button type="button" className="dialogue-native-overlay__continue ui-control" onClick={onClose}>好</button>
        )}
      </div>
    </OverlayFrame>
  );
}

export function MissionBoardOverlay({ state, onClose }: { state: ResidentMissionBoardState; onClose: () => void }) {
  return (
    <OverlayFrame owner="mission" label="森林任務" onClose={onClose} className="mission-native-overlay">
      <Image src={UNIFIED_RUNTIME_ASSETS.mission.boardShadow} alt="" fill sizes="(max-width: 780px) 96vw, 600px" loading="eager" unoptimized aria-hidden />
      <Image src={UNIFIED_RUNTIME_ASSETS.mission.boardBase} alt="" fill sizes="(max-width: 780px) 96vw, 600px" unoptimized aria-hidden />
      <Image src={UNIFIED_RUNTIME_ASSETS.mission.boardFrame} alt="" fill sizes="(max-width: 780px) 96vw, 600px" unoptimized aria-hidden />
      <Image src={UNIFIED_RUNTIME_ASSETS.mission.todaySection} alt="" fill sizes="(max-width: 780px) 96vw, 600px" unoptimized aria-hidden />
      <Image src={UNIFIED_RUNTIME_ASSETS.mission.weeklySection} alt="" fill sizes="(max-width: 780px) 96vw, 600px" unoptimized aria-hidden />
      <Image src={UNIFIED_RUNTIME_ASSETS.mission.paperShadow} alt="" fill sizes="(max-width: 780px) 96vw, 600px" unoptimized aria-hidden />
      <Image src={UNIFIED_RUNTIME_ASSETS.mission.paper} alt="" fill sizes="(max-width: 780px) 96vw, 600px" unoptimized aria-hidden />
      <Image className="mission-native-overlay__stamp-layer" src={UNIFIED_RUNTIME_ASSETS.mission.stamp} alt="" fill sizes="(max-width: 780px) 96vw, 600px" unoptimized aria-hidden />
      <div className="mission-native-overlay__body">
        <h2 className="sr-only">森林任務</h2>
        <article className="mission-native-overlay__today" aria-label="Today：今日來訪，已完成">
          <small>Today · {state.businessDate.slice(5)}</small>
          <h3>{state.today[0].name}</h3>
          <p>居民 Session 已確認。</p>
          <p className="mission-native-overlay__zero">{state.today[0].reward.stars}⭐ · EXP {state.today[0].reward.exp} · Energy {state.today[0].reward.energy} · CO₂e {state.today[0].reward.carbonGrams}</p>
          <span className="sr-only">Non-Merchant P0 Mission，已完成，獎勵零。</span>
        </article>
        <article className="mission-native-overlay__weekly" aria-label="Weekly：預覽，目前沒有進度">
          <small>Weekly</small>
          <h3>每週旅程準備中</h3>
          <p>Backend Authority pending · 進度／獎勵 0</p>
        </article>
      </div>
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

export function CoreTreeOverlay({ profile, onClose }: { profile: UserProgress; onClose: () => void }) {
  const growth = profile.growth;
  return (
    <OverlayFrame owner="core_tree" label="核心樹成長摘要" onClose={onClose} className="core-tree-native-overlay">
      <div className="core-tree-native-overlay__tree" aria-hidden>🌳</div>
      <div><small>Backend confirmed growth</small><h2>核心樹</h2><p>累積 {(growth.carbonTotalGrams / 1000).toFixed(1)} kg CO₂e</p><p>🌱 {growth.seedCount}　🪴 {growth.plantCount}　🌳 {growth.treeCount}</p><p>只有正式餐食資料能生成成長；本互動不建立 CO₂e。</p></div>
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
  onLogout: () => Promise<void>;
  onClose: () => void;
}) {
  return (
    <OverlayFrame owner="settings" label="設定" onClose={onClose} className="settings-native-overlay">
      <Image src={UNIFIED_RUNTIME_ASSETS.settings.overlayShadow} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden />
      <Image src={UNIFIED_RUNTIME_ASSETS.settings.overlayBase} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden />
      <Image src={UNIFIED_RUNTIME_ASSETS.settings.overlayBorder} alt="" fill sizes="(max-width: 780px) 94vw, 540px" unoptimized aria-hidden />
      <div className="settings-native-overlay__body">
        <h2>設定</h2>
        <button type="button" className="settings-native-overlay__row ui-control" onClick={onToggleMotion} aria-pressed={preference.reducedMotion}><span>減少動態效果</span><strong>{preference.reducedMotion ? "開" : "關"}</strong></button>
        <small>帳號層保存狀態：PENDING；目前只改本次 Presentation。</small>
        <button type="button" className="settings-native-overlay__row ui-control" onClick={onReplay}><span>Replay</span><strong>重播呈現</strong></button>
        <button type="button" className="settings-native-overlay__row ui-control" disabled><span>Customer Support</span><strong>準備中</strong></button>
        <small>provider = null · url = null · external_open = false</small>
        <button type="button" className="settings-native-overlay__row settings-native-overlay__row--logout ui-control" disabled={busy} onClick={() => void onLogout()}><span>登出</span><strong>{busy ? "處理中" : "離開居民世界"}</strong></button>
        {error ? <p role="alert">{error}</p> : null}
      </div>
    </OverlayFrame>
  );
}

export function RestaurantOverlay({ onClose }: { onClose: () => void }) {
  return (
    <OverlayFrame owner="restaurant" label="蔬食餐廳區施工公告" onClose={onClose} className="restaurant-native-overlay">
      <Image src={UNIFIED_RUNTIME_ASSETS.restaurant.noticeShadow} alt="" fill sizes="(max-width: 780px) 94vw, 560px" unoptimized aria-hidden />
      <Image src={UNIFIED_RUNTIME_ASSETS.restaurant.noticeBase} alt="" fill sizes="(max-width: 780px) 94vw, 560px" unoptimized aria-hidden />
      <Image src={UNIFIED_RUNTIME_ASSETS.restaurant.noticeBorder} alt="" fill sizes="(max-width: 780px) 94vw, 560px" unoptimized aria-hidden />
      <Image src={UNIFIED_RUNTIME_ASSETS.restaurant.preview} alt="" fill sizes="(max-width: 780px) 94vw, 560px" unoptimized aria-hidden />
      <div><small>Locked World Object</small><h2>蔬食餐廳區</h2><p>森林夥伴正在準備這個區域，先從施工圍籬看看未來旅程吧。</p><strong>交易 0 · 任務碼 0 · 獎勵 0 · CO₂e 0</strong></div>
    </OverlayFrame>
  );
}
