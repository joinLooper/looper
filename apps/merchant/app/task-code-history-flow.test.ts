import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { MerchantTaskCodeHistoryItem } from "@looper/types";
import {
  appendUniqueTaskCodeHistory,
  authorizedHistoryMerchant,
  buildTaskCodeHistoryQuery,
  formatMerchantHistoryTime,
  merchantTimezone,
  nullDisplay,
  resetTaskCodeHistoryPage,
  storedMerchantSettlement,
  taskCodeHistoryStatusLabel,
  unsettledHistoryReason,
  type HistoryBranchContext,
} from "./task-code-history-flow";

const branches: HistoryBranchContext[] = [
  { brandId: "brand-1", brandDisplayName: "森林品牌", merchantId: "merchant-1", branchCode: "one", storeName: "一店", role: "branch_staff", scope: "branch", timezone: "Asia/Taipei" },
  { brandId: "brand-1", brandDisplayName: "森林品牌", merchantId: "merchant-2", branchCode: "two", storeName: "二店", role: "brand_manager", scope: "brand", timezone: "Asia/Tokyo" },
];

function historyItem(overrides: Partial<MerchantTaskCodeHistoryItem> = {}): MerchantTaskCodeHistoryItem {
  return {
    submissionId: "submission-1",
    status: "settled",
    userId: "user-1",
    playerDisplayName: "玩家一號",
    missionId: "mission-1",
    missionTitle: "完成一餐蔬食",
    brandId: "brand-1",
    brandDisplayName: "森林品牌",
    merchantId: "merchant-1",
    merchantStoreName: "一店",
    merchantBranchCode: "one",
    submittedAt: "2026-07-17T01:00:00.000Z",
    confirmationExpiresAt: "2026-07-17T01:05:00.000Z",
    decidedAt: "2026-07-17T01:01:00.000Z",
    decidedBy: "account-1",
    settledAt: "2026-07-17T01:01:00.000Z",
    redemptionId: "redemption-1",
    rewardEventId: "reward-event-1",
    settlementSummary: { baseStars: 3, exp: 200, energy: 30, carbonGrams: 800, ruleVersion: "stored-rule" },
    reportingScope: null,
    reportingEligibility: {
      eligibleForSubmittedFlow: false,
      eligibleForTerminalFlow: false,
      eligibleForSettlement: false,
      issueCodes: ["legacy_missing_scope_snapshot"],
    },
    displayScopeSource: "current_fallback",
    ...overrides,
    expiredAt: overrides.expiredAt ?? null,
  };
}

test("merchant task code history view maps the three terminal statuses to Traditional Chinese", () => {
  assert.deepEqual(["settled", "rejected", "expired"].map((status) => taskCodeHistoryStatusLabel(status as MerchantTaskCodeHistoryItem["status"])), ["已完成", "已拒絕", "已逾時"]);
});

test("merchant task code history view omits status for all records and builds canonical filters", () => {
  assert.equal(buildTaskCodeHistoryQuery({}), "");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(buildTaskCodeHistoryQuery({ merchantId: "merchant-1", status: "settled" }, "cursor-1"))), {
    merchantId: "merchant-1", status: "settled", cursor: "cursor-1",
  });
});

test("merchant task code history view only accepts a Context-authorized merchant preference", () => {
  assert.equal(authorizedHistoryMerchant(branches, "merchant-2"), "merchant-2");
  assert.equal(authorizedHistoryMerchant(branches, "unauthorized"), null);
  assert.equal(authorizedHistoryMerchant([branches[0]], null), "merchant-1");
  assert.equal(authorizedHistoryMerchant(branches, null), null);
});

test("merchant task code history view appends cursor pages without duplicates and resets filters", () => {
  const first = historyItem();
  const second = historyItem({ submissionId: "submission-2" });
  assert.deepEqual(appendUniqueTaskCodeHistory([first], [first, second]).map((item) => item.submissionId), ["submission-1", "submission-2"]);
  assert.deepEqual(resetTaskCodeHistoryPage(), { items: [], nextCursor: null });
});

test("merchant task code history view uses stored API settlement fields only for settled records", () => {
  const settled = historyItem();
  assert.deepEqual(storedMerchantSettlement(settled), settled.settlementSummary);
  assert.equal(storedMerchantSettlement(historyItem({ status: "rejected", settlementSummary: null })), null);
  assert.equal(storedMerchantSettlement(historyItem({ status: "expired", settlementSummary: null })), null);
  assert.equal(unsettledHistoryReason("rejected"), "店家已拒絕，本筆未結算");
  assert.equal(unsettledHistoryReason("expired"), "確認期限已過，本筆未結算");
});

test("merchant task code history view selects branch timezone and keeps an explicit missing-timezone fallback", () => {
  assert.equal(merchantTimezone(branches, "merchant-2"), "Asia/Tokyo");
  assert.match(formatMerchantHistoryTime("2026-07-17T01:00:00.000Z", "Asia/Taipei").text, /Asia\/Taipei/);
  assert.equal(formatMerchantHistoryTime("2026-07-17T01:00:00.000Z", null).text, "2026-07-17T01:00:00.000Z（時區未提供）");
  assert.equal(nullDisplay(null), "—");
});

test("merchant task code history view contains no reward formula, sensitive data, or player growth field reference", () => {
  const helper = readFileSync(new URL("./task-code-history-flow.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("./task-code-history/page.tsx", import.meta.url), "utf8");
  const sources = `${helper}\n${page}`;
  assert.equal(/rewardStarAmount|redemptionExp|redemptionEnergy|isMonday|lunarDay|isDesignatedDate|levelDefinitions|baseStars\s*\+|stars\s*\+|\/\s*5|Math\.round/i.test(sources), false);
  assert.equal(/codeHash|code_hash|taskCodeSecret|secret|invitationToken|sessionToken|tokenHash|token_hash|idempotencyKey|idempotency_key|ruleSnapshot|rule_snapshot/i.test(sources), false);
  assert.equal(/chestStars|levelBefore|levelAfter|currentLevel|starBalance|currentEnergy|resources\b/i.test(sources), false);
});
