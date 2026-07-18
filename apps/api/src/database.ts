import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPORTING_TIMEZONE } from "@looper/types";
import { DEFAULT_ECONOMY_SETTINGS, DEFAULT_MERCHANT_TIMEZONE, LEVEL_DEFINITIONS, MERCHANT_PLAN_DEFINITIONS } from "./economy.js";

import { DatabaseSync } from "node:sqlite";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const DEFAULT_DATABASE_PATH = resolve(repoRoot, ".data/looper-dev.sqlite");
export const MINIMUM_NODE_VERSION = "22.5.0";
export const SQLITE_BUSY_TIMEOUT_MS = 5000;
export const TASK_CODE_SCOPE_SNAPSHOT_VERSION = "task-code-scope-v1";

type Migration = {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
};

function assertNodeSqliteSupport(): void {
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 5)) {
    throw new Error(`Looper API requires Node.js >=${MINIMUM_NODE_VERSION} because it uses node:sqlite. Current Node.js: ${process.versions.node}`);
  }
}

export function resolveDatabasePath(path = process.env.LOOPER_DATABASE_PATH): string {
  return path && path !== ":memory:" ? resolve(path) : (path ?? DEFAULT_DATABASE_PATH);
}

export function openDatabase(path = resolveDatabasePath()): DatabaseSync {
  assertNodeSqliteSupport();
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  configureDatabase(db);
  migrateDatabase(db);
  seedDatabase(db);
  return db;
}

export function configureDatabase(db: DatabaseSync): void {
  db.exec(`
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS};
`);
}

