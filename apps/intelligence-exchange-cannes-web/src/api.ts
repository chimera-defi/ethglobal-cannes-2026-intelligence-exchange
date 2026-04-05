import type { AcceptedSubmissionAttestation, WorldIdProof } from 'intelligence-exchange-cannes-shared';

const BROKER = import.meta.env.VITE_BROKER_URL ?? '/v1/cannes';

async function post<T>(path: string, body: unknown, authed = false): Promise<T> {
  const res = await fetch(`${BROKER}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(authed ? { credentials: 'include' } : {}),
  });
  const data = await res.json() as T;
  if (!res.ok) {
    const err = (data as { error?: { message?: string } }).error;
    throw new Error(err?.message ?? `HTTP ${res.status}`);
  }
  return data;
}

async function get<T>(path: string, authed = false): Promise<T> {
  const res = await fetch(`${BROKER}${path}`, authed ? { credentials: 'include' } : {});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export interface AuthChallengeResponse {
  challengeId: string;
  message: string;
}

export type AccountRole = 'poster' | 'worker' | 'reviewer';

export interface SessionAccount {
  accountAddress: string;
  activeSessionId?: string;
  worldRoles: AccountRole[];
}

export interface WorldVerification {
  verificationId: string;
  accountAddress: string;
  role: AccountRole;
  nullifierHash: string;
  verificationLevel: string;
  verifiedAt: string;
}

export interface AuthMeResponse {
  account: SessionAccount | null;
  authorizations: AgentAuthorization[];
  worldVerifications: WorldVerification[];
}

export function createAuthChallenge(
  accountAddress: string,
  purpose: 'web_login' | 'worker_claim' | 'worker_submit' | 'worker_unclaim' = 'web_login',
  metadata?: { agentFingerprint?: string; jobId?: string }
) {
  return post<AuthChallengeResponse>('/auth/challenge', {
    accountAddress,
    purpose,
    ...metadata,
  });
}

export function verifyAuthChallenge(challengeId: string, accountAddress: string, signature: string) {
  return post<{ sessionId: string; accountAddress: string; expiresAt: string }>(
    '/auth/verify',
    { challengeId, accountAddress, signature }
  );
}

export function logout() {
  return post<{ loggedOut: boolean }>('/auth/logout', {}, true);
}

export function getMe() {
  return get<AuthMeResponse>('/auth/me', true);
}

// ─── World ID ─────────────────────────────────────────────────────────────

export interface WorldStatusResponse {
  accountAddress: string;
  verifications: WorldVerification[];
}

export function verifyWorldRole(role: AccountRole, proof: {
  nullifierHash: string;
  proof: string;
  merkleRoot: string;
  verificationLevel: string;
}) {
  return post<{ verification: WorldVerification }>('/world/verify', { role, proof }, true);
}

export function getWorldStatus() {
  return get<WorldStatusResponse>('/world/status', true);
}

// ─── Agents ───────────────────────────────────────────────────────────────

export interface AgentAuthorization {
  authorizationId: string;
  agentType: string;
  agentVersion: string;
  role: 'poster' | 'worker';
  permissionScope: string[];
  status: 'pending_registration' | 'active' | 'revoked';
  onChainTokenId?: number;
  fingerprint?: string;
  agentbookHumanId?: string;
  agentbookRegisteredAt?: string;
}

export function listAgentAuthorizations() {
  return get<{ authorizations: AgentAuthorization[] }>('/agents/authorizations', true);
}

export function createAgentAuthorization(body: {
  agentType: string;
  agentVersion: string;
  role: 'poster' | 'worker';
  permissionScope: string[];
}) {
  return post<{ authorization: AgentAuthorization }>('/agents/authorizations', body, true);
}

export function syncAgentRegistration(authorizationId: string, body: {
  txHash: string;
  contractAddress: string;
  blockNumber: number;
  payload: unknown;
  status: string;
  onChainTokenId?: number;
}) {
  return post<{ authorization: AgentAuthorization }>(
    `/agents/authorizations/${authorizationId}/sync-registration`,
    body,
    true
  );
}

export function syncWorldchainRole(role: 'poster' | 'worker' | 'reviewer') {
  return post<{
    sync: {
      txHash: string;
      blockNumber: number;
      contractAddress: string;
      explorerUrl: string;
    };
  }>('/agents/worldchain/sync-role', { role }, true);
}

export interface AgentKitStatusResponse {
  address: string;
  chainId: string;
  headerName: string;
  accessMode: 'free' | 'free-trial';
  freeTrialUses: number;
  statement: string;
  agentBookContractAddress: string;
  registered: boolean;
  humanId?: string | null;
  role: 'poster' | 'worker';
  worldchain: {
    chainId: number;
    identityGateAddress: string | null;
    agentRegistryAddress: string | null;
    explorerBaseUrl: string;
  };
  identityGate: {
    configured: boolean;
    contractAddress: string | null;
    verified: boolean;
  };
  authorization: AgentAuthorization | null;
  identity: {
    fingerprint: string;
    accountAddress?: string | null;
    agentType: string;
    agentVersion?: string | null;
    role?: string | null;
    onChainTokenId?: number | null;
    registrationTxHash?: string | null;
    agentbookHumanId?: string | null;
    agentbookRegisteredAt?: string | null;
    acceptedCount: number;
    avgScore: string;
    registeredAt?: string | null;
  } | null;
  registrationCommand: string;
  helperSkillCommand: string;
}

export function getAgentKitStatus(address: string, fingerprint?: string) {
  const params = new URLSearchParams({ address });
  if (fingerprint) params.set('fingerprint', fingerprint);
  return get<AgentKitStatusResponse>(`/agentkit/status?${params.toString()}`);
}

export function registerAgentBook(address: string) {
  return post<{ alreadyRegistered: boolean; humanId?: string | null; output?: string; success?: boolean; message?: string }>(
    '/agentkit/register-agentbook',
    { address },
    true,
  );
}

// ─── Chain Sync ───────────────────────────────────────────────────────────

export function syncChainReceipt(body: {
  eventType: 'milestone_reserved' | 'milestone_released' | 'accepted_submission_attested';
  txHash: string;
  subjectId: string;
  contractAddress?: string;
  blockNumber?: number;
  payload: Record<string, unknown>;
  status?: 'pending' | 'confirmed' | 'failed';
}) {
  return post<{ sync: { eventType: string } }>('/chain/sync', body, true);
}

// ─── Ideas ─────────────────────────────────────────────────────────────────

export interface IdeaResponse {
  ideaId: string;
  fundingStatus: string;
  worldIdVerified: boolean;
}

export interface IntegrationsStatusResponse {
  world: {
    mode: 'live' | 'demo';
    appId: string | null;
    rpId: string | null;
    action: string | null;
    environment: 'production' | 'staging';
    strict: boolean;
  };
  zeroG: {
    mode: 'live' | 'demo';
    rpcUrl: string;
    indexerRpcUrl: string;
    chainId: number;
  };
  arc: {
    rpcUrl: string;
    chainId: number;
    escrowContractAddress: string | null;
    usdcAddress: string | null;
  };
  worldchain: {
    rpcUrl: string;
    chainId: number;
    agentBookContractAddress: string;
    identityGateAddress: string | null;
    agentRegistryAddress: string | null;
    escrowAddress: string | null;
    explorerBaseUrl: string;
  };
  agentKit: {
    enabled: boolean;
    headerName: string;
    accessMode: 'free' | 'free-trial';
    freeTrialUses: number;
    statement: string;
    chainId: string;
    agentBookContractAddress: string;
  };
  zeroG: {
    mode: 'live' | 'demo';
    rpcUrl: string;
    indexerRpcUrl: string;
    chainId: number;
  };
}

export interface IdeaDetailResponse {
  idea: {
    ideaId: string;
    title: string;
    prompt: string;
    budgetUsd: string;
    fundingStatus: string;
    posterId: string;
    createdAt: string;
    escrowTxHash?: string;
    reservationTxHash?: string;
    releaseTxHash?: string;
    attestationTxHash?: string;
  };
  brief: {
    briefId: string;
    summary: string;
    dossierUri?: string;
  } | null;
  jobs: Array<{
    jobId: string;
    milestoneId: string;
    milestoneType: string;
    status: string;
    budgetUsd: string;
    leaseExpiry?: string | null;
    activeClaimWorkerId?: string | null;
  }>;
}

export interface IdeaListResponse {
  ideas: Array<{
    ideaId: string;
    title: string;
    budgetUsd: string;
    fundingStatus: string;
    posterId: string;
    createdAt: string;
  }>;
  count: number;
}

export function getIdeas(posterId?: string) {
  const query = posterId ? `?posterId=${encodeURIComponent(posterId)}` : '';
  return get<IdeaListResponse>(`/ideas${query}`, true);
}

export function cancelIdea(ideaId: string) {
  return post<{ ideaId: string; cancelled: boolean }>(`/ideas/${ideaId}/cancel`, {}, true);
}

export function createIdea(body: {
  taskType: string;
  title: string;
  prompt: string;
  budgetUsdMax: number;
  posterAccountAddress?: string;
  worldIdProof?: WorldIdProof;
  delegatedAgentAuthorizationId?: string;
}) {
  return post<IdeaResponse>('/ideas', body, true);
}

export function fundIdea(ideaId: string, txHash: string, amountUsd: number) {
  return post<{ ideaId: string; fundingStatus: string; txHash: string }>(
    `/ideas/${ideaId}/fund`,
    { txHash, amountUsd },
    true
  );
}

export function planIdea(ideaId: string) {
  return post<{ briefId: string; status: string }>(`/ideas/${ideaId}/plan`, {}, true);
}

export function getIdea(ideaId: string) {
  return get<IdeaDetailResponse>(`/ideas/${ideaId}`, true);
}

// ─── Jobs ──────────────────────────────────────────────────────────────────

export interface SubmissionDetail {
  submissionId: string;
  artifactUri: string;
  summary: string;
  submittedAt: string;
  scoreBreakdown?: SubmissionResponse['scoreBreakdown'];
}

export interface JobResponse {
  job: {
    jobId: string;
    milestoneId: string;
    milestoneType: string;
    status: string;
    budgetUsd: string;
    activeClaimId?: string | null;
    activeClaimWorkerId?: string | null;
    leaseExpiry?: string | null;
    briefId: string;
    ideaId: string;
    posterId?: string | null;
    skillMdUrl?: string;
    submission?: SubmissionDetail;
  };
  spendEvents: Array<{
    eventId: string;
    workerId: string;
    vendor: string;
    purpose: string;
    amountUsd: string;
    settlementRail: 'demo' | 'arc';
    txHash?: string | null;
    createdAt: string;
  }>;
  latestSubmission: {
    submissionId: string;
    artifactUris: string[];
    summary?: string | null;
    accountAddress?: string | null;
    agentFingerprint?: string | null;
    scoreStatus?: string | null;
    scoreBreakdown?: SubmissionResponse['scoreBreakdown'] | null;
    submittedAt: string;
  } | null;
  latestAttestation: AcceptedSubmissionAttestation | null;
}

export interface SubmissionResponse {
  submissionId: string;
  scoreBreakdown: {
    scoreStatus: string;
    totalScore: number;
    checks: Array<{ name: string; passed: boolean; detail?: string }>;
    rejectionReason?: string;
  };
}

export function getJob(jobId: string) {
  return get<JobResponse>(`/jobs/${jobId}`, true);
}

export function getJobs(status = 'queued') {
  return get<{ jobs: JobResponse['job'][]; count: number }>(`/jobs?status=${status}`, true);
}

export interface JobBoardMilestone {
  jobId: string;
  milestoneId: string;
  milestoneType: string;
  title: string;
  description: string;
  skillMdUrl: string;
  status: string;
  budgetUsd: string;
  leaseExpiry?: string | null;
  activeClaimId?: string | null;
  activeClaimWorkerId?: string | null;
  activeClaimAgentFingerprint?: string | null;
  latestSubmission: {
    submissionId: string;
    artifactUris: string[];
    summary?: string | null;
    submittedAt: string;
    accountAddress?: string | null;
    agentFingerprint?: string | null;
    scoreStatus?: string | null;
  } | null;
  order: number;
}

export interface JobBoardGroup {
  briefId: string;
  ideaId: string;
  title: string;
  prompt: string;
  posterId: string;
  budgetUsd: string;
  briefSummary: string;
  generatedAt: string;
  matchingMilestoneCount: number;
  milestones: JobBoardMilestone[];
}

export function getJobBoard(status = 'queued') {
  return get<{ groups: JobBoardGroup[]; count: number }>(
    `/jobs?status=${status}&view=grouped`,
    true
  );
}

export async function getJobsByStatuses(statuses: string[]) {
  const results = await Promise.all(statuses.map((status) => getJobs(status)));
  const jobs = results.flatMap((result) => result.jobs);
  return { jobs, count: jobs.length };
}

export interface SignedAction {
  accountAddress: string;
  agentFingerprint: string;
  challengeId: string;
  signature: string;
}

export interface JobSubmissionInput {
  claimId: string;
  artifactUris: string[];
  summary?: string;
  traceUri?: string;
  status?: 'completed' | 'failed' | 'expired';
}

export function claimJob(jobId: string, signedAction: SignedAction) {
  return post<{ claimId: string; expiresAt: string; skillMdUrl: string }>(
    `/jobs/${jobId}/claim`,
    { signedAction },
    true
  );
}

export function claimJobDemo(jobId: string, body: {
  workerId: string;
  agentMetadata?: {
    agentType?: string;
    agentVersion?: string;
    operatorAddress?: string;
    fingerprint?: string;
  };
}) {
  return post<{ claimId: string; expiresAt: string; skillMdUrl: string }>(
    `/jobs/${jobId}/claim`,
    body
  );
}

export function submitJob(jobId: string, submission: JobSubmissionInput, signedAction: SignedAction) {
  return post<SubmissionResponse>(
    `/jobs/${jobId}/submit`,
    { ...submission, signedAction },
    true
  );
}

export function submitJobDemo(jobId: string, body: JobSubmissionInput & {
  workerId: string;
  agentMetadata?: {
    agentType?: string;
    agentVersion?: string;
    operatorAddress?: string;
    fingerprint?: string;
  };
}) {
  return post<SubmissionResponse>(
    `/jobs/${jobId}/submit`,
    body
  );
}

export function unclaimJob(jobId: string, signedAction: SignedAction) {
  return post<{ unclaimed: boolean; status: string; jobId: string; skillMdUrl: string }>(
    `/jobs/${jobId}/unclaim`,
    { signedAction },
    true
  );
}

export function unclaimJobDemo(jobId: string, body: {
  workerId: string;
  agentMetadata?: {
    agentType?: string;
    agentVersion?: string;
    operatorAddress?: string;
    fingerprint?: string;
  };
}) {
  return post<{ unclaimed: boolean; status: string; jobId: string; skillMdUrl: string }>(
    `/jobs/${jobId}/unclaim`,
    body
  );
}

// ─── Review ───────────────────────────────────────────────────────────────

export function acceptMilestone(ideaId: string, jobId: string) {
  return post<{ accepted: boolean; attestation: AcceptedSubmissionAttestation }>(
    `/ideas/${ideaId}/accept`,
    { jobId },
    true
  );
}

export function rejectMilestone(ideaId: string, jobId: string, reason?: string) {
  return post<{ rework: boolean }>(`/ideas/${ideaId}/reject`, { jobId, reason }, true);
}

// ─── Integrations ──────────────────────────────────────────────────────────

export function getIntegrationsStatus() {
  return get<IntegrationsStatusResponse>('/integrations/status');
}

// ─── Arc Escrow (Prize 1) ──────────────────────────────────────────────────

export interface ArcStatusResponse {
  status: {
    configured: boolean;
    rpcUrl: string;
    chainId: number;
    isTestnet: boolean;
    escrowContractAddress: string | null;
    usdcAddress: string;
    hasPrivateKey: boolean;
    explorerUrl: string;
    faucetUrl: string;
  };
  escrowConfig: {
    platformFeeBps: number;
    platformFeePercent: number;
    reviewTimeout: number;
    disputeWindow: number;
    usdcAddress: string;
  } | null;
  prize1Criteria: {
    conditionalEscrow: boolean;
    disputeMechanism: boolean;
    automaticRelease: boolean;
    programmableVesting: boolean;
    usdcNative: boolean;
    platformFeeSplit: boolean;
  };
}

export interface ArcConfigResponse {
  configured: boolean;
  chainId: number;
  isTestnet: boolean;
  rpcUrl: string;
  contracts: {
    advancedEscrow: string | null;
    usdc: string;
  };
  explorer: {
    baseUrl: string;
    txUrl: string;
    addressUrl: string;
  };
  faucets?: {
    circle: string;
  };
  usdc: {
    decimals: number;
    symbol: string;
  };
}

export interface ArcIdeaBalanceResponse {
  ideaId: string;
  ideaIdHash: string;
  available: string;
  availableFormatted: string;
  totalFunded: string;
  totalFundedFormatted: string;
  platformFeesReserved: string;
  platformFeesFormatted: string;
}

export interface ArcJobEscrowResponse {
  jobId: string;
  milestoneId: string;
  milestoneIdHash: string;
  status: {
    code: number;
    name: string;
  };
  onChain: {
    ideaId: string;
    amount: string;
    amountFormatted: string;
    worker: string;
    reviewer: string;
    submittedAt: number;
    reviewStartedAt: number;
    approvedAt: number;
    submissionHash: string;
    attestationHash: string;
    releasedAmount: string;
    releasedFormatted: string;
  } | null;
  vesting: {
    totalAmount: string;
    releasedAmount: string;
    releasableNow: string;
    releasableFormatted: string;
    startTime: number;
    cliff: number;
    duration: number;
    isLinear: boolean;
    progress: number;
  } | null;
  dispute: {
    disputant: string;
    reasonHash: string;
    raisedAt: number;
    resolutionDeadline: number;
    resolution: string;
    resolved: boolean;
    resolver: string;
    canAutoResolve: boolean;
  } | null;
  actions: {
    canAutoRelease: boolean;
    canAutoResolve: boolean;
  };
}

export interface ArcVestingProgressResponse {
  jobId: string;
  milestoneId: string;
  totalAmount: string;
  totalFormatted: string;
  releasedAmount: string;
  releasedFormatted: string;
  releasableNow: string;
  releasableFormatted: string;
  remaining: string;
  remainingFormatted: string;
  schedule: {
    startTime: number;
    cliff: number;
    duration: number;
    isLinear: boolean;
    elapsed: number;
    percentVested: number;
  };
}

export interface ArcTransactionData {
  to: string;
  data: string;
  value: string;
  description: string;
}

export interface ArcFundIdeaTxResponse {
  ideaId: string;
  amount: string;
  amountUSDC: string;
  platformFee: string;
  platformFeeFormatted: string;
  totalRequired: string;
  totalFormatted: string;
  transactions: ArcTransactionData[];
}

export interface ArcReserveMilestoneTxResponse {
  ideaId: string;
  milestoneId: string;
  amount: string;
  amountUSDC: string;
  vesting: {
    duration: number;
    cliff: number;
    linear: boolean;
  };
  transaction: ArcTransactionData;
}

export function getArcStatus() {
  return get<ArcStatusResponse>('/arc/status');
}

export function getArcConfig() {
  return get<ArcConfigResponse>('/arc/config');
}

export function getArcIdeaBalance(ideaId: string) {
  return get<ArcIdeaBalanceResponse>(`/arc/ideas/${ideaId}/balance`);
}

export function getArcJobEscrow(jobId: string) {
  return get<ArcJobEscrowResponse>(`/arc/jobs/${jobId}/escrow`);
}

export function getArcVestingProgress(jobId: string) {
  return get<ArcVestingProgressResponse>(`/arc/jobs/${jobId}/vesting`);
}

// Transaction builders
export function buildArcFundIdeaTx(ideaId: string, amount: string) {
  return post<ArcFundIdeaTxResponse>('/arc/tx/fund-idea', { ideaId, amount }, true);
}

export function buildArcReserveMilestoneTx(body: {
  ideaId: string;
  milestoneId: string;
  amount: string;
  vestingDuration?: number;
  vestingCliff?: number;
  linearVesting?: boolean;
}) {
  return post<ArcReserveMilestoneTxResponse>('/arc/tx/reserve-milestone', body, true);
}

export function buildArcSubmitMilestoneTx(jobId: string, submissionHash: string) {
  return post<{ jobId: string; milestoneId: string; submissionHash: string; transaction: ArcTransactionData }>(
    '/arc/tx/submit-milestone',
    { jobId, submissionHash },
    true
  );
}

export function buildArcStartReviewTx(jobId: string) {
  return post<{ jobId: string; milestoneId: string; transaction: ArcTransactionData }>(
    '/arc/tx/start-review',
    { jobId },
    true
  );
}

export function buildArcReviewMilestoneTx(body: {
  jobId: string;
  attestationHash: string;
  action: 'approve' | 'reject' | 'dispute';
  disputeReasonHash?: string;
}) {
  return post<{ jobId: string; action: string; transaction?: ArcTransactionData; message?: string }>(
    '/arc/tx/review-milestone',
    body,
    true
  );
}

export function buildArcReleaseMilestoneTx(jobId: string, autoRelease = false) {
  return post<{ jobId: string; milestoneId: string; autoRelease: boolean; transaction: ArcTransactionData }>(
    '/arc/tx/release-milestone',
    { jobId, autoRelease },
    true
  );
}
