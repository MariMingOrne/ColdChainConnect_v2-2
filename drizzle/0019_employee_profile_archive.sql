ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
