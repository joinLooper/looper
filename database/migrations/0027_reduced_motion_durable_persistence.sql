-- Runtime migration authority is apps/api/src/database.ts migration v27.
-- This SQL artifact mirrors v27 for review and managed deployment tooling.
-- Resident-level durable presentation preference.
-- NULL means that the resident has not selected an account override.
ALTER TABLE users
  ADD COLUMN reduced_motion INTEGER
  CHECK (reduced_motion IS NULL OR reduced_motion IN (0, 1));

ALTER TABLE users
  ADD COLUMN reduced_motion_updated_at TEXT;
