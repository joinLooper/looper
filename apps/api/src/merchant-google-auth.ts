import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { InMemoryStore } from "./store.js";
import { GOOGLE_SCHEMA_NAME } from "./merchant-google-schema.js";
import { googleAuthError } from "./merchant-google-verifier.js";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const opaque = () => randomBytes(32).toString("base64url");
const valid = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);

/** Only verified Google subjects enter this service. No email/name-based resolution. */
export class MerchantGoogleAuth {
  private static sequence = 0;
  constructor(private readonly store: InMemoryStore) {
    if (
      store.db
        .prepare("SELECT name FROM schema_migrations WHERE version = 28")
        .get()?.name !== GOOGLE_SCHEMA_NAME
    ) {
      throw new Error(
        "Explicit merchant Google schema migration 28 required before enablement",
      );
    }
  }

  private invitation(tokenHash: string, now: string) {
    const row = this.store.db
      .prepare(
        "SELECT * FROM account_invitations WHERE token_hash = ? AND purpose = 'merchant_operator'",
      )
      .get(tokenHash);
    if (!row || row.status !== "pending")
      throw googleAuthError("INVITATION_UNAVAILABLE", 409);
    if (String(row.expires_at) <= now)
      throw googleAuthError("INVITATION_EXPIRED", 409);
    this.membership(String(row.account_id));
    return row;
  }

  private membership(accountId: string) {
    const context = this.store.getMerchantContext(accountId);
    if (!context.memberships.some((m) => m.role !== "branch_staff"))
      throw googleAuthError("MERCHANT_PERMISSION_REQUIRED", 403);
    return context;
  }

