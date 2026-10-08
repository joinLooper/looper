-- Generated from approved W1A v27 inventory; regenerate with node scripts/generate-w1b-schema.mjs.
-- SQLite nullable TEXT primary keys are UNIQUE here, preserving NULL semantics.
-- 35 application tables. Allocator metadata lives in a separate internal schema.
BEGIN;
SELECT pg_advisory_xact_lock(170027,1);
CREATE SCHEMA IF NOT EXISTS w1b_control;
REVOKE ALL ON SCHEMA w1b_control FROM PUBLIC;
CREATE TABLE IF NOT EXISTS w1b_control.queue_counters(schema_name text PRIMARY KEY,high_water bigint NOT NULL);
CREATE SCHEMA looper_core;
REVOKE ALL ON SCHEMA looper_core FROM PUBLIC;
SET search_path TO looper_core,pg_catalog;
INSERT INTO w1b_control.queue_counters VALUES ('looper_core',0);
-- SQLite compatibility helpers for the approved v27 TEXT contract.
CREATE FUNCTION sqlite_json_valid(doc text) RETURNS bigint LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN IF doc IS NULL THEN RETURN NULL; END IF; PERFORM doc::json; RETURN 1;
EXCEPTION WHEN invalid_text_representation THEN RETURN 0; END $$;
CREATE FUNCTION sqlite_json_compact(doc text) RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE result text := ''; ch text; quoted boolean := false; escaped boolean := false; i integer;
BEGIN
  FOR i IN 1..length(doc) LOOP
    ch := substr(doc,i,1);
    IF quoted THEN
      result := result || ch;
      IF escaped THEN escaped := false; ELSIF ch = chr(92) THEN escaped := true; ELSIF ch = '"' THEN quoted := false; END IF;
    ELSIF ch = '"' THEN quoted := true; result := result || ch;
    ELSIF ch NOT IN (' ',chr(9),chr(10),chr(13)) THEN result := result || ch;
    END IF;
  END LOOP;
  RETURN result;
END $$;
CREATE FUNCTION sqlite_json_extract(doc text, path text) RETURNS json LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE value json; kind text; parsed json := doc::json;
BEGIN
  IF path !~ '^\$\.[A-Za-z_][A-Za-z0-9_]*$' THEN RAISE EXCEPTION 'Unsupported SQLite JSON path: %',path; END IF;
  IF json_typeof(parsed) <> 'object' THEN RETURN NULL; END IF;
  SELECT item.value INTO value FROM json_each(parsed) AS item WHERE item.key = substr(path,3) LIMIT 1;
  IF value IS NULL OR json_typeof(value) = 'null' THEN RETURN NULL; END IF;
  kind := json_typeof(value);
  IF kind = 'boolean' THEN RETURN CASE WHEN value::text = 'true' THEN '1'::json ELSE '0'::json END; END IF;
  IF kind IN ('array','object') THEN RETURN to_json(sqlite_json_compact(value::text)); END IF;
  RETURN value;
END $$;
CREATE FUNCTION sqlite_typeof(value json) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF value IS NULL THEN RETURN 'null'; END IF;
  IF json_typeof(value) = 'string' THEN RETURN 'text'; END IF;
  IF value::text ~ '^-?[0-9]+$' THEN RETURN 'integer'; END IF;
  RETURN 'real';
END $$;
CREATE FUNCTION sqlite_json_compare_number(doc text,path text,op text,rhs numeric) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE value json := sqlite_json_extract(doc,path); number numeric;
BEGIN
  IF value IS NULL THEN RETURN NULL; END IF;
  IF json_typeof(value) = 'string' THEN RETURN op IN ('>','>=','<>','!='); END IF;
  number := value::text::numeric;
  CASE op WHEN '>' THEN RETURN number > rhs; WHEN '>=' THEN RETURN number >= rhs; WHEN '=' THEN RETURN number = rhs; WHEN '<' THEN RETURN number < rhs; WHEN '<=' THEN RETURN number <= rhs; WHEN '<>' THEN RETURN number <> rhs; ELSE RAISE EXCEPTION 'Unsupported comparison'; END CASE;
END $$;
CREATE FUNCTION sqlite_json_set_raw(doc text,path text,replacement json) RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE item record; result text := '{'; found boolean := false; first boolean := true;
BEGIN
  IF path !~ '^\$\.[A-Za-z_][A-Za-z0-9_]*$' THEN RAISE EXCEPTION 'Unsupported SQLite JSON path'; END IF;
  IF json_typeof(doc::json) <> 'object' THEN RETURN sqlite_json_compact(doc); END IF;
  FOR item IN SELECT * FROM json_each(doc::json) LOOP
    IF NOT first THEN result := result || ','; END IF; first := false;
    result := result || to_json(item.key)::text || ':';
    IF NOT found AND item.key = substr(path,3) THEN result := result || replacement::text; found := true;
    ELSE result := result || item.value::text; END IF;
  END LOOP;
  IF NOT found THEN
    IF NOT first THEN result := result || ','; END IF;
    result := result || to_json(substr(path,3))::text || ':' || replacement::text;
  END IF;
  RETURN sqlite_json_compact(result || '}');
