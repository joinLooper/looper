import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { InMemoryStore } from "./store.js";
import {
  activeStaffMembership,
  hasStaffSchema,
  resolveStaffScope,
  staffError,
  type StaffScope,
} from "./merchant-staff-schema.js";
import type { VerifiedStaffLineIdentity } from "./merchant-staff-verifier.js";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const opaque = () => randomBytes(32).toString("base64url");
export class MerchantStaffAuth {
  constructor(
    private readonly store: InMemoryStore,
    readonly channelId: string,
    readonly merchantAppUrl: string,
  ) {
    if (!channelId || !hasStaffSchema(store.db))
      throw Error("Explicit staff schema 29 and shared LINE channel required");
  }
  get redirectUri() {
    return new URL("/staff/line/callback", this.merchantAppUrl).href;
  }
  private atomic<T>(operationId: string, work: () => T): T {
    const db = this.store.db;
    // This API service owns a root transaction. Acquire the writer lock before any reads.
    try {
      db.exec("BEGIN IMMEDIATE");
    } catch {
      db.close();
      throw staffError("STAFF_TRANSACTION_UNAVAILABLE", 503);
    }
    let result: T;
    try {
      result = work();
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        db.close();
        throw staffError("STAFF_TRANSACTION_UNAVAILABLE", 503);
      }
      throw error;
    }
    try {
      db.exec("COMMIT");
    } catch {
      db.close();
      throw Object.assign(staffError("STAFF_COMMIT_OUTCOME_UNKNOWN", 503), {
        operationId,
      });
    }
    return result;
  }
  private audit(
    actor: string,
    action: string,
    id: string,
    metadata: Record<string, unknown>,
    role = "merchant",
    entityType = "account_session",
  ) {
    this.store.db
      .prepare(
        `INSERT INTO audit_events(id,actor_role,actor_id,action,entity_type,entity_id,created_at,metadata_json) VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        `audit-${randomUUID()}`,
        role,
        actor,
        action,
        entityType,
        id,
        new Date().toISOString(),
        JSON.stringify(metadata),
      );
  }
  private invitation(id: string, pending: boolean): StaffScope {
    const db = this.store.db;
    const row = db
      .prepare(
        `SELECT i.*, s.account_id AS scoped_account_id,s.membership_id,s.brand_id,s.merchant_id,s.channel_id,s.provider
      FROM account_invitations i JOIN merchant_staff_invitations s ON s.invitation_id=i.id WHERE i.id=?`,
      )
      .get(id);
    if (
      !row ||
      row.purpose !== "merchant_operator" ||
      row.revoked_at ||
      row.status !== (pending ? "pending" : "redeemed")
    )
      throw staffError("STAFF_INVITATION_UNAVAILABLE", 409);
    if (pending && String(row.expires_at) <= new Date().toISOString())
      throw staffError("STAFF_INVITATION_EXPIRED", 409);
    const scope = activeStaffMembership(db, String(row.membership_id));
    if (
      row.account_id !== scope.accountId ||
      row.scoped_account_id !== scope.accountId ||
      row.brand_id !== scope.brandId ||
      row.merchant_id !== scope.merchantId ||
      row.channel_id !== this.channelId ||
      row.provider !== "line"
    )
      throw staffError("STAFF_SCOPE_INVALID");
    return { ...scope, channelId: this.channelId };
  }
  preview(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw staffError("STAFF_INVITATION_UNAVAILABLE", 409);
    const row = this.store.db
      .prepare("SELECT id FROM account_invitations WHERE token_hash=?")
      .get(hash(token));
    if (!row) throw staffError("STAFF_INVITATION_UNAVAILABLE", 409);
    const scope = this.invitation(String(row.id), true);
    return {
      invitationId: String(row.id),
      ...scope,
      storeName: this.store.getMerchant(scope.merchantId).storeName,
    };
  }
  issueInvitation(
    membershipId: string,
    actorId: string,
    idempotencyKey: string,
  ) {
    return this.atomic(hash(idempotencyKey), () => {
      const db = this.store.db,
        scope = activeStaffMembership(db, membershipId);
      const previous = db
        .prepare(
          "SELECT * FROM account_invitations WHERE creation_idempotency_key=?",
        )
        .get(idempotencyKey);
      if (previous) {
        const metadata = db
          .prepare(
            "SELECT * FROM merchant_staff_invitations WHERE invitation_id=?",
          )
          .get(String(previous.id));
        if (
          !metadata ||
          metadata.membership_id !== membershipId ||
          metadata.channel_id !== this.channelId ||
          previous.created_by_actor_id !== actorId
        )
          throw staffError("STAFF_IDEMPOTENCY_CONFLICT", 409);
        return {
          invitationId: String(previous.id),
          merchantId: scope.merchantId,
          replayed: true,
        };
      }
      const now = new Date().toISOString(),
        id = `invitation-${randomUUID()}`,
        token = opaque();
      db.prepare(
        `UPDATE account_invitations SET status='revoked',revoked_at=?,updated_at=? WHERE status='pending' AND id IN (SELECT invitation_id FROM merchant_staff_invitations WHERE membership_id=?)`,
      ).run(now, now, membershipId);
      db.prepare(
        `INSERT INTO account_invitations(id,account_id,purpose,token_hash,status,expires_at,created_by_actor_id,creation_idempotency_key,created_at,updated_at)
        VALUES (?,?,'merchant_operator',?,'pending',?,?,?,?,?)`,
      ).run(
        id,
        scope.accountId,
        hash(token),
        new Date(Date.now() + 72 * 3600000).toISOString(),
        actorId,
        idempotencyKey,
        now,
        now,
      );
      db.prepare(
        `INSERT INTO merchant_staff_invitations(invitation_id,account_id,membership_id,brand_id,merchant_id,provider,channel_id,created_at) VALUES (?,?,?,?,?,'line',?,?)`,
      ).run(
        id,
        scope.accountId,
        membershipId,
        scope.brandId,
        scope.merchantId,
        this.channelId,
        now,
      );
      this.audit(
        actorId,
        "identity.line_staff_invitation_created",
        id,
        {
          membershipId,
          merchantId: scope.merchantId,
          accountId: scope.accountId,
        },
        "admin",
        "account_invitation",
      );
      return {
        invitationId: id,
        invitationToken: token,
        invitationUrl: new URL(`/staff#invite=${token}`, this.merchantAppUrl)
          .href,
        merchantId: scope.merchantId,
        replayed: false,
      };
    });
  }
  challenge(invitationToken?: string, merchantId?: string) {
    const state = randomBytes(32).toString("hex"),
      nonce = randomBytes(32).toString("hex"),
      browser = opaque(),
      verifier = opaque();
    this.atomic(hash(state), () => {
      const invite = invitationToken ? this.preview(invitationToken) : null;
      if (invite && merchantId && merchantId !== invite.merchantId)
        throw staffError("STAFF_SCOPE_INVALID");
      // Retain consumed outcome evidence; remove only expired, unconsumed code secrets.
      this.store.db
        .prepare(
          "UPDATE merchant_staff_challenges SET code_verifier=NULL WHERE expires_at<=?",
        )
        .run(new Date().toISOString());
      this.store.db
        .prepare(
          `INSERT INTO merchant_staff_challenges(state_hash,nonce_hash,browser_hash,code_verifier,invitation_id,merchant_id,channel_id,expires_at) VALUES (?,?,?,?,?,?,?,?)`,
        )
        .run(
          hash(state),
          hash(nonce),
          hash(browser),
          verifier,
          invite?.invitationId ?? null,
          invite?.merchantId ?? merchantId ?? null,
          this.channelId,
          new Date(Date.now() + 300000).toISOString(),
        );
    });
    const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: this.channelId,
      redirect_uri: this.redirectUri,
      scope: "openid profile",
      state,
      nonce,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    }).toString();
    return { browser, authorizationUrl: url.href };
  }
  validateChallenge(state: string, browser: string) {
    if (!/^[a-f0-9]{64}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(browser))
      throw staffError("LINE_STATE_INVALID");
    const row = this.store.db
      .prepare("SELECT * FROM merchant_staff_challenges WHERE state_hash=?")
      .get(hash(state));
    if (
      !row ||
      row.browser_hash !== hash(browser) ||
      row.channel_id !== this.channelId ||
      row.consumed_at ||
      !row.code_verifier ||
      String(row.expires_at) <= new Date().toISOString()
    )
      throw staffError("LINE_CHALLENGE_EXPIRED_OR_REPLAYED");
    return {
      nonceHash: String(row.nonce_hash),
      verifier: String(row.code_verifier),
      invitationId: row.invitation_id ? String(row.invitation_id) : null,
      merchantId: row.merchant_id ? String(row.merchant_id) : null,
    };
  }
  login(state: string, browser: string, identity: VerifiedStaffLineIdentity) {
    return this.atomic(hash(state), () => {
      const db = this.store.db,
        challenge = this.validateChallenge(state, browser);
      if (
        identity.channelId !== this.channelId ||
        identity.nonceHash !== challenge.nonceHash ||
        !identity.subject.trim()
      )
        throw staffError("LINE_INVALID_CREDENTIAL", 401);
      const existing = db
        .prepare(
          "SELECT id,account_id FROM account_external_identities WHERE provider='line' AND provider_subject=?",
        )
        .get(identity.subject);
      let invitationId = challenge.invitationId;
      if (!invitationId) {
        if (!existing) throw staffError("STAFF_INVITATION_REQUIRED");
        const candidates = db
          .prepare(
            `SELECT i.id FROM account_invitations i JOIN merchant_staff_invitations s ON s.invitation_id=i.id
          JOIN merchant_operator_memberships m ON m.id=s.membership_id
          WHERE i.account_id=? AND i.status='redeemed' AND i.revoked_at IS NULL AND s.channel_id=? AND m.status='active' AND m.role='branch_staff'
          ${challenge.merchantId ? "AND s.merchant_id=?" : ""} ORDER BY i.redeemed_at DESC,i.id`,
          )
          .all(
            String(existing.account_id),
            this.channelId,
            ...(challenge.merchantId ? [challenge.merchantId] : []),
          );
        const eligible = candidates
          .map((row) => {
            try {
              return {
                id: String(row.id),
                scope: this.invitation(String(row.id), false),
              };
            } catch {
              return null;
            }
          })
          .filter((x): x is { id: string; scope: StaffScope } => x !== null);
        if (!eligible.length) throw staffError("STAFF_MEMBERSHIP_UNAVAILABLE");
        if (new Set(eligible.map((x) => x.scope.merchantId)).size !== 1)
          throw staffError("STAFF_BRANCH_REQUIRED");
        invitationId = eligible[0]!.id;
      }
      const scope = this.invitation(
        invitationId,
        Boolean(challenge.invitationId),
      );
      if (challenge.merchantId && scope.merchantId !== challenge.merchantId)
        throw staffError("STAFF_SCOPE_INVALID");
      if (existing && existing.account_id !== scope.accountId)
        throw staffError("ACCOUNT_LINK_CONFLICT", 409);
      // Do not attach a second LINE subject to an already LINE-bound account.
      const other = db
        .prepare(
          "SELECT provider_subject FROM account_external_identities WHERE account_id=? AND provider='line' AND provider_subject<>?",
        )
        .get(scope.accountId, identity.subject);
      if (other) throw staffError("ACCOUNT_LINK_CONFLICT", 409);
      const now = new Date().toISOString(),
        identityId = existing
          ? String(existing.id)
          : `identity-${randomUUID()}`;
      if (!existing)
        db.prepare(
          `INSERT INTO account_external_identities(id,account_id,provider,provider_subject,created_at,updated_at) VALUES (?,?,'line',?,?,?)`,
        ).run(identityId, scope.accountId, identity.subject, now, now);
      if (challenge.invitationId) {
        const changed = db
          .prepare(
            "UPDATE account_invitations SET status='redeemed',redeemed_at=?,updated_at=? WHERE id=? AND status='pending'",
          )
          .run(now, now, invitationId);
        if (Number(changed.changes) !== 1)
          throw staffError("STAFF_INVITATION_UNAVAILABLE", 409);
      }
      const sessionId = `session-${randomUUID()}`,
        sessionToken = opaque(),
        expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      db.prepare(
        `INSERT INTO account_sessions(id,account_id,purpose,token_hash,expires_at,created_from_invitation_id,created_at,updated_at) VALUES (?,?,'merchant_operator',?,?,?,?,?)`,
      ).run(
        sessionId,
        scope.accountId,
        hash(sessionToken),
        expiresAt,
        invitationId,
        now,
        now,
      );
      db.prepare(
        `INSERT INTO merchant_staff_sessions(session_id,invitation_id,account_id,membership_id,brand_id,merchant_id,provider,channel_id,identity_id,created_at) VALUES (?,?,?,?,?,?,'line',?,?,?)`,
      ).run(
        sessionId,
        invitationId,
        scope.accountId,
        scope.membershipId,
        scope.brandId,
        scope.merchantId,
        this.channelId,
        identityId,
        now,
      );
      const consumed = db
        .prepare(
          "UPDATE merchant_staff_challenges SET consumed_at=?,session_id=?,code_verifier=NULL WHERE state_hash=? AND consumed_at IS NULL",
        )
        .run(now, sessionId, hash(state));
      if (Number(consumed.changes) !== 1)
        throw staffError("LINE_CHALLENGE_EXPIRED_OR_REPLAYED");
      this.audit(
        scope.accountId,
        "identity.line_staff_session_created",
        sessionId,
        {
          invitationId,
          membershipId: scope.membershipId,
          merchantId: scope.merchantId,
          provider: "line",
          channelId: this.channelId,
          operationId: hash(state),
        },
      );
      resolveStaffScope(db, sessionId, scope.accountId);
      return {
        sessionToken,
        expiresAt,
        merchantId: scope.merchantId,
        accountId: scope.accountId,
      };
    });
  }
}
