import type { PersistenceDatabase } from "./persistence/contract.js";

export const GOOGLE_SCHEMA_VERSION = 28;
export const GOOGLE_SCHEMA_NAME = "merchant_google_identity_opt_in";

/** Explicit opt-in extension. Never applied by opening a default v27 database. */
export function migrateMerchantGoogle(
  db: PersistenceDatabase,
  engine: "sqlite" | "postgres",
): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    const applied = db
      .prepare("SELECT name FROM schema_migrations WHERE version = 28")
      .get();
    if (applied) {
      if (applied.name !== GOOGLE_SCHEMA_NAME)
        throw new Error("Migration 28 authority conflict");
      db.exec("COMMIT");
      return;
    }
    if (engine === "sqlite") {
      db.exec(`CREATE TABLE account_external_identities_google (
        id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
        provider TEXT NOT NULL CHECK (provider IN ('line', 'google')),
        provider_subject TEXT NOT NULL CHECK (length(trim(provider_subject)) > 0),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(provider, provider_subject));
        INSERT INTO account_external_identities_google SELECT * FROM account_external_identities;
        DROP TABLE account_external_identities;
        ALTER TABLE account_external_identities_google RENAME TO account_external_identities;
        CREATE INDEX idx_account_external_identities_account ON account_external_identities(account_id);`);
    } else {
      db.exec(`ALTER TABLE account_external_identities DROP CONSTRAINT account_external_identities_provider_check;
        ALTER TABLE account_external_identities ADD CONSTRAINT account_external_identities_provider_check CHECK(provider IN ('line', 'google'));`);
    }
    // One approved Google binding per account; LINE bindings retain their old rules.
    db.exec(`CREATE UNIQUE INDEX idx_account_google_identity ON account_external_identities(account_id) WHERE provider = 'google';
      CREATE TABLE merchant_google_challenges (
        state_hash TEXT PRIMARY KEY, nonce_hash TEXT NOT NULL, browser_hash TEXT NOT NULL,
        invitation_hash TEXT, expires_at TEXT NOT NULL, consumed_at TEXT);
      CREATE INDEX idx_merchant_google_challenge_expiry ON merchant_google_challenges(expires_at);`);
    db.prepare(
      "INSERT INTO schema_migrations(version, name, applied_at) VALUES (28, ?, ?)",
    ).run(GOOGLE_SCHEMA_NAME, new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
