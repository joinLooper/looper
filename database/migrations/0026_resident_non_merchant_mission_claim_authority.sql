-- Runtime migration authority is apps/api/src/database.ts migration v26.
-- This SQL artifact mirrors the v26 schema for review and managed deployment tooling.

CREATE TABLE IF NOT EXISTS resident_mission_instances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL CHECK (mission_id = 'resident-daily-core-tree-check'),
  business_date TEXT NOT NULL CHECK (business_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  state TEXT NOT NULL CHECK (state IN ('AVAILABLE', 'IN_PROGRESS', 'COMPLETED', 'CLAIMABLE', 'CLAIM_PENDING', 'CLAIMED')),
  completion_state TEXT NOT NULL CHECK (completion_state IN ('PENDING', 'COMPLETED')),
  completion_truth TEXT NOT NULL CHECK (completion_truth = 'core_tree_world_interaction_opened'),
  completed_at TEXT,
  claim_state TEXT NOT NULL CHECK (claim_state IN ('NOT_CLAIMABLE', 'CLAIMABLE', 'CLAIM_PENDING', 'CLAIMED')),
  claimed_at TEXT,
  reward_event_id TEXT UNIQUE REFERENCES reward_events(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_resident_mission_instances_user_date
  ON resident_mission_instances(user_id, business_date, mission_id);

CREATE TABLE IF NOT EXISTS resident_mission_claim_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_instance_id TEXT NOT NULL REFERENCES resident_mission_instances(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('REQUEST', 'BACKEND_SUCCESS', 'FAILURE')),
  reward_event_id TEXT UNIQUE REFERENCES reward_events(id),
  result_json TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (user_id, idempotency_key),
  CHECK (
    (status = 'BACKEND_SUCCESS' AND reward_event_id IS NOT NULL AND result_json IS NOT NULL AND completed_at IS NOT NULL)
    OR (status <> 'BACKEND_SUCCESS' AND reward_event_id IS NULL AND result_json IS NULL AND completed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_resident_mission_claim_requests_instance
  ON resident_mission_claim_requests(mission_instance_id, status);
