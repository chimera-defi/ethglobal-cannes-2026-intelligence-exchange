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

export const AccountRoleSchema = z.enum(['poster', 'worker', 'reviewer']);
export type AccountRole = z.infer<typeof AccountRoleSchema>;

export const AgentRoleSchema = z.enum(['poster', 'worker']);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const AuthorizationStatusSchema = z.enum(['pending_registration', 'active', 'revoked']);
export type AuthorizationStatus = z.infer<typeof AuthorizationStatusSchema>;

export const ChallengePurposeSchema = z.enum(['web_login', 'worker_claim', 'worker_submit', 'worker_unclaim']);
export type ChallengePurpose = z.infer<typeof ChallengePurposeSchema>;

export const ChainEventTypeSchema = z.enum([
  'idea_funded',
  'milestone_reserved',
  'milestone_released',
  'agent_registered',
  'accepted_submission_attested',
]);
export type ChainEventType = z.infer<typeof ChainEventTypeSchema>;

export const ChainSyncStatusSchema = z.enum(['pending', 'confirmed', 'failed']);
export type ChainSyncStatus = z.infer<typeof ChainSyncStatusSchema>;

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

export const PermissionScopeSchema = z.array(z.string().min(1)).min(1);
export type PermissionScope = z.infer<typeof PermissionScopeSchema>;

export const WorldIdProofSchema = z.object({
  nullifierHash: z.string(),
  proof: z.string(),
  merkleRoot: z.string(),
  verificationLevel: z.string(),
});
export type WorldIdProof = z.infer<typeof WorldIdProofSchema>;

// ─── Domain Objects ───────────────────────────────────────────────────────────

export const AuthenticatedAccountSchema = z.object({
  accountAddress: z.string(),
  activeSessionId: z.string().uuid().optional(),
  worldRoles: z.array(AccountRoleSchema).default([]),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type AuthenticatedAccount = z.infer<typeof AuthenticatedAccountSchema>;

export const AuthChallengeSchema = z.object({
  challengeId: z.string().uuid(),
  accountAddress: z.string(),
  purpose: ChallengePurposeSchema,
  nonce: z.string(),
  message: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  expiresAt: z.string().datetime(),
  usedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime().optional(),
});
export type AuthChallenge = z.infer<typeof AuthChallengeSchema>;

export const WebSessionSchema = z.object({
  sessionId: z.string().uuid(),
  accountAddress: z.string(),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime().optional(),
});
export type WebSession = z.infer<typeof WebSessionSchema>;

export const WorldVerificationSchema = z.object({
  verificationId: z.string().uuid(),
  accountAddress: z.string(),
  role: AccountRoleSchema,
  nullifierHash: z.string(),
  verificationLevel: z.string(),
  verifiedAt: z.string().datetime(),
});
export type WorldVerification = z.infer<typeof WorldVerificationSchema>;

export const AgentAuthorizationSchema = z.object({
  authorizationId: z.string().uuid(),
  accountAddress: z.string(),
  fingerprint: z.string(),
  agentType: z.string(),
  agentVersion: z.string().optional(),
  role: AgentRoleSchema,
  permissionScope: PermissionScopeSchema,
  status: AuthorizationStatusSchema,
  onChainTokenId: z.number().int().optional(),
  registrationTxHash: z.string().optional(),
  agentbookHumanId: z.string().optional(),
  agentbookRegisteredAt: z.string().datetime().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  activatedAt: z.string().datetime().optional(),
  revokedAt: z.string().datetime().optional(),
});
export type AgentAuthorization = z.infer<typeof AgentAuthorizationSchema>;

export const SignedActionEnvelopeSchema = z.object({
  accountAddress: z.string(),
  agentFingerprint: z.string(),
  challengeId: z.string().uuid(),
  signature: z.string(),
});
export type SignedActionEnvelope = z.infer<typeof SignedActionEnvelopeSchema>;

export const ChainReceiptSyncSchema = z.object({
  syncId: z.string().uuid().optional(),
  eventType: ChainEventTypeSchema,
  txHash: z.string(),
  contractAddress: z.string().optional(),
  blockNumber: z.number().int().nonnegative().optional(),
  subjectId: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
  status: ChainSyncStatusSchema.default('confirmed'),
});
export type ChainReceiptSync = z.infer<typeof ChainReceiptSyncSchema>;

export const AcceptedSubmissionAttestationSchema = z.object({
  jobId: z.string(),
  jobIdHash: z.string().optional(),
  agentFingerprint: z.string(),
  score: z.number().int().min(0).max(100),
  reviewerAddress: z.string(),
  payoutReleased: z.boolean(),
  attestorAddress: z.string(),
  registryAddress: z.string().optional(),
  chainId: z.number().int().positive().optional(),
  signature: z.string().optional(),
  attestedAt: z.string().datetime().optional(),
});
export type AcceptedSubmissionAttestation = z.infer<typeof AcceptedSubmissionAttestationSchema>;

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
  delegatedAgentAuthorizationId: z.string().uuid().optional(),
  buyerId: z.string().optional(),
  posterAccountAddress: z.string().optional(),
  worldIdProof: WorldIdProofSchema.optional(),
  worldVerificationToken: z.string().optional(),
});
export type JobCreateRequest = z.infer<typeof JobCreateRequestSchema>;

export const DemoJobClaimRequestSchema = z.object({
  workerId: z.string(),
  agentMetadata: AgentMetadataSchema.optional(),
});
export type DemoJobClaimRequest = z.infer<typeof DemoJobClaimRequestSchema>;

export const SignedJobClaimRequestSchema = z.object({
  signedAction: SignedActionEnvelopeSchema,
});
export type SignedJobClaimRequest = z.infer<typeof SignedJobClaimRequestSchema>;

