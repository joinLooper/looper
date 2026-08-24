import type { PlayerSessionContext } from "@looper/types";

export const protectedPlayerStoragePrefixes = [
  "looper.web.taskCodeSubmission.",
  "looper.web.playerEventResolution.",
  "looper.web.knowledgeCard.",
] as const;

export const authenticatedPlayerRequest = {
  credentials: "include",
  cache: "no-store",
} as const;

export function playerMutationRequest(body?: unknown, method = "POST"): RequestInit {
  return {
    ...authenticatedPlayerRequest,
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export function clearProtectedPlayerStorage(storage: Pick<Storage, "length" | "key" | "removeItem">): void {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && protectedPlayerStoragePrefixes.some((prefix) => key.startsWith(prefix))) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

export async function loadPlayerSession(
  apiUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<PlayerSessionContext | null> {
  const response = await fetcher(`${apiUrl}/auth/player/session`, authenticatedPlayerRequest);
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("無法確認玩家登入狀態");
  return response.json() as Promise<PlayerSessionContext>;
}

export interface LiffClient {
  init(input: { liffId: string }): Promise<void>;
  isInClient(): boolean;
  isLoggedIn(): boolean;
  login(): void;
  getIDToken(): string | null;
}

export type LiffBootstrapDiagnostic =
  | "LIFF_SDK_UNAVAILABLE"
  | "LIFF_INIT_FAILED"
  | "LIFF_BROWSER_NOT_AUTHENTICATED"
  | "LIFF_OPENID_TOKEN_UNAVAILABLE"
  | "LINE_PLAYER_SESSION_FAILED";

export class LiffBootstrapError extends Error {
  constructor(readonly diagnostic: LiffBootstrapDiagnostic) {
    super(diagnostic);
    this.name = "LiffBootstrapError";
  }
}

export async function obtainVerifiedLiffCredential(liff: LiffClient | undefined, liffId: string | undefined): Promise<string | null> {
  if (!liff) throw new LiffBootstrapError("LIFF_SDK_UNAVAILABLE");
  if (!liffId?.trim()) throw new LiffBootstrapError("LIFF_INIT_FAILED");
  try {
    await liff.init({ liffId: liffId.trim() });
  } catch {
    throw new LiffBootstrapError("LIFF_INIT_FAILED");
  }

  let isInClient: boolean;
  let isLoggedIn: boolean;
  try {
    isInClient = liff.isInClient();
    isLoggedIn = liff.isLoggedIn();
  } catch {
    throw new LiffBootstrapError("LIFF_INIT_FAILED");
  }

  if (!isLoggedIn) {
    if (isInClient) throw new LiffBootstrapError("LIFF_BROWSER_NOT_AUTHENTICATED");
    try {
      liff.login();
    } catch {
      throw new LiffBootstrapError("LIFF_BROWSER_NOT_AUTHENTICATED");
    }
    return null;
  }

  const idToken = liff.getIDToken();
  if (!idToken) throw new LiffBootstrapError("LIFF_OPENID_TOKEN_UNAVAILABLE");
  return idToken;
}

export async function establishLinePlayerSession(
  apiUrl: string,
  liff: LiffClient | undefined,
  liffId: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<PlayerSessionContext | null> {
  const idToken = await obtainVerifiedLiffCredential(liff, liffId);
  if (!idToken) return null;

  try {
    const response = await fetcher(`${apiUrl}/auth/player/line/session`, playerMutationRequest({ idToken }));
    if (!response.ok) throw new LiffBootstrapError("LINE_PLAYER_SESSION_FAILED");
    return await response.json() as PlayerSessionContext;
  } catch (error) {
    if (error instanceof LiffBootstrapError) throw error;
    throw new LiffBootstrapError("LINE_PLAYER_SESSION_FAILED");
  }
}
