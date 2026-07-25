export const MERCHANT_PREFERENCE_KEY = "looper.merchant.selectedMerchantId";

export type MerchantBranchContext = {
  brandId: string;
  brandDisplayName: string;
  merchantId: string;
  branchCode: string;
  storeName: string;
  role: string;
  scope: "brand" | "branch";
};

export const authenticatedFetchOptions = { credentials: "include" as const };
export const protectedMerchantStorageKeys = [MERCHANT_PREFERENCE_KEY, "looper.merchant.taskCodeDecisionKeys"] as const;

export function clearProtectedMerchantStorage(storage: Pick<Storage, "removeItem">): void {
  for (const key of protectedMerchantStorageKeys) storage.removeItem(key);
}

export async function merchantProtectedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  onAuthorizationFailure: () => void,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const response = await fetcher(input, { ...authenticatedFetchOptions, ...init });
  if (response.status === 401 || response.status === 403) onAuthorizationFailure();
  return response;
}

export function selectAuthorizedMerchant(branches: MerchantBranchContext[], preferredId: string | null): string | null {
  if (preferredId && branches.some((branch) => branch.merchantId === preferredId)) return preferredId;
  return branches.length === 1 ? branches[0].merchantId : null;
}

export function invitationRedeemRequest(token: string): RequestInit {
  return {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  };
}

export function removeInvitationToken(url: URL): string {
  url.searchParams.delete("token");
  return `${url.pathname}${url.search}${url.hash}`;
}
