import { z } from 'zod';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const JobStateSchema = z.enum([
  'created',
  'queued',
  'claimed',
  'running',
  'submitted',
  'accepted',
  'rejected',
  'expired',
  'disputed',
  'settled',
  'rework',
]);
export type JobState = z.infer<typeof JobStateSchema>;

export const MilestoneTypeSchema = z.enum(['brief', 'tasks', 'scaffold', 'review']);
export type MilestoneType = z.infer<typeof MilestoneTypeSchema>;

export const TaskTypeSchema = z.enum(['analysis', 'coding', 'research', 'summarization']);
export type TaskType = z.infer<typeof TaskTypeSchema>;

export const QualityProfileSchema = z.enum(['fast', 'balanced', 'strict']);
export type QualityProfile = z.infer<typeof QualityProfileSchema>;

export const TrustTierSchema = z.enum(['T0', 'T1', 'T2', 'T3']);
export type TrustTier = z.infer<typeof TrustTierSchema>;

export const FundingStatusSchema = z.enum(['unfunded', 'funded', 'partially_funded', 'exhausted']);
export type FundingStatus = z.infer<typeof FundingStatusSchema>;

export const ScoreStatusSchema = z.enum(['pending', 'passed', 'failed', 'rework']);
export type ScoreStatus = z.infer<typeof ScoreStatusSchema>;

export const CaseStateSchema = z.enum([
  'open',
  'triaged',
  'investigating',
  'resolved',
  'closed',
]);
export type CaseState = z.infer<typeof CaseStateSchema>;

// ─── Domain Objects ───────────────────────────────────────────────────────────

export const IdeaSubmissionSchema = z.object({
  ideaId: z.string().uuid(),
  posterId: z.string(),
  title: z.string().min(1).max(200),
  prompt: z.string().min(10).max(10_000),
  targetArtifact: z.string().optional(),
  budgetUsd: z.number().positive(),
  fundingStatus: FundingStatusSchema.default('unfunded'),
  createdAt: z.string().datetime(),
  worldIdNullifierHash: z.string().optional(),
});
export type IdeaSubmission = z.infer<typeof IdeaSubmissionSchema>;

