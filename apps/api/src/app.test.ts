import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "./app.js";

const userId = "user-demo";
const missionId = "mission-vegetarian-meal";

async function setup() {
  const app = await buildApp();
  await app.ready();
  return app;
}

test("核銷必須具備 merchant 權限", async () => {
  const app = await setup();
  await app.inject({ method: "POST", url: `/missions/${missionId}/accept`, payload: { userId } });
  const response = await app.inject({ method: "POST", url: "/redemptions", payload: { userId, missionId, merchantId: "merchant-demo", idempotencyKey: "redeem-0001" } });
  assert.equal(response.statusCode, 403);
  await app.close();
});

test("相同冪等鍵重送不會重複發獎勵", async () => {
  const app = await setup();
  await app.inject({ method: "POST", url: `/missions/${missionId}/accept`, payload: { userId } });
  const request = { method: "POST" as const, url: "/redemptions", headers: { "x-looper-role": "merchant" }, payload: { userId, missionId, merchantId: "merchant-demo", idempotencyKey: "redeem-0001" } };
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
  const allowed = await app.inject({ method: "GET", url: "/admin/overview", headers: { "x-looper-role": "admin" } });
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.json().auditEvents.length, 1);
  await app.close();
});
