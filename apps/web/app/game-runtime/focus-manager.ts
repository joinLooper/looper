export const PRIMARY_FOCUS_OWNERS = [
  "dialogue",
  "mission",
  "knowledge",
  "stars_summary",
  "settings",
  "restaurant",
  "core_tree",
  "treehouse_storage",
  "treehouse_star_shelf",
] as const;

export type PrimaryFocusOwner = (typeof PRIMARY_FOCUS_OWNERS)[number];

export interface GlobalFocusState {
  owner: PrimaryFocusOwner | null;
  triggerId: string | null;
  revision: number;
}

export type GlobalFocusAction =
  | { type: "claim"; owner: PrimaryFocusOwner; triggerId?: string | null }
  | { type: "release"; owner?: PrimaryFocusOwner }
  | { type: "scene_transition" };

export const INITIAL_GLOBAL_FOCUS_STATE: GlobalFocusState = {
  owner: null,
  triggerId: null,
  revision: 0,
};

export function globalFocusReducer(
  state: GlobalFocusState,
  action: GlobalFocusAction,
): GlobalFocusState {
  if (action.type === "scene_transition") {
    return { owner: null, triggerId: null, revision: state.revision + 1 };
  }
  if (action.type === "release") {
    if (action.owner && state.owner !== action.owner) return state;
    return { owner: null, triggerId: state.triggerId, revision: state.revision + 1 };
  }
  return {
    owner: action.owner,
    triggerId: action.triggerId ?? null,
    revision: state.revision + 1,
  };
}

export function activePrimaryFocusCount(state: GlobalFocusState): 0 | 1 {
  return state.owner === null ? 0 : 1;
}
