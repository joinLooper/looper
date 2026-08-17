import type {
  CoreTreeMissionCompletionResult,
  KnowledgeCardAnswerInput,
  KnowledgeCardAnswerResult,
  PlayerPresentationPreference,
  PlayerSessionContext,
  ResidentMissionBoardState,
  ResidentMissionClaimResult,
  UserProgress,
} from "@looper/types";
import { authenticatedPlayerRequest, playerMutationRequest } from "../player-session-flow";
import type { KnowledgeRuntimeState, ResidentRuntimeState } from "./runtime-types";

export const RUNTIME_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { message?: string };
  if (!response.ok) throw Object.assign(new Error(body.message ?? "居民資料暫時無法同步"), { status: response.status });
  return body;
}

export async function fetchPlayerSession(): Promise<PlayerSessionContext | null> {
  const response = await fetch(`${RUNTIME_API_URL}/auth/player/session`, authenticatedPlayerRequest);
  if (response.status === 401) return null;
  return responseJson<PlayerSessionContext>(response);
}

export async function fetchResidentRuntime(): Promise<ResidentRuntimeState> {
  const [profileResponse, knowledgeResponse, missionsResponse, presentationPreferenceResponse] = await Promise.all([
    fetch(`${RUNTIME_API_URL}/player/state`, authenticatedPlayerRequest),
    fetch(`${RUNTIME_API_URL}/player/knowledge-cards/sustainable-takeaway-container-v1`, authenticatedPlayerRequest),
    fetch(`${RUNTIME_API_URL}/player/missions/runtime`, authenticatedPlayerRequest),
    fetch(`${RUNTIME_API_URL}/player/preferences/presentation`, authenticatedPlayerRequest),
  ]);
  const profile = await responseJson<UserProgress>(profileResponse);
  const knowledge = knowledgeResponse.status === 404
    ? null
    : await responseJson<KnowledgeRuntimeState>(knowledgeResponse);
  const missions = await responseJson<ResidentMissionBoardState>(missionsResponse);
  const presentationPreference = await responseJson<PlayerPresentationPreference>(presentationPreferenceResponse);
  return { profile, knowledge, missions, presentationPreference };
}

export async function updatePresentationPreference(reducedMotion: boolean): Promise<PlayerPresentationPreference> {
  const response = await fetch(
    `${RUNTIME_API_URL}/player/preferences/presentation`,
    playerMutationRequest({ reducedMotion }),
  );
  return responseJson<PlayerPresentationPreference>(response);
}

export async function answerDailyKnowledge(input: KnowledgeCardAnswerInput): Promise<KnowledgeCardAnswerResult> {
  const response = await fetch(
    `${RUNTIME_API_URL}/player/knowledge-cards/sustainable-takeaway-container-v1/answers`,
    playerMutationRequest(input),
  );
  return responseJson<KnowledgeCardAnswerResult>(response);
}

export async function recordCoreTreeOpen(): Promise<CoreTreeMissionCompletionResult> {
  const response = await fetch(
    `${RUNTIME_API_URL}/player/world/core-tree/interactions/open`,
    playerMutationRequest({}),
  );
  return responseJson<CoreTreeMissionCompletionResult>(response);
}

export async function claimResidentMission(instanceId: string, idempotencyKey: string): Promise<ResidentMissionClaimResult> {
  const response = await fetch(
    `${RUNTIME_API_URL}/player/missions/instances/${encodeURIComponent(instanceId)}/claim`,
    playerMutationRequest({ idempotencyKey }),
  );
  return responseJson<ResidentMissionClaimResult>(response);
}

export async function logoutResident(): Promise<void> {
  const request = playerMutationRequest(undefined, "DELETE");
  const response = await fetch(
    `${RUNTIME_API_URL}/auth/player/session`,
    { ...request, signal: AbortSignal.timeout(5_000) },
  );
  if (!response.ok) throw new Error("登出暫時無法完成");
}
