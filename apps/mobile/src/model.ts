/** Local fixtures only. This module is never imported by the API or economy. */
export type DemoLevel = 1 | 5;
export type DemoState = {
  level: DemoLevel;
  answer: "reuse" | "single-use" | null;
  missionComplete: boolean;
  cared: boolean;
  reduceMotion: boolean;
};
export const INITIAL_STATE: DemoState = {
  level: 1,
  answer: null,
  missionComplete: false,
  cared: false,
  reduceMotion: false,
};
export const RESOURCES = Object.freeze({ exp: 20, stars: 6, energy: 8 });
export type Action =
  | { type: "level"; level: DemoLevel }
  | { type: "answer"; answer: Exclude<DemoState["answer"], null> }
  | { type: "mission" }
  | { type: "care" }
  | { type: "motion"; enabled: boolean }
  | { type: "reset" };
export function demoReducer(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case "level":
      return { ...state, level: action.level };
    case "answer":
      return state.answer === "reuse"
        ? state
        : { ...state, answer: action.answer };
    case "mission":
      return state.missionComplete
        ? state
        : { ...state, missionComplete: true };
    case "care":
      return { ...state, cared: true };
    case "motion":
      return { ...state, reduceMotion: action.enabled };
    case "reset":
      return { ...INITIAL_STATE };
  }
}
/** Derived demo-only steps. Never maps to ledger, EXP, energy or real missions. */
export function demoJourney(state: DemoState) {
  const steps = [
    { id: "knowledge", label: "完成每日知識", done: state.answer === "reuse" },
    { id: "mission", label: "完成小任務", done: state.missionComplete },
    { id: "sprout", label: "關心森林嫩芽", done: state.cared },
  ] as const;
  const next = steps.find((step) => !step.done) ?? null;
  return {
    completed: steps.filter((step) => step.done).length,
    total: steps.length,
    next: next?.id ?? null,
    nextLabel: next?.label ?? "今天的示範互動已完成",
  };
}

export const CHARACTER_SLOTS = {
  marmot: {
    id: "marmot",
    label: "土撥鼠",
    minimumLevel: 1,
    x: 420,
    y: 650,
    width: 190,
    height: 260,
    status: "ART_PENDING",
    pose: "自然站姿・雙手輕放身前",
    source: null,
  },
  rabbit: {
    id: "rabbit",
    label: "兔兔",
    minimumLevel: 5,
    x: 760,
    y: 530,
    width: 155,
    height: 220,
    status: "ART_PENDING",
    pose: "待獨立美術線核准",
    source: null,
  },
} as const;
export function sceneVisibility(level: DemoLevel) {
  return { marmot: true, rabbit: level >= 5, treehouseEntrance: level >= 5 };
}
export const ANCHORS = {
  stump: { x: 190, y: 720 },
  sprout: { x: 740, y: 790 },
  treehouse: { x: 780, y: 290 },
} as const;
export function fitScene(width: number, height: number) {
  const size = Math.max(1, Math.min(width, height));
  return { size, scale: size / 1000 };
}
export function logicalRect(
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
) {
  return {
    left: (x - width / 2) * scale,
    top: (y - height / 2) * scale,
    width: width * scale,
    height: height * scale,
  };
}