function tableExists(db: DatabaseSync, tableName: string): boolean {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function columnExists(db: DatabaseSync, tableName: string, columnName: string): boolean {
  if (!tableExists(db, tableName)) return false;
  return (db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<Record<string, unknown>>).some((row) => row.name === columnName);
}

function schemaVersionTableSql(): string {
  return `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'legacy',
  applied_at TEXT NOT NULL
);`;
}

function taskCodeReportingScopeSnapshotSql(): string {
  return `
CREATE TABLE IF NOT EXISTS task_code_submission_scope_snapshots (
  submission_id TEXT PRIMARY KEY REFERENCES task_code_submissions(id),
  snapshot_version TEXT NOT NULL CHECK (snapshot_version = '${TASK_CODE_SCOPE_SNAPSHOT_VERSION}'),
  captured_at TEXT NOT NULL,
  reporting_timezone TEXT NOT NULL CHECK (reporting_timezone = '${REPORTING_TIMEZONE}'),
  brand_id TEXT NOT NULL,
  brand_display_name TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  branch_code TEXT NOT NULL,
  branch_display_name TEXT NOT NULL,
  CHECK (brand_id <> '' AND brand_display_name <> ''),
  CHECK (merchant_id <> '' AND branch_code <> '' AND branch_display_name <> '')
);

CREATE INDEX IF NOT EXISTS idx_task_code_scope_snapshots_brand_submission
  ON task_code_submission_scope_snapshots(brand_id, submission_id);

CREATE INDEX IF NOT EXISTS idx_task_code_scope_snapshots_merchant_submission
  ON task_code_submission_scope_snapshots(merchant_id, submission_id);

CREATE TRIGGER IF NOT EXISTS trg_task_code_scope_snapshots_immutable_update
BEFORE UPDATE ON task_code_submission_scope_snapshots
BEGIN
  SELECT RAISE(ABORT, 'task code reporting scope snapshot is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_task_code_scope_snapshots_immutable_delete
BEFORE DELETE ON task_code_submission_scope_snapshots
BEGIN
  SELECT RAISE(ABORT, 'task code reporting scope snapshot is immutable');
END;
`;
}

function createSchemaSql(): string {
  return `
CREATE TABLE IF NOT EXISTS economy_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL CHECK (
    key <> 'core' OR (
      json_valid(value_json)
      AND json_extract(value_json, '$.vegetarianCarbonGrams') > 0
      AND json_extract(value_json, '$.carbonGramsPerSeed') > 0
      AND json_extract(value_json, '$.seedsPerPlant') > 0
      AND json_extract(value_json, '$.plantsPerTree') > 0
      AND json_extract(value_json, '$.redemptionEnergy') >= 0
      AND json_extract(value_json, '$.redemptionExp') >= 0
      AND json_extract(value_json, '$.energyRegenIntervalSeconds') > 0
      AND json_extract(value_json, '$.energyOverflowMultiplier') = 1
    )
  ),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS merchant_plan_definitions (
  plan TEXT PRIMARY KEY CHECK (plan IN ('sprout', 'grove', 'forest')),
  label TEXT NOT NULL,
  reward_star_amount INTEGER NOT NULL CHECK (reward_star_amount >= 0)
);

CREATE TABLE IF NOT EXISTS level_definitions (
  level INTEGER PRIMARY KEY CHECK (level >= 1),
  required_total_exp INTEGER NOT NULL CHECK (required_total_exp >= 0),
  reward_stars INTEGER NOT NULL CHECK (reward_stars >= 0),
  max_energy_increase INTEGER NOT NULL CHECK (max_energy_increase >= 0),
  unlock_flags_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  creation_idempotency_key TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id),
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_resources (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  star_balance INTEGER NOT NULL CHECK (star_balance >= 0),
  current_energy INTEGER NOT NULL CHECK (current_energy >= 0),
  max_energy INTEGER NOT NULL CHECK (max_energy >= 0),
  energy_regen_interval_seconds INTEGER NOT NULL CHECK (energy_regen_interval_seconds > 0),
  energy_last_updated_at TEXT NOT NULL,
  energy_overflow_pending INTEGER NOT NULL CHECK (energy_overflow_pending >= 0),
  current_exp INTEGER NOT NULL CHECK (current_exp >= 0),
  current_level INTEGER NOT NULL CHECK (current_level >= 1),
  next_level_exp INTEGER NOT NULL CHECK (next_level_exp >= 0),
  unlock_flags_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (current_energy <= max_energy)
);

CREATE TABLE IF NOT EXISTS user_growth_balances (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  carbon_total_grams INTEGER NOT NULL CHECK (carbon_total_grams >= 0),
  carbon_balance_grams INTEGER NOT NULL CHECK (carbon_balance_grams >= 0),
  seed_count INTEGER NOT NULL CHECK (seed_count >= 0),
  plant_count INTEGER NOT NULL CHECK (plant_count >= 0),
  tree_count INTEGER NOT NULL CHECK (tree_count >= 0),
  version INTEGER NOT NULL CHECK (version >= 1),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS merchant_applications (
  id TEXT PRIMARY KEY,
  store_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_line_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT NOT NULL,
  store_category TEXT NOT NULL,
  other_store_category TEXT NOT NULL,
  vegetarian_offering_json TEXT NOT NULL,
  other_meal_type TEXT NOT NULL,
  business_hours_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'needs_revision', 'approved', 'rejected')),
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT,
  review_note TEXT,
  merchant_id TEXT UNIQUE REFERENCES merchants(id)
);

CREATE TABLE IF NOT EXISTS merchant_brands (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  legal_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  application_id TEXT UNIQUE REFERENCES merchant_applications(id),
  brand_id TEXT NOT NULL REFERENCES merchant_brands(id),
  branch_code TEXT NOT NULL DEFAULT 'main',
  store_name TEXT NOT NULL,
  address TEXT NOT NULL,
  store_category TEXT NOT NULL,
  other_store_category TEXT NOT NULL,
  vegetarian_offering_json TEXT NOT NULL,
  other_meal_type TEXT NOT NULL,
  business_hours_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended')),
  can_redeem INTEGER NOT NULL CHECK (can_redeem IN (0, 1)),
  merchant_plan TEXT NOT NULL REFERENCES merchant_plan_definitions(plan),
  reward_star_amount INTEGER NOT NULL CHECK (reward_star_amount >= 0),
  reward_category TEXT NOT NULL DEFAULT 'general' CHECK (reward_category IN ('general', 'star')),
  timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS merchant_operator_memberships (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  brand_id TEXT NOT NULL REFERENCES merchant_brands(id) ON DELETE CASCADE,
  merchant_id TEXT REFERENCES merchants(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('brand_owner', 'brand_manager', 'branch_manager', 'branch_staff')),
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'left')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (role IN ('brand_owner', 'brand_manager') AND merchant_id IS NULL)
    OR (role IN ('branch_manager', 'branch_staff') AND merchant_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS platform_operator_memberships (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id),
  role TEXT NOT NULL CHECK (role IN ('operations_admin', 'finance_admin', 'super_admin')),
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'left')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  granted_by_account_id TEXT REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_platform_operator_memberships_account_status
  ON platform_operator_memberships(account_id, status);

CREATE INDEX IF NOT EXISTS idx_platform_operator_memberships_role_status
  ON platform_operator_memberships(role, status);

CREATE TABLE IF NOT EXISTS account_invitations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  purpose TEXT NOT NULL DEFAULT 'merchant_operator' CHECK (purpose IN ('merchant_operator', 'platform_operator')),
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'redeemed', 'revoked', 'expired')),
  expires_at TEXT NOT NULL,
  redeemed_at TEXT,
  revoked_at TEXT,
  created_by_actor_id TEXT NOT NULL,
  creation_idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_from_invitation_id TEXT NOT NULL REFERENCES account_invitations(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  mission_type TEXT NOT NULL DEFAULT 'vegetarian_meal',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (merchant_id, mission_type)
);

CREATE TABLE IF NOT EXISTS mission_enrollments (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('awaiting_verification', 'completed')),
  accepted_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (user_id, mission_id)
);

CREATE TABLE IF NOT EXISTS reward_events (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('vegetarian_purchase', 'task_completion', 'event_checkin', 'daily_login', 'level_up', 'admin_adjustment')),
  source_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merchant_id TEXT REFERENCES merchants(id),
  mission_id TEXT REFERENCES missions(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  logical_request_json TEXT NOT NULL,
  reward_payload_json TEXT NOT NULL,
  growth_summary_json TEXT NOT NULL,
  level_summary_json TEXT NOT NULL,
  rule_version TEXT,
  rule_snapshot_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(source_type, source_id, user_id)
);

CREATE TABLE IF NOT EXISTS redemptions (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  stars_granted INTEGER NOT NULL CHECK (stars_granted >= 0),
  energy_granted INTEGER NOT NULL CHECK (energy_granted >= 0),
  exp_granted INTEGER NOT NULL CHECK (exp_granted >= 0),
  carbon_grams INTEGER NOT NULL CHECK (carbon_grams >= 0),
  reward_event_id TEXT UNIQUE REFERENCES reward_events(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_code_windows (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  code_length INTEGER NOT NULL CHECK (code_length IN (4, 6)),
  valid_from TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'revoked')),
  created_at TEXT NOT NULL,
  CHECK (valid_until > valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_code_windows_one_active_per_merchant
  ON task_code_windows(merchant_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS task_code_submissions (
  id TEXT PRIMARY KEY,
  task_code_window_id TEXT NOT NULL REFERENCES task_code_windows(id) ON DELETE CASCADE,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired', 'settled')),
  submitted_at TEXT NOT NULL,
  confirmation_expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  rejected_at TEXT,
  expired_at TEXT,
  settled_at TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  decided_by TEXT,
  decision_idempotency_key TEXT UNIQUE,
  redemption_id TEXT UNIQUE REFERENCES redemptions(id),
  reward_event_id TEXT UNIQUE REFERENCES reward_events(id)
);

CREATE TABLE IF NOT EXISTS player_event_queue (
  queue_order INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_reward_event_id TEXT NOT NULL REFERENCES reward_events(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK (event_type IN ('level_up', 'home_scene')),
  event_level INTEGER CHECK (event_level IS NULL OR event_level >= 1),
  scene_id TEXT,
  event_name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'skipped')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution_idempotency_key TEXT UNIQUE,
  CHECK (
    (status = 'pending' AND resolved_at IS NULL AND resolution_idempotency_key IS NULL)
    OR (status IN ('completed', 'skipped') AND resolved_at IS NOT NULL AND resolution_idempotency_key IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_player_event_queue_user_pending_order
  ON player_event_queue(user_id, status, queue_order);

CREATE TABLE IF NOT EXISTS resource_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('stars', 'energy', 'energy_overflow', 'exp', 'carbon_total', 'carbon_balance', 'seed', 'plant', 'tree')),
  amount INTEGER NOT NULL,
  balance_before INTEGER NOT NULL CHECK (balance_before >= 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  transaction_kind TEXT NOT NULL DEFAULT 'legacy' CHECK (transaction_kind IN ('grant', 'consume', 'convert_debit', 'convert_credit', 'adjustment', 'legacy')),
  conversion_id TEXT NOT NULL DEFAULT '',
  conversion_type TEXT NOT NULL DEFAULT 'none' CHECK (conversion_type IN ('none', 'carbon_to_seed', 'seed_to_plant', 'plant_to_tree')),
  source_type TEXT NOT NULL CHECK (source_type IN ('vegetarian_purchase', 'task_completion', 'event_checkin', 'daily_login', 'level_up', 'admin_adjustment')),
  source_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  CHECK (transaction_kind = 'legacy' OR balance_after = balance_before + amount),
  CHECK ((transaction_kind IN ('convert_debit', 'convert_credit') AND conversion_id <> '' AND conversion_type <> 'none') OR (transaction_kind NOT IN ('convert_debit', 'convert_credit'))),
  UNIQUE(user_id, resource_type, source_type, source_id, transaction_kind, conversion_id, conversion_type)
);

CREATE TABLE IF NOT EXISTS plant_growth_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('seed_generated', 'seeds_combined_to_plant', 'plants_combined_to_tree')),
  conversion_id TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  before_count INTEGER NOT NULL CHECK (before_count >= 0),
  after_count INTEGER NOT NULL CHECK (after_count >= 0),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS energy_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('natural_regen', 'reward', 'level_up_refill')),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  energy_before INTEGER NOT NULL CHECK (energy_before >= 0),
  energy_after INTEGER NOT NULL CHECK (energy_after >= 0),
  overflow_before INTEGER NOT NULL CHECK (overflow_before >= 0),
  overflow_after INTEGER NOT NULL CHECK (overflow_after >= 0),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS level_up_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  previous_level INTEGER NOT NULL CHECK (previous_level >= 1),
  new_level INTEGER NOT NULL CHECK (new_level >= previous_level),
  reward_stars INTEGER NOT NULL CHECK (reward_stars >= 0),
  max_energy_before INTEGER NOT NULL CHECK (max_energy_before >= 0),
  max_energy_after INTEGER NOT NULL CHECK (max_energy_after >= max_energy_before),
  unlock_flags_json TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('user', 'merchant', 'admin')),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diamond_recipe_definitions (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  required_plant_count INTEGER NOT NULL CHECK (required_plant_count >= 0),
  required_level INTEGER NOT NULL CHECK (required_level >= 1),
  required_stars INTEGER NOT NULL CHECK (required_stars >= 0),
  required_energy INTEGER NOT NULL CHECK (required_energy >= 0),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1))
);`;
}

function rebuildTable(db: DatabaseSync, tableName: string, createSql: string, insertSql: string): void {
  if (!tableExists(db, tableName)) return;
  db.exec(`ALTER TABLE ${tableName} RENAME TO ${tableName}_legacy;`);
  db.exec(createSql.replace(`CREATE TABLE IF NOT EXISTS ${tableName}`, `CREATE TABLE ${tableName}`));
  db.exec(insertSql);
  db.exec(`DROP TABLE ${tableName}_legacy;`);
}

function createTableStatement(schemaSql: string, tableName: string): string {
  const start = schemaSql.indexOf(`CREATE TABLE IF NOT EXISTS ${tableName}`);
  if (start < 0) throw new Error(`Missing schema for ${tableName}`);
  const next = schemaSql.indexOf("\n\nCREATE TABLE", start + 1);
  return (next < 0 ? schemaSql.slice(start) : schemaSql.slice(start, next)).trim().replace(/;$/, "");
}

function stableBrandIdForMerchant(merchantId: string): string {
  return `merchant-brand-${merchantId}`;
}

function createMerchantBrandBranchConstraints(db: DatabaseSync): void {
  db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_brand_branch_code
  ON merchants(brand_id, branch_code);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_brand_scope_unique
  ON merchant_operator_memberships(account_id, brand_id, role)
  WHERE merchant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_branch_scope_unique
  ON merchant_operator_memberships(account_id, brand_id, merchant_id, role)
  WHERE merchant_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_memberships_branch_brand_insert
BEFORE INSERT ON merchant_operator_memberships
WHEN NEW.merchant_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM merchants WHERE id = NEW.merchant_id AND brand_id = NEW.brand_id)
BEGIN
  SELECT RAISE(ABORT, 'membership merchant must belong to brand');
END;

CREATE TRIGGER IF NOT EXISTS trg_memberships_branch_brand_update
BEFORE UPDATE OF brand_id, merchant_id ON merchant_operator_memberships
WHEN NEW.merchant_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM merchants WHERE id = NEW.merchant_id AND brand_id = NEW.brand_id)
BEGIN
  SELECT RAISE(ABORT, 'membership merchant must belong to brand');
