-- Migration 0002: Add consecutive_accepts for quality streak tracking
-- Also seeds referral table structure (in-memory for v1, persisted in future)

ALTER TABLE agent_identities
  ADD COLUMN IF NOT EXISTS consecutive_accepts INTEGER NOT NULL DEFAULT 0;
