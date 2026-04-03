import { pgTable, text, timestamp, numeric, integer, boolean, jsonb, uuid } from 'drizzle-orm/pg-core';

// ─── Ideas ───────────────────────────────────────────────────────────────────

export const ideas = pgTable('ideas', {
  ideaId: text('idea_id').primaryKey(),
  posterId: text('poster_id').notNull(),
  title: text('title').notNull(),
  prompt: text('prompt').notNull(),
  targetArtifact: text('target_artifact'),
  budgetUsd: numeric('budget_usd', { precision: 10, scale: 2 }).notNull(),
  fundingStatus: text('funding_status').notNull().default('unfunded'),
  worldIdNullifierHash: text('world_id_nullifier_hash'),
  escrowTxHash: text('escrow_tx_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Build Briefs ─────────────────────────────────────────────────────────────

export const briefs = pgTable('briefs', {
  briefId: text('brief_id').primaryKey(),
  ideaId: text('idea_id').notNull().references(() => ideas.ideaId),
  summary: text('summary').notNull(),
  acceptanceRubric: jsonb('acceptance_rubric').notNull().default({}),
  dossierUri: text('dossier_uri'),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Milestones ───────────────────────────────────────────────────────────────

export const milestones = pgTable('milestones', {
  milestoneId: text('milestone_id').primaryKey(),
  briefId: text('brief_id').notNull().references(() => briefs.briefId),
  ideaId: text('idea_id').notNull(),
  milestoneType: text('milestone_type').notNull(), // brief | tasks | scaffold | review
  title: text('title').notNull(),
  description: text('description').notNull(),
  budgetUsd: numeric('budget_usd', { precision: 10, scale: 2 }).notNull(),
  order: integer('order').notNull().default(0),
});

// ─── Jobs (milestone job queue entries) ──────────────────────────────────────

export const jobs = pgTable('jobs', {
  jobId: text('job_id').primaryKey(),
  milestoneId: text('milestone_id').notNull().references(() => milestones.milestoneId),
  briefId: text('brief_id').notNull(),
  ideaId: text('idea_id').notNull(),
  milestoneType: text('milestone_type').notNull(),
  budgetUsd: numeric('budget_usd', { precision: 10, scale: 2 }).notNull(),
  status: text('status').notNull().default('created'),
  leaseExpiry: timestamp('lease_expiry', { withTimezone: true }),
  activeClaimId: text('active_claim_id'),
  activeClaimWorkerId: text('active_claim_worker_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Job Events (append-only ledger — NEVER UPDATE, NEVER DELETE) ─────────────

export const jobEvents = pgTable('job_events', {
  eventId: text('event_id').primaryKey(),
  jobId: text('job_id').notNull().references(() => jobs.jobId),
  state: text('state').notNull(),
  actorId: text('actor_id'),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Claims ───────────────────────────────────────────────────────────────────

export const claims = pgTable('claims', {
  claimId: text('claim_id').primaryKey(),
  jobId: text('job_id').notNull().references(() => jobs.jobId),
  workerId: text('worker_id').notNull(),
  agentMetadata: jsonb('agent_metadata'),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('active'), // active | expired | submitted | cancelled
});

// ─── Submissions ──────────────────────────────────────────────────────────────

export const submissions = pgTable('submissions', {
  submissionId: text('submission_id').primaryKey(),
  jobId: text('job_id').notNull().references(() => jobs.jobId),
  claimId: text('claim_id').notNull().references(() => claims.claimId),
  workerId: text('worker_id').notNull(),
  artifactUris: jsonb('artifact_uris').notNull().default([]),
  traceUri: text('trace_uri'),
  summary: text('summary'),
  agentMetadata: jsonb('agent_metadata'),
  scoreBreakdown: jsonb('score_breakdown'),
  scoreStatus: text('score_status').default('pending'), // pending | passed | failed | rework
  telemetry: jsonb('telemetry'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Agent Identities (mirrors on-chain registry) ─────────────────────────────

export const agentIdentities = pgTable('agent_identities', {
  fingerprint: text('fingerprint').primaryKey(),
  agentType: text('agent_type').notNull(),
  agentVersion: text('agent_version'),
  operatorAddress: text('operator_address'),
  onChainTokenId: integer('on_chain_token_id'),
  acceptedCount: integer('accepted_count').notNull().default(0),
  avgScore: numeric('avg_score', { precision: 5, scale: 2 }).notNull().default('0'),
  registeredAt: timestamp('registered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Escrow Releases ─────────────────────────────────────────────────────────

export const escrowReleases = pgTable('escrow_releases', {
  releaseId: text('release_id').primaryKey(),
  jobId: text('job_id').notNull().references(() => jobs.jobId),
  ideaId: text('idea_id').notNull(),
  milestoneId: text('milestone_id').notNull(),
  payer: text('payer').notNull(),
  payee: text('payee').notNull(),
  amountUsd: numeric('amount_usd', { precision: 10, scale: 2 }).notNull(),
  txHash: text('tx_hash'),
  status: text('status').notNull().default('pending'), // pending | confirmed | failed
  releasedAt: timestamp('released_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
