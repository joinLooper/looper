"use client";

import type { AdminTaskCodeSubmission, AdminTaskCodeSubmissionPage, MerchantProfile, Mission, TaskCodeSubmissionStatus } from "@looper/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  appendUniqueTaskCodeSubmissions,
  buildTaskCodeSubmissionQuery,
  formatTaskCodeSubmissionTime,
  nullDisplay,
  resetTaskCodeSubmissionPage,
  storedSettlementDisplay,
  TASK_CODE_STATUS_OPTIONS,
  taskCodeStatusLabel,
  type TaskCodeSubmissionFilters,
} from "../task-code-submission-flow";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const adminHeaders = { "x-looper-role": "admin" };

function TimeValue({ value }: { value: string | null | undefined }) {
  const formatted = formatTaskCodeSubmissionTime(value);
  return formatted.iso
    ? <time dateTime={formatted.iso} title={`原始時間：${formatted.iso}`}>{formatted.text}</time>
    : <span>—</span>;
}

function StatusBadge({ status }: { status: TaskCodeSubmissionStatus }) {
  return <span className={`transaction-status status-${status}`}>{taskCodeStatusLabel(status)}</span>;
}

function SettlementSummary({ item, compact = false }: { item: AdminTaskCodeSubmission; compact?: boolean }) {
  const summary = storedSettlementDisplay(item);
  if (!summary) return <span className="unsettled-label">尚未結算</span>;
  return <div className={compact ? "settlement-compact" : "settlement-values"}>
    <span>基礎⭐ <strong>{summary.baseStars}</strong></span>
    <span>寶箱⭐ <strong>{summary.chestStars}</strong></span>
    <span>EXP <strong>{summary.exp}</strong></span>
    <span>⚡ <strong>{summary.energy}</strong></span>
    <span>CO₂e <strong>{summary.carbonGrams} g</strong></span>
    <span>等級 <strong>Lv.{summary.levelBefore} → Lv.{summary.levelAfter}</strong></span>
  </div>;
}

function DetailField({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`detail-field ${className}`}><dt>{label}</dt><dd>{children}</dd></div>;
}

