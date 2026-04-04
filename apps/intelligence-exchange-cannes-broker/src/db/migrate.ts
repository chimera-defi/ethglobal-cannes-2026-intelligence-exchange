import { sql } from './client';

// Idempotent schema creation — run on startup and in seed script.
// Append-only discipline: job_events table must NEVER be updated or deleted.
export async function migrate() {
  await sql`
    CREATE TABLE IF NOT EXISTS accounts (
      account_address TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS auth_challenges (
      challenge_id UUID PRIMARY KEY,
      account_address TEXT NOT NULL,
      purpose TEXT NOT NULL,
      nonce TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}',
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS web_sessions (
      session_id UUID PRIMARY KEY,
      account_address TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS world_verifications (
      verification_id UUID PRIMARY KEY,
      account_address TEXT NOT NULL,
      role TEXT NOT NULL,
      nullifier_hash TEXT NOT NULL,
      verification_level TEXT NOT NULL,
      verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS agent_authorizations (
      authorization_id UUID PRIMARY KEY,
      account_address TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      agent_version TEXT,
      role TEXT NOT NULL,
      permission_scope JSONB NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending_registration',
      on_chain_token_id INTEGER,
      registration_tx_hash TEXT,
      agentbook_human_id TEXT,
      agentbook_registered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      activated_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS ideas (
      idea_id TEXT PRIMARY KEY,
      poster_id TEXT NOT NULL,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      target_artifact TEXT,
      budget_usd NUMERIC(10,2) NOT NULL,
      funding_status TEXT NOT NULL DEFAULT 'unfunded',
      world_id_nullifier_hash TEXT,
      escrow_tx_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS briefs (
      brief_id TEXT PRIMARY KEY,
      idea_id TEXT NOT NULL REFERENCES ideas(idea_id),
      summary TEXT NOT NULL,
      acceptance_rubric JSONB NOT NULL DEFAULT '{}',
      dossier_uri TEXT,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS milestones (
      milestone_id TEXT PRIMARY KEY,
      brief_id TEXT NOT NULL REFERENCES briefs(brief_id),
      idea_id TEXT NOT NULL,
      milestone_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      budget_usd NUMERIC(10,2) NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS jobs (
      job_id TEXT PRIMARY KEY,
      milestone_id TEXT NOT NULL REFERENCES milestones(milestone_id),
      brief_id TEXT NOT NULL,
      idea_id TEXT NOT NULL,
      milestone_type TEXT NOT NULL,
      budget_usd NUMERIC(10,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'created',
      lease_expiry TIMESTAMPTZ,
      active_claim_id TEXT,
      active_claim_worker_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // APPEND-ONLY: Do NOT add UPDATE or DELETE operations on this table.
  await sql`
    CREATE TABLE IF NOT EXISTS job_events (
      event_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(job_id),
      state TEXT NOT NULL,
      actor_id TEXT,
      payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS claims (
      claim_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(job_id),
      worker_id TEXT NOT NULL,
      account_address TEXT,
      agent_fingerprint TEXT,
      agent_metadata JSONB,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS submissions (
      submission_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(job_id),
      claim_id TEXT NOT NULL REFERENCES claims(claim_id),
      worker_id TEXT NOT NULL,
      account_address TEXT,
      agent_fingerprint TEXT,
      artifact_uris JSONB NOT NULL DEFAULT '[]',
      trace_uri TEXT,
      summary TEXT,
      agent_metadata JSONB,
      score_breakdown JSONB,
      score_status TEXT DEFAULT 'pending',
      telemetry JSONB,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS agent_spend_events (
      event_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(job_id),
      worker_id TEXT NOT NULL,
      vendor TEXT NOT NULL,
      purpose TEXT NOT NULL,
      amount_usd NUMERIC(10,4) NOT NULL,
      settlement_rail TEXT NOT NULL DEFAULT 'demo',
      tx_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS agent_identities (
      fingerprint TEXT PRIMARY KEY,
      account_address TEXT,
      agent_type TEXT NOT NULL,
      agent_version TEXT,
      role TEXT,
      permissions_hash TEXT,
      operator_address TEXT,
      on_chain_token_id INTEGER,
      registration_tx_hash TEXT,
      agentbook_human_id TEXT,
      agentbook_registered_at TIMESTAMPTZ,
      accepted_count INTEGER NOT NULL DEFAULT 0,
      avg_score NUMERIC(5,2) NOT NULL DEFAULT 0,
      registered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS agentkit_usage_counters (
      endpoint TEXT NOT NULL,
      human_id TEXT NOT NULL,
      uses INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (endpoint, human_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS agentkit_nonces (
      nonce TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS escrow_releases (
      release_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(job_id),
      idea_id TEXT NOT NULL,
      milestone_id TEXT NOT NULL,
      payer TEXT NOT NULL,
      payee TEXT NOT NULL,
      amount_usd NUMERIC(10,2) NOT NULL,
      tx_hash TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      released_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS chain_syncs (
      sync_id UUID PRIMARY KEY,
      event_type TEXT NOT NULL,
      tx_hash TEXT NOT NULL,
      contract_address TEXT,
      block_number INTEGER,
      subject_id TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'confirmed',
      confirmed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS chain_events (
      event_id UUID PRIMARY KEY,
      sync_id UUID,
      event_type TEXT NOT NULL,
      tx_hash TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS accepted_attestations (
      attestation_id UUID PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(job_id),
      agent_fingerprint TEXT NOT NULL,
      score INTEGER NOT NULL,
      reviewer_address TEXT NOT NULL,
      payout_released BOOLEAN NOT NULL DEFAULT FALSE,
      attestor_address TEXT NOT NULL,
      signature TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Older local/test databases used a different World verification shape.
  // Normalize it in place so current routes and indexes can rely on account+role lookups.
  await sql`ALTER TABLE world_verifications ADD COLUMN IF NOT EXISTS account_address TEXT`;
  await sql`ALTER TABLE world_verifications ADD COLUMN IF NOT EXISTS role TEXT`;
  await sql`ALTER TABLE world_verifications ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`;
  await sql`
    UPDATE world_verifications
    SET
      account_address = COALESCE(account_address, wallet_address),
      role = COALESCE(role, subject_id),
      verified_at = COALESCE(verified_at, created_at, NOW())
    WHERE account_address IS NULL OR role IS NULL OR verified_at IS NULL
  `.catch(() => undefined);
  await sql`ALTER TABLE world_verifications ALTER COLUMN account_address SET NOT NULL`.catch(() => undefined);
  await sql`ALTER TABLE world_verifications ALTER COLUMN role SET NOT NULL`.catch(() => undefined);
  await sql`ALTER TABLE world_verifications ALTER COLUMN verified_at SET NOT NULL`.catch(() => undefined);
  await sql`ALTER TABLE world_verifications ALTER COLUMN verified_at SET DEFAULT NOW()`.catch(() => undefined);
  await sql`ALTER TABLE world_verifications ALTER COLUMN subject_type DROP NOT NULL`.catch(() => undefined);
  await sql`ALTER TABLE world_verifications ALTER COLUMN subject_id DROP NOT NULL`.catch(() => undefined);

  await sql`ALTER TABLE claims ADD COLUMN IF NOT EXISTS account_address TEXT`;
  await sql`ALTER TABLE claims ADD COLUMN IF NOT EXISTS agent_fingerprint TEXT`;

  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS account_address TEXT`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS agent_fingerprint TEXT`;

  await sql`ALTER TABLE agent_identities ADD COLUMN IF NOT EXISTS account_address TEXT`;
  await sql`ALTER TABLE agent_identities ADD COLUMN IF NOT EXISTS role TEXT`;
  await sql`ALTER TABLE agent_identities ADD COLUMN IF NOT EXISTS permissions_hash TEXT`;
  await sql`ALTER TABLE agent_identities ADD COLUMN IF NOT EXISTS registration_tx_hash TEXT`;
  await sql`ALTER TABLE agent_identities ADD COLUMN IF NOT EXISTS agentbook_human_id TEXT`;
  await sql`ALTER TABLE agent_identities ADD COLUMN IF NOT EXISTS agentbook_registered_at TIMESTAMPTZ`;

  await sql`ALTER TABLE agent_authorizations ADD COLUMN IF NOT EXISTS agentbook_human_id TEXT`;
  await sql`ALTER TABLE agent_authorizations ADD COLUMN IF NOT EXISTS agentbook_registered_at TIMESTAMPTZ`;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS world_verifications_account_role_idx
    ON world_verifications (account_address, role)
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS world_verifications_nullifier_idx
    ON world_verifications (nullifier_hash)
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS chain_syncs_tx_event_idx
    ON chain_syncs (tx_hash, event_type)
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS agentkit_usage_counters_endpoint_human_idx
    ON agentkit_usage_counters (endpoint, human_id)
  `;

  console.log('✓ Database schema ready');
}

// Allow running directly: bun run src/db/migrate.ts
if (import.meta.main) {
  migrate().then(() => process.exit(0)).catch(console.error);
}
