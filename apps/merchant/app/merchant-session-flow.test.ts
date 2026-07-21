import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { authenticatedFetchOptions, clearProtectedMerchantStorage, invitationRedeemRequest, merchantProtectedFetch, MERCHANT_PREFERENCE_KEY, removeInvitationToken, selectAuthorizedMerchant } from "./merchant-session-flow";

test("merchant invite session flow redeems with credentials and removes URL token", () => {
  const request = invitationRedeemRequest("secret-token");
  assert.equal(request.credentials, "include");
  assert.equal(String(request.body).includes("secret-token"), true);
  assert.equal(removeInvitationToken(new URL("https://merchant.test/invite?token=secret-token&x=1")), "/invite?x=1");
});

test("merchant invite session flow validates stored merchant preference against context", () => {
  const branches = [
    { brandId: "b", brandDisplayName: "B", merchantId: "m1", branchCode: "one", storeName: "One", role: "branch_staff", scope: "branch" as const },
    { brandId: "b", brandDisplayName: "B", merchantId: "m2", branchCode: "two", storeName: "Two", role: "branch_staff", scope: "branch" as const },
  ];
  assert.equal(selectAuthorizedMerchant([branches[0]], null), "m1");
  assert.equal(selectAuthorizedMerchant(branches, "m2"), "m2");
  assert.equal(selectAuthorizedMerchant(branches, "lost"), null);
  assert.equal(MERCHANT_PREFERENCE_KEY.toLowerCase().includes("merchantid"), true);
});

test("merchant invite session flow protected requests use credentials and no spoofed auth headers", () => {
  assert.equal(authenticatedFetchOptions.credentials, "include");
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const invite = readFileSync(new URL("./invite/page.tsx", import.meta.url), "utf8");
  assert.equal(/x-looper-role|x-looper-account-id|applicationId/.test(page), false);
  assert.equal(/localStorage.*token|sessionStorage.*token|console\.log/.test(invite), false);
  assert.match(page, /請使用 Looper 邀請連結登入/);
  assert.match(page, /auth\/logout/);
  assert.match(page, /clearProtectedState/);
  assert.match(page, /setInterval\(poll, 3000\)/);
  assert.match(page, /visibilitychange/);
});

test("merchant invite session flow clears all protected state on 401 or 403", async () => {
  const removed: string[] = [];
  clearProtectedMerchantStorage({ removeItem: (key) => removed.push(key) });
  assert.deepEqual(removed.sort(), ["looper.merchant.selectedMerchantId", "looper.merchant.taskCodeDecisionKeys"].sort());
  for (const status of [401, 403]) {
    let cleared = 0;
    const response = await merchantProtectedFetch("https://merchant.test/protected", {}, () => { cleared += 1; }, async () => new Response(null, { status }));
    assert.equal(response.status, status);
    assert.equal(cleared, 1);
  }
});
