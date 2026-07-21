"use client";

import type {
  MerchantTaskCodeHistoryItem,
  MerchantTaskCodeHistoryPage,
  MerchantTaskCodeHistoryStatus,
} from "@looper/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { authenticatedFetchOptions, MERCHANT_PREFERENCE_KEY } from "../merchant-session-flow";
import {
  appendUniqueTaskCodeHistory,
  authorizedHistoryMerchant,
  buildTaskCodeHistoryQuery,
  formatMerchantHistoryTime,
  merchantTimezone,
  nullDisplay,
  resetTaskCodeHistoryPage,
  storedMerchantSettlement,
  TASK_CODE_HISTORY_STATUS_OPTIONS,
  taskCodeHistoryStatusLabel,
  unsettledHistoryReason,
  type HistoryBranchContext,
  type TaskCodeHistoryFilters,
} from "../task-code-history-flow";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type SessionState = "checking" | "authenticated" | "unauthenticated";
type ContextState = "idle" | "loading" | "ready" | "empty" | "error";

function TimeValue({ value, timezone }: { value: string | null | undefined; timezone: string | null }) {
  const formatted = formatMerchantHistoryTime(value, timezone);
  return formatted.iso
    ? <time dateTime={formatted.iso} title={`原始時間：${formatted.iso}`}>{formatted.text}</time>
    : <span>—</span>;
}

function StatusBadge({ status }: { status: MerchantTaskCodeHistoryStatus }) {
  return <span className={`history-status history-status-${status}`}>{taskCodeHistoryStatusLabel(status)}</span>;
}

function SettlementSummary({ item }: { item: MerchantTaskCodeHistoryItem }) {
  const summary = storedMerchantSettlement(item);
  if (!summary) return <span className="history-unsettled">{unsettledHistoryReason(item.status) ?? "—"}</span>;
  return <div className="history-settlement">
    <span>基礎⭐ <strong>{summary.baseStars}</strong></span>
    <span>EXP <strong>{summary.exp}</strong></span>
    <span>⚡ <strong>{summary.energy}</strong></span>
    <span>CO₂e <strong>{summary.carbonGrams} g</strong></span>
  </div>;
}