END;
`);
}

function finalizedMaxEnergySql(levelColumn: string): string {
  return `CASE
    WHEN ${levelColumn} <= 2 THEN 0
    WHEN ${levelColumn} = 3 THEN 120
    WHEN ${levelColumn} = 4 THEN 123
    WHEN ${levelColumn} = 5 THEN 126
    WHEN ${levelColumn} = 6 THEN 129
    WHEN ${levelColumn} = 7 THEN 132
    WHEN ${levelColumn} = 8 THEN 135
    WHEN ${levelColumn} = 9 THEN 138
    ELSE 142
  END`;
}

function finalizedNextLevelExp(level: number): number {
  const next = LEVEL_DEFINITIONS.find((definition) => definition.level === level + 1);
  const current = LEVEL_DEFINITIONS.find((definition) => definition.level === level);
  return next?.requiredTotalExp ?? current?.requiredTotalExp ?? LEVEL_DEFINITIONS[LEVEL_DEFINITIONS.length - 1].requiredTotalExp;
}

function finalizedUnlockFlagsForLevel(level: number): string[] {
  return LEVEL_DEFINITIONS
    .filter((definition) => definition.level <= level)
    .flatMap((definition) => definition.unlockFlags);
}

function migrateLegacyConstraints(db: DatabaseSync): void {
  const resourceSchema = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'user_resources'").get() as { sql?: string } | undefined)?.sql ?? "";
  if (columnExists(db, "missions", "mission_type") && columnExists(db, "reward_events", "logical_request_json") && resourceSchema.includes("star_balance >= 0")) return;
  const schemaSql = createSchemaSql();
  try {
    const rebuilds = [
      {
        table: "economy_settings",
        insert: `INSERT INTO economy_settings (key, value_json, updated_at)
          SELECT key, value_json, updated_at FROM economy_settings_legacy;`,
      },
      {
        table: "merchant_applications",
        insert: `INSERT INTO merchant_applications
          (id, store_name, contact_name, contact_line_id, phone, email, address, store_category, other_store_category, vegetarian_offering_json, other_meal_type, business_hours_json, status, submitted_at, reviewed_at, review_note, merchant_id)
          SELECT id, store_name, contact_name, contact_line_id, phone, email, address, store_category, other_store_category, vegetarian_offering_json, other_meal_type, business_hours_json, status, submitted_at, reviewed_at, review_note, merchant_id
          FROM merchant_applications_legacy;`,
      },
      {
        table: "merchants",
        insert: `INSERT INTO merchants
          (id, application_id, store_name, address, store_category, other_store_category, vegetarian_offering_json, other_meal_type, business_hours_json, status, can_redeem, merchant_plan, reward_star_amount, created_at)
          SELECT id, application_id, store_name, address, store_category, other_store_category, vegetarian_offering_json, other_meal_type, business_hours_json, status, can_redeem, merchant_plan, reward_star_amount, created_at
          FROM merchants_legacy;`,
      },
      {
        table: "missions",
        insert: `INSERT INTO missions
          (id, merchant_id, mission_type, title, description, created_at)
          SELECT id, merchant_id, 'vegetarian_meal', title, description, created_at
          FROM missions_legacy;`,
      },
      {
        table: "mission_enrollments",
        insert: `INSERT INTO mission_enrollments (user_id, mission_id, status, accepted_at, completed_at)
          SELECT user_id, mission_id, status, accepted_at, completed_at FROM mission_enrollments_legacy;`,
      },
      {
        table: "reward_events",
        insert: `INSERT INTO reward_events
          (id, source_type, source_id, user_id, merchant_id, mission_id, idempotency_key, logical_request_json, reward_payload_json, growth_summary_json, level_summary_json, created_at)
          SELECT id, source_type, source_id, user_id, merchant_id, mission_id, idempotency_key,
            '{"legacy":true,"sourceId":"' || replace(source_id, '"', '\\"') || '"}',
            reward_payload_json, growth_summary_json, level_summary_json, created_at
          FROM reward_events_legacy;`,
      },
      {
        table: "redemptions",
        insert: `INSERT INTO redemptions
          (id, idempotency_key, user_id, mission_id, merchant_id, stars_granted, energy_granted, exp_granted, carbon_grams, reward_event_id, created_at)
          SELECT id, idempotency_key, user_id, mission_id, merchant_id, stars_granted, energy_granted, exp_granted, carbon_grams, reward_event_id, created_at
          FROM redemptions_legacy;`,
      },
      {
        table: "user_resources",
        insert: `INSERT INTO user_resources
          (user_id, star_balance, current_energy, max_energy, energy_regen_interval_seconds, energy_last_updated_at, energy_overflow_pending, current_exp, current_level, next_level_exp, unlock_flags_json, updated_at)
          SELECT user_id, star_balance, current_energy, max_energy,
            CASE WHEN energy_regen_interval_seconds = 1200 THEN 120 ELSE energy_regen_interval_seconds END,
            energy_last_updated_at, energy_overflow_pending, current_exp, current_level, next_level_exp, unlock_flags_json, updated_at
          FROM user_resources_legacy;`,
      },
      {
        table: "user_growth_balances",
        insert: `INSERT INTO user_growth_balances
          (user_id, carbon_total_grams, carbon_balance_grams, seed_count, plant_count, tree_count, version, updated_at)
          SELECT user_id, carbon_total_grams, carbon_balance_grams, seed_count, plant_count, tree_count, version, updated_at
          FROM user_growth_balances_legacy;`,
      },
      {
        table: "resource_transactions",
        insert: `INSERT INTO resource_transactions
          (id, user_id, resource_type, amount, balance_before, balance_after, transaction_kind, conversion_id, conversion_type, source_type, source_id, idempotency_key, created_at, metadata_json)
          SELECT id, user_id, resource_type, amount, balance_before, balance_after,
            'legacy',
            '',
            'none',
            source_type, source_id, idempotency_key, created_at, metadata_json
          FROM resource_transactions_legacy;`,
      },
      {
        table: "plant_growth_logs",
        insert: `INSERT INTO plant_growth_logs
          (id, user_id, source_type, source_id, event_type, conversion_id, quantity, before_count, after_count, created_at)
          SELECT id, user_id, source_type, source_id, event_type, '', quantity, before_count, after_count, created_at
          FROM plant_growth_logs_legacy;`,
      },
    ];

    for (const rebuild of rebuilds) {
      if (tableExists(db, rebuild.table)) rebuildTable(db, rebuild.table, createTableStatement(schemaSql, rebuild.table), rebuild.insert);
    }
  } finally {
    db.exec(createSchemaSql());
  }
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial_core_economy_schema",
    up(db) {
      db.exec(createSchemaSql());
    },
  },
  {
    version: 2,
    name: "core_economy_integrity_constraints",
    up(db) {
      if (tableExists(db, "schema_migrations") && !columnExists(db, "schema_migrations", "name")) {
        db.exec("ALTER TABLE schema_migrations ADD COLUMN name TEXT NOT NULL DEFAULT 'legacy';");
      }
      db.exec(createSchemaSql());
      migrateLegacyConstraints(db);
      db.prepare("UPDATE economy_settings SET value_json = json_set(value_json, '$.energyRegenIntervalSeconds', 120), updated_at = ? WHERE key = 'core' AND json_extract(value_json, '$.energyRegenIntervalSeconds') = 1200").run(new Date().toISOString());
      db.prepare("UPDATE user_resources SET energy_regen_interval_seconds = 120, updated_at = ? WHERE energy_regen_interval_seconds = 1200").run(new Date().toISOString());
    },
  },
  {
    version: 3,
    name: "resource_ledger_growth_integrity",
    up(db) {
      db.exec(createSchemaSql());
      const schemaSql = createSchemaSql();
      const resourceSchema = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'resource_transactions'").get() as { sql?: string } | undefined)?.sql ?? "";
      if (!resourceSchema.includes("transaction_kind") || !resourceSchema.includes("balance_after = balance_before + amount")) {
        rebuildTable(db, "resource_transactions", createTableStatement(schemaSql, "resource_transactions"), `INSERT INTO resource_transactions
          (id, user_id, resource_type, amount, balance_before, balance_after, transaction_kind, conversion_id, conversion_type, source_type, source_id, idempotency_key, created_at, metadata_json)
          SELECT id, user_id, resource_type, amount, balance_before, balance_after, 'legacy', '', 'none', source_type, source_id, idempotency_key, created_at, metadata_json
          FROM resource_transactions_legacy;`);
      }
      if (!columnExists(db, "plant_growth_logs", "conversion_id")) {
        rebuildTable(db, "plant_growth_logs", createTableStatement(schemaSql, "plant_growth_logs"), `INSERT INTO plant_growth_logs
          (id, user_id, source_type, source_id, event_type, conversion_id, quantity, before_count, after_count, created_at)
          SELECT id, user_id, source_type, source_id, event_type, '', quantity, before_count, after_count, created_at
          FROM plant_growth_logs_legacy;`);
      }
    },
  },
  {
    version: 4,
    name: "level_runtime_integrity",
    up(db) {
      db.exec(createSchemaSql());
      const schemaSql = createSchemaSql();
      const energyLogSchema = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'energy_logs'").get() as { sql?: string } | undefined)?.sql ?? "";
      if (!energyLogSchema.includes("level_up_refill")) {
        rebuildTable(db, "energy_logs", createTableStatement(schemaSql, "energy_logs"), `INSERT INTO energy_logs
          (id, user_id, event_type, amount, energy_before, energy_after, overflow_before, overflow_after, source_type, source_id, created_at)
          SELECT id, user_id, event_type, amount, energy_before, energy_after, overflow_before, overflow_after, source_type, source_id, created_at
          FROM energy_logs_legacy;`);
      }
    },
  },
  {
    version: 5,
    name: "admin_economy_settings_management",
    up(db) {
      if (!columnExists(db, "economy_settings", "version")) {
        db.exec("ALTER TABLE economy_settings ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);");
      }
      if (!columnExists(db, "economy_settings", "updated_by")) {
        db.exec("ALTER TABLE economy_settings ADD COLUMN updated_by TEXT NOT NULL DEFAULT 'system';");
      }
    },
  },
  {
    version: 6,
    name: "mvp_task_code_thin_slice",
    up(db) {
      db.exec(createSchemaSql());
    },
  },
  {
    version: 7,
    name: "task_code_submission_decisions",
    up(db) {
      if (!columnExists(db, "task_code_submissions", "decided_by")) {
        db.exec("ALTER TABLE task_code_submissions ADD COLUMN decided_by TEXT;");
      }
      if (!columnExists(db, "task_code_submissions", "decision_idempotency_key")) {
        db.exec("ALTER TABLE task_code_submissions ADD COLUMN decision_idempotency_key TEXT;");
      }
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_task_code_submissions_decision_idempotency_key ON task_code_submissions(decision_idempotency_key) WHERE decision_idempotency_key IS NOT NULL;");
    },
  },
  {
    version: 8,
    name: "finalized_core_economy_rules",
    up(db) {
      const now = new Date().toISOString();
      db.exec(createSchemaSql());
      const finalizedSettings = JSON.stringify(DEFAULT_ECONOMY_SETTINGS);
      if (tableExists(db, "economy_settings")) {
        db.prepare("UPDATE economy_settings SET value_json = ?, version = version + 1, updated_at = ?, updated_by = 'migration' WHERE key = 'core'").run(finalizedSettings, now);
      }

      if (tableExists(db, "level_definitions")) {
        db.exec("DELETE FROM level_definitions;");
        const insertLevel = db.prepare("INSERT INTO level_definitions (level, required_total_exp, reward_stars, max_energy_increase, unlock_flags_json) VALUES (?, ?, ?, ?, ?)");
        for (const level of LEVEL_DEFINITIONS) {
          insertLevel.run(level.level, level.requiredTotalExp, level.rewardStars, level.maxEnergyIncrease, JSON.stringify(level.unlockFlags));
        }
      }

      if (tableExists(db, "user_resources")) {
        const schemaSql = createSchemaSql();
        const currentSchema = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'user_resources'").get() as { sql?: string } | undefined)?.sql ?? "";
        const maxEnergy = finalizedMaxEnergySql("current_level");
        if (currentSchema.includes("max_energy > 0") || currentSchema.includes("1.5")) {
          rebuildTable(db, "user_resources", createTableStatement(schemaSql, "user_resources"), `INSERT INTO user_resources
            (user_id, star_balance, current_energy, max_energy, energy_regen_interval_seconds, energy_last_updated_at, energy_overflow_pending, current_exp, current_level, next_level_exp, unlock_flags_json, updated_at)
            SELECT user_id, star_balance, min(current_energy, ${maxEnergy}), ${maxEnergy}, 120, energy_last_updated_at, 0, current_exp, current_level, next_level_exp, unlock_flags_json, updated_at
            FROM user_resources_legacy;`);
        }
        db.prepare(`UPDATE user_resources SET
          max_energy = ${maxEnergy},
          current_energy = min(current_energy, ${maxEnergy}),
          energy_regen_interval_seconds = 120,
          energy_overflow_pending = 0,
          updated_at = ?`).run(now);
        const users = db.prepare("SELECT user_id, current_level FROM user_resources").all() as Array<{ user_id: string; current_level: number }>;
        const updateUser = db.prepare("UPDATE user_resources SET next_level_exp = ?, unlock_flags_json = ?, updated_at = ? WHERE user_id = ?");
        for (const user of users) {
          updateUser.run(finalizedNextLevelExp(user.current_level), JSON.stringify(finalizedUnlockFlagsForLevel(user.current_level)), now, user.user_id);
        }
      }

      if (tableExists(db, "level_up_logs")) {
        const schemaSql = createSchemaSql();
        const currentSchema = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'level_up_logs'").get() as { sql?: string } | undefined)?.sql ?? "";
        if (currentSchema.includes("max_energy_before > 0")) {
          rebuildTable(db, "level_up_logs", createTableStatement(schemaSql, "level_up_logs"), `INSERT INTO level_up_logs
            (id, user_id, previous_level, new_level, reward_stars, max_energy_before, max_energy_after, unlock_flags_json, source_type, source_id, created_at)
            SELECT id, user_id, previous_level, new_level, reward_stars, max_energy_before, max_energy_after, unlock_flags_json, source_type, source_id, created_at
            FROM level_up_logs_legacy;`);
        }
      }
    },
  },
  {
    version: 9,
    name: "finalized_star_settlement_snapshot",
    up(db) {
      db.exec(createSchemaSql());
      if (tableExists(db, "merchants")) {
        if (!columnExists(db, "merchants", "reward_category")) {
          db.exec("ALTER TABLE merchants ADD COLUMN reward_category TEXT NOT NULL DEFAULT 'general';");
        }
        if (!columnExists(db, "merchants", "timezone")) {
          db.exec(`ALTER TABLE merchants ADD COLUMN timezone TEXT NOT NULL DEFAULT '${DEFAULT_MERCHANT_TIMEZONE}';`);
        }
        db.prepare("UPDATE merchants SET reward_category = 'general' WHERE reward_category IS NULL OR reward_category = ''").run();
        db.prepare("UPDATE merchants SET timezone = ? WHERE timezone IS NULL OR timezone = ''").run(DEFAULT_MERCHANT_TIMEZONE);
      }
      if (tableExists(db, "reward_events")) {
        if (!columnExists(db, "reward_events", "rule_version")) {
          db.exec("ALTER TABLE reward_events ADD COLUMN rule_version TEXT;");
        }
        if (!columnExists(db, "reward_events", "rule_snapshot_json")) {
          db.exec("ALTER TABLE reward_events ADD COLUMN rule_snapshot_json TEXT;");
        }
      }
    },
  },
  {
    version: 10,
    name: "task_code_submission_settlement_links",
    up(db) {
      db.exec(createSchemaSql());
      if (!tableExists(db, "task_code_submissions")) return;
      const currentSchema = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'task_code_submissions'").get() as { sql?: string } | undefined)?.sql ?? "";
      if (!columnExists(db, "task_code_submissions", "settled_at") || !currentSchema.includes("'settled'")) {
        rebuildTable(db, "task_code_submissions", createTableStatement(createSchemaSql(), "task_code_submissions"), `INSERT INTO task_code_submissions
          (id, task_code_window_id, merchant_id, mission_id, user_id, status, submitted_at, confirmation_expires_at, confirmed_at, rejected_at, settled_at, idempotency_key, decided_by, decision_idempotency_key, redemption_id, reward_event_id)
          SELECT id, task_code_window_id, merchant_id, mission_id, user_id, status, submitted_at, confirmation_expires_at, confirmed_at, rejected_at, NULL, idempotency_key, decided_by, decision_idempotency_key, NULL, NULL
          FROM task_code_submissions_legacy;`);
      }
    },
  },
  {
    version: 11,
    name: "player_event_queue",
    up(db) {
      db.exec(createSchemaSql());
    },
  },
  {
    version: 12,
    name: "merchant_brand_branch_model",
    up(db) {
      db.exec(createSchemaSql());
      if (!tableExists(db, "merchants")) return;
      if (!columnExists(db, "merchants", "brand_id")) {
        db.exec("ALTER TABLE merchants ADD COLUMN brand_id TEXT REFERENCES merchant_brands(id);");
      }
      if (!columnExists(db, "merchants", "branch_code")) {
        db.exec("ALTER TABLE merchants ADD COLUMN branch_code TEXT NOT NULL DEFAULT 'main';");
      }

      const merchants = db.prepare("SELECT id, store_name, created_at, brand_id, branch_code FROM merchants ORDER BY created_at").all() as Array<{
        id: string;
        store_name: string;
        created_at: string;
        brand_id?: string | null;
        branch_code?: string | null;
      }>;
      const insertBrand = db.prepare(`INSERT OR IGNORE INTO merchant_brands
        (id, display_name, legal_name, status, created_at, updated_at)
        VALUES (?, ?, NULL, 'active', ?, ?)`);
      const updateMerchant = db.prepare("UPDATE merchants SET brand_id = ?, branch_code = ? WHERE id = ?");
      for (const merchant of merchants) {
        const brandId = merchant.brand_id && merchant.brand_id.trim() ? merchant.brand_id : stableBrandIdForMerchant(merchant.id);
        const branchCode = merchant.branch_code && merchant.branch_code.trim() ? merchant.branch_code : "main";
        insertBrand.run(brandId, merchant.store_name, merchant.created_at, merchant.created_at);
        updateMerchant.run(brandId, branchCode, merchant.id);
      }
      createMerchantBrandBranchConstraints(db);
    },
  },
  {
    version: 13,
    name: "nullable_branch_application_reference",
    up(db) {
      db.exec(createSchemaSql());
      if (!tableExists(db, "merchants")) return;
      const currentSchema = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'merchants'").get() as { sql?: string } | undefined)?.sql ?? "";
      if (currentSchema.includes("application_id TEXT NOT NULL")) {
        rebuildTable(db, "merchants", createTableStatement(createSchemaSql(), "merchants"), `INSERT INTO merchants
          (id, application_id, brand_id, branch_code, store_name, address, store_category, other_store_category, vegetarian_offering_json, other_meal_type, business_hours_json, status, can_redeem, merchant_plan, reward_star_amount, reward_category, timezone, created_at)
          SELECT id, application_id, brand_id, branch_code, store_name, address, store_category, other_store_category, vegetarian_offering_json, other_meal_type, business_hours_json, status, can_redeem, merchant_plan, reward_star_amount, reward_category, timezone, created_at
          FROM merchants_legacy;`);
      }
      createMerchantBrandBranchConstraints(db);
    },
  },
  {
    version: 14,
    name: "canonical_account_identities",
    up(db) {
      db.exec(createSchemaSql());

      if (tableExists(db, "merchant_operator_memberships") && columnExists(db, "merchant_operator_memberships", "operator_user_id") && !columnExists(db, "merchant_operator_memberships", "account_id")) {
        const membershipCount = (db.prepare("SELECT COUNT(*) AS count FROM merchant_operator_memberships").get() as { count: number }).count;
        if (membershipCount > 0) throw new Error("Cannot migrate merchant memberships to accounts while membership data exists");
        rebuildTable(db, "merchant_operator_memberships", createTableStatement(createSchemaSql(), "merchant_operator_memberships"), `INSERT INTO merchant_operator_memberships
          (id, account_id, brand_id, merchant_id, role, status, created_at, updated_at)
          SELECT id, operator_user_id, brand_id, merchant_id, role, status, created_at, updated_at
          FROM merchant_operator_memberships_legacy
          WHERE 0;`);
      }

      if (!tableExists(db, "users")) {
        createMerchantBrandBranchConstraints(db);
        return;
      }

      const users = db.prepare("SELECT id, display_name, created_at FROM users ORDER BY created_at").all() as Array<{
        id: string;
        display_name: string;
        created_at: string;
      }>;
      const insertAccount = db.prepare(`INSERT OR IGNORE INTO accounts
        (id, display_name, status, created_at, updated_at, creation_idempotency_key)
        VALUES (?, ?, 'active', ?, ?, NULL)`);
      for (const user of users) {
        insertAccount.run(user.id, user.display_name, user.created_at, user.created_at);
      }

      const userSchema = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get() as { sql?: string } | undefined)?.sql ?? "";
      if (!columnExists(db, "users", "account_id") || !userSchema.includes("account_id TEXT NOT NULL UNIQUE")) {
        rebuildTable(db, "users", createTableStatement(createSchemaSql(), "users"), `INSERT INTO users
          (id, account_id, display_name, created_at)
          SELECT id, id, display_name, created_at
          FROM users_legacy;`);
      }

      createMerchantBrandBranchConstraints(db);
    },
  },
  {
    version: 15,
    name: "merchant_membership_scope_exclusivity",
    up(db) {
      db.exec(createSchemaSql());
      if (!tableExists(db, "merchant_operator_memberships")) return;

      const duplicateBrandScope = db.prepare(`SELECT account_id, brand_id
        FROM merchant_operator_memberships
        WHERE merchant_id IS NULL
        GROUP BY account_id, brand_id
        HAVING COUNT(*) > 1
        LIMIT 1`).get() as { account_id: string; brand_id: string } | undefined;
      if (duplicateBrandScope) {
        throw new Error(`Cannot migrate merchant memberships: duplicate brand scope for account ${duplicateBrandScope.account_id} and brand ${duplicateBrandScope.brand_id}`);
      }

      const duplicateBranchScope = db.prepare(`SELECT account_id, brand_id, merchant_id
        FROM merchant_operator_memberships
        WHERE merchant_id IS NOT NULL
        GROUP BY account_id, brand_id, merchant_id
        HAVING COUNT(*) > 1
        LIMIT 1`).get() as { account_id: string; brand_id: string; merchant_id: string } | undefined;
      if (duplicateBranchScope) {
        throw new Error(`Cannot migrate merchant memberships: duplicate branch scope for account ${duplicateBranchScope.account_id}, brand ${duplicateBranchScope.brand_id}, and merchant ${duplicateBranchScope.merchant_id}`);
      }

      const overlappingScope = db.prepare(`SELECT brand_scope.account_id, brand_scope.brand_id
        FROM merchant_operator_memberships brand_scope
        JOIN merchant_operator_memberships branch_scope
          ON branch_scope.account_id = brand_scope.account_id
          AND branch_scope.brand_id = brand_scope.brand_id
        WHERE brand_scope.merchant_id IS NULL
          AND branch_scope.merchant_id IS NOT NULL
        LIMIT 1`).get() as { account_id: string; brand_id: string } | undefined;
      if (overlappingScope) {
        throw new Error(`Cannot migrate merchant memberships: brand and branch scopes overlap for account ${overlappingScope.account_id} and brand ${overlappingScope.brand_id}`);
      }

      db.exec(`
