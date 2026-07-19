import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { AdminTaskCodeSubmission } from "@looper/types";
import {
  appendUniqueTaskCodeSubmissions,
  buildTaskCodeSubmissionQuery,
  nullDisplay,
  resetTaskCodeSubmissionPage,
  storedSettlementDisplay,
  taskCodeStatusLabel,
} from "./task-code-submission-flow";
import { authenticatedRequest } from "./admin-session-flow";

function submission(overrides: Partial<AdminTaskCodeSubmission> = {}): AdminTaskCodeSubmission {
  return {
    submissionId: "submission-1",
    status: "settled",
    userId: "user-1",
    missionId: "mission-1",
    missionTitle: "完成一餐蔬食",
    brandId: "brand-1",
    brandDisplayName: "森林品牌",
    merchantId: "merchant-1",
    merchantStoreName: "森林分店",
    merchantBranchCode: "main",
    createdAt: "2026-07-17T01:00:00.000Z",
    confirmationExpiresAt: "2026-07-17T01:05:00.000Z",
    confirmedAt: "2026-07-17T01:01:00.000Z",
    decidedAt: "2026-07-17T01:01:00.000Z",
    decidedBy: "account-1",
    settledAt: "2026-07-17T01:01:00.000Z",
    expiredAt: null,
    redemptionId: "redemption-1",
    rewardEventId: "reward-event-1",
    settlementSummary: { baseStars: 3, chestStars: 17, exp: 211, energy: 29, carbonGrams: 877, levelBefore: 2, levelAfter: 4, ruleVersion: "stored-rule" },
    reportingScope: null,
    reportingEligibility: {
      eligibleForSubmittedFlow: false,
      eligibleForTerminalFlow: false,
      eligibleForSettlement: false,
      issueCodes: ["legacy_missing_scope_snapshot"],
    },
    displayScopeSource: "current_fallback",
    ...overrides,
  };
}

test("admin task code transaction view maps every status to Traditional Chinese", () => {
  assert.deepEqual(["pending", "confirmed", "rejected", "expired", "settled"].map((status) => taskCodeStatusLabel(status as AdminTaskCodeSubmission["status"])), ["待確認", "已確認", "已拒絕", "已逾時", "已完成"]);
});

test("admin task code transaction view builds canonical filters and cursor query", () => {
  const query = new URLSearchParams(buildTaskCodeSubmissionQuery({ status: "settled", brandId: "brand-1", merchantId: "merchant-1", missionId: "mission-1" }, "cursor-1"));
  assert.deepEqual(Object.fromEntries(query), { status: "settled", brandId: "brand-1", merchantId: "merchant-1", missionId: "mission-1", cursor: "cursor-1" });
  assert.equal(buildTaskCodeSubmissionQuery({}), "");
});

test("admin task code transaction view appends cursor pages without duplicate submissions", () => {
  const first = submission();
  const second = submission({ submissionId: "submission-2" });
  assert.deepEqual(appendUniqueTaskCodeSubmissions([first], [first, second]).map((item) => item.submissionId), ["submission-1", "submission-2"]);
});

test("admin task code transaction view resets items and cursor when filters change", () => {
  assert.deepEqual(resetTaskCodeSubmissionPage(), { items: [], nextCursor: null });
});

test("admin task code transaction view displays null values as an em dash", () => {
  assert.equal(nullDisplay(null), "—");
  assert.equal(nullDisplay(undefined), "—");
  assert.equal(nullDisplay(""), "—");
  assert.equal(nullDisplay(0), "0");
});

test("admin task code transaction view uses stored settlement fields and hides resources before settlement", () => {
  const settled = submission();
  assert.deepEqual(storedSettlementDisplay(settled), settled.settlementSummary);
  assert.equal(storedSettlementDisplay(submission({ status: "pending", settlementSummary: null })), null);
  assert.equal(storedSettlementDisplay(submission({ status: "rejected", settlementSummary: null })), null);
  assert.equal(storedSettlementDisplay(submission({ status: "expired", settlementSummary: null })), null);
});

test("admin task code transaction view contains no frontend reward formula or sensitive response reference", () => {
  const helper = readFileSync(new URL("./task-code-submission-flow.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("./task-code-submissions/page.tsx", import.meta.url), "utf8");
  const sources = `${helper}\n${page}`;
  assert.equal(/redemptionExp|redemptionEnergy|carbonGramsPerSeed|rewardStarAmount|isMonday|lunarDay|isDesignatedDate|levelDefinitions|baseStars\s*\+|chestStars\s*\+/i.test(sources), false);
  assert.equal(/codeHash|code_hash|taskCodeSecret|invitationToken|sessionToken|tokenHash|token_hash|decisionIdempotencyKey|decision_idempotency_key|idempotencyKey|idempotency_key/i.test(sources), false);
});

test("admin task code transaction view uses the canonical Session request for initial filters and load more", () => {
  const page = readFileSync(new URL("./task-code-submissions/page.tsx", import.meta.url), "utf8");
  assert.deepEqual(authenticatedRequest, { credentials: "include" });
  assert.match(page, /fetch\(`\$\{API_URL\}\/merchants`, authenticatedRequest\)/);
  assert.match(page, /fetch\(`\$\{API_URL\}\/missions`, authenticatedRequest\)/);
  assert.match(page, /fetch\(`\$\{API_URL\}\/admin\/task-code-submissions\$\{query \? `\?\$\{query\}` : ""\}`, authenticatedRequest\)/);
  assert.match(page, /const loadFirstPage = useCallback[\s\S]*\[filters, rejectInvalidSession\]/);
  assert.match(page, /async function loadMore\(\)[\s\S]*fetch\(`\$\{API_URL\}\/admin\/task-code-submissions\?\$\{query\}`, authenticatedRequest\)/);
});

test("admin task code transaction view rejects legacy and client-controlled identity", () => {
  const page = readFileSync(new URL("./task-code-submissions/page.tsx", import.meta.url), "utf8");
  assert.equal(/x-looper-role|x-looper-account-id|x-account-id|actorId\s*:|accountId\s*:/i.test(page), false);
  assert.equal(/headers\s*:\s*\{[^}]*role|headers\s*:\s*\{[^}]*account/i.test(page), false);
});

test("admin task code transaction view clears protected data and invalidates the Session gate on 401 or 403", () => {
  const page = readFileSync(new URL("./task-code-submissions/page.tsx", import.meta.url), "utf8");
  assert.match(page, /response\.status !== 401 && response\.status !== 403/);
  assert.match(page, /response\.status === 401 \? "unauthenticated" : "forbidden"/);
  assert.match(page, /setItems\(\[\]\);[\s\S]*setNextCursor\(null\);[\s\S]*setMerchants\(\[\]\);[\s\S]*setMissions\(\[\]\);[\s\S]*setSelected\(null\)/);
  assert.match(page, /adminSession\?\.invalidateSession\(status\)/);
  assert.match(page, /rejectInvalidSession\(response\)/);
});