export const MilestoneSchema = z.object({
  milestoneId: z.string().uuid(),
  briefId: z.string().uuid(),
  milestoneType: MilestoneTypeSchema,
  title: z.string(),
  description: z.string(),
  budgetUsd: z.number().positive(),
  order: z.number().int().min(0),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const BuildBriefSchema = z.object({
  briefId: z.string().uuid(),
  ideaId: z.string().uuid(),
  summary: z.string(),
  milestones: z.array(MilestoneSchema),
  acceptanceRubric: z.record(z.string(), z.unknown()),
  dossierUri: z.string().url().optional(),
  generatedAt: z.string().datetime(),
});
export type BuildBrief = z.infer<typeof BuildBriefSchema>;

export const MilestoneJobSchema = z.object({
  jobId: z.string().uuid(),
  briefId: z.string().uuid(),
  milestoneId: z.string().uuid(),
  milestoneType: MilestoneTypeSchema,
  budgetUsd: z.number().positive(),
  requiredCapabilities: z.array(z.string()).default([]),
  acceptanceSchemaId: z.string().optional(),
  status: JobStateSchema.default('created'),
  leaseExpiry: z.string().datetime().optional(),
  activeClaimId: z.string().uuid().optional(),
  activeClaimWorkerId: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MilestoneJob = z.infer<typeof MilestoneJobSchema>;

export const WorkerClaimSchema = z.object({
  claimId: z.string().uuid(),
  jobId: z.string().uuid(),
  workerId: z.string(),
  claimedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  status: z.enum(['active', 'expired', 'submitted', 'cancelled']).default('active'),
});
export type WorkerClaim = z.infer<typeof WorkerClaimSchema>;

export const ScoreBreakdownSchema = z.object({
  scoreStatus: ScoreStatusSchema,
  checks: z.array(z.object({
    name: z.string(),
    passed: z.boolean(),
    detail: z.string().optional(),
  })),
  totalScore: z.number().min(0).max(100),
  rejectionReason: z.string().optional(),
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const AgentMetadataSchema = z.object({
  agentType: z.string(),   // e.g. "claude-code", "codex", "custom"
  agentVersion: z.string().optional(),
  operatorAddress: z.string().optional(), // EVM address of human operator
  fingerprint: z.string().optional(),     // keccak256 computed by broker
});
export type AgentMetadata = z.infer<typeof AgentMetadataSchema>;

export const ExecutionSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
  jobId: z.string().uuid(),
  workerId: z.string(),
  artifactUris: z.array(z.string()),
  traceUri: z.string().url().optional(),
  summary: z.string().max(5000).optional(),
  agentMetadata: AgentMetadataSchema.optional(),
  scoreBreakdown: ScoreBreakdownSchema.optional(),
  submittedAt: z.string().datetime(),
});
export type ExecutionSubmission = z.infer<typeof ExecutionSubmissionSchema>;

export const EscrowReleaseSchema = z.object({
  releaseId: z.string().uuid(),
  jobId: z.string().uuid(),
  ideaId: z.string().uuid(),
  milestoneId: z.string().uuid(),
  payer: z.string(),
  payee: z.string(),
  amountUsd: z.number().positive(),
  txHash: z.string().optional(),
  status: z.enum(['pending', 'confirmed', 'failed']).default('pending'),
  releasedAt: z.string().datetime().optional(),
});
export type EscrowRelease = z.infer<typeof EscrowReleaseSchema>;

// ─── API Request Schemas ──────────────────────────────────────────────────────

export const JobCreateRequestSchema = z.object({
  buyerId: z.string(),
  taskType: TaskTypeSchema,
  prompt: z.string().min(10).max(10_000),
  title: z.string().min(1).max(200),
  budgetUsdMax: z.number().positive(),
  slaMins: z.number().int().positive().default(45),
  attachments: z.array(z.object({
    uri: z.string(),
    kind: z.enum(['text', 'image', 'repo', 'pdf']),
  })).optional(),
  qualityProfile: QualityProfileSchema.optional().default('balanced'),
  worldIdProof: z.object({
    nullifierHash: z.string(),
    proof: z.string(),
    merkleRoot: z.string(),
    verificationLevel: z.string(),
  }).optional(),
});
export type JobCreateRequest = z.infer<typeof JobCreateRequestSchema>;

export const JobClaimRequestSchema = z.object({
  workerId: z.string(),
  agentMetadata: AgentMetadataSchema.optional(),
});
export type JobClaimRequest = z.infer<typeof JobClaimRequestSchema>;

export const JobResultSubmitRequestSchema = z.object({
  workerId: z.string(),
  claimId: z.string().uuid(),
  status: z.enum(['completed', 'failed', 'expired']),
  artifactUris: z.array(z.string().url()).min(1),
  summary: z.string().max(5000).optional(),
  traceUri: z.string().url().optional(),
  agentMetadata: AgentMetadataSchema.optional(),
  telemetry: z.object({
    inputTokens: z.number().int().optional(),
    outputTokens: z.number().int().optional(),
    toolCalls: z.number().int().optional(),
    durationMs: z.number().int().optional(),
  }).optional(),
});
export type JobResultSubmitRequest = z.infer<typeof JobResultSubmitRequestSchema>;

export const JobStateEventSchema = z.object({
  eventId: z.string().uuid(),
  jobId: z.string().uuid(),
  state: JobStateSchema,
  timestamp: z.string().datetime(),
  actorId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type JobStateEvent = z.infer<typeof JobStateEventSchema>;

// ─── Error Envelope ───────────────────────────────────────────────────────────

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

// ─── Agent Identity (ERC-8004 / on-chain registry) ───────────────────────────

export const AgentIdentitySchema = z.object({
  fingerprint: z.string(),       // keccak256 of (agentType+version+operatorAddress)
  agentType: z.string(),
  agentVersion: z.string().optional(),
  operatorAddress: z.string().optional(),
  tokenId: z.number().int().optional(),       // ERC token id after registration
  acceptedCount: z.number().int().default(0),
  avgScore: z.number().min(0).max(100).default(0),
  registeredAt: z.string().datetime().optional(),
});
export type AgentIdentity = z.infer<typeof AgentIdentitySchema>;

// ─── Settlement ───────────────────────────────────────────────────────────────

export const SettlementLineItemSchema = z.object({
  jobId: z.string(),
  workerId: z.string(),
  payoutUsd: z.number(),
  agentFingerprint: z.string().optional(),
});

export const SettlementBatchSchema = z.object({
  batchId: z.string(),
  totalJobs: z.number().int(),
  grossUsd: z.number(),
  platformFeeUsd: z.number(),
  netPayoutUsd: z.number(),
  lineItems: z.array(SettlementLineItemSchema),
});
export type SettlementBatch = z.infer<typeof SettlementBatchSchema>;
