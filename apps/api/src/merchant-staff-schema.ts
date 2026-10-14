import type { PersistenceDatabase } from "./persistence/contract.js";
export const STAFF_SCHEMA_NAME = "line_branch_staff_opt_in";
export const staffError = (code: string, statusCode = 403) =>
  Object.assign(new Error(code), { code, errorCode: code, statusCode });
export const hasStaffSchema = (db: PersistenceDatabase) =>
  db.prepare("SELECT name FROM schema_migrations WHERE version=29").get()
    ?.name === STAFF_SCHEMA_NAME;
/** Explicit v29 opt-in, after the existing v28 identity-table migration; never toggles Google login. */
export function migrateMerchantStaff(db: PersistenceDatabase): void {
  if (
    db.prepare("SELECT name FROM schema_migrations WHERE version=28").get()
      ?.name !== "merchant_google_identity_opt_in"
  )
    throw Error(
      "Apply existing opt-in identity migration 28 before staff migration 29",
    );
  db.exec("BEGIN IMMEDIATE");
  try {
    const previous = db
      .prepare("SELECT name FROM schema_migrations WHERE version=29")
      .get();
    if (previous) {
      if (previous.name !== STAFF_SCHEMA_NAME)
        throw Error("Staff migration authority conflict");
      db.exec("COMMIT");
      return;
    }
    db.exec(`CREATE TABLE merchant_staff_invitations (
      invitation_id TEXT PRIMARY KEY REFERENCES account_invitations(id),
      account_id TEXT NOT NULL REFERENCES accounts(id), membership_id TEXT NOT NULL REFERENCES merchant_operator_memberships(id),
      brand_id TEXT NOT NULL REFERENCES merchant_brands(id), merchant_id TEXT NOT NULL REFERENCES merchants(id),
      provider TEXT NOT NULL CHECK(provider='line'), channel_id TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX idx_staff_invite_account ON merchant_staff_invitations(account_id);
      CREATE INDEX idx_staff_invite_membership ON merchant_staff_invitations(membership_id);
      CREATE INDEX idx_staff_invite_brand ON merchant_staff_invitations(brand_id);
      CREATE INDEX idx_staff_invite_merchant ON merchant_staff_invitations(merchant_id);
      CREATE TABLE merchant_staff_sessions (
      session_id TEXT PRIMARY KEY REFERENCES account_sessions(id), invitation_id TEXT NOT NULL REFERENCES merchant_staff_invitations(invitation_id),
      account_id TEXT NOT NULL REFERENCES accounts(id), membership_id TEXT NOT NULL REFERENCES merchant_operator_memberships(id),
      brand_id TEXT NOT NULL REFERENCES merchant_brands(id), merchant_id TEXT NOT NULL REFERENCES merchants(id),
      provider TEXT NOT NULL CHECK(provider='line'), channel_id TEXT NOT NULL, identity_id TEXT NOT NULL REFERENCES account_external_identities(id), created_at TEXT NOT NULL);
      CREATE INDEX idx_staff_session_invite ON merchant_staff_sessions(invitation_id);
      CREATE INDEX idx_staff_session_account ON merchant_staff_sessions(account_id);
      CREATE INDEX idx_staff_session_membership ON merchant_staff_sessions(membership_id);
      CREATE INDEX idx_staff_session_brand ON merchant_staff_sessions(brand_id);
      CREATE INDEX idx_staff_session_merchant ON merchant_staff_sessions(merchant_id);
      CREATE INDEX idx_staff_session_identity ON merchant_staff_sessions(identity_id);
      CREATE TABLE merchant_staff_challenges (
      state_hash TEXT PRIMARY KEY, nonce_hash TEXT NOT NULL, browser_hash TEXT NOT NULL, code_verifier TEXT,
      invitation_id TEXT REFERENCES merchant_staff_invitations(invitation_id), merchant_id TEXT,
      channel_id TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT,
      session_id TEXT REFERENCES merchant_staff_sessions(session_id));
      CREATE INDEX idx_staff_challenge_expiry ON merchant_staff_challenges(expires_at);
      CREATE INDEX idx_staff_challenge_invite ON merchant_staff_challenges(invitation_id);
      CREATE INDEX idx_staff_challenge_session ON merchant_staff_challenges(session_id);`);
    db.prepare(
      "INSERT INTO schema_migrations(version,name,applied_at) VALUES (29,?,?)",
    ).run(STAFF_SCHEMA_NAME, new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function rejectStaffInvitation(
  db: PersistenceDatabase,
  invitationId: string,
): void {
  if (
    hasStaffSchema(db) &&
    db
      .prepare(
        "SELECT invitation_id FROM merchant_staff_invitations WHERE invitation_id=?",
      )
      .get(invitationId)
  )
    throw staffError("LINE_STAFF_REQUIRED");
}
export type StaffScope = {
  accountId: string;
  membershipId: string;
  brandId: string;
  merchantId: string;
  channelId: string;
};
export function activeStaffMembership(
  db: PersistenceDatabase,
  membershipId: string,
): StaffScope {
  const row = db
    .prepare(
      `SELECT m.account_id,m.id,m.brand_id,m.merchant_id FROM merchant_operator_memberships m
    JOIN accounts a ON a.id=m.account_id JOIN merchant_brands b ON b.id=m.brand_id
    JOIN merchants branch ON branch.id=m.merchant_id AND branch.brand_id=m.brand_id
    WHERE m.id=? AND m.role='branch_staff' AND m.status='active' AND a.status='active'
    AND b.status='active' AND branch.status='active' AND branch.can_redeem=1`,
    )
    .get(membershipId);
  if (!row) throw staffError("STAFF_MEMBERSHIP_UNAVAILABLE");
  return {
    accountId: String(row.account_id),
    membershipId: String(row.id),
    brandId: String(row.brand_id),
    merchantId: String(row.merchant_id),
    channelId: "",
  };
}
/** Null means a pre-existing manager session. Staff provenance can never fall back to account-wide grants. */
export function resolveStaffScope(
  db: PersistenceDatabase,
  sessionId: string,
  accountId: string,
): StaffScope | null {
  if (!hasStaffSchema(db)) return null;
  const session = db
    .prepare("SELECT * FROM account_sessions WHERE id=?")
    .get(sessionId);
  if (!session) throw staffError("STAFF_SESSION_INVALID", 401);
  const scope = db
    .prepare("SELECT * FROM merchant_staff_sessions WHERE session_id=?")
    .get(sessionId);
  const inviteScope = db
    .prepare("SELECT * FROM merchant_staff_invitations WHERE invitation_id=?")
    .get(String(session.created_from_invitation_id ?? ""));
  if (!scope && !inviteScope) return null;
  if (
    !scope ||
    !inviteScope ||
    session.account_id !== accountId ||
    session.purpose !== "merchant_operator" ||
    session.revoked_at ||
    String(session.expires_at) <= new Date().toISOString()
  )
    throw staffError("STAFF_SESSION_INVALID");
  const invite = db
    .prepare("SELECT * FROM account_invitations WHERE id=?")
    .get(String(scope.invitation_id));
  const identity = db
    .prepare(
      "SELECT * FROM account_external_identities WHERE id=? AND provider='line' AND account_id=?",
    )
    .get(String(scope.identity_id), accountId);
  if (
    !invite ||
    !identity ||
    invite.status !== "redeemed" ||
    invite.revoked_at ||
    invite.purpose !== "merchant_operator" ||
    invite.account_id !== accountId ||
    scope.invitation_id !== session.created_from_invitation_id
  )
    throw staffError("STAFF_PROVENANCE_INVALID");
  const active = activeStaffMembership(db, String(scope.membership_id));
  for (const [key, value] of [
    ["account_id", active.accountId],
    ["membership_id", active.membershipId],
    ["brand_id", active.brandId],
    ["merchant_id", active.merchantId],
  ] as const) {
    if (scope[key] !== value || inviteScope[key] !== value)
      throw staffError("STAFF_SCOPE_INVALID");
  }
  if (
    scope.provider !== "line" ||
    inviteScope.provider !== "line" ||
    !scope.channel_id ||
    scope.channel_id !== inviteScope.channel_id
  )
    throw staffError("STAFF_PROVENANCE_INVALID");
  return { ...active, channelId: String(scope.channel_id) };
}