DROP INDEX IF EXISTS idx_memberships_brand_scope_unique;
DROP INDEX IF EXISTS idx_memberships_branch_scope_unique;
DROP TRIGGER IF EXISTS trg_memberships_scope_exclusivity_insert;
DROP TRIGGER IF EXISTS trg_memberships_scope_exclusivity_update;

CREATE UNIQUE INDEX idx_memberships_brand_scope_unique
  ON merchant_operator_memberships(account_id, brand_id)
  WHERE merchant_id IS NULL;

CREATE UNIQUE INDEX idx_memberships_branch_scope_unique
  ON merchant_operator_memberships(account_id, brand_id, merchant_id)
  WHERE merchant_id IS NOT NULL;

CREATE TRIGGER trg_memberships_scope_exclusivity_insert
BEFORE INSERT ON merchant_operator_memberships
WHEN EXISTS (
  SELECT 1 FROM merchant_operator_memberships existing
  WHERE existing.account_id = NEW.account_id
    AND existing.brand_id = NEW.brand_id
    AND ((NEW.merchant_id IS NULL AND existing.merchant_id IS NOT NULL)
      OR (NEW.merchant_id IS NOT NULL AND existing.merchant_id IS NULL))
)
BEGIN
  SELECT RAISE(ABORT, 'brand and branch memberships cannot overlap');
