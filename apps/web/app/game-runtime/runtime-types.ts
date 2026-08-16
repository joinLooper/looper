import type { KnowledgeCardRuntimeState, ResidentMissionBoardState, UserProgress } from "@looper/types";

export type RuntimeScene = "forest" | "treehouse";
export type DialogueCharacter = "rabbit" | "marmot";
export type SessionGateState = "checking" | "authenticated" | "unauthenticated" | "error";

export interface ResidentRuntimeState {
  profile: UserProgress;
  knowledge: KnowledgeRuntimeState | null;
  missions: ResidentMissionBoardState;
}

export type KnowledgeRuntimeState = KnowledgeCardRuntimeState;

export interface ResidentPreferenceState {
  reducedMotion: boolean;
  persistenceStatus: "pending";
}
