-- Archived accounts can't sign in and are hidden from the default account list.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