END;

CREATE TRIGGER trg_memberships_scope_exclusivity_update
BEFORE UPDATE OF account_id, brand_id, merchant_id ON merchant_operator_memberships
WHEN EXISTS (
  SELECT 1 FROM merchant_operator_memberships existing
  WHERE existing.id <> NEW.id
    AND existing.account_id = NEW.account_id
    AND existing.brand_id = NEW.brand_id
    AND ((NEW.merchant_id IS NULL AND existing.merchant_id IS NOT NULL)
      OR (NEW.merchant_id IS NOT NULL AND existing.merchant_id IS NULL))
)
BEGIN
  SELECT RAISE(ABORT, 'brand and branch memberships cannot overlap');
END;
`);
    },
  },
  {
    version: 16,
    name: "merchant_invitation_sessions",
    up(db) {
      db.exec(createSchemaSql());
    },
  },
  {
    version: 17,
    name: "canonical_reporting_timestamps",
    up(db) {
      if (!tableExists(db, "task_code_submissions")) {
        db.exec(createSchemaSql());
        return;
      }
      if (!columnExists(db, "task_code_submissions", "expired_at")) {
        db.exec("ALTER TABLE task_code_submissions ADD COLUMN expired_at TEXT;");
      }
      db.exec(`
CREATE INDEX IF NOT EXISTS idx_task_code_submissions_settled_reporting
  ON task_code_submissions(settled_at DESC, id DESC)
  WHERE status = 'settled';

