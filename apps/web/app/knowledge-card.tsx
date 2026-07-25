"use client";

import type { KnowledgeCardAnswerResult } from "@looper/types";
import { useEffect, useReducer, useRef } from "react";
import {
  APPROVED_MVP_KNOWLEDGE_QUESTION,
  KNOWLEDGE_REWARD_LABEL,
  initialKnowledgeCardState,
  knowledgeAnswerOutcome,
  reduceKnowledgeCard,
} from "./knowledge-card-flow";
import { AssetButton, AssetSurface, UiIcon } from "./ui-primitives";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function KnowledgeCard({ playerId, onClose, onAuthorizationFailure, onRewardApplied }: {
  playerId: string;
  onClose: () => void;
  onAuthorizationFailure: () => void;
  onRewardApplied: () => void;
}) {
  const [state, dispatch] = useReducer(reduceKnowledgeCard, initialKnowledgeCardState);
  const outcome = knowledgeAnswerOutcome(state);
  const requestInFlight = useRef(false);

  useEffect(() => {
    dispatch({ type: "load" });
    const timer = window.setTimeout(() => {
      dispatch({ type: "loaded", question: APPROVED_MVP_KNOWLEDGE_QUESTION });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (state.rewardStatus !== "pending" || !state.question || !state.selectedAnswerId || requestInFlight.current) return undefined;
    const controller = new AbortController();
    requestInFlight.current = true;
    const storageKey = `looper.web.knowledgeCard.${playerId}.${state.question.id}.${state.question.version}`;
    let idempotencyKey = window.localStorage.getItem(storageKey);
    if (!idempotencyKey) {
      idempotencyKey = `knowledge-card-ui:${crypto.randomUUID()}`;
      window.localStorage.setItem(storageKey, idempotencyKey);
    }
    void fetch(`${API_URL}/player/knowledge-cards/${encodeURIComponent(state.question.id)}/answers`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selectedOptionId: state.selectedAnswerId, cardVersion: state.question.version, idempotencyKey }),
      signal: controller.signal,
    }).then(async (response) => {
      if (response.status === 401 || response.status === 403) {
        onAuthorizationFailure();
        return;
      }
      const result = await response.json() as KnowledgeCardAnswerResult & { message?: string };
      if (!response.ok) throw new Error(result.message ?? "EXP 入帳失敗");
      dispatch({ type: "answer_succeeded", isCorrect: result.isCorrect });
      dispatch({ type: "reward_completed" });
      onRewardApplied();
    }).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      dispatch({ type: "reward_failed", message: error instanceof Error ? error.message : "EXP 入帳失敗" });
    }).finally(() => {
      requestInFlight.current = false;
    });
    return () => controller.abort();
  }, [onAuthorizationFailure, onRewardApplied, playerId, state.question, state.rewardStatus, state.selectedAnswerId]);

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
                {state.rewardStatus === "error" ? <AssetButton onClick={() => dispatch({ type: "submit" })}>重試入帳</AssetButton> : null}
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
