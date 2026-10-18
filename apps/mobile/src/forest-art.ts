import type { ImageSourcePropType } from "react-native";
import type { DemoState } from "./model";
import { checklistKey, checklistRowsForDemo, type ChecklistKey } from "./forest-art-state";

/** Exact RGBA state exports from W2-02 B07 Phase2. No recolour or raster edits. */
const signs: Record<ChecklistKey, ImageSourcePropType> = {
  "000": require("../assets/forest-props/task_sign_000.png"),
  "001": require("../assets/forest-props/task_sign_001.png"),
  "010": require("../assets/forest-props/task_sign_010.png"),
  "011": require("../assets/forest-props/task_sign_011.png"),
  "100": require("../assets/forest-props/task_sign_100.png"),
  "101": require("../assets/forest-props/task_sign_101.png"),
  "110": require("../assets/forest-props/task_sign_110.png"),
  "111": require("../assets/forest-props/task_sign_111.png"),
};
const journals: Record<ChecklistKey, ImageSourcePropType> = {
  "000": require("../assets/forest-props/task_journal_000.png"),
  "001": require("../assets/forest-props/task_journal_001.png"),
  "010": require("../assets/forest-props/task_journal_010.png"),
  "011": require("../assets/forest-props/task_journal_011.png"),
  "100": require("../assets/forest-props/task_journal_100.png"),
  "101": require("../assets/forest-props/task_journal_101.png"),
  "110": require("../assets/forest-props/task_journal_110.png"),
  "111": require("../assets/forest-props/task_journal_111.png"),
};
export const FOREST_PROPS = {
  knowledge: require("../assets/forest-props/closed_knowledge_book.png") as ImageSourcePropType,
  backpack: require("../assets/forest-props/soft_pouch.png") as ImageSourcePropType,
  tools: require("../assets/forest-props/more_hanging_tag.png") as ImageSourcePropType,
};

export function illustratedChecklistSources(state: Pick<DemoState,"missionComplete"|"cared">) {
  const key = checklistKey(checklistRowsForDemo(state));
  return { key, sign: signs[key], journal: journals[key] };
}

/** Future official missions can address any of the eight art-provided states. */
export function checklistSourcesByKey(key: ChecklistKey) {
  return { sign: signs[key], journal: journals[key] };
}