export const JobClaimRequestSchema = z.union([
  SignedJobClaimRequestSchema,
  DemoJobClaimRequestSchema,
]);
export type JobClaimRequest = z.infer<typeof JobClaimRequestSchema>;

export const DemoJobUnclaimRequestSchema = z.object({
  workerId: z.string(),
  agentMetadata: AgentMetadataSchema.optional(),
});
export type DemoJobUnclaimRequest = z.infer<typeof DemoJobUnclaimRequestSchema>;

export const SignedJobUnclaimRequestSchema = z.object({
  signedAction: SignedActionEnvelopeSchema,
});
export type SignedJobUnclaimRequest = z.infer<typeof SignedJobUnclaimRequestSchema>;

export const JobUnclaimRequestSchema = z.union([
  SignedJobUnclaimRequestSchema,
  DemoJobUnclaimRequestSchema,
]);
export type JobUnclaimRequest = z.infer<typeof JobUnclaimRequestSchema>;

const JobSubmissionFieldsSchema = z.object({
  claimId: z.string().uuid(),
  status: z.enum(['completed', 'failed', 'expired']),
  artifactUris: z.array(z.string().url()).min(1),
  summary: z.string().max(5000).optional(),
  traceUri: z.string().url().optional(),
  telemetry: z.object({
    inputTokens: z.number().int().optional(),
    outputTokens: z.number().int().optional(),
    toolCalls: z.number().int().optional(),
    durationMs: z.number().int().optional(),
  }).optional(),
});

export const SignedJobResultSubmitRequestSchema = JobSubmissionFieldsSchema.extend({
  signedAction: SignedActionEnvelopeSchema,
});
export type SignedJobResultSubmitRequest = z.infer<typeof SignedJobResultSubmitRequestSchema>;

export const DemoJobResultSubmitRequestSchema = JobSubmissionFieldsSchema.extend({
  workerId: z.string(),
  agentMetadata: AgentMetadataSchema.optional(),
});
export type DemoJobResultSubmitRequest = z.infer<typeof DemoJobResultSubmitRequestSchema>;

export const JobResultSubmitRequestSchema = z.union([
  SignedJobResultSubmitRequestSchema,
  DemoJobResultSubmitRequestSchema,
]);
export type JobResultSubmitRequest = z.infer<typeof JobResultSubmitRequestSchema>;

export const JobSpendCreateRequestSchema = z.object({
  workerId: z.string(),
  vendor: z.string().min(1).max(200),
  purpose: z.string().min(1).max(500),
  amountUsd: z.number().positive(),
  settlementRail: z.enum(['demo', 'arc']).default('demo'),
  txHash: z.string().optional(),
});
export type JobSpendCreateRequest = z.infer<typeof JobSpendCreateRequestSchema>;

export const JobStateEventSchema = z.object({
  eventId: z.string().uuid(),
  jobId: z.string().uuid(),
  state: JobStateSchema,
  timestamp: z.string().datetime(),
  actorId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type JobStateEvent = z.infer<typeof JobStateEventSchema>;

// ─── Auth / Identity API Schemas ──────────────────────────────────────────────

export const AuthChallengeRequestSchema = z.object({
  accountAddress: z.string(),
  purpose: ChallengePurposeSchema,
  agentFingerprint: z.string().optional(),
  jobId: z.string().optional(),
});
export type AuthChallengeRequest = z.infer<typeof AuthChallengeRequestSchema>;

export const AuthChallengeResponseSchema = AuthChallengeSchema.pick({
  challengeId: true,
  accountAddress: true,
  purpose: true,
  nonce: true,
  message: true,
  expiresAt: true,
});
export type AuthChallengeResponse = z.infer<typeof AuthChallengeResponseSchema>;

export const AuthVerifyRequestSchema = z.object({
  challengeId: z.string().uuid(),
  accountAddress: z.string(),
  signature: z.string(),
});
export type AuthVerifyRequest = z.infer<typeof AuthVerifyRequestSchema>;

export const MeResponseSchema = z.object({
  account: AuthenticatedAccountSchema.nullable(),
  authorizations: z.array(AgentAuthorizationSchema),
  worldVerifications: z.array(WorldVerificationSchema),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const WorldVerificationRequestSchema = z.object({
  role: AccountRoleSchema,
  proof: WorldIdProofSchema,
});
export type WorldVerificationRequest = z.infer<typeof WorldVerificationRequestSchema>;

export const WorldStatusResponseSchema = z.object({
  accountAddress: z.string(),
  verifications: z.array(WorldVerificationSchema),
});
export type WorldStatusResponse = z.infer<typeof WorldStatusResponseSchema>;

export const AgentAuthorizationCreateRequestSchema = z.object({
  agentType: z.string(),
  agentVersion: z.string().optional(),
  role: AgentRoleSchema,
  permissionScope: PermissionScopeSchema,
});
export type AgentAuthorizationCreateRequest = z.infer<typeof AgentAuthorizationCreateRequestSchema>;

export const AgentAuthorizationSyncRequestSchema = ChainReceiptSyncSchema.omit({
  eventType: true,
  subjectId: true,
}).extend({
  onChainTokenId: z.number().int().positive(),
});
export type AgentAuthorizationSyncRequest = z.infer<typeof AgentAuthorizationSyncRequestSchema>;

export const AcceptJobRequestSchema = z.object({
  jobId: z.string(),
});
export type AcceptJobRequest = z.infer<typeof AcceptJobRequestSchema>;

export const RejectJobRequestSchema = z.object({
  jobId: z.string(),
  reason: z.string().optional(),
});
export type RejectJobRequest = z.infer<typeof RejectJobRequestSchema>;

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
