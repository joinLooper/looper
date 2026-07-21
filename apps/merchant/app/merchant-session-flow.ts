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
