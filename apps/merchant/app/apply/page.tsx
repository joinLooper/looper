"use client";

import type { BusinessDayHours, MealType, MerchantApplicationInput, StoreCategory, WeekdayKey } from "@looper/types";
import { MEAL_TYPES, STORE_CATEGORIES, WEEKDAYS } from "@looper/types";
import { Button } from "@looper/ui";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const APPLICATION_STORAGE_KEY = "looper.merchant.applicationId";

const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2).toString().padStart(2, "0");
  const minute = index % 2 === 0 ? "00" : "30";
  return `${hour}:${minute}`;
});

function defaultHours(): BusinessDayHours[] {
  return WEEKDAYS.map((weekday, index) => ({
    day: weekday.key,
    closed: index === 0,
    periods: index === 0 ? [] : [{ start: "11:00", end: "20:00" }],
  }));
}

function initialForm(): MerchantApplicationInput {
  return {
    storeName: "",
    contactName: "",
    contactLineId: "",
    phone: "",
    email: "",
    address: "",
    storeCategory: "餐廳",
    otherStoreCategory: "",
    vegetarianOffering: [],
    otherMealType: "",
    businessHours: defaultHours(),
  };
}

export default function ApplyPage() {
  const [form, setForm] = useState<MerchantApplicationInput>(initialForm);
  const [message, setMessage] = useState("請填寫店家資料。送出後平台會進行審核。");
  const [isBusy, setIsBusy] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const openDayCount = useMemo(() => form.businessHours.filter((day) => !day.closed).length, [form.businessHours]);

  function setField<K extends keyof MerchantApplicationInput>(key: K, value: MerchantApplicationInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleMealType(mealType: MealType) {
    setForm((current) => {
      const selected = current.vegetarianOffering.includes(mealType);
      return {
        ...current,
        vegetarianOffering: selected ? current.vegetarianOffering.filter((item) => item !== mealType) : [...current.vegetarianOffering, mealType],
        otherMealType: mealType === "其他" && selected ? "" : current.otherMealType,
      };
    });
  }

  function updateDay(dayKey: WeekdayKey, updater: (day: BusinessDayHours) => BusinessDayHours) {
    setForm((current) => ({
      ...current,
      businessHours: current.businessHours.map((day) => day.day === dayKey ? updater(day) : day),
    }));
  }

  function toggleClosed(dayKey: WeekdayKey) {
    updateDay(dayKey, (day) => ({
      ...day,
      closed: !day.closed,
      periods: day.closed ? [{ start: "11:00", end: "20:00" }] : [],
    }));
  }

  function updatePeriod(dayKey: WeekdayKey, periodIndex: number, key: "start" | "end", value: string) {
    updateDay(dayKey, (day) => ({
      ...day,
      periods: day.periods.map((period, index) => index === periodIndex ? { ...period, [key]: value } : period),
    }));
  }

  function addSecondPeriod(dayKey: WeekdayKey) {
    updateDay(dayKey, (day) => day.periods.length >= 2 ? day : { ...day, periods: [...day.periods, { start: "17:00", end: "21:00" }] });
  }

  function removeSecondPeriod(dayKey: WeekdayKey) {
    updateDay(dayKey, (day) => ({ ...day, periods: day.periods.slice(0, 1) }));
  }

  function copyMondayToWeekdays() {
    const monday = form.businessHours.find((day) => day.day === "monday");
    if (!monday) return;
    setForm((current) => ({
      ...current,
      businessHours: current.businessHours.map((day) => ["tuesday", "wednesday", "thursday", "friday"].includes(day.day)
        ? { ...monday, day: day.day, periods: monday.periods.map((period) => ({ ...period })) }
        : day),
    }));
    setMessage("已將星期一的設定套用到星期二至星期五。");
  }

  function validateHours(): string | null {
    if (!openDayCount) return "請至少設定一天營業日。";
    for (const day of form.businessHours) {
      if (day.closed) continue;
      for (const period of day.periods) {
        if (period.start >= period.end) return `${WEEKDAYS.find((item) => item.key === day.day)?.label}的結束時間必須晚於開始時間。`;
      }
      if (day.periods[1] && day.periods[0].end > day.periods[1].start) return `${WEEKDAYS.find((item) => item.key === day.day)?.label}的兩個時段不可重疊。`;
    }
    return null;
  }

  async function submitApplication(event: FormEvent) {
    event.preventDefault();
    if (!form.vegetarianOffering.length) return setMessage("請至少選擇一種餐點類型。");
    if (form.storeCategory === "其他" && !form.otherStoreCategory.trim()) return setMessage("請填寫其他店家業態。");
    if (form.vegetarianOffering.includes("其他") && !form.otherMealType.trim()) return setMessage("請填寫其他餐點類型。");
    const hoursError = validateHours();
    if (hoursError) return setMessage(hoursError);

    setIsBusy(true);
    setMessage("正在送出合作申請…");
    try {
      const response = await fetch(`${API_URL}/merchant-applications`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) return setMessage(data.message ?? "申請送出失敗");
      window.localStorage.setItem(APPLICATION_STORAGE_KEY, data.id);
      setSubmittedId(data.id);
      setMessage("合作申請已送出。這個公開頁面仍可再次開啟，不會被店家後台取代。");
    } catch {
      setMessage("目前無法送出申請，請稍後再試。");
    } finally {
      setIsBusy(false);
    }
  }

  if (submittedId) return <main className="merchant-shell status-layout">
    <header className="merchant-header"><div><p className="merchant-brand">🌱 Looper Partner Application</p><h1>申請已送出</h1><p className="merchant-subtitle">申請編號：{submittedId}</p></div></header>
    <section className="status-card"><p className="message-box">{message}</p><div className="button-row"><Link className="primary-action link-action" href="/">前往店家後台查看進度</Link><Button className="secondary-action" type="button" onClick={() => { setForm(initialForm()); setSubmittedId(null); setMessage("可繼續送出另一家店的合作申請。"); }}>再送一筆申請</Button></div></section>
  </main>;

  return <main className="merchant-shell">
    <header className="merchant-header"><div><p className="merchant-brand">🌱 Looper Partner Application</p><h1>申請成為合作店家</h1><p className="merchant-subtitle">這是開放型申請頁，任何人都能進入。申請送出後，可前往獨立店家後台查看審核狀態。</p></div><Link className="dashboard-link" href="/">店家後台</Link></header>
    <section className="progress-card"><div className="progress-steps"><div className="progress-step active">1. 填寫店家資料</div><div className="progress-step">2. 平台審核</div><div className="progress-step">3. 啟用合作功能</div></div></section>
    <form className="merchant-form" onSubmit={submitApplication}>
      <section className="form-section"><h2>店家基本資料</h2><p>「店家業態」表示這是一間什麼店；「餐點類型」則描述主要提供哪些餐點。</p><div className="form-grid">
        <label className="field"><span>店家名稱</span><input required placeholder="例如：森林蔬食" value={form.storeName} onChange={(event) => setField("storeName", event.target.value)} /></label>
        <label className="field"><span>店家業態</span><select required value={form.storeCategory} onChange={(event) => setField("storeCategory", event.target.value as StoreCategory)}>{STORE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select><small>用於平台分類、搜尋與推薦，例如餐廳、咖啡廳或食品零售。</small></label>
        {form.storeCategory === "其他" ? <label className="field full"><span>其他店家業態</span><input required maxLength={100} placeholder="請說明主要營運方式" value={form.otherStoreCategory} onChange={(event) => setField("otherStoreCategory", event.target.value)} /></label> : null}
        <label className="field full"><span>店家地址</span><input required placeholder="完整營業地址" value={form.address} onChange={(event) => setField("address", event.target.value)} /></label>
      </div></section>

      <section className="form-section"><div className="section-heading"><div><h2>每週營業時間</h2><p>星期與時段分開設定。每一天可設為公休，或設定一至兩個營業時段。</p></div><Button className="secondary-action compact-action" type="button" onClick={copyMondayToWeekdays}>星期一套用至平日</Button></div>
        <div className="hours-editor">{form.businessHours.map((day) => {
          const weekday = WEEKDAYS.find((item) => item.key === day.day);
          return <div className={`hours-row ${day.closed ? "closed" : ""}`} key={day.day}>
            <div className="day-control"><strong>{weekday?.label}</strong><label className="closed-toggle"><input type="checkbox" checked={day.closed} onChange={() => toggleClosed(day.day)} />公休</label></div>
            {day.closed ? <span className="closed-label">本日公休</span> : <div className="period-list">{day.periods.map((period, index) => <div className="period-row" key={`${day.day}-${index}`}><span>{index === 0 ? "主要時段" : "第二時段"}</span><select aria-label={`${weekday?.label}開始時間`} value={period.start} onChange={(event) => updatePeriod(day.day, index, "start", event.target.value)}>{TIME_OPTIONS.map((time) => <option key={time}>{time}</option>)}</select><span>至</span><select aria-label={`${weekday?.label}結束時間`} value={period.end} onChange={(event) => updatePeriod(day.day, index, "end", event.target.value)}>{TIME_OPTIONS.map((time) => <option key={time}>{time}</option>)}</select>{index === 1 ? <button className="text-button" type="button" onClick={() => removeSecondPeriod(day.day)}>移除</button> : null}</div>)}{day.periods.length === 1 ? <button className="text-button" type="button" onClick={() => addSecondPeriod(day.day)}>＋新增第二時段</button> : null}</div>}
          </div>;
        })}</div>
      </section>

      <section className="form-section"><h2>餐點類型</h2><p>可複選，用於玩家搜尋、主題推薦與任務配對。</p><div className="meal-grid">{MEAL_TYPES.map((mealType) => <label className="meal-option" key={mealType}><input type="checkbox" checked={form.vegetarianOffering.includes(mealType)} onChange={() => toggleMealType(mealType)} /><span>{mealType}</span></label>)}</div>{form.vegetarianOffering.includes("其他") ? <label className="field other-field"><span>其他餐點類型</span><input required maxLength={100} placeholder="例如：蔬食鐵板料理" value={form.otherMealType} onChange={(event) => setField("otherMealType", event.target.value)} /></label> : null}</section>

      <section className="form-section"><h2>聯絡資料</h2><p>平台會使用以下方式聯繫審核、補件與合作事項。</p><div className="form-grid">
        <label className="field"><span>聯絡人</span><input required placeholder="店長或主要窗口" value={form.contactName} onChange={(event) => setField("contactName", event.target.value)} /></label>
        <label className="field"><span>聯絡電話</span><input required inputMode="tel" placeholder="0912-345-678" value={form.phone} onChange={(event) => setField("phone", event.target.value)} /></label>
        <label className="field full"><span>聯絡人的 LINE ID</span><input required placeholder="請填聯絡人個人的 LINE ID，不是餐廳 LINE@" value={form.contactLineId} onChange={(event) => setField("contactLineId", event.target.value)} /><small>此欄為主要聯絡人的個人 LINE ID，並非餐廳官方 LINE@。</small></label>
        <label className="field full"><span>Email</span><input required type="email" placeholder="store@example.com" value={form.email} onChange={(event) => setField("email", event.target.value)} /></label>
      </div></section>

      <div className="form-actions"><Button className="primary-action" type="submit" disabled={isBusy}>{isBusy ? "送出中…" : "送出合作申請"}</Button><p className="message-box" aria-live="polite">{message}</p></div>
    </form>
  </main>;
}
