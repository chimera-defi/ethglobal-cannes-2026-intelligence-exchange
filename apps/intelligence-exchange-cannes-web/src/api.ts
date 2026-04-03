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

export interface WorldVerificationResponse {
  subjectType: 'buyer' | 'worker';
  subjectId: string;
  walletAddress: string | null;
  nullifierHash: string | null;
  verificationLevel: string | null;
  verified: boolean;
  enforced: boolean;
  mode: string;
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

export interface BuyerIdeaDetail extends IdeaDetailResponse {
  idea: IdeaDetailResponse['idea'] & {
    statusBucket: 'active' | 'review' | 'completed' | 'cancelled';
  };
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
  worldIdProof?: { nullifierHash: string; proof: string; merkleRoot: string; verificationLevel: string };
}) {
  return post<IdeaResponse>('/ideas', body);
}

export function verifyWorldIdentity(body: {
  subjectType: 'buyer' | 'worker';
  subjectId: string;
  walletAddress?: string;
  worldIdProof: { nullifierHash: string; proof: string; merkleRoot: string; verificationLevel: string };
}) {
  return post<WorldVerificationResponse>('/identity/world/verify', body);
}

export function getWorldIdentityStatus(subjectType: 'buyer' | 'worker', subjectId: string) {
  const qs = new URLSearchParams({ subjectType, subjectId }).toString();
  return get<WorldVerificationResponse>(`/identity/world/status?${qs}`);
}

export function getIntegrationStatus() {
  return get<{
    world: { enforced: boolean; mode: string };
    zeroG: { mode: string };
    arc: { mode: string; chainId: number; escrowAddress: string; usdcAddress: string; localFaucet: boolean };
  }>('/integrations/status');
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

function classifyIdea(detail: IdeaDetailResponse): BuyerIdeaDetail['idea']['statusBucket'] {
  if (detail.idea.fundingStatus === 'cancelled') return 'cancelled';
  if (detail.jobs.some((job) => job.status === 'submitted')) return 'review';
  if (detail.jobs.length > 0 && detail.jobs.every((job) => job.status === 'accepted')) return 'completed';
  return 'active';
}

export async function getBuyerWorkspace(posterId: string) {
  const list = await getIdeas(posterId);
  const details = await Promise.all(
    list.ideas.map(async (idea) => {
      const detail = await getIdea(idea.ideaId);
      return {
        ...detail,
        idea: {
          ...detail.idea,
          statusBucket: classifyIdea(detail),
        },
      } satisfies BuyerIdeaDetail;
    }),
  );

  const activeIdeas = details.filter((detail) => detail.idea.statusBucket === 'active');
  const reviewIdeas = details.filter((detail) => detail.idea.statusBucket === 'review');
  const historyIdeas = details.filter((detail) => ['completed', 'cancelled'].includes(detail.idea.statusBucket));

  return {
    buyerId: posterId,
    activeIdeas,
    reviewIdeas,
    historyIdeas,
    metrics: {
      totalIdeas: details.length,
      activeIdeas: activeIdeas.length,
      reviewIdeas: reviewIdeas.length,
      completedIdeas: details.filter((detail) => detail.idea.statusBucket === 'completed').length,
      cancelledIdeas: details.filter((detail) => detail.idea.statusBucket === 'cancelled').length,
    },
  };
}

// ─── Jobs ──────────────────────────────────────────────────────────────────

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
  };
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

// ─── Review ───────────────────────────────────────────────────────���────────

export function acceptMilestone(ideaId: string, jobId: string, reviewerId: string) {
  return post<{ accepted: boolean }>(`/ideas/${ideaId}/accept`, { jobId, reviewerId });
}

export function rejectMilestone(ideaId: string, jobId: string, reviewerId: string, reason?: string) {
  return post<{ rework: boolean }>(`/ideas/${ideaId}/reject`, { jobId, reviewerId, reason });
}
