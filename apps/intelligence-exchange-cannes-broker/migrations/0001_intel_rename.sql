-- Migration: IXP → INTEL column rename
-- Generated: 2026-05-27
-- Apply: PGPASSWORD=iex psql -h localhost -U iex -d iex_cannes -f this_file.sql

BEGIN;

-- token_accounts
ALTER TABLE token_accounts
  RENAME COLUMN ixp_balance TO intel_balance;
ALTER TABLE token_accounts
  RENAME COLUMN ixp_reserved TO intel_reserved;

-- token_ledger_entries
ALTER TABLE token_ledger_entries
  RENAME COLUMN delta_ixp TO delta_intel;

-- idea_token_reserves
ALTER TABLE idea_token_reserves
  RENAME COLUMN avg_mint_price_usd_per_ixp TO avg_mint_price_usd_per_intel;
ALTER TABLE idea_token_reserves
  RENAME COLUMN ixp_minted TO intel_minted;
ALTER TABLE idea_token_reserves
  RENAME COLUMN ixp_reserved TO intel_reserved;
ALTER TABLE idea_token_reserves
  RENAME COLUMN ixp_spent TO intel_spent;
ALTER TABLE idea_token_reserves
  RENAME COLUMN ixp_protocol_fee TO intel_protocol_fee;

COMMIT;
