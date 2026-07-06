"use client";

import type { MealType, MerchantApplication, MerchantApplicationInput, Redemption } from "@looper/types";
import { BUSINESS_HOURS_OPTIONS, MEAL_TYPES } from "@looper/types";
import { Button } from "@looper/ui";
import { FormEvent, useCallback, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const merchantHeaders = { "x-looper-role": "merchant" };
const APPLICATION_STORAGE_KEY = "looper.merchant.applicationId";

const initialForm: MerchantApplicationInput = {
  storeName: "",
  contactName: "",
  contactLineId: "",
  phone: "",
  email: "",
  address: "",
  storeType: "蔬食餐廳",
  vegetarianOffering: [],
  otherMealType: "",
  businessHours: BUSINESS_HOURS_OPTIONS[3],
};

function statusLabel(status: MerchantApplication["status"]) {
  if (status === "approved") return "已通過";
  if (status === "needs_revision") return "需要補件";
  if (status === "rejected") return "未通過";
  return "等待平台審核";
}

export default function Page() {
  const [form, setForm] = useState(initialForm);
  const [application, setApplication] = useState<MerchantApplication | null>(null);
  const [records, setRecords] = useState<Redemption[]>([]);
  const [message, setMessage] = useState("歡迎加入 Looper。先完成店家資料申請。");
  const [isBusy, setIsBusy] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);

  const refreshRecords = useCallback(async () => {
    const response = await fetch(`${API_URL}/merchant/redemptions`, { headers: merchantHeaders });
    if (response.ok) setRecords(await response.json());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function restoreApplication() {
      const id = window.localStorage.getItem(APPLICATION_STORAGE_KEY);
      if (!id) { if (!cancelled) setIsRestoring(false); return; }
      try {
        const response = await fetch(`${API_URL}/merchant-applications/${id}`);
        if (response.status === 404) {
          window.localStorage.removeItem(APPLICATION_STORAGE_KEY);
          if (!cancelled) setMessage("先前的申請資料已失效，請重新送出合作申請。");
          return;
        }
        const data = await response.json();
        if (response.ok && !cancelled) {
          setApplication(data);
          setMessage(data.status === "approved" ? "已恢復店家資料，核銷功能已啟用。" : "已恢復先前的店家申請狀態。");
        }
      } catch {
        if (!cancelled) setMessage("目前無法連線以恢復店家申請狀態，請稍後再試。");
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    }
    restoreApplication();
    refreshRecords().catch(() => undefined);
    return () => { cancelled = true; };
  }, [refreshRecords]);

  function setField<K extends keyof MerchantApplicationInput>(key: K, value: MerchantApplicationInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleMealType(mealType: MealType) {
    const selected = form.vegetarianOffering.includes(mealType);
    const vegetarianOffering = selected ? form.vegetarianOffering.filter((item) => item !== mealType) : [...form.vegetarianOffering, mealType];
    setForm((current) => ({ ...current, vegetarianOffering, otherMealType: mealType === "其他" && selected ? "" : current.otherMealType }));
  }

  async function submitApplication(event: FormEvent) {
    event.preventDefault();
    if (!form.vegetarianOffering.length) return setMessage("請至少選擇一種餐點類型。");
    if (form.vegetarianOffering.includes("其他") && !form.otherMealType.trim()) return setMessage("請填寫其他餐點類型。");
    setIsBusy(true);
    try {
      const response = await fetch(`${API_URL}/merchant-applications`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) return setMessage(data.message ?? "申請送出失敗");
      window.localStorage.setItem(APPLICATION_STORAGE_KEY, data.id);
      setApplication(data);
      setMessage("申請已送出，平台審核通過後就能開始使用核銷功能。");
    } catch { setMessage("目前無法送出申請，請稍後再試。"); }
    finally { setIsBusy(false); }
  }

  async function refreshApplication() {
    if (!application || isBusy) return;
    setIsBusy(true);
    try {
      const response = await fetch(`${API_URL}/merchant-applications/${application.id}`);
      const data = await response.json();
      if (!response.ok) return setMessage(data.message ?? "目前無法更新審核狀態");
      setApplication(data);
      setMessage(data.status === "approved" ? "申請已通過，核銷功能已啟用。" : "審核狀態已更新。");
    } catch { setMessage("目前無法更新審核狀態，請稍後再試。"); }
    finally { setIsBusy(false); }
  }

  async function redeem() {
    if (!application?.merchantId || isBusy) return setMessage("店家尚未通過審核，暫時不能核銷。");
    setIsBusy(true);
    try {
      const response = await fetch(`${API_URL}/redemptions`, { method: "POST", headers: { "content-type": "application/json", ...merchantHeaders }, body: JSON.stringify({ userId: "user-demo", missionId: `mission-${application.merchantId}-vegetarian-meal`, merchantId: application.merchantId, idempotencyKey: crypto.randomUUID() }) });
      const data = await response.json();
      setMessage(response.ok ? "核銷成功，獎勵已發放。" : data.message ?? "核銷失敗");
      await refreshRecords();
    } catch { setMessage("目前無法完成核銷，請稍後再試。"); }
    finally { setIsBusy(false); }
  }

  if (isRestoring) return <main className="merchant-shell status-layout"><section className="status-card"><p className="merchant-brand">🌱 Looper Merchant Center</p><h1>正在恢復店家資料</h1><p className="message-box">請稍候，正在確認先前的申請與審核狀態…</p></section></main>;

  if (!application) return <main className="merchant-shell">
    <header className="merchant-header"><div><p className="merchant-brand">🌱 Looper Merchant Center</p><h1>申請成為合作店家</h1><p className="merchant-subtitle">完成基本資料後，由平台進行審核。通過後會建立店家頁面、玩家任務與核銷資格。</p></div></header>
    <section className="progress-card"><div className="progress-steps"><div className="progress-step active">1. 填寫店家資料</div><div className="progress-step">2. 平台審核</div><div className="progress-step">3. 啟用合作功能</div></div></section>
    <form className="merchant-form" onSubmit={submitApplication}>
      <section className="form-section"><h2>店家基本資料</h2><p>這些資料會用於平台審核與後續建立店家頁面。</p><div className="form-grid">
        <label className="field"><span>店家名稱</span><input required value={form.storeName} onChange={(e) => setField("storeName", e.target.value)} /></label>
        <label className="field"><span>店家類型</span><input required value={form.storeType} onChange={(e) => setField("storeType", e.target.value)} /></label>
        <label className="field full"><span>店家地址</span><input required value={form.address} onChange={(e) => setField("address", e.target.value)} /></label>
        <label className="field full"><span>營業時間</span><select required value={form.businessHours} onChange={(e) => setField("businessHours", e.target.value as MerchantApplicationInput["businessHours"])}>{BUSINESS_HOURS_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label>
      </div></section>
      <section className="form-section"><h2>餐點類型</h2><p>可複選。選擇「其他」時請補充實際餐點。</p><div className="meal-grid">{MEAL_TYPES.map((mealType) => <label className="meal-option" key={mealType}><input type="checkbox" checked={form.vegetarianOffering.includes(mealType)} onChange={() => toggleMealType(mealType)} /><span>{mealType}</span></label>)}</div>{form.vegetarianOffering.includes("其他") ? <label className="field" style={{ marginTop: 14 }}><span>其他餐點類型</span><input required maxLength={100} placeholder="例如：蔬食鐵板料理" value={form.otherMealType} onChange={(e) => setField("otherMealType", e.target.value)} /></label> : null}</section>
      <section className="form-section"><h2>聯絡資料</h2><p>平台會使用以下方式聯繫審核、補件與合作事項。</p><div className="form-grid">
        <label className="field"><span>聯絡人</span><input required value={form.contactName} onChange={(e) => setField("contactName", e.target.value)} /></label>
        <label className="field"><span>聯絡電話</span><input required inputMode="tel" value={form.phone} onChange={(e) => setField("phone", e.target.value)} /></label>
        <label className="field full"><span>聯絡人的 LINE ID</span><input required placeholder="請填聯絡人個人的 LINE ID，不是餐廳 LINE@" value={form.contactLineId} onChange={(e) => setField("contactLineId", e.target.value)} /><small>此欄為主要聯絡人的個人 LINE ID，並非餐廳官方 LINE@。</small></label>
        <label className="field full"><span>Email</span><input required type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} /></label>
      </div></section>
      <div className="form-actions"><Button className="primary-action" type="submit" disabled={isBusy}>{isBusy ? "送出中…" : "送出合作申請"}</Button><p className="message-box">{message}</p></div>
    </form>
  </main>;

  return <main className="merchant-shell status-layout">
    <header className="merchant-header"><div><p className="merchant-brand">🌱 Looper Merchant Center</p><h1>{application.storeName}</h1><p className="merchant-subtitle">店家申請與合作功能狀態</p></div><span className="status-badge">{statusLabel(application.status)}</span></header>
    <section className="status-card"><h2>申請資訊</h2><p>{application.address}</p><p>{application.businessHours}</p><p>聯絡人 LINE ID：{application.contactLineId}</p><div className="selected-types">{application.vegetarianOffering.map((item) => <span key={item}>{item === "其他" && application.otherMealType ? `其他：${application.otherMealType}` : item}</span>)}</div><div className="button-row"><Button className="secondary-action" type="button" onClick={refreshApplication} disabled={isBusy}>更新審核狀態</Button><Button className="primary-action" type="button" onClick={redeem} disabled={application.status !== "approved" || isBusy}>確認玩家任務核銷</Button></div><p className="message-box">{message}</p></section>
    <section className="records-card"><h2>核銷紀錄</h2>{records.length ? records.map((record) => <p key={record.id}>{record.userId}・+{record.starsGranted} 星星・+{record.energyGranted} 能量</p>) : <p>尚無核銷紀錄。</p>}</section>
  </main>;
}
