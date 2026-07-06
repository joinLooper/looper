import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "./app.js";

const adminHeaders = { "x-looper-role": "admin" };
const merchantHeaders = { "x-looper-role": "merchant" };
const businessHours = [
  { day: "monday", closed: true, periods: [] },
  { day: "tuesday", closed: false, periods: [{ start: "11:00", end: "14:00" }, { start: "17:00", end: "20:00" }] },
  { day: "wednesday", closed: false, periods: [{ start: "11:00", end: "20:00" }] },
  { day: "thursday", closed: false, periods: [{ start: "11:00", end: "20:00" }] },
  { day: "friday", closed: false, periods: [{ start: "11:00", end: "21:00" }] },
  { day: "saturday", closed: false, periods: [{ start: "10:00", end: "21:00" }] },
  { day: "sunday", closed: false, periods: [{ start: "10:00", end: "18:00" }] },
];
const applicationPayload = {
  storeName: "森林蔬食",
  contactName: "林店長",
  contactLineId: "forest.manager",
  phone: "0912345678",
  email: "forest@example.com",
  address: "台北市森林路 1 號",
  storeCategory: "餐廳",
  otherStoreCategory: "",
  vegetarianOffering: ["火鍋", "咖哩飯", "拉麵"],
  otherMealType: "",
  businessHours,
};

async function setup() { const app = await buildApp(); await app.ready(); return app; }
async function onboardMerchant(app: Awaited<ReturnType<typeof setup>>) {
  const submitted = await app.inject({ method: "POST", url: "/merchant-applications", payload: applicationPayload });
  assert.equal(submitted.statusCode, 201);
  const application = submitted.json();
  const approved = await app.inject({ method: "POST", url: `/merchant-applications/${application.id}/review`, headers: adminHeaders, payload: { decision: "approve", reviewerId: "admin-demo" } });
  assert.equal(approved.statusCode, 200);
  return approved.json();
}

test("平台初始沒有合作店家與玩家任務", async () => {
  const app = await setup();
  assert.deepEqual((await app.inject({ method: "GET", url: "/merchants" })).json(), []);
  assert.deepEqual((await app.inject({ method: "GET", url: "/missions" })).json(), []);
  await app.close();
});

test("店家申請保留店家業態與每週營業時間", async () => {
  const app = await setup();
  const submitted = await app.inject({ method: "POST", url: "/merchant-applications", payload: applicationPayload });
  assert.equal(submitted.statusCode, 201);
  const application = submitted.json();
  assert.equal(application.storeCategory, "餐廳");
  assert.equal(application.businessHours.length, 7);
  assert.equal(application.businessHours[1].periods.length, 2);
  await app.close();
});

test("店家申請通過後才建立店家與任務", async () => {
  const app = await setup();
  const application = await onboardMerchant(app);
  assert.equal(application.status, "approved");
  assert.equal(application.contactLineId, "forest.manager");
  assert.equal((await app.inject({ method: "GET", url: "/merchants" })).json().length, 1);
  assert.equal((await app.inject({ method: "GET", url: "/missions" })).json().length, 1);
  await app.close();
});

test("其他餐點類型必須填寫補充內容", async () => {
  const app = await setup();
  const response = await app.inject({ method: "POST", url: "/merchant-applications", payload: { ...applicationPayload, email: "other-meal@example.com", vegetarianOffering: ["其他"], otherMealType: "" } });
  assert.equal(response.statusCode, 400);
  await app.close();
});

test("其他店家業態必須填寫補充內容", async () => {
  const app = await setup();
  const response = await app.inject({ method: "POST", url: "/merchant-applications", payload: { ...applicationPayload, email: "other-store@example.com", storeCategory: "其他", otherStoreCategory: "" } });
  assert.equal(response.statusCode, 400);
  await app.close();
});

test("營業時間缺少星期或時段重疊會被拒絕", async () => {
  const app = await setup();
  const missingDay = await app.inject({ method: "POST", url: "/merchant-applications", payload: { ...applicationPayload, email: "missing-day@example.com", businessHours: businessHours.slice(0, 6) } });
  assert.equal(missingDay.statusCode, 400);
  const overlapping = businessHours.map((day) => day.day === "tuesday" ? { ...day, periods: [{ start: "11:00", end: "18:00" }, { start: "17:00", end: "20:00" }] } : day);
  const overlapResponse = await app.inject({ method: "POST", url: "/merchant-applications", payload: { ...applicationPayload, email: "overlap@example.com", businessHours: overlapping } });
  assert.equal(overlapResponse.statusCode, 400);
  await app.close();
});

test("沒有 Admin 權限不能審核店家", async () => {
  const app = await setup();
  const application = (await app.inject({ method: "POST", url: "/merchant-applications", payload: applicationPayload })).json();
  const denied = await app.inject({ method: "POST", url: `/merchant-applications/${application.id}/review`, payload: { decision: "approve", reviewerId: "admin-demo" } });
  assert.equal(denied.statusCode, 403);
  await app.close();
});

test("完整平台 MVP：店家加入、平台審核、玩家接任務、店家核銷", async () => {
  const app = await setup();
  const application = await onboardMerchant(app);
  const mission = (await app.inject({ method: "GET", url: "/missions" })).json()[0];
  const accepted = await app.inject({ method: "POST", url: `/missions/${mission.id}/accept`, payload: { userId: "user-demo" } });
  assert.equal(accepted.statusCode, 201);
  const redeemed = await app.inject({ method: "POST", url: "/redemptions", headers: merchantHeaders, payload: { userId: "user-demo", missionId: mission.id, merchantId: application.merchantId, idempotencyKey: "onboarding-flow-0001" } });
  assert.equal(redeemed.statusCode, 201);
  assert.equal(redeemed.json().user.stars, 10);
  assert.equal(redeemed.json().user.energy, 20);
  const overview = (await app.inject({ method: "GET", url: "/admin/overview", headers: adminHeaders })).json();
  assert.equal(overview.metrics.completedMissions, 1);
  assert.equal(overview.metrics.starsGranted, 10);
  assert.equal(overview.metrics.energyGranted, 20);
  await app.close();
});

test("相同核銷請求重送不會重複發獎勵", async () => {
  const app = await setup();
  const application = await onboardMerchant(app);
  const mission = (await app.inject({ method: "GET", url: "/missions" })).json()[0];
  await app.inject({ method: "POST", url: `/missions/${mission.id}/accept`, payload: { userId: "user-demo" } });
  const request = { method: "POST" as const, url: "/redemptions", headers: merchantHeaders, payload: { userId: "user-demo", missionId: mission.id, merchantId: application.merchantId, idempotencyKey: "same-request-0001" } };
  assert.equal((await app.inject(request)).statusCode, 201);
  assert.equal((await app.inject(request)).statusCode, 200);
  const user = (await app.inject({ method: "GET", url: "/users/user-demo/state" })).json();
  assert.equal(user.stars, 10);
  assert.equal(user.energy, 20);
  await app.close();
});