CREATE INDEX IF NOT EXISTS idx_task_code_submissions_merchant_settled_reporting
  ON task_code_submissions(merchant_id, settled_at DESC, id DESC)
  WHERE status = 'settled';

CREATE INDEX IF NOT EXISTS idx_task_code_submissions_expired_reporting
  ON task_code_submissions(expired_at DESC, id DESC)
  WHERE status = 'expired';
`);
    },
  },
  {
    version: 18,
    name: "task_code_reporting_scope_snapshots",
    up(db) {
      db.exec(taskCodeReportingScopeSnapshotSql());
    },
  },
  {
    version: 19,
    name: "platform_operator_rbac",
    up(db) {
      db.exec(createSchemaSql());
    },
  },
  {
    version: 20,
    name: "platform_operator_invitation_support",
    up(db) {
      if (!tableExists(db, "account_invitations")) {
        db.exec(createSchemaSql());
        return;
      }
      if (!columnExists(db, "account_invitations", "purpose")) {
        db.exec("ALTER TABLE account_invitations ADD COLUMN purpose TEXT NOT NULL DEFAULT 'merchant_operator' CHECK (purpose IN ('merchant_operator', 'platform_operator'));");
      }
    },
  },
];

export function migrateDatabase(db: DatabaseSync): void {
  db.exec(schemaVersionTableSql());
  if (!columnExists(db, "schema_migrations", "name")) {
    db.exec("ALTER TABLE schema_migrations ADD COLUMN name TEXT NOT NULL DEFAULT 'legacy';");
  }

  const appliedRows = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: number }>;
  const applied = new Set(appliedRows.map((row) => Number(row.version)));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec("BEGIN IMMEDIATE");
    try {
      migration.up(db);
      const violations = db.prepare("PRAGMA foreign_key_check").all() as unknown[];
      if (violations.length) throw new Error(`Database migration ${migration.version} failed foreign key check`);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, datetime('now'))").run(migration.version, migration.name);
      db.exec("COMMIT");
      db.exec("PRAGMA foreign_keys = ON;");
    } catch (error) {
      db.exec("ROLLBACK");
      db.exec("PRAGMA foreign_keys = ON;");
      throw error;
    }
  }
}

export function seedDatabase(db: DatabaseSync): void {
  const now = new Date().toISOString();
  db.prepare("INSERT OR IGNORE INTO economy_settings (key, value_json, version, updated_at, updated_by) VALUES ('core', ?, 1, ?, 'system')").run(JSON.stringify(DEFAULT_ECONOMY_SETTINGS), now);
  db.prepare("UPDATE economy_settings SET value_json = json_set(value_json, '$.energyRegenIntervalSeconds', 120), updated_at = ?, updated_by = 'migration' WHERE key = 'core' AND json_extract(value_json, '$.energyRegenIntervalSeconds') = 1200").run(now);
  for (const plan of MERCHANT_PLAN_DEFINITIONS) {
    db.prepare("INSERT OR IGNORE INTO merchant_plan_definitions (plan, label, reward_star_amount) VALUES (?, ?, ?)").run(plan.plan, plan.label, plan.rewardStarAmount);
  }
  for (const level of LEVEL_DEFINITIONS) {
    db.prepare("INSERT OR IGNORE INTO level_definitions (level, required_total_exp, reward_stars, max_energy_increase, unlock_flags_json) VALUES (?, ?, ?, ?, ?)").run(
      level.level,
      level.requiredTotalExp,
      level.rewardStars,
      level.maxEnergyIncrease,
      JSON.stringify(level.unlockFlags),
    );
  }
  db.prepare("INSERT OR IGNORE INTO diamond_recipe_definitions (id, label, required_plant_count, required_level, required_stars, required_energy, enabled) VALUES ('starter-diamond', '未啟用鑽石合成資格', 1, 10, 1000, 100, 0)").run();
  db.prepare("INSERT OR IGNORE INTO accounts (id, display_name, status, created_at, updated_at, creation_idempotency_key) VALUES ('user-demo', 'Looper 測試旅人', 'active', ?, ?, NULL)").run(now, now);
  db.prepare("INSERT OR IGNORE INTO users (id, account_id, display_name, created_at) VALUES ('user-demo', 'user-demo', 'Looper 測試旅人', ?)").run(now);
  db.prepare(`INSERT OR IGNORE INTO user_resources
    (user_id, star_balance, current_energy, max_energy, energy_regen_interval_seconds, energy_last_updated_at, energy_overflow_pending, current_exp, current_level, next_level_exp, unlock_flags_json, updated_at)
    VALUES ('user-demo', 0, 0, 0, ?, ?, 0, 0, 1, 50, ?, ?)`).run(DEFAULT_ECONOMY_SETTINGS.energyRegenIntervalSeconds, now, JSON.stringify(finalizedUnlockFlagsForLevel(1)), now);
  db.prepare("UPDATE user_resources SET energy_regen_interval_seconds = 120, updated_at = ? WHERE energy_regen_interval_seconds = 1200").run(now);
  db.prepare(`INSERT OR IGNORE INTO user_growth_balances
    (user_id, carbon_total_grams, carbon_balance_grams, seed_count, plant_count, tree_count, version, updated_at)
    VALUES ('user-demo', 0, 0, 0, 0, 0, 1, ?)`).run(now);
}
