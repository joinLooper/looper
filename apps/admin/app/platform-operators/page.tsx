"use client";

import type {
  PlatformOperatorCreateResult,
  PlatformOperatorListItem,
  PlatformOperatorPage,
  PlatformOperatorRole,
  PlatformOperatorRoleUpdateResult,
  PlatformOperatorStatusUpdateResult,
  PlatformOperatorInvitationResendResult,
} from "@looper/types";
import { Button } from "@looper/ui";
import Link from "next/link";
import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { hasPlatformPermission, platformRoleLabel } from "../admin-session-flow";
import { useAdminSession } from "../admin-session-gate";
import {
  accountStatusLabel,
  canChangePlatformOperatorRole,
  canReactivatePlatformOperator,
  canResendPlatformInvitation,
  canSuspendPlatformOperator,
  classifyPlatformOperatorError,
  createPlatformOperatorRequest,
  invitationStatusLabel,
  invitationUrl,
  isDifferentRole,
  isValidReason,
  membershipStatusLabel,
  nextIdempotencyKey,
  oneTimeInvitationFromResponse,
  platformOperatorErrorMessage,
  platformOperatorRequest,
  resendPlatformInvitationRequest,
  updatePlatformOperatorRoleRequest,
  updatePlatformOperatorStatusRequest,
  type OneTimeInvitation,
  type PlatformOperatorApiError,
} from "../platform-operator-flow";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const ROLES: PlatformOperatorRole[] = ["operations_admin", "finance_admin", "super_admin"];
type DialogKind = "suspend" | "reactivate" | "role" | "resend";
type ActionDialog = {
  kind: DialogKind;
  item: PlatformOperatorListItem;
  reason: string;
  role: PlatformOperatorRole;
  idempotencyKey: string;
};

function newKey(): string {
  return nextIdempotencyKey(() => crypto.randomUUID());
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Taipei" }).format(new Date(value));
}

function actionTitle(kind: DialogKind): string {
  if (kind === "suspend") return "停權平台操作人員";
  if (kind === "reactivate") return "復職平台操作人員";
  if (kind === "role") return "變更平台角色";
  return "重新產生邀請";
}

