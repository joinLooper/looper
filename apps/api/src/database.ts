import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_ECONOMY_SETTINGS, LEVEL_DEFINITIONS, MERCHANT_PLAN_DEFINITIONS } from "./economy.js";

import { DatabaseSync } from "node:sqlite";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const DEFAULT_DATABASE_PATH = resolve(repoRoot, ".data/looper-dev.sqlite");

export function resolveDatabasePath(path = process.env.LOOPER_DATABASE_PATH): string {
  return path && path !== ":memory:" ? resolve(path) : (path ?? DEFAULT_DATABASE_PATH);
}

export function openDatabase(path = resolveDatabasePath()): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  migrateDatabase(db);
  seedDatabase(db);
  return db;
}

export function migrateDatabase(db: DatabaseSync): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS economy_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS merchant_plan_definitions (
  plan TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  reward_star_amount INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS level_definitions (
  level INTEGER PRIMARY KEY,
  required_total_exp INTEGER NOT NULL,
  reward_stars INTEGER NOT NULL,
  max_energy_increase INTEGER NOT NULL,
  unlock_flags_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_resources (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  star_balance INTEGER NOT NULL,
  current_energy INTEGER NOT NULL,
  max_energy INTEGER NOT NULL,
  energy_regen_interval_seconds INTEGER NOT NULL,
  energy_last_updated_at TEXT NOT NULL,
  energy_overflow_pending INTEGER NOT NULL,
  current_exp INTEGER NOT NULL,
  current_level INTEGER NOT NULL,
  next_level_exp INTEGER NOT NULL,
  unlock_flags_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_growth_balances (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  carbon_total_grams INTEGER NOT NULL,
  carbon_balance_grams INTEGER NOT NULL,
  seed_count INTEGER NOT NULL,
  plant_count INTEGER NOT NULL,
  tree_count INTEGER NOT NULL,
  version INTEGER NOT NULL,
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
  status TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT,
  review_note TEXT,
  merchant_id TEXT
);

CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES merchant_applications(id),
  store_name TEXT NOT NULL,
  address TEXT NOT NULL,
  store_category TEXT NOT NULL,
  other_store_category TEXT NOT NULL,
  vegetarian_offering_json TEXT NOT NULL,
  other_meal_type TEXT NOT NULL,
  business_hours_json TEXT NOT NULL,
  status TEXT NOT NULL,
  can_redeem INTEGER NOT NULL,
  merchant_plan TEXT NOT NULL REFERENCES merchant_plan_definitions(plan),
  reward_star_amount INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mission_enrollments (
  user_id TEXT NOT NULL REFERENCES users(id),
  mission_id TEXT NOT NULL REFERENCES missions(id),
  status TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (user_id, mission_id)
);

CREATE TABLE IF NOT EXISTS redemptions (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  mission_id TEXT NOT NULL REFERENCES missions(id),
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  stars_granted INTEGER NOT NULL,
  energy_granted INTEGER NOT NULL,
  exp_granted INTEGER NOT NULL,
  carbon_grams INTEGER NOT NULL,
  reward_event_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reward_events (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  merchant_id TEXT,
  mission_id TEXT,
  idempotency_key TEXT NOT NULL,
  reward_payload_json TEXT NOT NULL,
  growth_summary_json TEXT NOT NULL,
  level_summary_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(source_type, source_id, user_id)
);

CREATE TABLE IF NOT EXISTS resource_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  resource_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  UNIQUE(user_id, resource_type, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS plant_growth_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  before_count INTEGER NOT NULL,
  after_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS energy_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  energy_before INTEGER NOT NULL,
  energy_after INTEGER NOT NULL,
  overflow_before INTEGER NOT NULL,
  overflow_after INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS level_up_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  previous_level INTEGER NOT NULL,
  new_level INTEGER NOT NULL,
  reward_stars INTEGER NOT NULL,
  max_energy_before INTEGER NOT NULL,
  max_energy_after INTEGER NOT NULL,
  unlock_flags_json TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_role TEXT NOT NULL,
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
  required_plant_count INTEGER NOT NULL,
  required_level INTEGER NOT NULL,
  required_stars INTEGER NOT NULL,
  required_energy INTEGER NOT NULL,
  enabled INTEGER NOT NULL
);

INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (1, datetime('now'));
`);
}

export function seedDatabase(db: DatabaseSync): void {
  const now = new Date().toISOString();
  db.prepare("INSERT OR IGNORE INTO economy_settings (key, value_json, updated_at) VALUES ('core', ?, ?)").run(JSON.stringify(DEFAULT_ECONOMY_SETTINGS), now);
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
  db.prepare("INSERT OR IGNORE INTO users (id, display_name, created_at) VALUES ('user-demo', 'Looper 測試旅人', ?)").run(now);
  db.prepare(`INSERT OR IGNORE INTO user_resources
    (user_id, star_balance, current_energy, max_energy, energy_regen_interval_seconds, energy_last_updated_at, energy_overflow_pending, current_exp, current_level, next_level_exp, unlock_flags_json, updated_at)
    VALUES ('user-demo', 0, 0, 100, ?, ?, 0, 0, 1, 500, '[]', ?)`).run(DEFAULT_ECONOMY_SETTINGS.energyRegenIntervalSeconds, now, now);
  db.prepare(`INSERT OR IGNORE INTO user_growth_balances
    (user_id, carbon_total_grams, carbon_balance_grams, seed_count, plant_count, tree_count, version, updated_at)
    VALUES ('user-demo', 0, 0, 0, 0, 0, 1, ?)`).run(now);
}
