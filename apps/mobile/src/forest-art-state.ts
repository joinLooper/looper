/** Pure visual state for approved B07 art; no backend or Economy coupling. */
import type { DemoState } from "./model";

export type ChecklistKey = "000" | "001" | "010" | "011" | "100" | "101" | "110" | "111";
export type ChecklistRows = readonly [boolean, boolean, boolean];

export function checklistKey(rows: ChecklistRows): ChecklistKey {
  return rows.map((done) => (done ? "1" : "0")).join("") as ChecklistKey;
}

/**
 * The first illustrated sample row starts checked, exactly as in the approved
 * source. The other two local demonstration marks follow actions already in
 * DemoState. These are VISUAL fixtures, not a real 3-task ledger.
 */
export function checklistRowsForDemo(
  state: Pick<DemoState, "missionComplete" | "cared">,
): ChecklistRows {
  return [true, state.missionComplete, state.cared];
}

/** Image frame is relative to the native Pressable hit rect (logical 1000 world).
 * Exact pivot-based placement from B07 LOCKED_FOREST_PLACEMENT / approved sample.
 * Source canvas/padding are never trimmed or stretched.
 */
export const FOREST_ART_FRAMES = {
  knowledge: { left: -12.605, top: -18.42, width: 76.125, height: 76.125 },
  mission: { left: -6.12, top: -12.32, width: 110.239, height: 110.239 },
  backpack: { left: -0.187, top: -3.665, width: 79.617, height: 79.617 },
  tools: { left: -28.4, top: -56.275, width: 115.2, height: 115.2 },
} as const;
