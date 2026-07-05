import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "./app.js";

const userId = "user-demo";
const missionId = "mission-vegetarian-meal";
const merchantHeaders = { "x-looper-role": "merchant" };
const adminHeaders = { "x-looper-role": "admin" };

async function setup() {
  const app = await buildApp();
  await app.ready();
  return app;
}

test("核銷必須具備 merchant 權限", async () => {
  const app = await setup();
  await app.inject({ method: "POST", url: `/missions/${missionId}/accept`, payload: { userId } });
  const response = await app.inject({
    method: "POST",
    url: "/redemptions",
    payload: { userId, missionId, merchantId: "merchant-demo", idempotencyKey: "redeem-0001" },
  });
  assert.equal(response.statusCode, 403);
  await app.close();
});

test("相同冪等鍵重送不會重複發獎勵", async () => {
  const app = await setup();
  await app.inject({ method: "POST", url: `/missions/${missionId}/accept`, payload: { userId } });
  const request = {
    method: "POST" as const,
    url: "/redemptions",
    headers: merchantHeaders,
    payload: { userId, missionId, merchantId: "merchant-demo", idempotencyKey: "redeem-0001" },
  };
  const first = await app.inject(request);
  const second = await app.inject(request);
  assert.equal(first.statusCode, 201);
  assert.equal(second.statusCode, 200);
  const state = await app.inject({ method: "GET", url: `/users/${userId}/state` });
  const user = state.json();
  assert.equal(user.stars, 10);
  assert.equal(user.energy, 20);
  await app.close();
});

test("admin overview 需要 admin 權限且包含審計紀錄", async () => {
  const app = await setup();
  const denied = await app.inject({ method: "GET", url: "/admin/overview" });
  assert.equal(denied.statusCode, 403);
  await app.inject({ method: "POST", url: `/missions/${missionId}/accept`, payload: { userId } });
  const allowed = await app.inject({ method: "GET", url: "/admin/overview", headers: adminHeaders });
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.json().auditEvents.length, 1);
  await app.close();
});

test("MVP 完整流程：玩家接任務、店家核銷、玩家與後台同步", async () => {
  const app = await setup();

  const initialState = await app.inject({ method: "GET", url: `/users/${userId}/state` });
  assert.equal(initialState.statusCode, 200);
  assert.equal(initialState.json().stars, 0);
  assert.equal(initialState.json().energy, 0);

  const accepted = await app.inject({
    method: "POST",
    url: `/missions/${missionId}/accept`,
    payload: { userId },
  });
  assert.equal(accepted.statusCode, 201);
  assert.equal(accepted.json().enrollment.status, "awaiting_verification");

  const beforeRedemption = await app.inject({
    method: "GET",
    url: "/admin/overview",
    headers: adminHeaders,
  });
  assert.equal(beforeRedemption.json().metrics.awaitingVerification, 1);
  assert.equal(beforeRedemption.json().metrics.completedMissions, 0);

  const redeemed = await app.inject({
    method: "POST",
    url: "/redemptions",
    headers: merchantHeaders,
    payload: {
      userId,
      missionId,
      merchantId: "merchant-demo",
      idempotencyKey: "mvp-flow-0001",
    },
  });
  assert.equal(redeemed.statusCode, 201);
  assert.equal(redeemed.json().user.stars, 10);
  assert.equal(redeemed.json().user.energy, 20);
  assert.equal(redeemed.json().user.enrollments[0].status, "completed");

  const finalState = await app.inject({ method: "GET", url: `/users/${userId}/state` });
  assert.equal(finalState.json().stars, 10);
  assert.equal(finalState.json().energy, 20);
  assert.equal(finalState.json().enrollments[0].status, "completed");

  const merchantRecords = await app.inject({
    method: "GET",
    url: "/merchant/redemptions",
    headers: merchantHeaders,
  });
  assert.equal(merchantRecords.statusCode, 200);
  assert.equal(merchantRecords.json().length, 1);

  const finalOverview = await app.inject({
    method: "GET",
    url: "/admin/overview",
    headers: adminHeaders,
  });
  const overview = finalOverview.json();
  assert.equal(overview.metrics.awaitingVerification, 0);
  assert.equal(overview.metrics.completedMissions, 1);
  assert.equal(overview.metrics.starsGranted, 10);
  assert.equal(overview.metrics.energyGranted, 20);
  assert.equal(overview.redemptions.length, 1);
  assert.equal(overview.auditEvents.length, 2);

  await app.close();
});

test("無效 payload 會被拒絕，不留下半完成資料", async () => {
  const app = await setup();

  const response = await app.inject({
    method: "POST",
    url: "/redemptions",
    headers: merchantHeaders,
    payload: {
      userId,
      missionId,
      merchantId: "merchant-demo",
      idempotencyKey: "short",
    },
  });

  assert.equal(response.statusCode, 400);

  const state = await app.inject({ method: "GET", url: `/users/${userId}/state` });
  assert.equal(state.json().stars, 0);
  assert.equal(state.json().energy, 0);
  assert.equal(state.json().enrollments.length, 0);

  await app.close();
});
