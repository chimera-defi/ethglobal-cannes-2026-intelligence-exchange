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
  purpose: 'web_login' | 'worker_claim' | 'worker_submit' = 'web_login',
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
  onChainTokenId?: string;
  fingerprint?: string;
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
  onChainTokenId?: string;
}) {
  return post<{ authorization: AgentAuthorization }>(
    `/agents/authorizations/${authorizationId}/sync-registration`,
    body,
    true
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
  arc: {
    rpcUrl: string;
    chainId: number;
    escrowContractAddress: string | null;
    usdcAddress: string | null;
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
    milestoneType: string;
    status: string;
    budgetUsd: string;
    leaseExpiry?: string;
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

export function getIdeas() {
  return get<IdeaListResponse>('/ideas', true);
}

export function cancelIdea(ideaId: string) {
  return post<{ ideaId: string; cancelled: boolean }>(`/ideas/${ideaId}/cancel`, {}, true);
}

export function createIdea(body: {
  taskType: string;
  title: string;
  prompt: string;
  budgetUsdMax: number;
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
    milestoneType: string;
    status: string;
    budgetUsd: string;
    activeClaimWorkerId?: string;
    leaseExpiry?: string;
    briefId: string;
    ideaId: string;
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
    agentFingerprint?: string | null;
    scoreStatus?: string | null;
    scoreBreakdown?: SubmissionResponse['scoreBreakdown'] | null;
    submittedAt: string;
  } | null;
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

export interface SignedAction {
  accountAddress: string;
  agentFingerprint: string;
  challengeId: string;
  signature: string;
}

export function claimJob(jobId: string, signedAction: SignedAction) {
  return post<{ claimId: string; expiresAt: string; skillMdUrl: string }>(
    `/jobs/${jobId}/claim`,
    { signedAction },
    true
  );
}

// ─── Review ───────────────────────────────────────────────────────────────

export function acceptMilestone(ideaId: string, jobId: string) {
  return post<{ accepted: boolean; attestationPayload?: unknown }>(`/ideas/${ideaId}/accept`, { jobId }, true);
}

export function rejectMilestone(ideaId: string, jobId: string, reason?: string) {
  return post<{ rework: boolean }>(`/ideas/${ideaId}/reject`, { jobId, reason }, true);
}

// ─── Integrations ──────────────────────────────────────────────────────────

export function getIntegrationsStatus() {
  return get<IntegrationsStatusResponse>('/integrations/status');
}