  challenge(invitationToken?: string) {
    if (invitationToken && !valid(invitationToken))
      throw googleAuthError("INVITATION_UNAVAILABLE", 409);
    const now = new Date().toISOString();
    const invitationHash = invitationToken ? hash(invitationToken) : null;
    if (invitationHash) this.invitation(invitationHash, now);
    const state = opaque(),
      nonce = opaque(),
      browser = opaque();
    // Bounded lifetime; no token, credential, or Google subject is stored here.
    this.store.db
      .prepare("DELETE FROM merchant_google_challenges WHERE expires_at <= ?")
      .run(now);
    this.store.db
      .prepare(
        `INSERT INTO merchant_google_challenges
      (state_hash, nonce_hash, browser_hash, invitation_hash, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        hash(state),
        hash(nonce),
        hash(browser),
        invitationHash,
        new Date(Date.now() + 300000).toISOString(),
      );
    return { state, nonce, browser };
  }

  validateChallenge(state: string, browser: string, nonce?: string) {
    if (!valid(state) || !valid(browser))
      throw googleAuthError("GOOGLE_CSRF_STATE_INVALID", 403);
    const row = this.store.db
      .prepare("SELECT * FROM merchant_google_challenges WHERE state_hash = ?")
      .get(hash(state));
    if (
      !row ||
      row.browser_hash !== hash(browser) ||
      row.consumed_at ||
      String(row.expires_at) <= new Date().toISOString()
    ) {
      throw googleAuthError("GOOGLE_CHALLENGE_EXPIRED_OR_REPLAYED", 403);
    }
    if (nonce !== undefined && row.nonce_hash !== hash(nonce))
      throw googleAuthError("GOOGLE_NONCE_INVALID", 403);
    return row;
  }

  login(
    state: string,
    browser: string,
    identity: { subject: string; nonce: string },
  ) {
    const db = this.store.db;
    const point = `merchant_google_${++MerchantGoogleAuth.sequence}`;
    try {
      db.exec(`SAVEPOINT ${point}`);
    } catch {
      db.close();
      throw googleAuthError("GOOGLE_TRANSACTION_UNAVAILABLE", 503);
    }
    let result;
    try {
      const challenge = this.validateChallenge(state, browser, identity.nonce);
      const now = new Date().toISOString();
      const existing = db
        .prepare(
          "SELECT account_id FROM account_external_identities WHERE provider = 'google' AND provider_subject = ?",
        )
        .get(identity.subject);
      let accountId: string;
      let invitationId: string;
      if (challenge.invitation_hash) {
        const invitation = this.invitation(
          String(challenge.invitation_hash),
          now,
        );
        accountId = String(invitation.account_id);
        invitationId = String(invitation.id);
        const other = db
          .prepare(
            "SELECT provider_subject FROM account_external_identities WHERE provider = 'google' AND account_id = ?",
          )
          .get(accountId);
        if (
          (existing && existing.account_id !== accountId) ||
          (other && other.provider_subject !== identity.subject)
        ) {
          throw googleAuthError("GOOGLE_ACCOUNT_CONFLICT", 409);
        }
        if (!existing)
          db.prepare(
            `INSERT INTO account_external_identities
          (id, account_id, provider, provider_subject, created_at, updated_at) VALUES (?, ?, 'google', ?, ?, ?)`,
          ).run(
            `identity-${randomUUID()}`,
            accountId,
            identity.subject,
            now,
            now,
          );
        const changed = db
          .prepare(
            "UPDATE account_invitations SET status = 'redeemed', redeemed_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
          )
          .run(now, now, invitationId);
        if (Number(changed.changes) !== 1)
          throw googleAuthError("INVITATION_UNAVAILABLE", 409);
      } else {
        if (!existing)
          throw googleAuthError("MERCHANT_INVITATION_REQUIRED", 403);
        accountId = String(existing.account_id);
        // Preserve the existing invitation-provenance constraint for returning sessions.
        const invitation = db
          .prepare(
            `SELECT id FROM account_invitations WHERE account_id = ?
          AND purpose = 'merchant_operator' AND status = 'redeemed' AND revoked_at IS NULL ORDER BY redeemed_at DESC, id LIMIT 1`,
          )
          .get(accountId);
        if (!invitation)
          throw googleAuthError("MERCHANT_INVITATION_REQUIRED", 403);
        invitationId = String(invitation.id);
      }
      const context = this.membership(accountId);
      const consumed = db
        .prepare(
          "UPDATE merchant_google_challenges SET consumed_at = ? WHERE state_hash = ? AND consumed_at IS NULL",
        )
        .run(now, hash(state));
      if (Number(consumed.changes) !== 1)
        throw googleAuthError("GOOGLE_CHALLENGE_EXPIRED_OR_REPLAYED", 403);
      const sessionId = `session-${randomUUID()}`,
        sessionToken = opaque();
      const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      db.prepare(
        `INSERT INTO account_sessions
        (id, account_id, purpose, token_hash, expires_at, revoked_at, created_from_invitation_id, last_used_at, created_at, updated_at)
        VALUES (?, ?, 'merchant_operator', ?, ?, NULL, ?, NULL, ?, ?)`,
      ).run(
        sessionId,
        accountId,
        hash(sessionToken),
        expiresAt,
        invitationId,
        now,
        now,
      );
      db.prepare(
        `INSERT INTO audit_events(id, actor_role, actor_id, action, entity_type, entity_id, created_at, metadata_json)
        VALUES (?, 'merchant', ?, 'identity.google_merchant_session_created', 'account_session', ?, ?, ?)`,
      ).run(
        `audit-${randomUUID()}`,
        accountId,
        sessionId,
        now,
        JSON.stringify({
          invitationId,
          firstBinding: !existing,
          provider: "google",
        }),
      );
      result = {
        sessionToken,
        account: {
          accountId,
          displayName: context.displayName,
          accountStatus: "active" as const,
          sessionId,
          sessionCreatedAt: now,
          expiresAt,
        },
      };
    } catch (error) {
      try {
        db.exec(`ROLLBACK TO SAVEPOINT ${point}`);
        db.exec(`RELEASE SAVEPOINT ${point}`);
      } catch {
        db.close();
        throw googleAuthError("GOOGLE_TRANSACTION_UNAVAILABLE", 503);
      }
      throw error;
    }
    try {
      db.exec(`RELEASE SAVEPOINT ${point}`);
    } catch {
      db.close();
      throw googleAuthError("GOOGLE_COMMIT_OUTCOME_UNKNOWN", 503);
    }
    return result;
  }
}
