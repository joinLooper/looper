"use client";

import type { MealType, MerchantApplication, MerchantApplicationInput, Redemption } from "@looper/types";
import { MEAL_TYPES } from "@looper/types";
import { Button } from "@looper/ui";
import { FormEvent, useCallback, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const merchantHeaders = { "x-looper-role": "merchant" };

const initialForm: MerchantApplicationInput = {
  storeName: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  storeType: "蔬食餐廳",
  vegetarianOffering: [],
  businessHours: "",
};

export default function Page() {
  const [form, setForm] = useState(initialForm);
  const [application, setApplication] = useState<MerchantApplication | null>(null);
  const [records, setRecords] = useState<Redemption[]>([]);
  const [message, setMessage] = useState("歡迎加入 Looper。先完成店家資料申請。");

  const refreshRecords = useCallback(async () => {
    const response = await fetch(`${API_URL}/merchant/redemptions`, { headers: merchantHeaders });
    if (response.ok) setRecords(await response.json());
  }, []);

  useEffect(() => { refreshRecords().catch(() => undefined); }, [refreshRecords]);

  function toggleMealType(mealType: MealType) {
    const selected = form.vegetarianOffering.includes(mealType);
    setForm({
      ...form,
      vegetarianOffering: selected
        ? form.vegetarianOffering.filter((item) => item !== mealType)
        : [...form.vegetarianOffering, mealType],
    });
  }

  async function submitApplication(event: FormEvent) {
    event.preventDefault();
    if (!form.vegetarianOffering.length) {
      setMessage("請至少選擇一種餐點類型。");
      return;
    }
    setMessage("正在送出申請…");
    const response = await fetch(`${API_URL}/merchant-applications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.message ?? "申請送出失敗");
      return;
    }
    setApplication(data);
    setMessage("申請已送出，平台審核通過後就能開始使用核銷功能。");
  }

  async function refreshApplication() {
    if (!application) return;
    const response = await fetch(`${API_URL}/merchant-applications/${application.id}`);
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.message ?? "目前無法更新審核狀態");
      return;
    }
    setApplication(data);
    setMessage(data.status === "approved" ? "申請已通過，核銷功能已啟用。" : "審核狀態已更新。");
  }

  async function redeem() {
    if (!application?.merchantId) {
      setMessage("店家尚未通過審核，暫時不能核銷。");
      return;
    }
    const response = await fetch(`${API_URL}/redemptions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...merchantHeaders },
      body: JSON.stringify({
        userId: "user-demo",
        missionId: `mission-${application.merchantId}-vegetarian-meal`,
        merchantId: application.merchantId,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const data = await response.json();
    setMessage(response.ok ? "核銷成功，獎勵已發放。" : data.message ?? "核銷失敗");
    await refreshRecords();
  }

  if (!application) {
    return <main style={{ maxWidth: 720, margin: "36px auto", padding: 24, fontFamily: "sans-serif" }}>
      <p>Looper Merchant Center</p>
      <h1>申請成為合作店家</h1>
      <p>填寫基本資料，通過平台審核後即可建立店家頁面並使用任務核銷。</p>
      <form onSubmit={submitApplication} style={{ display: "grid", gap: 16 }}>
        {([
          ["storeName", "店家名稱"],
          ["contactName", "聯絡人"],
          ["phone", "聯絡電話"],
          ["email", "Email"],
          ["address", "店家地址"],
          ["storeType", "店家類型"],
          ["businessHours", "營業時間"],
        ] as const).map(([key, label]) => <label key={key} style={{ display: "grid", gap: 6 }}><span>{label}</span><input required value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} style={{ padding: 12, borderRadius: 10, border: "1px solid #ccc" }} /></label>)}

        <fieldset style={{ border: "1px solid #ddd", borderRadius: 14, padding: 16 }}>
          <legend style={{ padding: "0 8px", fontWeight: 800 }}>餐點類型（可複選）</legend>
          <p style={{ marginTop: 4, color: "#647069", fontSize: 14 }}>選擇店內實際可提供的蔬食餐點類型，之後可用於玩家搜尋與任務推薦。</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
            {MEAL_TYPES.map((mealType) => <label key={mealType} style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, border: "1px solid #ddd", borderRadius: 10 }}>
              <input type="checkbox" checked={form.vegetarianOffering.includes(mealType)} onChange={() => toggleMealType(mealType)} />
              <span>{mealType}</span>
            </label>)}
          </div>
        </fieldset>

        <Button type="submit">送出合作申請</Button>
      </form>
      <p aria-live="polite">{message}</p>
    </main>;
  }

  return <main style={{ maxWidth: 720, margin: "36px auto", padding: 24, fontFamily: "sans-serif" }}>
    <p>Looper Merchant Center</p>
    <h1>{application.storeName}</h1>
    <p>申請狀態：{application.status === "pending" ? "等待平台審核" : application.status === "needs_revision" ? "需要補件" : application.status === "approved" ? "已通過" : "未通過"}</p>
    <p>餐點類型：{application.vegetarianOffering.join("、")}</p>
    {application.reviewNote ? <p>平台留言：{application.reviewNote}</p> : null}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Button type="button" onClick={refreshApplication}>更新審核狀態</Button>
      <Button type="button" onClick={redeem} disabled={application.status !== "approved"}>確認玩家任務核銷</Button>
    </div>
    <p aria-live="polite">{message}</p>
    <h2>核銷紀錄</h2>
    {records.length ? records.map((record) => <p key={record.id}>{record.userId}・+{record.starsGranted} 星星・+{record.energyGranted} 能量</p>) : <p>尚無核銷紀錄。</p>}
  </main>;
}
