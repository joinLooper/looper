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
  isLoggedIn(): boolean;
  login(): void;
  getIDToken(): string | null;
}

export async function obtainVerifiedLiffCredential(liff: LiffClient | undefined, liffId: string | undefined): Promise<string | null> {
  if (!liffId?.trim()) throw new Error("LINE LIFF 尚未設定");
  if (!liff) throw new Error("請從 LINE 開啟 Looper");
  await liff.init({ liffId: liffId.trim() });
  if (!liff.isLoggedIn()) {
    liff.login();
    return null;
  }
  const idToken = liff.getIDToken();
  if (!idToken) throw new Error("LINE 登入憑證無法取得");
  return idToken;
}
