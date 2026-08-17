import type { KnowledgeCardRuntimeState, PlayerPresentationPreference, ResidentMissionBoardState, UserProgress } from "@looper/types";

export type RuntimeScene = "forest" | "treehouse";
export type DialogueCharacter = "rabbit" | "marmot";
export type SessionGateState = "checking" | "authenticated" | "unauthenticated" | "error";

export interface ResidentRuntimeState {
  profile: UserProgress;
  knowledge: KnowledgeRuntimeState | null;
  missions: ResidentMissionBoardState;
  presentationPreference: PlayerPresentationPreference;
}

export type KnowledgeRuntimeState = KnowledgeCardRuntimeState;

export interface ResidentPreferenceState {
  reducedMotion: boolean;
  backendReducedMotion: boolean | null;
  updatedAt: string | null;
  persistenceStatus: "system_default" | "saving" | "persisted" | "failed";
}