END $$;
CREATE FUNCTION sqlite_json_set(doc text,path text,replacement bigint) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT sqlite_json_set_raw(doc,path,COALESCE(to_json(replacement),'null'::json)) $$;
CREATE FUNCTION sqlite_json_set(doc text,path text,replacement text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT sqlite_json_set_raw(doc,path,COALESCE(to_json(replacement),'null'::json)) $$;
CREATE FUNCTION sqlite_lower(value text) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT translate(value,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') $$;
CREATE FUNCTION sqlite_glob(value text,pattern text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE result text := '^'; ch text; i integer;
BEGIN
  FOR i IN 1..length(pattern) LOOP
    ch:=substr(pattern,i,1);
    IF ch='*' THEN result:=result||'.*'; ELSIF ch='?' THEN result:=result||'.';
    ELSIF ch IN ('.','+','(',')','{','}','$','|',chr(92)) THEN result:=result||chr(92)||ch;
    ELSE result:=result||ch; END IF;
  END LOOP;
  RETURN value ~ (result||'$');
END $$;
CREATE FUNCTION next_queue_order() RETURNS bigint LANGUAGE plpgsql VOLATILE AS $$
DECLARE result bigint;
BEGIN
  UPDATE w1b_control.queue_counters SET high_water=high_water+1 WHERE schema_name=current_schema() RETURNING high_water INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'Missing isolated queue allocator'; END IF;
  RETURN result;
END $$;

CREATE TABLE account_external_identities (
  id text COLLATE "C" UNIQUE,
  account_id text COLLATE "C" NOT NULL,
  provider text COLLATE "C" NOT NULL CHECK (provider IN ('line')),
  provider_subject text COLLATE "C" NOT NULL CHECK (length(trim(provider_subject)) > 0),
  created_at text COLLATE "C" NOT NULL,
  updated_at text COLLATE "C" NOT NULL,
  UNIQUE (provider, provider_subject)
);

CREATE TABLE account_invitations (
  id text COLLATE "C" UNIQUE,
  account_id text COLLATE "C" NOT NULL,
  purpose text COLLATE "C" NOT NULL DEFAULT 'merchant_operator' CHECK (purpose IN ('merchant_operator', 'platform_operator')),
  token_hash text COLLATE "C" NOT NULL UNIQUE,
  status text COLLATE "C" NOT NULL CHECK (status IN ('pending', 'redeemed', 'revoked', 'expired')),
  expires_at text COLLATE "C" NOT NULL,
  redeemed_at text COLLATE "C",
  revoked_at text COLLATE "C",
  created_by_actor_id text COLLATE "C" NOT NULL,
  creation_idempotency_key text COLLATE "C" NOT NULL UNIQUE,
  created_at text COLLATE "C" NOT NULL,
  updated_at text COLLATE "C" NOT NULL
);

CREATE TABLE account_sessions (
  id text COLLATE "C" UNIQUE,
  account_id text COLLATE "C" NOT NULL,
  purpose text COLLATE "C" NOT NULL CHECK (purpose IN ('merchant_operator', 'platform_operator', 'player')),
  token_hash text COLLATE "C" NOT NULL UNIQUE,
  expires_at text COLLATE "C" NOT NULL,
  revoked_at text COLLATE "C",
  created_from_invitation_id text COLLATE "C",
  last_used_at text COLLATE "C",
  created_at text COLLATE "C" NOT NULL,
  updated_at text COLLATE "C" NOT NULL,
  CHECK (
    (purpose = 'player' AND created_from_invitation_id IS NULL)
    OR (purpose IN ('merchant_operator', 'platform_operator') AND created_from_invitation_id IS NOT NULL)
  )
);

CREATE TABLE accounts (
  id text COLLATE "C" UNIQUE,
  display_name text COLLATE "C" NOT NULL,
  status text COLLATE "C" NOT NULL CHECK (status IN ('active', 'suspended', 'closed')),
  created_at text COLLATE "C" NOT NULL,
  updated_at text COLLATE "C" NOT NULL,
  creation_idempotency_key text COLLATE "C" UNIQUE
);

CREATE TABLE audit_events (
  id text COLLATE "C" UNIQUE,
  actor_role text COLLATE "C" NOT NULL CHECK (actor_role IN ('user', 'merchant', 'admin')),
  actor_id text COLLATE "C" NOT NULL,
  action text COLLATE "C" NOT NULL,
  entity_type text COLLATE "C" NOT NULL,
  entity_id text COLLATE "C" NOT NULL,
  created_at text COLLATE "C" NOT NULL,
  metadata_json text COLLATE "C" NOT NULL
);

CREATE TABLE diamond_recipe_definitions (
  id text COLLATE "C" UNIQUE,
  label text COLLATE "C" NOT NULL,
  required_plant_count bigint NOT NULL CHECK (required_plant_count >= 0),
  required_level bigint NOT NULL CHECK (required_level >= 1),
  required_stars bigint NOT NULL CHECK (required_stars >= 0),
  required_energy bigint NOT NULL CHECK (required_energy >= 0),
  enabled bigint NOT NULL CHECK (enabled IN (0, 1))
);

CREATE TABLE economy_settings (
  key text COLLATE "C" UNIQUE,
  value_json text COLLATE "C" NOT NULL CHECK (
    key <> 'core' OR (
      (sqlite_json_valid(value_json) = 1)
      AND sqlite_json_compare_number(value_json,'$.vegetarianCarbonGrams','>',0)
      AND sqlite_json_compare_number(value_json,'$.carbonGramsPerSeed','>',0)
      AND sqlite_json_compare_number(value_json,'$.seedsPerPlant','>',0)
      AND sqlite_json_compare_number(value_json,'$.plantsPerTree','>',0)
      AND sqlite_json_compare_number(value_json,'$.redemptionEnergy','>=',0)
      AND sqlite_json_compare_number(value_json,'$.redemptionExp','>=',0)
      AND sqlite_json_compare_number(value_json,'$.energyRegenIntervalSeconds','>',0)
      AND sqlite_json_compare_number(value_json,'$.energyOverflowMultiplier','=',1)
    )
  ),
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at text COLLATE "C" NOT NULL,
  updated_by text COLLATE "C" NOT NULL DEFAULT 'system'
);

CREATE TABLE energy_logs (
  id text COLLATE "C" UNIQUE,
  user_id text COLLATE "C" NOT NULL,
  event_type text COLLATE "C" NOT NULL CHECK (event_type IN ('natural_regen', 'reward', 'level_up_refill')),
  amount bigint NOT NULL CHECK (amount >= 0),
  energy_before bigint NOT NULL CHECK (energy_before >= 0),
  energy_after bigint NOT NULL CHECK (energy_after >= 0),
  overflow_before bigint NOT NULL CHECK (overflow_before >= 0),
  overflow_after bigint NOT NULL CHECK (overflow_after >= 0),
  source_type text COLLATE "C" NOT NULL,
  source_id text COLLATE "C" NOT NULL,
  created_at text COLLATE "C" NOT NULL
);

CREATE TABLE knowledge_card_attempts (
  id text COLLATE "C" UNIQUE,
  user_id text COLLATE "C" NOT NULL,
  card_id text COLLATE "C" NOT NULL,
  card_version text COLLATE "C" NOT NULL,
  selected_option_id text COLLATE "C" NOT NULL,
  is_correct bigint NOT NULL CHECK (is_correct IN (0, 1)),
  reward_exp bigint NOT NULL CHECK (reward_exp IN (30, 50)),
  idempotency_key text COLLATE "C" NOT NULL UNIQUE,
  answered_at text COLLATE "C" NOT NULL,
  reward_event_id text COLLATE "C" NOT NULL UNIQUE,
  UNIQUE(user_id, card_id, card_version),
  CHECK (card_id <> '' AND card_version <> '' AND selected_option_id <> '')
);

CREATE TABLE level_definitions (
  level bigint PRIMARY KEY CHECK (level >= 1),
  required_total_exp bigint NOT NULL CHECK (required_total_exp >= 0),
  reward_stars bigint NOT NULL CHECK (reward_stars >= 0),
  max_energy_increase bigint NOT NULL CHECK (max_energy_increase >= 0),
  unlock_flags_json text COLLATE "C" NOT NULL
);

CREATE TABLE level_up_logs (
  id text COLLATE "C" UNIQUE,
  user_id text COLLATE "C" NOT NULL,
  previous_level bigint NOT NULL CHECK (previous_level >= 1),
  new_level bigint NOT NULL CHECK (new_level >= previous_level),
  reward_stars bigint NOT NULL CHECK (reward_stars >= 0),
  max_energy_before bigint NOT NULL CHECK (max_energy_before >= 0),
  max_energy_after bigint NOT NULL CHECK (max_energy_after >= max_energy_before),
  unlock_flags_json text COLLATE "C" NOT NULL,
  source_type text COLLATE "C" NOT NULL,
  source_id text COLLATE "C" NOT NULL,
  created_at text COLLATE "C" NOT NULL
);

CREATE TABLE merchant_applications (
  id text COLLATE "C" UNIQUE,
  store_name text COLLATE "C" NOT NULL,
  contact_name text COLLATE "C" NOT NULL,
  contact_line_id text COLLATE "C" NOT NULL,
  phone text COLLATE "C" NOT NULL,
  email text COLLATE "C" NOT NULL,
  address text COLLATE "C" NOT NULL,
  store_category text COLLATE "C" NOT NULL,
  other_store_category text COLLATE "C" NOT NULL,
  vegetarian_offering_json text COLLATE "C" NOT NULL,
  other_meal_type text COLLATE "C" NOT NULL,
  business_hours_json text COLLATE "C" NOT NULL,
  status text COLLATE "C" NOT NULL CHECK (status IN ('pending', 'needs_revision', 'approved', 'rejected')),
  submitted_at text COLLATE "C" NOT NULL,
  reviewed_at text COLLATE "C",
  review_note text COLLATE "C",
  merchant_id text COLLATE "C" UNIQUE
);

CREATE TABLE merchant_brands (
  id text COLLATE "C" UNIQUE,
  display_name text COLLATE "C" NOT NULL,
  legal_name text COLLATE "C",
  status text COLLATE "C" NOT NULL CHECK (status IN ('active', 'suspended')),
  created_at text COLLATE "C" NOT NULL,
  updated_at text COLLATE "C" NOT NULL
);

CREATE TABLE merchant_operator_memberships (
  id text COLLATE "C" UNIQUE,
  account_id text COLLATE "C" NOT NULL,
  brand_id text COLLATE "C" NOT NULL,
  merchant_id text COLLATE "C",
  role text COLLATE "C" NOT NULL CHECK (role IN ('brand_owner', 'brand_manager', 'branch_manager', 'branch_staff')),
  status text COLLATE "C" NOT NULL CHECK (status IN ('active', 'suspended', 'left')),
  created_at text COLLATE "C" NOT NULL,
  updated_at text COLLATE "C" NOT NULL,
  CHECK (
    (role IN ('brand_owner', 'brand_manager') AND merchant_id IS NULL)
    OR (role IN ('branch_manager', 'branch_staff') AND merchant_id IS NOT NULL)
  )
);

CREATE TABLE merchant_plan_definitions (
  plan text COLLATE "C" UNIQUE CHECK (plan IN ('sprout', 'grove', 'forest')),
  label text COLLATE "C" NOT NULL,
  reward_star_amount bigint NOT NULL CHECK (reward_star_amount >= 0)
);

CREATE TABLE merchants (
  id text COLLATE "C" UNIQUE,
  application_id text COLLATE "C" UNIQUE,
  brand_id text COLLATE "C" NOT NULL,
  branch_code text COLLATE "C" NOT NULL DEFAULT 'main',
  store_name text COLLATE "C" NOT NULL,
  address text COLLATE "C" NOT NULL,
  store_category text COLLATE "C" NOT NULL,
  other_store_category text COLLATE "C" NOT NULL,
  vegetarian_offering_json text COLLATE "C" NOT NULL,
  other_meal_type text COLLATE "C" NOT NULL,
  business_hours_json text COLLATE "C" NOT NULL,
  status text COLLATE "C" NOT NULL CHECK (status IN ('active', 'suspended')),
  can_redeem bigint NOT NULL CHECK (can_redeem IN (0, 1)),
  merchant_plan text COLLATE "C" NOT NULL,
  reward_star_amount bigint NOT NULL CHECK (reward_star_amount >= 0),
  reward_category text COLLATE "C" NOT NULL DEFAULT 'general' CHECK (reward_category IN ('general', 'star')),
  timezone text COLLATE "C" NOT NULL DEFAULT 'Asia/Taipei',
  created_at text COLLATE "C" NOT NULL
);

CREATE TABLE mission_enrollments (
  user_id text COLLATE "C" NOT NULL,
  mission_id text COLLATE "C" NOT NULL,
  status text COLLATE "C" NOT NULL CHECK (status IN ('awaiting_verification', 'completed')),
  accepted_at text COLLATE "C" NOT NULL,
  completed_at text COLLATE "C",
  PRIMARY KEY (user_id, mission_id)
);

CREATE TABLE missions (
  id text COLLATE "C" UNIQUE,
  merchant_id text COLLATE "C" NOT NULL,
  mission_type text COLLATE "C" NOT NULL DEFAULT 'vegetarian_meal',
  title text COLLATE "C" NOT NULL,
  description text COLLATE "C" NOT NULL,
  created_at text COLLATE "C" NOT NULL,
  UNIQUE (merchant_id, mission_type)
);

CREATE TABLE plant_growth_logs (
  id text COLLATE "C" UNIQUE,
  user_id text COLLATE "C" NOT NULL,
  source_type text COLLATE "C" NOT NULL,
  source_id text COLLATE "C" NOT NULL,
  event_type text COLLATE "C" NOT NULL CHECK (event_type IN ('seed_generated', 'seeds_combined_to_plant', 'plants_combined_to_tree')),
  conversion_id text COLLATE "C" NOT NULL DEFAULT '',
  quantity bigint NOT NULL CHECK (quantity > 0),
  before_count bigint NOT NULL CHECK (before_count >= 0),
  after_count bigint NOT NULL CHECK (after_count >= 0),
  created_at text COLLATE "C" NOT NULL
);

CREATE TABLE platform_operator_memberships (
  id text COLLATE "C" UNIQUE,
  account_id text COLLATE "C" NOT NULL UNIQUE,
  role text COLLATE "C" NOT NULL CHECK (role IN ('operations_admin', 'finance_admin', 'super_admin')),
  status text COLLATE "C" NOT NULL CHECK (status IN ('active', 'suspended', 'left')),
  created_at text COLLATE "C" NOT NULL,
  updated_at text COLLATE "C" NOT NULL,
  granted_by_account_id text COLLATE "C"
);

CREATE TABLE platform_operator_role_transitions (
  id text COLLATE "C" UNIQUE,
  membership_id text COLLATE "C" NOT NULL,
  target_account_id text COLLATE "C" NOT NULL,
  actor_account_id text COLLATE "C" NOT NULL,
  from_role text COLLATE "C" NOT NULL CHECK (from_role IN ('operations_admin', 'finance_admin', 'super_admin')),
  to_role text COLLATE "C" NOT NULL CHECK (to_role IN ('operations_admin', 'finance_admin', 'super_admin')),
  reason text COLLATE "C" NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  idempotency_key text COLLATE "C" NOT NULL UNIQUE,
  revoked_platform_session_count bigint NOT NULL CHECK (revoked_platform_session_count >= 0),
  invitation_id text COLLATE "C" NOT NULL,
  created_at text COLLATE "C" NOT NULL,
  CHECK (from_role <> to_role)
);

CREATE TABLE platform_operator_status_transitions (
  id text COLLATE "C" UNIQUE,
  membership_id text COLLATE "C" NOT NULL,
  target_account_id text COLLATE "C" NOT NULL,
  actor_account_id text COLLATE "C" NOT NULL,
  from_status text COLLATE "C" NOT NULL CHECK (from_status IN ('active', 'suspended')),
  to_status text COLLATE "C" NOT NULL CHECK (to_status IN ('active', 'suspended')),
  reason text COLLATE "C" NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  idempotency_key text COLLATE "C" NOT NULL UNIQUE,
  revoked_platform_session_count bigint NOT NULL CHECK (revoked_platform_session_count >= 0),
  invitation_id text COLLATE "C",
  created_at text COLLATE "C" NOT NULL,
  CHECK (from_status <> to_status)
);

CREATE TABLE player_event_queue (
  queue_order bigint DEFAULT next_queue_order() PRIMARY KEY,
  id text COLLATE "C" NOT NULL UNIQUE,
  user_id text COLLATE "C" NOT NULL,
  source_reward_event_id text COLLATE "C" NOT NULL,
  event_key text COLLATE "C" NOT NULL UNIQUE,
  event_type text COLLATE "C" NOT NULL CHECK (event_type IN ('level_up', 'home_scene')),
  event_level bigint CHECK (event_level IS NULL OR event_level >= 1),
  scene_id text COLLATE "C",
  event_name text COLLATE "C" NOT NULL,
  payload_json text COLLATE "C" NOT NULL,
  status text COLLATE "C" NOT NULL CHECK (status IN ('pending', 'completed', 'skipped')),
  created_at text COLLATE "C" NOT NULL,
  resolved_at text COLLATE "C",
  resolution_idempotency_key text COLLATE "C" UNIQUE,
  CHECK (
    (status = 'pending' AND resolved_at IS NULL AND resolution_idempotency_key IS NULL)
    OR (status IN ('completed', 'skipped') AND resolved_at IS NOT NULL AND resolution_idempotency_key IS NOT NULL)
  )
);

CREATE TABLE redemptions (
  id text COLLATE "C" UNIQUE,
  idempotency_key text COLLATE "C" NOT NULL UNIQUE,
  user_id text COLLATE "C" NOT NULL,
  mission_id text COLLATE "C" NOT NULL,
  merchant_id text COLLATE "C" NOT NULL,
  stars_granted bigint NOT NULL CHECK (stars_granted >= 0),
  energy_granted bigint NOT NULL CHECK (energy_granted >= 0),
  exp_granted bigint NOT NULL CHECK (exp_granted >= 0),
  carbon_grams bigint NOT NULL CHECK (carbon_grams >= 0),
  reward_event_id text COLLATE "C" UNIQUE,
  created_at text COLLATE "C" NOT NULL
);

CREATE TABLE resident_mission_claim_requests (
  id text COLLATE "C" UNIQUE,
  user_id text COLLATE "C" NOT NULL,
  mission_instance_id text COLLATE "C" NOT NULL,
  idempotency_key text COLLATE "C" NOT NULL,
  request_fingerprint text COLLATE "C" NOT NULL,
  status text COLLATE "C" NOT NULL CHECK (status IN ('REQUEST', 'BACKEND_SUCCESS', 'FAILURE')),
  reward_event_id text COLLATE "C" UNIQUE,
  result_json text COLLATE "C",
  created_at text COLLATE "C" NOT NULL,
  completed_at text COLLATE "C",
  UNIQUE (user_id, idempotency_key),
  CHECK (
    (status = 'BACKEND_SUCCESS' AND reward_event_id IS NOT NULL AND result_json IS NOT NULL AND completed_at IS NOT NULL)
    OR (status <> 'BACKEND_SUCCESS' AND reward_event_id IS NULL AND result_json IS NULL AND completed_at IS NULL)
  )
);

CREATE TABLE resident_mission_instances (
  id text COLLATE "C" UNIQUE,
  user_id text COLLATE "C" NOT NULL,
  mission_id text COLLATE "C" NOT NULL CHECK (mission_id = 'resident-daily-core-tree-check'),
  business_date text COLLATE "C" NOT NULL CHECK (sqlite_glob(business_date,'[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
  state text COLLATE "C" NOT NULL CHECK (state IN ('AVAILABLE', 'IN_PROGRESS', 'COMPLETED', 'CLAIMABLE', 'CLAIM_PENDING', 'CLAIMED')),
  completion_state text COLLATE "C" NOT NULL CHECK (completion_state IN ('PENDING', 'COMPLETED')),
  completion_truth text COLLATE "C" NOT NULL CHECK (completion_truth = 'core_tree_world_interaction_opened'),
  completed_at text COLLATE "C",
  claim_state text COLLATE "C" NOT NULL CHECK (claim_state IN ('NOT_CLAIMABLE', 'CLAIMABLE', 'CLAIM_PENDING', 'CLAIMED')),
  claimed_at text COLLATE "C",
  reward_event_id text COLLATE "C" UNIQUE,
  created_at text COLLATE "C" NOT NULL,
  updated_at text COLLATE "C" NOT NULL,
  UNIQUE (user_id, mission_id, business_date),
  CHECK (
    (completion_state = 'PENDING' AND completed_at IS NULL AND claim_state = 'NOT_CLAIMABLE')
    OR (completion_state = 'COMPLETED' AND completed_at IS NOT NULL AND claim_state IN ('CLAIMABLE', 'CLAIM_PENDING', 'CLAIMED'))
  ),
  CHECK (
    (claim_state = 'CLAIMED' AND state = 'CLAIMED' AND claimed_at IS NOT NULL AND reward_event_id IS NOT NULL)
    OR (claim_state <> 'CLAIMED' AND claimed_at IS NULL AND reward_event_id IS NULL)
  )
);

CREATE TABLE resource_transactions (
  id text COLLATE "C" UNIQUE,
  user_id text COLLATE "C" NOT NULL,
  resource_type text COLLATE "C" NOT NULL CHECK (resource_type IN ('stars', 'energy', 'energy_overflow', 'exp', 'carbon_total', 'carbon_balance', 'seed', 'plant', 'tree')),
  amount bigint NOT NULL,
  balance_before bigint NOT NULL CHECK (balance_before >= 0),
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  transaction_kind text COLLATE "C" NOT NULL DEFAULT 'legacy' CHECK (transaction_kind IN ('grant', 'consume', 'convert_debit', 'convert_credit', 'adjustment', 'legacy')),
  conversion_id text COLLATE "C" NOT NULL DEFAULT '',
  conversion_type text COLLATE "C" NOT NULL DEFAULT 'none' CHECK (conversion_type IN ('none', 'carbon_to_seed', 'seed_to_plant', 'plant_to_tree')),
  source_type text COLLATE "C" NOT NULL CHECK (source_type IN ('vegetarian_purchase', 'task_completion', 'event_checkin', 'daily_login', 'level_up', 'admin_adjustment')),
  source_id text COLLATE "C" NOT NULL,
  idempotency_key text COLLATE "C" NOT NULL,
  created_at text COLLATE "C" NOT NULL,
  metadata_json text COLLATE "C" NOT NULL,
  CHECK (transaction_kind = 'legacy' OR balance_after = balance_before + amount),
  CHECK ((transaction_kind IN ('convert_debit', 'convert_credit') AND conversion_id <> '' AND conversion_type <> 'none') OR (transaction_kind NOT IN ('convert_debit', 'convert_credit'))),
  UNIQUE(user_id, resource_type, source_type, source_id, transaction_kind, conversion_id, conversion_type)
);

CREATE TABLE reward_events (
  id text COLLATE "C" UNIQUE,
  source_type text COLLATE "C" NOT NULL CHECK (source_type IN ('vegetarian_purchase', 'task_completion', 'event_checkin', 'daily_login', 'level_up', 'admin_adjustment')),
  source_id text COLLATE "C" NOT NULL,
  user_id text COLLATE "C" NOT NULL,
  merchant_id text COLLATE "C",
  mission_id text COLLATE "C",
  idempotency_key text COLLATE "C" NOT NULL UNIQUE,
  logical_request_json text COLLATE "C" NOT NULL,
  reward_payload_json text COLLATE "C" NOT NULL,
  growth_summary_json text COLLATE "C" NOT NULL,
  level_summary_json text COLLATE "C" NOT NULL,
  rule_version text COLLATE "C",
  rule_snapshot_json text COLLATE "C",
  created_at text COLLATE "C" NOT NULL,
  UNIQUE(source_type, source_id, user_id)
);

CREATE TABLE schema_migrations (
  version bigint PRIMARY KEY,
  name text COLLATE "C" NOT NULL DEFAULT 'legacy',
  applied_at text COLLATE "C" NOT NULL
);

CREATE TABLE task_code_submission_scope_snapshots (
  submission_id text COLLATE "C" UNIQUE,
  snapshot_version text COLLATE "C" NOT NULL CHECK (snapshot_version = 'task-code-scope-v1'),
  captured_at text COLLATE "C" NOT NULL,
  reporting_timezone text COLLATE "C" NOT NULL CHECK (reporting_timezone = 'Asia/Taipei'),
  brand_id text COLLATE "C" NOT NULL,
  brand_display_name text COLLATE "C" NOT NULL,
  merchant_id text COLLATE "C" NOT NULL,
  branch_code text COLLATE "C" NOT NULL,
  branch_display_name text COLLATE "C" NOT NULL,
  CHECK (brand_id <> '' AND brand_display_name <> ''),
  CHECK (merchant_id <> '' AND branch_code <> '' AND branch_display_name <> '')
);

CREATE TABLE task_code_submissions (
  id text COLLATE "C" UNIQUE,
  task_code_window_id text COLLATE "C" NOT NULL,
  merchant_id text COLLATE "C" NOT NULL,
  mission_id text COLLATE "C" NOT NULL,
  user_id text COLLATE "C" NOT NULL,
  status text COLLATE "C" NOT NULL CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired', 'settled')),
  submitted_at text COLLATE "C" NOT NULL,
  confirmation_expires_at text COLLATE "C" NOT NULL,
  confirmed_at text COLLATE "C",
  rejected_at text COLLATE "C",
  expired_at text COLLATE "C",
  settled_at text COLLATE "C",
  idempotency_key text COLLATE "C" NOT NULL UNIQUE,
  decided_by text COLLATE "C",
  decision_idempotency_key text COLLATE "C" UNIQUE,
  redemption_id text COLLATE "C" UNIQUE,
  reward_event_id text COLLATE "C" UNIQUE
);

CREATE TABLE task_code_windows (
  id text COLLATE "C" UNIQUE,
  merchant_id text COLLATE "C" NOT NULL,
  code_hash text COLLATE "C" NOT NULL,
  code_length bigint NOT NULL CHECK (code_length IN (4, 6)),
  valid_from text COLLATE "C" NOT NULL,
  valid_until text COLLATE "C" NOT NULL,
  status text COLLATE "C" NOT NULL CHECK (status IN ('active', 'expired', 'revoked')),
  created_at text COLLATE "C" NOT NULL,
  CHECK (valid_until > valid_from)
);

CREATE TABLE user_growth_balances (
  user_id text COLLATE "C" UNIQUE,
  carbon_total_grams bigint NOT NULL CHECK (carbon_total_grams >= 0),
  carbon_balance_grams bigint NOT NULL CHECK (carbon_balance_grams >= 0),
  seed_count bigint NOT NULL CHECK (seed_count >= 0),
  plant_count bigint NOT NULL CHECK (plant_count >= 0),
  tree_count bigint NOT NULL CHECK (tree_count >= 0),
  version bigint NOT NULL CHECK (version >= 1),
  updated_at text COLLATE "C" NOT NULL
);

CREATE TABLE user_resources (
  user_id text COLLATE "C" UNIQUE,
  star_balance bigint NOT NULL CHECK (star_balance >= 0),
  current_energy bigint NOT NULL CHECK (current_energy >= 0),
  max_energy bigint NOT NULL CHECK (max_energy >= 0),
  energy_regen_interval_seconds bigint NOT NULL CHECK (energy_regen_interval_seconds > 0),
  energy_last_updated_at text COLLATE "C" NOT NULL,
  energy_overflow_pending bigint NOT NULL CHECK (energy_overflow_pending >= 0),
  current_exp bigint NOT NULL CHECK (current_exp >= 0),
  current_level bigint NOT NULL CHECK (current_level >= 1),
  next_level_exp bigint NOT NULL CHECK (next_level_exp >= 0),
  unlock_flags_json text COLLATE "C" NOT NULL,
  updated_at text COLLATE "C" NOT NULL,
  CHECK (current_energy <= max_energy)
);

CREATE TABLE users (
  id text COLLATE "C" UNIQUE,
  account_id text COLLATE "C" NOT NULL UNIQUE,
  display_name text COLLATE "C" NOT NULL,
  created_at text COLLATE "C" NOT NULL,
  reduced_motion bigint CHECK (reduced_motion IS NULL OR reduced_motion IN (0, 1)),
  reduced_motion_updated_at text COLLATE "C"
);

ALTER TABLE account_external_identities ADD FOREIGN KEY (account_id) REFERENCES accounts(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
CREATE INDEX idx_account_external_identities_account
  ON account_external_identities(account_id);
ALTER TABLE account_invitations ADD FOREIGN KEY (account_id) REFERENCES accounts(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE account_sessions ADD FOREIGN KEY (created_from_invitation_id) REFERENCES account_invitations(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE account_sessions ADD FOREIGN KEY (account_id) REFERENCES accounts(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
CREATE INDEX idx_account_sessions_purpose_expiry_revocation
  ON account_sessions(purpose, expires_at, revoked_at);
ALTER TABLE energy_logs ADD FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE knowledge_card_attempts ADD FOREIGN KEY (reward_event_id) REFERENCES reward_events(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE knowledge_card_attempts ADD FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
CREATE INDEX idx_knowledge_card_attempts_user_answered
  ON knowledge_card_attempts(user_id, answered_at DESC);
CREATE FUNCTION trg_knowledge_card_attempts_immutable_delete_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(170027,1);
  RAISE EXCEPTION 'knowledge card attempt is immutable' USING ERRCODE='P0001';
  RETURN NEW;
END $$;
CREATE TRIGGER trg_knowledge_card_attempts_immutable_delete BEFORE DELETE ON knowledge_card_attempts FOR EACH ROW EXECUTE FUNCTION trg_knowledge_card_attempts_immutable_delete_fn();
CREATE FUNCTION trg_knowledge_card_attempts_immutable_update_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(170027,1);
  RAISE EXCEPTION 'knowledge card attempt is immutable' USING ERRCODE='P0001';
  RETURN NEW;
END $$;
CREATE TRIGGER trg_knowledge_card_attempts_immutable_update BEFORE UPDATE ON knowledge_card_attempts FOR EACH ROW EXECUTE FUNCTION trg_knowledge_card_attempts_immutable_update_fn();
ALTER TABLE level_up_logs ADD FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE merchant_applications ADD FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE merchant_operator_memberships ADD FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE merchant_operator_memberships ADD FOREIGN KEY (brand_id) REFERENCES merchant_brands(id) ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE merchant_operator_memberships ADD FOREIGN KEY (account_id) REFERENCES accounts(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
CREATE UNIQUE INDEX idx_memberships_branch_scope_unique
  ON merchant_operator_memberships(account_id, brand_id, merchant_id)
  WHERE merchant_id IS NOT NULL;
CREATE UNIQUE INDEX idx_memberships_brand_scope_unique
  ON merchant_operator_memberships(account_id, brand_id)
  WHERE merchant_id IS NULL;
CREATE FUNCTION trg_memberships_branch_brand_insert_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(170027,1);
  IF NEW.merchant_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM merchants WHERE id = NEW.merchant_id AND brand_id = NEW.brand_id) THEN RAISE EXCEPTION 'membership merchant must belong to brand' USING ERRCODE='P0001'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_memberships_branch_brand_insert BEFORE INSERT ON merchant_operator_memberships FOR EACH ROW EXECUTE FUNCTION trg_memberships_branch_brand_insert_fn();
CREATE FUNCTION trg_memberships_branch_brand_update_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(170027,1);
  IF NEW.merchant_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM merchants WHERE id = NEW.merchant_id AND brand_id = NEW.brand_id) THEN RAISE EXCEPTION 'membership merchant must belong to brand' USING ERRCODE='P0001'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_memberships_branch_brand_update BEFORE UPDATE OF brand_id, merchant_id ON merchant_operator_memberships FOR EACH ROW EXECUTE FUNCTION trg_memberships_branch_brand_update_fn();
CREATE FUNCTION trg_memberships_scope_exclusivity_insert_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(170027,1);
  IF EXISTS (
  SELECT 1 FROM merchant_operator_memberships existing
  WHERE existing.account_id = NEW.account_id
    AND existing.brand_id = NEW.brand_id
    AND ((NEW.merchant_id IS NULL AND existing.merchant_id IS NOT NULL)
      OR (NEW.merchant_id IS NOT NULL AND existing.merchant_id IS NULL))
) THEN RAISE EXCEPTION 'brand and branch memberships cannot overlap' USING ERRCODE='P0001'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_memberships_scope_exclusivity_insert BEFORE INSERT ON merchant_operator_memberships FOR EACH ROW EXECUTE FUNCTION trg_memberships_scope_exclusivity_insert_fn();
CREATE FUNCTION trg_memberships_scope_exclusivity_update_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(170027,1);
  IF EXISTS (
  SELECT 1 FROM merchant_operator_memberships existing
  WHERE existing.id <> NEW.id
    AND existing.account_id = NEW.account_id
    AND existing.brand_id = NEW.brand_id
    AND ((NEW.merchant_id IS NULL AND existing.merchant_id IS NOT NULL)
      OR (NEW.merchant_id IS NOT NULL AND existing.merchant_id IS NULL))
) THEN RAISE EXCEPTION 'brand and branch memberships cannot overlap' USING ERRCODE='P0001'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_memberships_scope_exclusivity_update BEFORE UPDATE OF account_id, brand_id, merchant_id ON merchant_operator_memberships FOR EACH ROW EXECUTE FUNCTION trg_memberships_scope_exclusivity_update_fn();
ALTER TABLE merchants ADD FOREIGN KEY (merchant_plan) REFERENCES merchant_plan_definitions(plan) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE merchants ADD FOREIGN KEY (brand_id) REFERENCES merchant_brands(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE merchants ADD FOREIGN KEY (application_id) REFERENCES merchant_applications(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
CREATE UNIQUE INDEX idx_merchants_brand_branch_code
  ON merchants(brand_id, branch_code);
ALTER TABLE mission_enrollments ADD FOREIGN KEY (mission_id) REFERENCES missions(id) ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE mission_enrollments ADD FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE missions ADD FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE plant_growth_logs ADD FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE platform_operator_memberships ADD FOREIGN KEY (granted_by_account_id) REFERENCES accounts(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE platform_operator_memberships ADD FOREIGN KEY (account_id) REFERENCES accounts(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
CREATE INDEX idx_platform_operator_memberships_role_status
  ON platform_operator_memberships(role, status);
CREATE INDEX idx_platform_operator_memberships_account_status
  ON platform_operator_memberships(account_id, status);
ALTER TABLE platform_operator_role_transitions ADD FOREIGN KEY (invitation_id) REFERENCES account_invitations(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE platform_operator_role_transitions ADD FOREIGN KEY (actor_account_id) REFERENCES accounts(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE platform_operator_role_transitions ADD FOREIGN KEY (target_account_id) REFERENCES accounts(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE platform_operator_role_transitions ADD FOREIGN KEY (membership_id) REFERENCES platform_operator_memberships(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
CREATE FUNCTION trg_platform_operator_role_transitions_immutable_delete_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(170027,1);
  RAISE EXCEPTION 'platform operator role transition is immutable' USING ERRCODE='P0001';
  RETURN NEW;
END $$;
CREATE TRIGGER trg_platform_operator_role_transitions_immutable_delete BEFORE DELETE ON platform_operator_role_transitions FOR EACH ROW EXECUTE FUNCTION trg_platform_operator_role_transitions_immutable_delete_fn();
CREATE FUNCTION trg_platform_operator_role_transitions_immutable_update_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(170027,1);
  RAISE EXCEPTION 'platform operator role transition is immutable' USING ERRCODE='P0001';
  RETURN NEW;
END $$;
CREATE TRIGGER trg_platform_operator_role_transitions_immutable_update BEFORE UPDATE ON platform_operator_role_transitions FOR EACH ROW EXECUTE FUNCTION trg_platform_operator_role_transitions_immutable_update_fn();
ALTER TABLE platform_operator_status_transitions ADD FOREIGN KEY (invitation_id) REFERENCES account_invitations(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE platform_operator_status_transitions ADD FOREIGN KEY (actor_account_id) REFERENCES accounts(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE platform_operator_status_transitions ADD FOREIGN KEY (target_account_id) REFERENCES accounts(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE platform_operator_status_transitions ADD FOREIGN KEY (membership_id) REFERENCES platform_operator_memberships(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
CREATE FUNCTION trg_platform_operator_status_transitions_immutable_delete_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(170027,1);
  RAISE EXCEPTION 'platform operator status transition is immutable' USING ERRCODE='P0001';
  RETURN NEW;
END $$;
CREATE TRIGGER trg_platform_operator_status_transitions_immutable_delete BEFORE DELETE ON platform_operator_status_transitions FOR EACH ROW EXECUTE FUNCTION trg_platform_operator_status_transitions_immutable_delete_fn();
CREATE FUNCTION trg_platform_operator_status_transitions_immutable_update_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(170027,1);
  RAISE EXCEPTION 'platform operator status transition is immutable' USING ERRCODE='P0001';
  RETURN NEW;
END $$;
CREATE TRIGGER trg_platform_operator_status_transitions_immutable_update BEFORE UPDATE ON platform_operator_status_transitions FOR EACH ROW EXECUTE FUNCTION trg_platform_operator_status_transitions_immutable_update_fn();
ALTER TABLE player_event_queue ADD FOREIGN KEY (source_reward_event_id) REFERENCES reward_events(id) ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE player_event_queue ADD FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE CASCADE;
CREATE INDEX idx_player_event_queue_user_pending_order
  ON player_event_queue(user_id, status, queue_order);
ALTER TABLE redemptions ADD FOREIGN KEY (reward_event_id) REFERENCES reward_events(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE redemptions ADD FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE redemptions ADD FOREIGN KEY (mission_id) REFERENCES missions(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE redemptions ADD FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE resident_mission_claim_requests ADD FOREIGN KEY (reward_event_id) REFERENCES reward_events(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE resident_mission_claim_requests ADD FOREIGN KEY (mission_instance_id) REFERENCES resident_mission_instances(id) ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE resident_mission_claim_requests ADD FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE CASCADE;
CREATE INDEX idx_resident_mission_claim_requests_instance
  ON resident_mission_claim_requests(mission_instance_id, status);
ALTER TABLE resident_mission_instances ADD FOREIGN KEY (reward_event_id) REFERENCES reward_events(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE resident_mission_instances ADD FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE CASCADE;
CREATE INDEX idx_resident_mission_instances_user_date
  ON resident_mission_instances(user_id, business_date, mission_id);
ALTER TABLE resource_transactions ADD FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE reward_events ADD FOREIGN KEY (mission_id) REFERENCES missions(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE reward_events ADD FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE reward_events ADD FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE task_code_submission_scope_snapshots ADD FOREIGN KEY (submission_id) REFERENCES task_code_submissions(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
CREATE INDEX idx_task_code_scope_snapshots_merchant_submission
  ON task_code_submission_scope_snapshots(merchant_id, submission_id);
CREATE INDEX idx_task_code_scope_snapshots_brand_submission
  ON task_code_submission_scope_snapshots(brand_id, submission_id);
CREATE FUNCTION trg_task_code_scope_snapshots_immutable_delete_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(170027,1);
  RAISE EXCEPTION 'task code reporting scope snapshot is immutable' USING ERRCODE='P0001';
  RETURN NEW;
END $$;
CREATE TRIGGER trg_task_code_scope_snapshots_immutable_delete BEFORE DELETE ON task_code_submission_scope_snapshots FOR EACH ROW EXECUTE FUNCTION trg_task_code_scope_snapshots_immutable_delete_fn();
CREATE FUNCTION trg_task_code_scope_snapshots_immutable_update_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(170027,1);
  RAISE EXCEPTION 'task code reporting scope snapshot is immutable' USING ERRCODE='P0001';
  RETURN NEW;
END $$;
CREATE TRIGGER trg_task_code_scope_snapshots_immutable_update BEFORE UPDATE ON task_code_submission_scope_snapshots FOR EACH ROW EXECUTE FUNCTION trg_task_code_scope_snapshots_immutable_update_fn();
ALTER TABLE task_code_submissions ADD FOREIGN KEY (reward_event_id) REFERENCES reward_events(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE task_code_submissions ADD FOREIGN KEY (redemption_id) REFERENCES redemptions(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE task_code_submissions ADD FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE task_code_submissions ADD FOREIGN KEY (mission_id) REFERENCES missions(id) ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE task_code_submissions ADD FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE task_code_submissions ADD FOREIGN KEY (task_code_window_id) REFERENCES task_code_windows(id) ON UPDATE NO ACTION ON DELETE CASCADE;
CREATE INDEX idx_task_code_submissions_expired_reporting
  ON task_code_submissions(expired_at DESC, id DESC)
  WHERE status = 'expired';
CREATE INDEX idx_task_code_submissions_merchant_settled_reporting
  ON task_code_submissions(merchant_id, settled_at DESC, id DESC)
  WHERE status = 'settled';
CREATE INDEX idx_task_code_submissions_settled_reporting
  ON task_code_submissions(settled_at DESC, id DESC)
  WHERE status = 'settled';
CREATE UNIQUE INDEX idx_task_code_submissions_decision_idempotency_key ON task_code_submissions(decision_idempotency_key) WHERE decision_idempotency_key IS NOT NULL;
ALTER TABLE task_code_windows ADD FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON UPDATE NO ACTION ON DELETE CASCADE;
CREATE UNIQUE INDEX idx_task_code_windows_one_active_per_merchant
  ON task_code_windows(merchant_id)
  WHERE status = 'active';
ALTER TABLE user_growth_balances ADD FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE user_resources ADD FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE CASCADE;
ALTER TABLE users ADD FOREIGN KEY (account_id) REFERENCES accounts(id) ON UPDATE NO ACTION ON DELETE NO ACTION;
INSERT INTO schema_migrations VALUES (1,'initial_core_economy_schema',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (2,'core_economy_integrity_constraints',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (3,'resource_ledger_growth_integrity',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (4,'level_runtime_integrity',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (5,'admin_economy_settings_management',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (6,'mvp_task_code_thin_slice',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (7,'task_code_submission_decisions',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (8,'finalized_core_economy_rules',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (9,'finalized_star_settlement_snapshot',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (10,'task_code_submission_settlement_links',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (11,'player_event_queue',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (12,'merchant_brand_branch_model',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (13,'nullable_branch_application_reference',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (14,'canonical_account_identities',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (15,'merchant_membership_scope_exclusivity',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (16,'merchant_invitation_sessions',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (17,'canonical_reporting_timestamps',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (18,'task_code_reporting_scope_snapshots',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (19,'platform_operator_rbac',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (20,'platform_operator_invitation_support',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (21,'platform_operator_status_transitions',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (22,'platform_operator_role_transitions',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (23,'player_identity_and_session',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (24,'knowledge_card_reward_persistence',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (25,'unified_knowledge_daily_rewards',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (26,'resident_non_merchant_mission_claim_authority',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
INSERT INTO schema_migrations VALUES (27,'reduced_motion_durable_persistence',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'));
COMMIT;
