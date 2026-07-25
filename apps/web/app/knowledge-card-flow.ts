export const KNOWLEDGE_REWARD_LABEL = "+30 EXP";

export type KnowledgeAnswer = {
  id: string;
  label: string;
};

export type KnowledgeQuestion = {
  id: string;
  version: string;
  prompt: string;
  answers: KnowledgeAnswer[];
  correctAnswerId: string;
  supplement: string;
};

export const APPROVED_MVP_KNOWLEDGE_QUESTION: KnowledgeQuestion = {
  id: "sustainable-takeaway-container-v1",
  version: "v1",
  prompt: "外帶餐點時，哪一個做法通常能減少一次性垃圾？",
  answers: [
    { id: "reusable-container", label: "自備可重複使用的餐盒" },
    { id: "extra-bag", label: "每樣餐點多套一層塑膠袋" },
    { id: "extra-cutlery", label: "索取多份免洗餐具" },
  ],
  correctAnswerId: "reusable-container",
  supplement: "自備可重複使用的餐盒與餐具，可以減少一次性容器的使用量。",
};

export type KnowledgePhase =
  | "initial"
  | "loading"
  | "ready"
  | "selected"
  | "correct"
  | "incorrect"
  | "error";

export type KnowledgeRewardStatus =
  | "idle"
  | "pending"
  | "completed"
  | "unavailable"
  | "error";

export type KnowledgeCardState = {
  phase: KnowledgePhase;
  question: KnowledgeQuestion | null;
  selectedAnswerId: string | null;
  rewardStatus: KnowledgeRewardStatus;
  errorMessage: string;
};

export const initialKnowledgeCardState: KnowledgeCardState = {
  phase: "initial",
  question: null,
  selectedAnswerId: null,
  rewardStatus: "idle",
  errorMessage: "",
};

export type KnowledgeCardAction =
  | { type: "load" }
  | { type: "loaded"; question: KnowledgeQuestion }
  | { type: "load_failed"; message: string }
  | { type: "select"; answerId: string }
  | { type: "submit" }
  | { type: "answer_succeeded"; isCorrect: boolean }
  | { type: "reward_completed" }
  | { type: "reward_unavailable" }
  | { type: "reward_failed"; message: string }
  | { type: "retry" };

export function reduceKnowledgeCard(
  state: KnowledgeCardState,
  action: KnowledgeCardAction,
): KnowledgeCardState {
  switch (action.type) {
    case "load":
    case "retry":
      return { ...initialKnowledgeCardState, phase: "loading" };
    case "loaded":
      return {
        ...initialKnowledgeCardState,
        phase: "ready",
        question: action.question,
      };
    case "load_failed":
      return {
        ...initialKnowledgeCardState,
        phase: "error",
        errorMessage: action.message,
      };
    case "select":
      if (!state.question || state.phase === "correct" || state.phase === "incorrect") return state;
      if (!state.question.answers.some((answer) => answer.id === action.answerId)) return state;
      return { ...state, phase: "selected", selectedAnswerId: action.answerId };
    case "submit": {
      if (!state.question || !state.selectedAnswerId) return state;
      if (state.phase === "correct" || state.phase === "incorrect" || state.rewardStatus === "pending" || state.rewardStatus === "completed") return state;
      return {
        ...state,
        phase: "selected",
        rewardStatus: "pending",
      };
    }
    case "answer_succeeded":
      if (state.rewardStatus !== "pending") return state;
      return { ...state, phase: action.isCorrect ? "correct" : "incorrect" };
    case "reward_completed":
      if (state.rewardStatus !== "pending") return state;
      return { ...state, rewardStatus: "completed" };
    case "reward_unavailable":
      if (state.rewardStatus !== "pending") return state;
      return { ...state, rewardStatus: "unavailable" };
    case "reward_failed":
      if (state.rewardStatus !== "pending") return state;
      return { ...state, rewardStatus: "error", errorMessage: action.message };
    default:
      return state;
  }
}

export function knowledgeAnswerOutcome(state: KnowledgeCardState): "correct" | "incorrect" | null {
  return state.phase === "correct" || state.phase === "incorrect" ? state.phase : null;
}