export default function TaskCodeSubmissionsPage() {
  const [items, setItems] = useState<AdminTaskCodeSubmission[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState<TaskCodeSubmissionFilters>({});
  const [merchants, setMerchants] = useState<MerchantProfile[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminTaskCodeSubmission | null>(null);
  const queryGeneration = useRef(0);
  const firstRequest = useRef(0);
  const moreRequest = useRef(0);

  const loadReferenceData = useCallback(async () => {
    setReferenceError(null);
    try {
      const [merchantResponse, missionResponse] = await Promise.all([
        fetch(`${API_URL}/merchants`),
        fetch(`${API_URL}/missions`),
      ]);
      if (!merchantResponse.ok || !missionResponse.ok) throw new Error("reference data failed");
      setMerchants(await merchantResponse.json() as MerchantProfile[]);
      setMissions(await missionResponse.json() as Mission[]);
    } catch {
      setReferenceError("無法讀取品牌、分店與任務選項，請稍後重試。");
    }
  }, []);

  const loadFirstPage = useCallback(async () => {
    const requestId = ++firstRequest.current;
    const generation = queryGeneration.current;
    const reset = resetTaskCodeSubmissionPage();
    setItems(reset.items);
    setNextCursor(reset.nextCursor);
    setInitialLoading(true);
    setInitialError(null);
    setMoreError(null);
    const query = buildTaskCodeSubmissionQuery(filters);
    try {
      const response = await fetch(`${API_URL}/admin/task-code-submissions${query ? `?${query}` : ""}`, { headers: adminHeaders });
      if (!response.ok) throw new Error("transaction query failed");
      const page = await response.json() as AdminTaskCodeSubmissionPage;
      if (requestId !== firstRequest.current || generation !== queryGeneration.current) return;
      setItems(page.items);
      setNextCursor(page.nextCursor);
    } catch {
      if (requestId !== firstRequest.current || generation !== queryGeneration.current) return;
      setInitialError("無法讀取核銷交易，請稍後重試。");
    } finally {
      if (requestId === firstRequest.current && generation === queryGeneration.current) setInitialLoading(false);
    }
  }, [filters]);

  useEffect(() => { void loadReferenceData(); }, [loadReferenceData]);
  useEffect(() => { void loadFirstPage(); }, [loadFirstPage]);
  useEffect(() => {
    if (!selected) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selected]);

  const brands = useMemo(() => Array.from(new Map(merchants.map((merchant) => [merchant.brandId, { id: merchant.brandId, name: merchant.brandDisplayName }])).values()).sort((a, b) => a.name.localeCompare(b.name, "zh-TW")), [merchants]);
  const visibleMerchants = useMemo(() => merchants.filter((merchant) => !filters.brandId || merchant.brandId === filters.brandId).sort((a, b) => a.storeName.localeCompare(b.storeName, "zh-TW")), [filters.brandId, merchants]);
  const visibleMissions = useMemo(() => {
    const visibleMerchantIds = new Set(visibleMerchants.map((merchant) => merchant.id));
    return missions.filter((mission) => filters.merchantId ? mission.merchantId === filters.merchantId : !filters.brandId || visibleMerchantIds.has(mission.merchantId)).sort((a, b) => a.title.localeCompare(b.title, "zh-TW"));
  }, [filters.brandId, filters.merchantId, missions, visibleMerchants]);

  function replaceFilters(next: TaskCodeSubmissionFilters) {
    queryGeneration.current += 1;
    moreRequest.current += 1;
    const reset = resetTaskCodeSubmissionPage();
    setItems(reset.items);
    setNextCursor(reset.nextCursor);
    setMoreLoading(false);
    setMoreError(null);
    setSelected(null);
    setFilters(next);
  }

  async function loadMore() {
    if (!nextCursor || moreLoading) return;
    const cursor = nextCursor;
    const requestId = ++moreRequest.current;
    const generation = queryGeneration.current;
    setMoreLoading(true);
    setMoreError(null);
    const query = buildTaskCodeSubmissionQuery(filters, cursor);
    try {
      const response = await fetch(`${API_URL}/admin/task-code-submissions?${query}`, { headers: adminHeaders });
      if (!response.ok) throw new Error("more transactions failed");
      const page = await response.json() as AdminTaskCodeSubmissionPage;
      if (requestId !== moreRequest.current || generation !== queryGeneration.current) return;
      setItems((current) => appendUniqueTaskCodeSubmissions(current, page.items));
      setNextCursor(page.nextCursor);
    } catch {
      if (requestId === moreRequest.current && generation === queryGeneration.current) setMoreError("載入更多交易失敗，已保留目前資料，可重試同一頁。");
    } finally {
      if (requestId === moreRequest.current && generation === queryGeneration.current) setMoreLoading(false);
    }
  }

  const hasFilters = Boolean(filters.status || filters.brandId || filters.merchantId || filters.missionId);

  return <main className="admin-shell transaction-shell">
    <header className="transaction-header">
      <div>
        <Link className="back-link" href="/">← 返回平台營運工作台</Link>
        <p className="section-eyebrow">任務與核銷</p>
        <h1>核銷交易</h1>
        <p className="admin-subtitle">追蹤玩家任務碼提交、店家確認與平台資源結算</p>
      </div>
      <p className="source-note">資料由平台中央帳本提供</p>
    </header>

    <section className="panel filter-panel" aria-label="交易篩選">
      <div className="filter-heading"><div><h2>篩選條件</h2><p>篩選會重新從第一頁讀取中央資料。</p></div><button className="clear-filter-button" type="button" onClick={() => replaceFilters({})} disabled={!hasFilters}>清除篩選</button></div>
      <div className="filter-grid">
        <label><span>狀態</span><select value={filters.status ?? ""} onChange={(event) => replaceFilters({ ...filters, status: event.target.value ? event.target.value as TaskCodeSubmissionStatus : undefined })}><option value="">全部狀態</option>{TASK_CODE_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label><span>品牌</span><select value={filters.brandId ?? ""} onChange={(event) => replaceFilters({ ...filters, brandId: event.target.value || undefined, merchantId: undefined, missionId: undefined })}><option value="">全部品牌</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
        <label><span>分店</span><select value={filters.merchantId ?? ""} onChange={(event) => replaceFilters({ ...filters, merchantId: event.target.value || undefined, missionId: undefined })}><option value="">全部分店</option>{visibleMerchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.storeName}（{merchant.branchCode}）</option>)}</select></label>
        <label><span>任務</span><select value={filters.missionId ?? ""} onChange={(event) => replaceFilters({ ...filters, missionId: event.target.value || undefined })}><option value="">全部任務</option>{visibleMissions.map((mission) => <option key={mission.id} value={mission.id}>{mission.title}</option>)}</select></label>
      </div>
      {referenceError ? <div className="inline-error" role="alert"><span>{referenceError}</span><button type="button" onClick={loadReferenceData}>重試選項</button></div> : null}
    </section>

    <section className="panel transaction-panel" aria-busy={initialLoading}>
      <div className="panel-header"><div><h2>交易紀錄</h2><p className="panel-description">依提交時間由新到舊排列</p></div><span className="panel-count">已載入 {items.length} 筆</span></div>
      {initialLoading ? <div className="transaction-state" aria-live="polite"><strong>正在讀取核銷交易…</strong><span>請稍候，資料正在由平台中央帳本載入。</span></div> : null}
      {!initialLoading && initialError ? <div className="transaction-state error-state" role="alert"><strong>{initialError}</strong><button type="button" onClick={loadFirstPage}>重新載入</button></div> : null}
      {!initialLoading && !initialError && !items.length ? <div className="transaction-state"><strong>{hasFilters ? "沒有符合篩選條件的交易" : "目前沒有核銷交易"}</strong><span>{hasFilters ? "請調整或清除篩選條件。" : "玩家提交任務碼後會顯示在這裡。"}</span></div> : null}
      {items.length ? <div className="transaction-table-wrap"><table className="transaction-table"><thead><tr><th>提交時間</th><th>狀態</th><th>玩家</th><th>任務</th><th>品牌</th><th>分店</th><th>店員／決策人</th><th>決策時間</th><th>結算摘要</th><th>查看</th></tr></thead><tbody>{items.map((item) => <tr key={item.submissionId}>
        <td data-label="提交時間"><TimeValue value={item.createdAt} /></td>
        <td data-label="狀態"><StatusBadge status={item.status} /></td>
        <td data-label="玩家"><span className="breakable-id" title={item.userId}>{item.userId}</span></td>
        <td data-label="任務"><strong>{item.missionTitle}</strong></td>
        <td data-label="品牌">{item.brandDisplayName}</td>
        <td data-label="分店"><span>{item.merchantStoreName}</span><small>{item.merchantBranchCode}</small></td>
        <td data-label="店員／決策人"><span className="breakable-id" title={item.decidedBy ?? undefined}>{nullDisplay(item.decidedBy)}</span></td>
        <td data-label="決策時間"><TimeValue value={item.decidedAt} /></td>
        <td data-label="結算摘要"><SettlementSummary item={item} compact /></td>
        <td data-label="查看"><button className="view-detail-button" type="button" onClick={() => setSelected(item)}>查看</button></td>
      </tr>)}</tbody></table></div> : null}
      {items.length ? <div className="load-more-area">
        {moreError ? <div className="inline-error" role="alert"><span>{moreError}</span><button type="button" onClick={loadMore}>重試</button></div> : null}
        {nextCursor ? <button className="load-more-button" type="button" onClick={loadMore} disabled={moreLoading}>{moreLoading ? "載入更多中…" : "載入更多"}</button> : <span className="list-end">已顯示目前全部結果</span>}
      </div> : null}
    </section>

    {selected ? <div className="drawer-layer"><button className="drawer-scrim" type="button" aria-label="關閉交易摘要" onClick={() => setSelected(null)} /><aside className="transaction-drawer" role="dialog" aria-modal="true" aria-labelledby="transaction-detail-title">
      <header className="drawer-header"><div><p className="section-eyebrow">單筆摘要</p><h2 id="transaction-detail-title">核銷交易明細</h2></div><button className="drawer-close" type="button" onClick={() => setSelected(null)} aria-label="關閉">×</button></header>
      <div className="drawer-body">
        <section><h3>基本資料</h3><dl className="detail-grid"><DetailField label="Submission ID" className="wide"><span className="breakable-id">{selected.submissionId}</span></DetailField><DetailField label="狀態"><StatusBadge status={selected.status} /></DetailField><DetailField label="玩家"><span className="breakable-id">{selected.userId}</span></DetailField><DetailField label="任務">{selected.missionTitle}<small className="detail-secondary">{selected.missionId}</small></DetailField><DetailField label="品牌">{selected.brandDisplayName}<small className="detail-secondary">{selected.brandId}</small></DetailField><DetailField label="分店">{selected.merchantStoreName}<small className="detail-secondary">{selected.merchantBranchCode}・{selected.merchantId}</small></DetailField></dl></section>
        <section><h3>時間</h3><dl className="detail-grid"><DetailField label="提交時間"><TimeValue value={selected.createdAt} /></DetailField><DetailField label="確認期限"><TimeValue value={selected.confirmationExpiresAt} /></DetailField><DetailField label="決策時間"><TimeValue value={selected.decidedAt} /></DetailField><DetailField label="結算時間"><TimeValue value={selected.settledAt} /></DetailField></dl></section>
        <section><h3>店家處理</h3><dl className="detail-grid"><DetailField label="決策人"><span className="breakable-id">{nullDisplay(selected.decidedBy)}</span></DetailField><DetailField label="處理結果">{selected.status === "rejected" ? "店家已拒絕" : selected.status === "expired" ? "確認期限已逾時" : taskCodeStatusLabel(selected.status)}</DetailField></dl></section>
        <section><h3>Settlement links</h3><dl className="detail-grid"><DetailField label="Redemption ID"><span className="breakable-id">{nullDisplay(selected.redemptionId)}</span></DetailField><DetailField label="Reward Event ID"><span className="breakable-id">{nullDisplay(selected.rewardEventId)}</span></DetailField><DetailField label="Rule Version"><span className="breakable-id">{nullDisplay(selected.settlementSummary?.ruleVersion)}</span></DetailField></dl></section>
        <section><h3>資源結算</h3>{storedSettlementDisplay(selected) ? <SettlementSummary item={selected} /> : <div className="unsettled-detail"><strong>尚未結算</strong><span>此筆交易目前沒有資源結算資料。</span></div>}</section>
      </div>
    </aside></div> : null}
  </main>;
}
