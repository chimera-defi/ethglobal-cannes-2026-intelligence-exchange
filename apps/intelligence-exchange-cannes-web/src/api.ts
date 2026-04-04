const BROKER = import.meta.env.VITE_BROKER_URL ?? '/v1/cannes';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BROKER}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as T;
  if (!res.ok) {
    const err = (data as { error?: { message?: string } }).error;
    throw new Error(err?.message ?? `HTTP ${res.status}`);
  }
  return data;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BROKER}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
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

export interface WorldVerificationResponse {
  verificationToken: string;
  proof: {
    nullifierHash: string;
    proof: string;
    merkleRoot: string;
    verificationLevel: string;
  };
  worldResult: unknown;
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

export function getIdeas(posterId?: string) {
  const qs = posterId ? `?posterId=${encodeURIComponent(posterId)}` : '';
  return get<IdeaListResponse>(`/ideas${qs}`);
}

export function cancelIdea(ideaId: string) {
  return post<{ ideaId: string; cancelled: boolean }>(`/ideas/${ideaId}/cancel`, {});
}

export function createIdea(body: {
  buyerId: string;
  taskType: string;
  title: string;
  prompt: string;
  budgetUsdMax: number;
  posterAccountAddress?: string;
  worldVerificationToken?: string;
  worldIdProof?: { nullifierHash: string; proof: string; merkleRoot: string; verificationLevel: string };
}) {
  return post<IdeaResponse>('/ideas', body);
}

export function fundIdea(ideaId: string, txHash: string, amountUsd: number) {
  return post<{ ideaId: string; fundingStatus: string; txHash: string }>(`/ideas/${ideaId}/fund`, { txHash, amountUsd });
}

export function planIdea(ideaId: string) {
  return post<{ briefId: string; status: string }>(`/ideas/${ideaId}/plan`, {});
}

export function getIdea(ideaId: string) {
  return get<IdeaDetailResponse>(`/ideas/${ideaId}`);
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
  return get<JobResponse>(`/jobs/${jobId}`);
}

export function getJobs(status = 'queued') {
  return get<{ jobs: JobResponse['job'][]; count: number }>(`/jobs?status=${status}`);
}

export function claimJob(jobId: string, body: {
  workerId: string;
  agentMetadata?: {
    agentType?: string;
    agentVersion?: string;
    operatorAddress?: string;
    fingerprint?: string;
  };
}) {
  return post<{ claimId: string; expiresAt: string; skillMdUrl: string }>(`/jobs/${jobId}/claim`, body);
}

export function recordJobSpend(jobId: string, body: {
  workerId: string;
  vendor: string;
  purpose: string;
  amountUsd: number;
  settlementRail: 'demo' | 'arc';
  txHash?: string;
}) {
  return post<{ eventId: string; recordedAt: string; settlementRail: 'demo' | 'arc' }>(`/jobs/${jobId}/spend`, body);
}

// ─── Review ───────────────────────────────────────────────────────────────

export function acceptMilestone(ideaId: string, jobId: string, reviewerId: string) {
  return post<{ accepted: boolean }>(`/ideas/${ideaId}/accept`, { jobId, reviewerId });
}

export function rejectMilestone(ideaId: string, jobId: string, reviewerId: string, reason?: string) {
  return post<{ rework: boolean }>(`/ideas/${ideaId}/reject`, { jobId, reviewerId, reason });
}

export function getIntegrationsStatus() {
  return get<IntegrationsStatusResponse>('/integrations/status');
}

export function verifyWorldProof(idkitResponse: unknown, role: 'poster' | 'worker' | 'reviewer' = 'poster') {
  return post<WorldVerificationResponse>('/integrations/world/verify', {
    role,
    idkitResponse,
  });
}