function DetailField({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <div className={`history-detail-field${wide ? " history-detail-wide" : ""}`}><dt>{label}</dt><dd>{children}</dd></div>;
}

export default function TaskCodeHistoryPage() {
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [contextState, setContextState] = useState<ContextState>("idle");
  const [contextError, setContextError] = useState<string | null>(null);
  const [branches, setBranches] = useState<HistoryBranchContext[]>([]);
  const [filters, setFilters] = useState<TaskCodeHistoryFilters>({});
  const [items, setItems] = useState<MerchantTaskCodeHistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MerchantTaskCodeHistoryItem | null>(null);
  const requestGeneration = useRef(0);
  const firstRequest = useRef(0);
  const moreRequest = useRef(0);

  const becomeUnauthenticated = useCallback(() => {
    requestGeneration.current += 1;
    setSessionState("unauthenticated");
    setContextState("idle");
    setBranches([]);
    setItems([]);
    setNextCursor(null);
    setSelected(null);
  }, []);

  const loadContext = useCallback(async () => {
    setContextState("loading");
    setContextError(null);
    try {
      const response = await fetch(`${API_URL}/merchant/context`, authenticatedFetchOptions);
      if (response.status === 401) return becomeUnauthenticated();
      if (response.status === 403) {
        setBranches([]);
        setContextState("empty");
        return;
      }
      if (!response.ok) throw new Error("context failed");
      const context = await response.json() as { branches: HistoryBranchContext[] };
      if (!context.branches.length) {
        setBranches([]);
        setContextState("empty");
        return;
      }
      const preferred = window.localStorage.getItem(MERCHANT_PREFERENCE_KEY);
      const selectedMerchant = authorizedHistoryMerchant(context.branches, preferred);
      if (preferred && !context.branches.some((branch) => branch.merchantId === preferred)) {
        window.localStorage.removeItem(MERCHANT_PREFERENCE_KEY);
      }
      setBranches(context.branches);
      setFilters({ merchantId: selectedMerchant ?? undefined });
      setContextState("ready");
    } catch {
      setContextError("無法取得店家授權範圍，請稍後重試。");
      setContextState("error");
    }
  }, [becomeUnauthenticated]);

  useEffect(() => {
    let active = true;
    setSessionState("checking");
    fetch(`${API_URL}/auth/session`, authenticatedFetchOptions)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("session failed")))
      .then((session: { authenticated: boolean }) => {
        if (!active) return;
        if (!session.authenticated) return becomeUnauthenticated();
        setSessionState("authenticated");
        void loadContext();
      })
      .catch(() => {
        if (!active) return;
        setSessionState("unauthenticated");
      });
    return () => { active = false; };
  }, [becomeUnauthenticated, loadContext]);

  const loadFirstPage = useCallback(async () => {
    const requestId = ++firstRequest.current;
    const generation = requestGeneration.current;
    const reset = resetTaskCodeHistoryPage();
    setItems(reset.items);
    setNextCursor(reset.nextCursor);
    setHistoryLoading(true);
    setHistoryError(null);
    setMoreError(null);
    const query = buildTaskCodeHistoryQuery(filters);
    try {
      const response = await fetch(`${API_URL}/merchant/task-code-submissions/history${query ? `?${query}` : ""}`, authenticatedFetchOptions);
      if (response.status === 401) return becomeUnauthenticated();
      if (response.status === 403) {
        setContextState("empty");
        setBranches([]);
        return;
      }
      if (!response.ok) throw new Error("history failed");
      const page = await response.json() as MerchantTaskCodeHistoryPage;
      if (requestId !== firstRequest.current || generation !== requestGeneration.current) return;
      setItems(page.items);
      setNextCursor(page.nextCursor);
    } catch {
      if (requestId === firstRequest.current && generation === requestGeneration.current) {
        setHistoryError("無法讀取核銷紀錄，請稍後重試。");
      }
    } finally {
      if (requestId === firstRequest.current && generation === requestGeneration.current) setHistoryLoading(false);
    }
  }, [becomeUnauthenticated, filters]);

  useEffect(() => {
    if (sessionState === "authenticated" && contextState === "ready") void loadFirstPage();
  }, [contextState, loadFirstPage, sessionState]);

  useEffect(() => {
    if (!selected) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selected]);

  function replaceFilters(next: TaskCodeHistoryFilters) {
    requestGeneration.current += 1;
    moreRequest.current += 1;
    const reset = resetTaskCodeHistoryPage();
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
    const generation = requestGeneration.current;
    setMoreLoading(true);
    setMoreError(null);
    const query = buildTaskCodeHistoryQuery(filters, cursor);
    try {
      const response = await fetch(`${API_URL}/merchant/task-code-submissions/history?${query}`, authenticatedFetchOptions);
      if (response.status === 401) return becomeUnauthenticated();
      if (response.status === 403) {
        setContextState("empty");
        setBranches([]);
        return;
      }
      if (!response.ok) throw new Error("more history failed");
      const page = await response.json() as MerchantTaskCodeHistoryPage;
      if (requestId !== moreRequest.current || generation !== requestGeneration.current) return;
      setItems((current) => appendUniqueTaskCodeHistory(current, page.items));
      setNextCursor(page.nextCursor);
    } catch {
      if (requestId === moreRequest.current && generation === requestGeneration.current) {
        setMoreError("載入更多紀錄失敗，已保留目前資料，可重試同一頁。");
      }
    } finally {
      if (requestId === moreRequest.current && generation === requestGeneration.current) setMoreLoading(false);
    }
  }

  const currentBranch = useMemo(() => branches.find((branch) => branch.merchantId === filters.merchantId), [branches, filters.merchantId]);
  const scopeLabel = currentBranch ? `${currentBranch.brandDisplayName}－${currentBranch.storeName}` : "全部授權分店";
  const hasHistoryFilter = Boolean(filters.status || (branches.length > 1 && filters.merchantId));

  if (sessionState === "checking") return <main className="merchant-shell history-shell"><section className="status-card history-state"><h1>核銷紀錄</h1><p>正在確認店家登入狀態…</p></section></main>;
  if (sessionState === "unauthenticated") return <main className="merchant-shell history-shell"><section className="status-card history-state"><h1>核銷紀錄</h1><p>請使用店家邀請連結登入</p><Link className="history-home-link" href="/">返回店家首頁</Link></section></main>;

  return <main className="merchant-shell history-shell">
    <header className="history-header">
      <div><Link className="history-back" href="/">← 返回店家首頁</Link><p className="history-eyebrow">交易紀錄</p><h1>核銷紀錄</h1><p>所有紀錄皆來自平台中央交易資料</p></div>
      <div className="history-scope"><span>目前查詢範圍</span><strong>{scopeLabel}</strong></div>
    </header>

    {contextState === "loading" ? <section className="status-card history-state"><strong>正在讀取授權分店…</strong><span>完成後才會載入核銷紀錄。</span></section> : null}
    {contextState === "error" ? <section className="status-card history-state history-error" role="alert"><strong>{contextError}</strong><button type="button" onClick={loadContext}>重試</button></section> : null}
    {contextState === "empty" ? <section className="status-card history-state"><strong>無可操作分店</strong><span>目前帳號沒有有效的店家 membership，請聯絡平台管理員。</span></section> : null}

    {contextState === "ready" ? <>
      <section className="status-card history-filters" aria-label="核銷紀錄篩選">
        <div className="history-filter-heading"><div><h2>查詢條件</h2><p>切換條件會重新讀取第一頁中央紀錄。</p></div><button type="button" onClick={() => replaceFilters({ merchantId: branches.length === 1 ? branches[0].merchantId : undefined })} disabled={!hasHistoryFilter}>清除篩選</button></div>
        <div className="history-filter-grid">
          {branches.length > 1 ? <label><span>分店</span><select value={filters.merchantId ?? ""} onChange={(event) => replaceFilters({ ...filters, merchantId: event.target.value || undefined })}><option value="">全部授權分店</option>{branches.map((branch) => <option key={branch.merchantId} value={branch.merchantId}>{branch.brandDisplayName}－{branch.storeName}（{branch.branchCode}）</option>)}</select></label> : <div className="history-single-branch"><span>授權分店</span><strong>{branches[0].brandDisplayName}－{branches[0].storeName}</strong></div>}
          <label><span>狀態</span><select value={filters.status ?? ""} onChange={(event) => replaceFilters({ ...filters, status: event.target.value ? event.target.value as MerchantTaskCodeHistoryStatus : undefined })}><option value="">全部紀錄</option>{TASK_CODE_HISTORY_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>
      </section>

      <section className="status-card history-records" aria-busy={historyLoading}>
        <div className="history-section-heading"><div><h2>交易紀錄</h2><p>依提交時間由新到舊排列</p></div><span>已載入 {items.length} 筆</span></div>
        {historyLoading ? <div className="history-state"><strong>正在讀取核銷紀錄…</strong><span>Context 已載入，正在查詢中央交易資料。</span></div> : null}
        {!historyLoading && historyError ? <div className="history-state history-error" role="alert"><strong>{historyError}</strong><button type="button" onClick={loadFirstPage}>重新載入</button></div> : null}
        {!historyLoading && !historyError && !items.length ? <div className="history-state"><strong>{hasHistoryFilter ? "沒有符合篩選條件的紀錄" : "目前沒有核銷紀錄"}</strong><span>{hasHistoryFilter ? "請調整或清除篩選條件。" : "已完成、已拒絕或已逾時的紀錄會顯示在這裡。"}</span></div> : null}
        {items.length ? <div className="history-list">{items.map((item) => {
          const timezone = merchantTimezone(branches, item.merchantId);
          return <article className="history-record" key={item.submissionId}>
            <div className="history-record-head"><StatusBadge status={item.status} /><button type="button" onClick={() => setSelected(item)}>查看詳情</button></div>
            <h3>{item.missionTitle}</h3>
            <dl className="history-record-grid">
              <DetailField label="玩家">{item.playerDisplayName}</DetailField>
              <DetailField label="品牌／分店">{item.brandDisplayName}／{item.merchantStoreName}</DetailField>
              <DetailField label="提交時間"><TimeValue value={item.submittedAt} timezone={timezone} /></DetailField>
              <DetailField label="店家處理時間"><TimeValue value={item.decidedAt} timezone={timezone} /></DetailField>
              <DetailField label="處理人"><span className="history-breakable" title={item.decidedBy ?? undefined}>{nullDisplay(item.decidedBy)}</span></DetailField>
              <DetailField label="結算摘要" wide><SettlementSummary item={item} /></DetailField>
            </dl>
          </article>;
        })}</div> : null}
        {items.length ? <div className="history-more">
          {moreError ? <div className="history-inline-error" role="alert"><span>{moreError}</span><button type="button" onClick={loadMore}>重試</button></div> : null}
          {nextCursor ? <button type="button" onClick={loadMore} disabled={moreLoading}>{moreLoading ? "載入更多中…" : "載入更多"}</button> : <span>已顯示全部紀錄</span>}
        </div> : null}
      </section>
    </> : null}

    {selected ? <div className="history-drawer-layer"><button className="history-scrim" type="button" aria-label="關閉紀錄詳情" onClick={() => setSelected(null)} /><aside className="history-drawer" role="dialog" aria-modal="true" aria-labelledby="history-detail-title">
      <header><div><p className="history-eyebrow">單筆摘要</p><h2 id="history-detail-title">核銷紀錄明細</h2></div><button type="button" aria-label="關閉" onClick={() => setSelected(null)}>×</button></header>
      <div className="history-drawer-body">
        <section><h3>紀錄資料</h3><dl className="history-detail-grid"><DetailField label="Submission ID" wide><span className="history-breakable">{selected.submissionId}</span></DetailField><DetailField label="狀態"><StatusBadge status={selected.status} /></DetailField><DetailField label="任務">{selected.missionTitle}</DetailField><DetailField label="玩家">{selected.playerDisplayName}</DetailField><DetailField label="品牌">{selected.brandDisplayName}</DetailField><DetailField label="分店">{selected.merchantStoreName}</DetailField></dl></section>
        <section><h3>時間</h3><dl className="history-detail-grid"><DetailField label="提交時間"><TimeValue value={selected.submittedAt} timezone={merchantTimezone(branches, selected.merchantId)} /></DetailField><DetailField label="確認期限"><TimeValue value={selected.confirmationExpiresAt} timezone={merchantTimezone(branches, selected.merchantId)} /></DetailField><DetailField label="店家處理時間"><TimeValue value={selected.decidedAt} timezone={merchantTimezone(branches, selected.merchantId)} /></DetailField><DetailField label="結算時間"><TimeValue value={selected.settledAt} timezone={merchantTimezone(branches, selected.merchantId)} /></DetailField></dl></section>
        <section><h3>店家處理</h3><dl className="history-detail-grid"><DetailField label="處理人"><span className="history-breakable">{nullDisplay(selected.decidedBy)}</span></DetailField><DetailField label="處理結果">{unsettledHistoryReason(selected.status) ?? "已完成結算"}</DetailField></dl></section>
        <section><h3>平台關聯</h3><dl className="history-detail-grid"><DetailField label="Redemption ID"><span className="history-breakable">{nullDisplay(selected.redemptionId)}</span></DetailField><DetailField label="Reward Event ID"><span className="history-breakable">{nullDisplay(selected.rewardEventId)}</span></DetailField><DetailField label="Rule Version"><span className="history-breakable">{nullDisplay(selected.settlementSummary?.ruleVersion)}</span></DetailField></dl></section>
        <section><h3>已完成資源摘要</h3>{storedMerchantSettlement(selected) ? <SettlementSummary item={selected} /> : <p className="history-unsettled">—</p>}</section>
      </div>
    </aside></div> : null}
  </main>;
}
