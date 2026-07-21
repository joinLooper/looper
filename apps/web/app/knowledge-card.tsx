"use client";

import { useEffect, useReducer } from "react";
import {
  APPROVED_MVP_KNOWLEDGE_QUESTION,
  KNOWLEDGE_REWARD_LABEL,
  initialKnowledgeCardState,
  knowledgeAnswerOutcome,
  reduceKnowledgeCard,
} from "./knowledge-card-flow";
import { AssetButton, AssetSurface, UiIcon } from "./ui-primitives";

export function KnowledgeCard({ onClose }: { onClose: () => void }) {
  const [state, dispatch] = useReducer(reduceKnowledgeCard, initialKnowledgeCardState);
  const outcome = knowledgeAnswerOutcome(state);

  useEffect(() => {
    dispatch({ type: "load" });
    const timer = window.setTimeout(() => {
      dispatch({ type: "loaded", question: APPROVED_MVP_KNOWLEDGE_QUESTION });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (state.rewardStatus !== "pending") return undefined;
    const timer = window.setTimeout(() => dispatch({ type: "reward_unavailable" }), 0);
    return () => window.clearTimeout(timer);
  }, [state.rewardStatus]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="modal-backdrop knowledge-backdrop" role="presentation">
      <AssetSurface
        assetId="ui_dialog"
        state={state.phase === "loading" ? "loading" : state.phase === "error" ? "error" : "default"}
        className={`knowledge-card knowledge-card--${state.phase}`}
        labelledBy="knowledge-card-title"
        role="dialog"
        ariaModal
      >
        <button type="button" className="dialog-icon-button knowledge-card__close ui-control" aria-label="關閉永續小知識" onClick={onClose}>
          <UiIcon assetId="ui_icon_close" />
        </button>
        <header className="knowledge-card__header">
          <UiIcon assetId="ui_icon_knowledge" />
          <div>
            <span>補充</span>
            <h2 id="knowledge-card-title">永續小知識</h2>
          </div>
        </header>

        {state.phase === "loading" || state.phase === "initial" ? (
          <div className="knowledge-card__status" role="status">
            <UiIcon assetId="ui_icon_loading" className="spinning-icon" />
            <p>正在準備題目...</p>
          </div>
        ) : state.phase === "error" ? (
          <div className="knowledge-card__status" role="alert">
            <UiIcon assetId="ui_icon_error" />
            <p>{state.errorMessage || "題目暫時無法載入。"}</p>
            <AssetButton onClick={() => dispatch({ type: "retry" })}>重試</AssetButton>
          </div>
        ) : state.question ? (
          <>
            <p className="knowledge-card__question">{state.question.prompt}</p>
            <div className="knowledge-card__answers" role="radiogroup" aria-label="答案選項">
              {state.question.answers.map((answer) => {
                const selected = state.selectedAnswerId === answer.id;
                const isCorrect = outcome && answer.id === state.question?.correctAnswerId;
                return (
                  <button
                    key={answer.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`knowledge-answer${selected ? " is-selected" : ""}${isCorrect ? " is-correct" : ""}`}
                    disabled={Boolean(outcome)}
                    onClick={() => dispatch({ type: "select", answerId: answer.id })}
                  >
                    <span>{answer.label}</span>
                    {isCorrect ? <UiIcon assetId="ui_icon_success" /> : null}
                  </button>
                );
              })}
            </div>

            {outcome ? (
              <div className={`knowledge-feedback knowledge-feedback--${outcome}`} role="status">
                <strong>{outcome === "correct" ? "答對了" : "這題答錯了"}</strong>
                <p>{outcome === "correct" ? "你掌握了這個減廢方法。" : "沒關係，看看補充後再繼續。"}</p>
                <p className="knowledge-supplement"><span>補充</span>{state.question.supplement}</p>
                <div className="knowledge-reward-row" aria-label={`本題獎勵 ${KNOWLEDGE_REWARD_LABEL}`}>
                  <span aria-hidden="true" />
                  <strong className="knowledge-reward">{KNOWLEDGE_REWARD_LABEL}</strong>
                  <span aria-hidden="true" />
                </div>
                <small className="knowledge-reward-note">
                  {state.rewardStatus === "pending"
                    ? "正在確認入帳能力..."
                    : state.rewardStatus === "completed"
                      ? "已由中央玩家資料入帳"
                      : state.rewardStatus === "error"
                        ? "入帳確認失敗，未重複送出"
                        : "尚待正式入帳；目前不會變更玩家 EXP"}
                </small>
                <AssetButton onClick={onClose}>完成</AssetButton>
              </div>
            ) : (
              <AssetButton
                onClick={() => dispatch({ type: "submit" })}
                disabled={!state.selectedAnswerId}
              >
                確認答案
              </AssetButton>
            )}
          </>
        ) : null}
      </AssetSurface>
    </div>
  );
}
