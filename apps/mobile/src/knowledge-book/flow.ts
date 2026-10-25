/** Issue #67: memory-only QA. No economy client, reward, persistence or ledger. */
export type PaperState = "unanswered" | "selected" | "correct" | "incorrect" | "completed";
export type Stage = "intro" | PaperState | "ENERGY_POLICY_PENDING" | "level-locked";
export type Question = { id: string; title: string; options: readonly string[]; answer: number; explanation: string; illustration: "food-waste-example" | null };
export const QUESTIONS: readonly Question[] = [
  { id: "qa-food-01", title: "家裡有即將到期的食材，怎麼做更能減少浪費？", options: ["先檢查保存狀況，優先安排食用", "直接丟掉所有食材", "繼續購買相同食材", "只看包裝顏色決定"], answer: 0, explanation: "先確認食材的保存狀況與食用安全，再安排份量和順序，有助於減少不必要的浪費。這是 QA 範例題，沒有正式獎勵。", illustration: "food-waste-example" },
  { id: "qa-reuse-02", title: "出門買飲料前，哪個準備可以減少一次性用品？", options: ["每次多拿幾個塑膠袋", "準備乾淨的可重複使用杯", "丟掉還能使用的杯子", "不管需求都索取吸管"], answer: 1, explanation: "攜帶乾淨、適合盛裝飲品的可重複使用杯，並依店家規定使用，可以減少一次性容器。這題沒有套用惜食插畫。", illustration: null },
  { id: "qa-policy-03", title: "第三題政策檢查", options: ["A", "B", "C", "D"], answer: 0, explanation: "第三題等待正式活力政策，不允許送出答案。", illustration: null },
];
export type Receipt = { questionId: string; selected: number; correct: boolean };
export type Session = { day: string; level: number; stage: Stage; questionId: string | null; selected: number | null; receipts: readonly Receipt[] };
export type Action = { type: "open"; questionId?: string } | { type: "select"; option: number } | { type: "submit" } | { type: "complete" } | { type: "next" } | { type: "close" } | { type: "level"; level: number } | { type: "day"; day: string };
export function qaEnabled(dev: boolean, optIn?: string) { return dev || optIn === "1"; }
export function taipeiDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function createSession(day: string, level: number): Session { return { day, level, stage: "intro", questionId: null, selected: null, receipts: [] }; }
export function currentQuestion(state: Session) { return QUESTIONS.find(q => q.id === state.questionId); }
function open(state: Session, questionId: string): Session {
  if (!QUESTIONS.some(q => q.id === questionId)) return state;
  if (state.level < 3) return { ...state, stage: "level-locked", questionId: null, selected: null };
  const receipt = state.receipts.find(r => r.questionId === questionId);
  if (receipt) return { ...state, questionId, selected: receipt.selected, stage: "completed" };
  // The third fixture always exercises the pending policy; never infer an energy cost.
  if (state.receipts.length >= 2 || questionId === QUESTIONS[2].id) return { ...state, questionId, selected: null, stage: "ENERGY_POLICY_PENDING" };
  return { ...state, questionId, selected: null, stage: "unanswered" };
}
export function reducer(state: Session, action: Action): Session {
  switch (action.type) {
    case "day": return action.day === state.day ? state : createSession(action.day, state.level);
    case "level": return Number.isInteger(action.level) && action.level >= 1 ? { ...state, level: action.level, stage: "intro", questionId: null, selected: null } : state;
    case "close": return { ...state, stage: "intro", questionId: null, selected: null };
    case "open": return open(state, action.questionId ?? QUESTIONS[0].id);
    case "select": {
      const q = currentQuestion(state);
      if (state.level < 3 || !q || !["unanswered", "selected"].includes(state.stage) || !Number.isInteger(action.option) || action.option < 0 || action.option >= q.options.length) return state;
      return { ...state, selected: action.option, stage: "selected" };
    }
    case "submit": {
      const q = currentQuestion(state);
      if (state.level < 3 || state.stage !== "selected" || !q || state.selected === null || state.receipts.some(r => r.questionId === q.id)) return state;
      if (state.receipts.length >= 2 || q.id === QUESTIONS[2].id) return { ...state, stage: "ENERGY_POLICY_PENDING", selected: null };
      const receipt = { questionId: q.id, selected: state.selected, correct: state.selected === q.answer };
      return { ...state, stage: receipt.correct ? "correct" : "incorrect", receipts: [...state.receipts, receipt] };
    }
    case "complete": return ["correct", "incorrect"].includes(state.stage) ? { ...state, stage: "completed" } : state;
    case "next": {
      if (state.stage !== "completed") return state;
      const index = QUESTIONS.findIndex(q => q.id === state.questionId);
      return index >= 0 && index < QUESTIONS.length - 1 ? open(state, QUESTIONS[index + 1].id) : state;
    }
  }
}
