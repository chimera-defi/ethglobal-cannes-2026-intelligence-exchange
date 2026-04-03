import { sql } from './client';

// Idempotent schema creation — run on startup and in seed script.
// Append-only discipline: job_events table must NEVER be updated or deleted.
export async function migrate() {
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
    CREATE TABLE IF NOT EXISTS agent_identities (
      fingerprint TEXT PRIMARY KEY,
      agent_type TEXT NOT NULL,
      agent_version TEXT,
      operator_address TEXT,
      on_chain_token_id INTEGER,
      accepted_count INTEGER NOT NULL DEFAULT 0,
      avg_score NUMERIC(5,2) NOT NULL DEFAULT 0,
      registered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS world_verifications (
      verification_id TEXT PRIMARY KEY,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      wallet_address TEXT,
      nullifier_hash TEXT NOT NULL UNIQUE,
      verification_level TEXT,
      provider TEXT NOT NULL DEFAULT 'world',
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

  console.log('✓ Database schema ready');
}

// Allow running directly: bun run src/db/migrate.ts
if (import.meta.main) {
  migrate().then(() => process.exit(0)).catch(console.error);
}