export default function PlatformOperatorsPage() {
  const session = useAdminSession();
  const canManage = hasPlatformPermission(session?.context ?? null, "platform.identity.manage");
  const [items, setItems] = useState<PlatformOperatorListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  const [busyMutation, setBusyMutation] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ActionDialog | null>(null);
  const [oneTimeInvitation, setOneTimeInvitation] = useState<OneTimeInvitation | null>(null);
  const [tokenUnavailable, setTokenUnavailable] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<{ displayName: string; role: PlatformOperatorRole; idempotencyKey: string }>(() => ({
    displayName: "", role: "operations_admin", idempotencyKey: newKey(),
  }));
  const requestVersion = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
    };
  }, []);

  const handleAuthorizationError = useCallback((error: PlatformOperatorApiError) => {
    if (error !== "unauthenticated" && error !== "forbidden") return false;
    setItems([]);
    setNextCursor(null);
    setDialog(null);
    setOneTimeInvitation(null);
    setTokenUnavailable(false);
    if (error === "unauthenticated") session?.invalidateSession("unauthenticated");
    else setAccessDenied(true);
    return true;
  }, [session]);

  const loadOperators = useCallback(async (cursor: string | null = null, append = false): Promise<boolean> => {
    if (!canManage || !session) return false;
    const version = ++requestVersion.current;
    append ? setLoadingMore(true) : setLoading(true);
    if (!append) setListError(null);
    try {
      const query = new URLSearchParams({ limit: "20" });
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`${API_URL}/admin/platform-operators?${query}`, platformOperatorRequest);
      if (version !== requestVersion.current || !mounted.current) return false;
      if (!response.ok) {
        const error = classifyPlatformOperatorError(response.status);
        if (handleAuthorizationError(error)) return false;
        setListError(platformOperatorErrorMessage(error));
        return false;
      }
      const page = await response.json() as PlatformOperatorPage;
      setItems((current) => append
        ? [...current, ...page.items.filter((incoming) => !current.some((item) => item.membershipId === incoming.membershipId))]
        : page.items);
      setNextCursor(page.nextCursor);
      setListError(null);
      return true;
    } catch {
      if (version !== requestVersion.current || !mounted.current) return false;
      setListError(platformOperatorErrorMessage("network"));
      return false;
    } finally {
      if (version === requestVersion.current && mounted.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [canManage, handleAuthorizationError, session]);

  useEffect(() => {
    if (canManage) void loadOperators();
  }, [canManage, loadOperators]);

  function changeCreateForm(update: Partial<Pick<typeof createForm, "displayName" | "role">>) {
    setCreateForm((current) => ({ ...current, ...update, idempotencyKey: newKey() }));
  }

  function openDialog(kind: DialogKind, item: PlatformOperatorListItem) {
    setMutationMessage(null);
    setDialog({ kind, item, reason: "", role: item.role, idempotencyKey: newKey() });
  }

  function changeDialog(update: Partial<Pick<ActionDialog, "reason" | "role">>) {
    setDialog((current) => current ? { ...current, ...update, idempotencyKey: newKey() } : null);
  }

  async function refreshAfterMutation(successMessage: string) {
    const refreshed = await loadOperators();
    if (mounted.current) setMutationMessage(refreshed ? successMessage : "操作已完成，但列表更新失敗。請重新載入。 ");
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyMutation || !createForm.displayName.trim()) return;
    const operationId = `create:${createForm.idempotencyKey}`;
    setBusyMutation(operationId);
    setMutationMessage(null);
    try {
      const response = await fetch(`${API_URL}/admin/platform-operators`, createPlatformOperatorRequest({
        displayName: createForm.displayName.trim(), role: createForm.role, idempotencyKey: createForm.idempotencyKey,
      }));
      if (!response.ok) {
        const error = classifyPlatformOperatorError(response.status);
        if (!handleAuthorizationError(error)) setMutationMessage(platformOperatorErrorMessage(error));
        if (error === "not_found" || error === "conflict") await loadOperators();
        return;
      }
      const result = await response.json() as PlatformOperatorCreateResult;
      const invitation = oneTimeInvitationFromResponse(result, result.account.displayName);
      setOneTimeInvitation(invitation);
      setTokenUnavailable(!invitation);
      setCreateForm({ displayName: "", role: "operations_admin", idempotencyKey: newKey() });
      await refreshAfterMutation(invitation ? "平台操作人員已建立，邀請連結只會顯示這一次。" : "平台操作人員已建立；此重送結果不會再次顯示邀請連結。");
    } catch {
      if (mounted.current) setMutationMessage(platformOperatorErrorMessage("network"));
    } finally {
      if (mounted.current) setBusyMutation(null);
    }
  }

  async function submitDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || busyMutation) return;
    if (dialog.kind !== "resend" && !isValidReason(dialog.reason)) {
      setMutationMessage("原因必須為 1–500 個字。 ");
      return;
    }
    if (dialog.kind === "role" && !isDifferentRole(dialog.item.role, dialog.role)) {
      setMutationMessage("請選擇不同於目前角色的新角色。 ");
      return;
    }
    const operationId = `${dialog.kind}:${dialog.idempotencyKey}`;
    setBusyMutation(operationId);
    setMutationMessage(null);
    try {
      let response: Response;
      if (dialog.kind === "resend") {
        response = await fetch(`${API_URL}/admin/platform-operators/${encodeURIComponent(dialog.item.membershipId)}/invitations`, resendPlatformInvitationRequest(dialog.idempotencyKey));
      } else if (dialog.kind === "role") {
        response = await fetch(`${API_URL}/admin/platform-operators/${encodeURIComponent(dialog.item.membershipId)}/role`, updatePlatformOperatorRoleRequest({
          role: dialog.role, reason: dialog.reason.trim(), idempotencyKey: dialog.idempotencyKey,
        }));
      } else {
        response = await fetch(`${API_URL}/admin/platform-operators/${encodeURIComponent(dialog.item.membershipId)}/status`, updatePlatformOperatorStatusRequest({
          status: dialog.kind === "suspend" ? "suspended" : "active",
          reason: dialog.reason.trim(), idempotencyKey: dialog.idempotencyKey,
        }));
      }
      if (!response.ok) {
        const error = classifyPlatformOperatorError(response.status);
        if (handleAuthorizationError(error)) return;
        setMutationMessage(platformOperatorErrorMessage(error));
        if (error === "not_found" || error === "conflict") {
          setDialog(null);
          await loadOperators();
        }
        return;
      }
      const result = await response.json() as PlatformOperatorInvitationResendResult | PlatformOperatorStatusUpdateResult | PlatformOperatorRoleUpdateResult;
      const invitation = oneTimeInvitationFromResponse(result, dialog.item.displayName);
      setOneTimeInvitation(invitation);
      setTokenUnavailable(Boolean(result.tokenRevealed === false && result.replayed));
      const successMessage = dialog.kind === "suspend"
        ? "停權已完成。"
        : dialog.kind === "reactivate"
          ? "復職已完成；目標人員需使用新邀請重新進入後台。"
          : dialog.kind === "role"
            ? "角色變更已完成；目標人員需使用新邀請重新進入後台。"
            : invitation ? "新邀請已建立，連結只會顯示這一次。" : "邀請操作已完成；重送結果不會再次顯示連結。";
      setDialog(null);
      await refreshAfterMutation(successMessage);
    } catch {
      if (mounted.current) setMutationMessage(platformOperatorErrorMessage("network"));
    } finally {
      if (mounted.current) setBusyMutation(null);
    }
  }

  function closeInvitation() {
    setOneTimeInvitation(null);
    setTokenUnavailable(false);
    setCopyMessage(null);
  }

  async function copyInvitation() {
    if (!oneTimeInvitation) return;
    try {
      await navigator.clipboard.writeText(invitationUrl(window.location.origin, oneTimeInvitation.token));
      setCopyMessage("邀請連結已複製。 ");
    } catch {
      setCopyMessage("無法自動複製，請手動選取邀請連結。 ");
    }
  }

  if (!canManage || accessDenied) return <main className="admin-shell platform-operator-shell">
    <Link className="back-link" href="/">← 返回平台首頁</Link>
    <section className="admin-auth-card inline-auth-card"><h1>無法管理平台人員</h1><p>你沒有管理平台人員的權限。</p></section>
  </main>;

  const invitationLink = oneTimeInvitation ? invitationUrl(typeof window === "undefined" ? "" : window.location.origin, oneTimeInvitation.token) : "";
  return <main className="admin-shell platform-operator-shell">
    <header className="platform-operator-header">
      <div><Link className="back-link" href="/">← 返回平台首頁</Link><p className="admin-brand">平台身分管理</p><h1>平台人員管理</h1><p className="admin-subtitle">查看平台操作人員、建立一次性邀請，以及管理後台存取與角色。</p></div>
      <Button type="button" className="refresh-button" onClick={() => void loadOperators()} disabled={loading}>{loading ? "載入中..." : "重新載入"}</Button>
    </header>

    {mutationMessage ? <p className="admin-message" aria-live="polite">{mutationMessage}</p> : null}

    <section className="panel platform-create-panel">
      <div className="panel-header"><div><h2>建立平台操作人員邀請</h2><p>建立正式帳號、平台 membership 與一次性邀請。</p></div></div>
      <form className="platform-create-form" onSubmit={submitCreate}>
        <label><span>顯示名稱</span><input value={createForm.displayName} maxLength={120} required onChange={(event) => changeCreateForm({ displayName: event.target.value })} /></label>
        <label><span>平台角色</span><select value={createForm.role} onChange={(event) => changeCreateForm({ role: event.target.value as PlatformOperatorRole })}>{ROLES.map((role) => <option key={role} value={role}>{platformRoleLabel(role)}</option>)}</select></label>
        <Button className="action-primary" type="submit" disabled={Boolean(busyMutation) || !createForm.displayName.trim()}>{busyMutation?.startsWith("create:") ? "建立中..." : "建立邀請"}</Button>
      </form>
    </section>

    <section className="panel platform-list-panel">
      <div className="panel-header"><div><h2>平台操作人員</h2><p>角色與狀態均由平台正式資料提供。</p></div><span className="panel-count">{items.length} 筆</span></div>
      {loading && !items.length ? <div className="platform-list-state">正在讀取平台人員...</div> : null}
      {listError ? <div className="platform-list-state error-state"><p>{listError}</p><Button type="button" onClick={() => void loadOperators()}>重試</Button></div> : null}
      {!loading && !listError && !items.length ? <div className="platform-list-state">目前沒有平台操作人員。</div> : null}
      {items.length ? <div className="platform-operator-list">{items.map((item) => <article className="platform-operator-card" key={item.membershipId}>
        <div className="platform-operator-card-head"><div><h3>{item.displayName}</h3><p title={item.accountId}>帳號：{item.accountId}</p></div><span className={`operator-status operator-status-${item.membershipStatus}`}>{membershipStatusLabel(item.membershipStatus)}</span></div>
        <dl className="platform-operator-fields">
          <div><dt>角色</dt><dd>{platformRoleLabel(item.role)}</dd></div>
          <div><dt>帳號狀態</dt><dd>{accountStatusLabel(item.accountStatus)}</dd></div>
          <div className="wide"><dt>邀請</dt><dd>{invitationStatusLabel(item)}{item.pendingInvitationId ? <small>有效期限：{formatTime(item.pendingInvitationExpiresAt)}</small> : null}</dd></div>
          <div><dt>建立時間</dt><dd>{formatTime(item.membershipCreatedAt)}</dd></div>
          <div><dt>更新時間</dt><dd>{formatTime(item.membershipUpdatedAt)}</dd></div>
        </dl>
        <div className="platform-operator-actions">
          {canChangePlatformOperatorRole(item) ? <Button type="button" onClick={() => openDialog("role", item)} disabled={Boolean(busyMutation)}>變更角色</Button> : null}
          {canResendPlatformInvitation(item) ? <Button type="button" onClick={() => openDialog("resend", item)} disabled={Boolean(busyMutation)}>重新產生邀請</Button> : null}
          {canSuspendPlatformOperator(item) ? <Button className="danger-button" type="button" onClick={() => openDialog("suspend", item)} disabled={Boolean(busyMutation)}>停權</Button> : null}
          {canReactivatePlatformOperator(item) ? <Button type="button" onClick={() => openDialog("reactivate", item)} disabled={Boolean(busyMutation)}>復職</Button> : null}
        </div>
      </article>)}</div> : null}
      {nextCursor ? <div className="platform-load-more"><Button type="button" onClick={() => void loadOperators(nextCursor, true)} disabled={loadingMore}>{loadingMore ? "載入中..." : "載入更多"}</Button></div> : null}
    </section>

    {dialog ? <div className="platform-dialog-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyMutation) setDialog(null); }}>
      <section className="platform-dialog" role="dialog" aria-modal="true" aria-labelledby="platform-dialog-title">
        <h2 id="platform-dialog-title">{actionTitle(dialog.kind)}</h2>
        <p>目標：<strong>{dialog.item.displayName}</strong>・{platformRoleLabel(dialog.item.role)}</p>
        {dialog.kind === "suspend" ? <p className="danger-notice">停權會影響此人員的 Looper 平台後台存取。</p> : null}
        {dialog.kind === "resend" ? <p>建立新邀請後，現有待接受邀請會依後端規則處理。</p> : null}
        <form onSubmit={submitDialog}>
          {dialog.kind === "role" ? <label><span>新角色</span><select value={dialog.role} onChange={(event) => changeDialog({ role: event.target.value as PlatformOperatorRole })}>{ROLES.map((role) => <option key={role} value={role} disabled={role === dialog.item.role}>{platformRoleLabel(role)}</option>)}</select></label> : null}
          {dialog.kind !== "resend" ? <label><span>原因（1–500字）</span><textarea value={dialog.reason} maxLength={500} required onChange={(event) => changeDialog({ reason: event.target.value })} /></label> : null}
          <div className="platform-dialog-actions"><Button type="button" onClick={() => setDialog(null)} disabled={Boolean(busyMutation)}>取消</Button><Button className={dialog.kind === "suspend" ? "danger-button" : "action-primary"} type="submit" disabled={Boolean(busyMutation) || (dialog.kind !== "resend" && !isValidReason(dialog.reason)) || (dialog.kind === "role" && !isDifferentRole(dialog.item.role, dialog.role))}>{busyMutation ? "送出中..." : "確認操作"}</Button></div>
        </form>
      </section>
    </div> : null}

    {oneTimeInvitation || tokenUnavailable ? <div className="platform-dialog-layer" role="presentation">
      <section className="platform-dialog invitation-result" role="dialog" aria-modal="true" aria-labelledby="invitation-result-title">
        <h2 id="invitation-result-title">邀請操作完成</h2>
        {oneTimeInvitation ? <><p><strong>{oneTimeInvitation.displayName}</strong> 的邀請連結只會顯示這一次。關閉後無法從列表再次查看。</p><label><span>一次性邀請連結</span><textarea readOnly value={invitationLink} onFocus={(event) => event.currentTarget.select()} /></label><p>有效期限：{formatTime(oneTimeInvitation.expiresAt)}</p><p aria-live="polite">{copyMessage}</p><div className="platform-dialog-actions"><Button type="button" onClick={copyInvitation}>複製邀請連結</Button><Button className="action-primary" type="button" onClick={closeInvitation}>我已保存，關閉</Button></div></> : <><p>這是重送或未再次揭露 token 的結果，基於安全規則無法重新顯示舊邀請連結。</p><Button className="action-primary" type="button" onClick={closeInvitation}>關閉</Button></>}
      </section>
    </div> : null}
  </main>;
}
