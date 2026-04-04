import { z } from 'zod';
import {
  ErrorEnvelopeSchema,
  MilestoneTypeSchema,
  ScoreBreakdownSchema,
  type AgentMetadata,
  type JobResultSubmitRequest,
  type MilestoneType,
} from 'intelligence-exchange-cannes-shared';

export const DEFAULT_BROKER_URL = process.env.BROKER_URL ?? 'http://localhost:3001';

const BrokerJobSchema = z.object({
  jobId: z.string().uuid(),
  ideaId: z.string().optional(),
  briefId: z.string().optional(),
  milestoneId: z.string().optional(),
  milestoneType: MilestoneTypeSchema,
  budgetUsd: z.coerce.number(),
  status: z.string(),
  activeClaimId: z.string().uuid().nullable().optional(),
  activeClaimWorkerId: z.string().nullable().optional(),
  leaseExpiry: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

const BrokerJobsResponseSchema = z.object({
  jobs: z.array(BrokerJobSchema),
  count: z.number().int().nonnegative(),
});

const BrokerClaimResponseSchema = z.object({
  claimId: z.string().uuid(),
  jobId: z.string().uuid(),
  expiresAt: z.string().datetime(),
  skillMdUrl: z.string().min(1),
});

const BrokerVerifyResponseSchema = z.object({
  subjectId: z.string(),
  verified: z.boolean(),
  nullifierHash: z.string(),
});

const BrokerSubmissionResponseSchema = z.object({
  submissionId: z.string().uuid(),
  scoreBreakdown: ScoreBreakdownSchema,
});

export type BrokerJob = z.infer<typeof BrokerJobSchema>;
export type BrokerClaimResponse = z.infer<typeof BrokerClaimResponseSchema>;
export type BrokerVerifyResponse = z.infer<typeof BrokerVerifyResponseSchema>;
export type BrokerSubmissionResponse = z.infer<typeof BrokerSubmissionResponseSchema>;

type FetchLike = typeof fetch;

export interface BrokerClient {
  brokerUrl: string;
  listJobs(status?: string): Promise<BrokerJob[]>;
  getJob(jobId: string): Promise<BrokerJob>;
  verifyWorker(workerId: string, walletAddress?: string): Promise<BrokerVerifyResponse>;
  claimJob(jobId: string, workerId: string, agentMetadata?: AgentMetadata): Promise<BrokerClaimResponse>;
  fetchSkillMarkdown(skillMdUrl: string): Promise<string>;
  submitJob(jobId: string, submission: JobResultSubmitRequest): Promise<BrokerSubmissionResponse>;
}

function isJsonContentType(contentType: string | null): boolean {
  return contentType?.toLowerCase().includes('application/json') ?? false;
}

async function readResponseBody(res: Response): Promise<unknown> {
  const bodyText = await res.text();
  if (!bodyText) {
    return undefined;
  }

  if (isJsonContentType(res.headers.get('content-type'))) {
    return JSON.parse(bodyText) as unknown;
  }

  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return bodyText;
  }
}

function extractErrorMessage(res: Response, payload: unknown): string {
  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload;
  }

  const parsed = ErrorEnvelopeSchema.safeParse(payload);
  if (parsed.success) {
    return parsed.data.error.message;
  }

  return `HTTP ${res.status} ${res.statusText}`.trim();
}

async function brokerRequest<T>(
  brokerUrl: string,
  path: string,
  init: RequestInit | undefined,
  schema: z.ZodSchema<T>,
  fetchImpl: FetchLike,
): Promise<T> {
  const res = await fetchImpl(`${brokerUrl}${path}`, init);
  const payload = await readResponseBody(res);

  if (!res.ok) {
    throw new Error(extractErrorMessage(res, payload));
  }

  return schema.parse(payload);
}

function normalizeSkillUrl(brokerUrl: string, skillMdUrl: string): string {
  return new URL(skillMdUrl, brokerUrl).toString();
}

export function createBrokerClient(
  brokerUrl = DEFAULT_BROKER_URL,
  fetchImpl: FetchLike = fetch,
): BrokerClient {
  return {
    brokerUrl,
    async listJobs(status = 'queued') {
      const result = await brokerRequest(
        brokerUrl,
        `/v1/cannes/jobs?status=${encodeURIComponent(status)}`,
        undefined,
        BrokerJobsResponseSchema,
        fetchImpl,
      );
      return result.jobs;
    },
    async getJob(jobId: string) {
      const result = await brokerRequest(
        brokerUrl,
        `/v1/cannes/jobs/${jobId}`,
        undefined,
        z.object({ job: BrokerJobSchema }),
        fetchImpl,
      );
      return result.job;
    },
    async verifyWorker(workerId: string, walletAddress?: string) {
      return brokerRequest(
        brokerUrl,
        '/v1/cannes/identity/world/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subjectType: 'worker',
            subjectId: workerId,
            walletAddress,
            worldIdProof: {
              nullifierHash: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
              proof: '0xdemo-proof',
              merkleRoot: '0xdemo-root',
              verificationLevel: 'device',
            },
          }),
        },
        BrokerVerifyResponseSchema,
        fetchImpl,
      );
    },
    async claimJob(jobId: string, workerId: string, agentMetadata?: AgentMetadata) {
      return brokerRequest(
        brokerUrl,
        `/v1/cannes/jobs/${jobId}/claim`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workerId,
            agentMetadata,
          }),
        },
        BrokerClaimResponseSchema,
        fetchImpl,
      );
    },
    async fetchSkillMarkdown(skillMdUrl: string) {
      const res = await fetchImpl(normalizeSkillUrl(brokerUrl, skillMdUrl));
      if (!res.ok) {
        const payload = await readResponseBody(res);
        throw new Error(extractErrorMessage(res, payload));
      }
      return res.text();
    },
    async submitJob(jobId: string, submission: JobResultSubmitRequest) {
      return brokerRequest(
        brokerUrl,
        `/v1/cannes/jobs/${jobId}/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(submission),
        },
        BrokerSubmissionResponseSchema,
        fetchImpl,
      );
    },
  };
}

export function formatBudgetUsd(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}

export function formatMilestoneFilter(types: MilestoneType[] | undefined): string {
  if (!types || types.length === 0) {
    return 'all';
  }

  return types.join(',');
}
