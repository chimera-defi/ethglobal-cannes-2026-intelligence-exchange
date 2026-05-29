import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { acceptedAttestations, agentSpendEvents, briefs, claims, ideas, ideaTokenReserves, jobs, milestones, submissions } from '../db/schema';
import { claimJob, recordSpendEvent, submitJob, unclaimJob } from '../services/jobService';
import {
  JobClaimRequestSchema,
  JobResultSubmitRequestSchema,
  JobSpendCreateRequestSchema,
  JobUnclaimRequestSchema,
  type JobClaimRequest,
  type JobResultSubmitRequest,
  type JobUnclaimRequest,
} from 'intelligence-exchange-cannes-shared';
import { MILESTONE_ORDER } from 'intelligence-exchange-cannes-shared';
import { getSessionAccountAddress, requireAgentAuthorization, requireWorldRoleIfStrict } from '../services/accessService';
import { consumeChallenge } from '../services/authService';
import { hydrateAcceptedSubmissionAttestation, checkWorkerStake } from '../services/chainService';
import { computeAgentFingerprint, normalizeAccountAddress } from '../services/identityService';
import { httpError } from '../services/errors';
import { getWorldConfig } from '../services/sponsorConfig';
import { keccak256, toBytes, createWalletClient, createPublicClient, http, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const jobsRouter = new Hono();

type GroupedJobBoardItem = {
  briefId: string;
  ideaId: string;
  title: string;
  prompt: string;
  posterId: string;
  budgetUsd: string;
  briefSummary: string;
  generatedAt: Date;
  matchingMilestoneCount: number;
  milestones: Array<{
    jobId: string;
    milestoneId: string;
    milestoneType: string;
    title: string;
    description: string;
    skillMdUrl: string;
    status: string;
    budgetUsd: string;
    leaseExpiry: Date | null;
    activeClaimId: string | null;
    activeClaimWorkerId: string | null;
    activeClaimAgentFingerprint: string | null;
    latestSubmission: {
      submissionId: string;
      artifactUris: string[];
      summary: string | null;
      submittedAt: Date;
      accountAddress: string | null;
      agentFingerprint: string | null;
      scoreStatus: string | null;
    } | null;
    order: number;
  }>;
};

function buildDemoAgentIdentity(input: {
  workerId: string;
  agentMetadata?: {
    agentType?: string;
    agentVersion?: string;
    operatorAddress?: string;
    fingerprint?: string;
  };
}) {
  const accountAddress = normalizeAccountAddress(input.workerId);
  const operatorAddress = /^0x[a-fA-F0-9]{40}$/.test(input.agentMetadata?.operatorAddress ?? '')
    ? input.agentMetadata!.operatorAddress!
    : (`0x${keccak256(toBytes(accountAddress)).slice(2, 42)}` as `0x${string}`);
  const fingerprint = input.agentMetadata?.fingerprint
    ?? computeAgentFingerprint(
      input.agentMetadata?.agentType ?? 'demo-worker',
      input.agentMetadata?.agentVersion ?? '0.0.0',
      operatorAddress,
    );

  return { accountAddress, fingerprint };
}

function isSignedClaimRequest(
  req: JobClaimRequest,
): req is Extract<JobClaimRequest, { signedAction: unknown }> {
  return 'signedAction' in req;
}

function isSignedSubmitRequest(
  req: JobResultSubmitRequest,
): req is Extract<JobResultSubmitRequest, { signedAction: unknown }> {
  return 'signedAction' in req;
}

function isSignedUnclaimRequest(
  req: JobUnclaimRequest,
): req is Extract<JobUnclaimRequest, { signedAction: unknown }> {
  return 'signedAction' in req;
}

function sortMilestonesByOrder(
  a: { order: number; milestoneType: string },
  b: { order: number; milestoneType: string },
) {
  if (a.order !== b.order) {
    return a.order - b.order;
  }

  return MILESTONE_ORDER.indexOf(a.milestoneType as typeof MILESTONE_ORDER[number])
    - MILESTONE_ORDER.indexOf(b.milestoneType as typeof MILESTONE_ORDER[number]);
}

export async function buildGroupedJobBoard(statusFilter: string) {
  const matchingJobs = await db.select()
    .from(jobs)
    .where(eq(jobs.status, statusFilter))
    .orderBy(desc(jobs.updatedAt));
  if (matchingJobs.length === 0) {
    return { groups: [] as GroupedJobBoardItem[], count: 0 };
  }

  const briefIds = Array.from(new Set(matchingJobs.map((job) => job.briefId)));
  const briefMatchCounts = new Map<string, number>();
  for (const job of matchingJobs) {
    briefMatchCounts.set(job.briefId, (briefMatchCounts.get(job.briefId) ?? 0) + 1);
  }

  const boardJobs = await db.select().from(jobs).where(inArray(jobs.briefId, briefIds));
  const boardBriefs = await db.select().from(briefs).where(inArray(briefs.briefId, briefIds));
  const ideaIds = Array.from(new Set(boardBriefs.map((brief) => brief.ideaId)));
  const boardIdeas = ideaIds.length > 0
    ? await db.select().from(ideas).where(inArray(ideas.ideaId, ideaIds))
    : [];
  const boardMilestones = await db.select().from(milestones).where(inArray(milestones.briefId, briefIds));
  const activeClaimIds = Array.from(
    new Set(
      boardJobs
        .map((job) => job.activeClaimId)
        .filter((claimId): claimId is string => Boolean(claimId)),
    ),
  );
  const boardClaims: Array<typeof claims.$inferSelect> = activeClaimIds.length > 0
    ? await db.select().from(claims).where(inArray(claims.claimId, activeClaimIds))
    : [];
  const jobIds = Array.from(new Set(boardJobs.map((job) => job.jobId)));
  const boardSubmissions: Array<typeof submissions.$inferSelect> = jobIds.length > 0
    ? await db.select().from(submissions).where(inArray(submissions.jobId, jobIds)).orderBy(desc(submissions.submittedAt))
    : [];

  const briefsById = new Map(boardBriefs.map((brief) => [brief.briefId, brief]));
  const ideasById = new Map(boardIdeas.map((idea) => [idea.ideaId, idea]));
  const milestonesById = new Map(boardMilestones.map((milestone) => [milestone.milestoneId, milestone]));
  const claimsById = new Map(boardClaims.map((claim) => [claim.claimId, claim]));
  const latestSubmissionByJobId = new Map<string, typeof submissions.$inferSelect>();
  const jobsByBriefId = new Map<string, typeof boardJobs>();

  for (const submission of boardSubmissions) {
    if (!latestSubmissionByJobId.has(submission.jobId)) {
      latestSubmissionByJobId.set(submission.jobId, submission);
    }
  }

  for (const job of boardJobs) {
    const existing = jobsByBriefId.get(job.briefId) ?? [];
    existing.push(job);
    jobsByBriefId.set(job.briefId, existing);
  }

  const groups = briefIds.flatMap((briefId) => {
    const brief = briefsById.get(briefId);
    if (!brief) return [];

    const idea = ideasById.get(brief.ideaId);
    if (!idea) return [];

    const milestoneJobs = (jobsByBriefId.get(briefId) ?? [])
      .map((job) => {
        const milestone = milestonesById.get(job.milestoneId);
        const activeClaim = job.activeClaimId ? claimsById.get(job.activeClaimId) : null;
        const latestSubmission = latestSubmissionByJobId.get(job.jobId) ?? null;
        return {
          jobId: job.jobId,
          milestoneId: job.milestoneId,
          milestoneType: job.milestoneType,
          title: milestone?.title ?? `${job.milestoneType} milestone`,
          description: milestone?.description ?? brief.summary,
          skillMdUrl: `/v1/cannes/jobs/${job.jobId}/skill.md`,
          status: job.status,
          budgetUsd: job.budgetUsd,
          leaseExpiry: job.leaseExpiry ?? null,
          activeClaimId: job.activeClaimId ?? null,
          activeClaimWorkerId: job.activeClaimWorkerId ?? null,
          activeClaimAgentFingerprint: activeClaim?.agentFingerprint ?? null,
          latestSubmission: latestSubmission
            ? {
                submissionId: latestSubmission.submissionId,
                artifactUris: Array.isArray(latestSubmission.artifactUris)
                  ? latestSubmission.artifactUris.filter((uri): uri is string => typeof uri === 'string')
                  : [],
                summary: latestSubmission.summary ?? null,
                submittedAt: latestSubmission.submittedAt,
                accountAddress: latestSubmission.accountAddress ?? null,
                agentFingerprint: latestSubmission.agentFingerprint ?? null,
                scoreStatus: latestSubmission.scoreStatus ?? null,
              }
            : null,
          order: milestone?.order ?? Number.MAX_SAFE_INTEGER,
        };
      })
      .sort(sortMilestonesByOrder);

    return [{
      briefId,
      ideaId: brief.ideaId,
      title: idea.title,
      prompt: idea.prompt,
      posterId: idea.posterId,
      budgetUsd: idea.budgetUsd,
      briefSummary: brief.summary,
      generatedAt: brief.generatedAt,
      matchingMilestoneCount: briefMatchCounts.get(briefId) ?? 0,
      milestones: milestoneJobs,
    }];
  });

  return { groups, count: groups.length };
}

export async function getFlatJobs(statusFilter: string) {
  const jobsList = await db.select().from(jobs).where(eq(jobs.status, statusFilter));
  return { jobs: jobsList, count: jobsList.length };
}

export async function getJobDetail(jobId: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) {
    return null;
  }

  const [idea] = await db.select({ posterId: ideas.posterId }).from(ideas).where(eq(ideas.ideaId, job.ideaId));
  const spendEvents = await db.select().from(agentSpendEvents)
    .where(eq(agentSpendEvents.jobId, jobId))
    .orderBy(desc(agentSpendEvents.createdAt));
  const latestSubmission = (await db.select().from(submissions)
    .where(eq(submissions.jobId, jobId))
    .orderBy(desc(submissions.submittedAt)))[0] ?? null;
  const latestAttestationRecord = (await db.select().from(acceptedAttestations)
    .where(eq(acceptedAttestations.jobId, jobId))
    .orderBy(desc(acceptedAttestations.createdAt)))[0] ?? null;

  return {
    job: {
      ...job,
      posterId: idea?.posterId ?? null,
      skillMdUrl: `/v1/cannes/jobs/${jobId}/skill.md`,
    },
    spendEvents,
    latestSubmission,
    latestAttestation: latestAttestationRecord
      ? hydrateAcceptedSubmissionAttestation(latestAttestationRecord)
      : null,
  };
}

export async function buildSkillMdResponse(jobId: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) {
    return { error: { code: 'NOT_FOUND', message: 'Job not found' } as const, status: 404 as const };
  }
  if (job.status !== 'queued' && job.status !== 'claimed') {
    return {
      error: { code: 'NOT_AVAILABLE', message: `Job status: ${job.status}` } as const,
      status: 409 as const,
    };
  }

  const [milestone] = await db.select().from(milestones).where(eq(milestones.milestoneId, job.milestoneId));
  const [brief] = await db.select().from(briefs).where(eq(briefs.briefId, job.briefId));

  const milestoneIdx = MILESTONE_ORDER.indexOf(job.milestoneType as typeof MILESTONE_ORDER[number]);
  const leaseDeadline = job.leaseExpiry
    ? job.leaseExpiry.toISOString()
    : new Date(Date.now() + 45 * 60 * 1000).toISOString();

  const skillMd = `---
job_id: ${jobId}
milestone_type: ${job.milestoneType}
budget_usd: ${job.budgetUsd}
deadline: ${leaseDeadline}
submission_endpoint: POST ${process.env.BROKER_URL ?? 'http://localhost:3001'}/v1/cannes/jobs/${jobId}/submit
spend_endpoint: POST ${process.env.BROKER_URL ?? 'http://localhost:3001'}/v1/cannes/jobs/${jobId}/spend
---

# ${milestone?.title ?? `Milestone: ${job.milestoneType}`}

## Context
${brief?.summary ?? 'Build the requested deliverable.'}

## Your Task
Complete the **${job.milestoneType}** milestone (step ${milestoneIdx + 1} of ${MILESTONE_ORDER.length}).

${milestone?.description ?? ''}

## Acceptance Criteria
- Provide at least one artifact URI (file URL, GitHub gist, or data URI)
- Include a summary (≥50 chars for review milestones, ≥20 chars for others)
- Submit with status: "completed"
- If your run pays for tools, data, inference, or API calls, log each spend via the spend endpoint

## Milestone Type Guide
- **brief**: Define requirements, user stories, and acceptance criteria
- **tasks**: Break down work into concrete implementation tasks (JSON format preferred)
- **scaffold**: Generate the project skeleton / boilerplate code
- **review**: Perform code review, security analysis, or quality check

## How to Submit
\`\`\`
POST ${process.env.BROKER_URL ?? 'http://localhost:3001'}/v1/cannes/jobs/${jobId}/submit
Content-Type: application/json

{
  "signedAction": {
    "accountAddress": "<worker-wallet>",
    "agentFingerprint": "<authorized-fingerprint>",
    "challengeId": "<challenge-id-from-/auth/challenge>",
    "signature": "<wallet-signature>"
  },
  "claimId": "<claim-id-from-claim-response>",
  "status": "completed",
  "artifactUris": ["<your-artifact-url>"],
  "summary": "<what you built and why>"
}
\`\`\`

Optional spend logging:
\`\`\`
POST ${process.env.BROKER_URL ?? 'http://localhost:3001'}/v1/cannes/jobs/${jobId}/spend
Content-Type: application/json

{
  "workerId": "<your-worker-id>",
  "vendor": "openrouter",
  "purpose": "review pass",
  "amountUsd": 0.0125,
  "settlementRail": "arc",
  "txHash": "0x..."
}
\`\`\`

Production mode:
1. create a challenge from \`POST /v1/cannes/auth/challenge\`
2. sign the returned message with the worker wallet
3. send the \`signedAction\` envelope back to the broker

In demo mode, the broker also accepts direct \`workerId\` submissions without signed actions.
`;

  return {
    response: new Response(skillMd, {
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    }),
    status: 200 as const,
  };
}

// GET /v1/cannes/jobs — list available (queued) jobs
jobsRouter.get('/', async (c) => {
  const statusFilter = c.req.query('status') ?? 'queued';
  const view = c.req.query('view');

  if (view === 'grouped') {
    return c.json(await buildGroupedJobBoard(statusFilter));
  }

  return c.json(await getFlatJobs(statusFilter));
});

// GET /v1/cannes/jobs/:jobId — get job details
jobsRouter.get('/:jobId', async (c) => {
  const { jobId } = c.req.param();
  if (!jobId || !jobId.trim()) return c.json({ error: { code: 'INVALID_PARAM', message: 'jobId is required' } }, 400);
  const detail = await getJobDetail(jobId);
  if (!detail) return c.json({ error: { code: 'NOT_FOUND', message: 'Job not found' } }, 404);
  return c.json(detail);
});

// GET /v1/cannes/jobs/:jobId/skill.md — serve skill.md task file for agents
jobsRouter.get('/:jobId/skill.md', async (c) => {
  const { jobId } = c.req.param();
  if (!jobId || !jobId.trim()) return c.json({ error: { code: 'INVALID_PARAM', message: 'jobId is required' } }, 400);
  const result = await buildSkillMdResponse(jobId);
  if ('error' in result) {
    return c.json({ error: result.error }, result.status);
  }
  return result.response;
});

// GET /v1/cannes/jobs/:jobId/escrow-funding-params — get escrow funding params for a specific job
jobsRouter.get('/:jobId/escrow-funding-params', async (c) => {
  const { jobId } = c.req.param();

  const taskEscrowAddress = process.env.TASK_ESCROW_ADDRESS;
  if (!taskEscrowAddress || taskEscrowAddress.trim() === '') {
    return c.json({ error: 'On-chain escrow not configured', configured: false }, 200);
  }

  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Job not found' } }, 404);
  }

  const [ideaReserve] = await db.select().from(ideaTokenReserves).where(eq(ideaTokenReserves.ideaId, job.ideaId));
  if (!ideaReserve) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Idea token reserves not found' } }, 404);
  }

  const budgetUsd = Number.parseFloat(job.budgetUsd);
  const avgMintPriceUsdPerIntel = Number.parseFloat(ideaReserve.avgMintPriceUsdPerIntel);
  const amountIntel = budgetUsd / avgMintPriceUsdPerIntel;
  const amountWei = BigInt(Math.floor(amountIntel * 1e18));
  const taskIdBytes32 = keccak256(toBytes(jobId)); // Uses jobId, matches broker setWorker/release calls

  const intelTokenAddress = process.env.INTEL_TOKEN_CONTRACT_ADDRESS;

  const erc20ApproveAbi = [{ type: 'function' as const, name: 'approve', inputs: [{name:'spender',type:'address'},{name:'amount',type:'uint256'}], outputs: [{type:'bool'}], stateMutability:'nonpayable' as const }];
  const taskEscrowAbi = [{ type: 'function' as const, name: 'fundTask', inputs: [{name:'taskId',type:'bytes32'},{name:'amount',type:'uint256'}], outputs: [], stateMutability:'nonpayable' as const }];

  const approveCalldata = encodeFunctionData({
    abi: erc20ApproveAbi,
    functionName: 'approve',
    args: [taskEscrowAddress as `0x${string}`, amountWei],
  });

  const fundTaskCalldata = encodeFunctionData({
    abi: taskEscrowAbi,
    functionName: 'fundTask',
    args: [taskIdBytes32, amountWei],
  });

  return c.json({
    taskEscrowAddress,
    intelTokenAddress: intelTokenAddress ?? null,
    taskIdBytes32,
    amountWei: amountWei.toString(),
    approveCalldata,
    fundTaskCalldata,
    instructions: 'Broadcast approve tx from your buyer wallet, then fundTask tx. Both must use the same wallet that funded this job.',
  });
});

// POST /v1/cannes/jobs/:jobId/claim — agent claims a milestone
jobsRouter.post('/:jobId/claim', zValidator('json', JobClaimRequestSchema), async (c) => {
  const { jobId } = c.req.param();
  if (!jobId || !jobId.trim()) return c.json({ error: { code: 'INVALID_PARAM', message: 'jobId is required' } }, 400);
  const req = c.req.valid('json');

  try {
    let result: Awaited<ReturnType<typeof claimJob>>;
    let workerAddress: string;

    if (isSignedClaimRequest(req)) {
      await consumeChallenge({
        challengeId: req.signedAction.challengeId,
        accountAddress: req.signedAction.accountAddress,
        signature: req.signedAction.signature,
        purpose: 'worker_claim',
        metadata: {
          agentFingerprint: req.signedAction.agentFingerprint,
          jobId,
        },
      });

      await requireWorldRoleIfStrict(req.signedAction.accountAddress, 'worker');
      await requireAgentAuthorization({
        accountAddress: req.signedAction.accountAddress,
        fingerprint: req.signedAction.agentFingerprint,
        role: 'worker',
        requiredPermissions: ['claim_jobs'],
      });

      workerAddress = req.signedAction.accountAddress;
    } else {
      if (getWorldConfig().strict) {
        throw httpError('Signed worker claim required when WORLD_ID_STRICT is enabled', 401, 'AUTH_REQUIRED');
      }

      const demoIdentity = buildDemoAgentIdentity(req);
      workerAddress = demoIdentity.accountAddress;
    }

    // Worker stake check for high-value tasks
    const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
    if (job) {
      const budgetUsd = Number.parseFloat(job.budgetUsd);
      // Convert USD to ETH wei (approximate: 1 ETH = $3000)
      const ethPriceUsd = 3000;
      const taskValueWei = BigInt(Math.floor((budgetUsd / ethPriceUsd) * 1e18));
      
      const stakeCheck = await checkWorkerStake(workerAddress, taskValueWei);
      if (!stakeCheck.canClaim) {
        console.warn(`[jobs:claim] Worker stake check failed for worker=${workerAddress} jobId=${jobId} budgetUsd=${budgetUsd}`);
        return c.json({ 
          error: { 
            code: 'INSUFFICIENT_STAKE', 
            message: 'Worker stake insufficient for high-value task. Stake INTEL at WorkerStakeManager to claim tasks above threshold.' 
          } 
        }, 403);
      }
    }

    // Proceed with claim after stake check passes
    if (isSignedClaimRequest(req)) {
      result = await claimJob(jobId, req.signedAction.accountAddress, req.signedAction.agentFingerprint);
    } else {
      const demoIdentity = buildDemoAgentIdentity(req);
      result = await claimJob(jobId, demoIdentity.accountAddress, demoIdentity.fingerprint);
    }

    return c.json({ ...result, jobId, skillMdUrl: `/v1/cannes/jobs/${jobId}/skill.md` });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const code = (err as { code?: string }).code ?? 'CLAIM_FAILED';
    return c.json({ error: { code, message: String(err) } }, status as 401 | 403 | 404 | 409 | 500);
  }
});

// POST /v1/cannes/jobs/:jobId/unclaim — release an active claim back to the queue
jobsRouter.post('/:jobId/unclaim', zValidator('json', JobUnclaimRequestSchema), async (c) => {
  const { jobId } = c.req.param();
  const req = c.req.valid('json');

  try {
    let result: Awaited<ReturnType<typeof unclaimJob>>;

    if (isSignedUnclaimRequest(req)) {
      await consumeChallenge({
        challengeId: req.signedAction.challengeId,
        accountAddress: req.signedAction.accountAddress,
        signature: req.signedAction.signature,
        purpose: 'worker_unclaim',
        metadata: {
          agentFingerprint: req.signedAction.agentFingerprint,
          jobId,
        },
      });

      await requireWorldRoleIfStrict(req.signedAction.accountAddress, 'worker');
      await requireAgentAuthorization({
        accountAddress: req.signedAction.accountAddress,
        fingerprint: req.signedAction.agentFingerprint,
        role: 'worker',
        requiredPermissions: ['claim_jobs'],
      });

      result = await unclaimJob(jobId, req.signedAction.accountAddress, req.signedAction.agentFingerprint);
    } else {
      if (getWorldConfig().strict) {
        throw httpError('Signed worker unclaim required when WORLD_ID_STRICT is enabled', 401, 'AUTH_REQUIRED');
      }

      const demoIdentity = buildDemoAgentIdentity(req);
      result = await unclaimJob(jobId, demoIdentity.accountAddress, demoIdentity.fingerprint);
    }

    return c.json({ ...result, jobId, skillMdUrl: `/v1/cannes/jobs/${jobId}/skill.md` });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const code = (err as { code?: string }).code ?? 'UNCLAIM_FAILED';
    return c.json({ error: { code, message: String(err) } }, status as 401 | 403 | 404 | 409 | 500);
  }
});

// POST /v1/cannes/jobs/:jobId/submit — agent submits output
jobsRouter.post('/:jobId/submit', zValidator('json', JobResultSubmitRequestSchema), async (c) => {
  const { jobId } = c.req.param();
  const req = c.req.valid('json');

  try {
    let result: Awaited<ReturnType<typeof submitJob>>;

    if (isSignedSubmitRequest(req)) {
      await consumeChallenge({
        challengeId: req.signedAction.challengeId,
        accountAddress: req.signedAction.accountAddress,
        signature: req.signedAction.signature,
        purpose: 'worker_submit',
        metadata: {
          agentFingerprint: req.signedAction.agentFingerprint,
          jobId,
        },
      });

      await requireWorldRoleIfStrict(req.signedAction.accountAddress, 'worker');
      await requireAgentAuthorization({
        accountAddress: req.signedAction.accountAddress,
        fingerprint: req.signedAction.agentFingerprint,
        role: 'worker',
        requiredPermissions: ['submit_results'],
      });

      result = await submitJob(
        jobId,
        req,
        req.signedAction.accountAddress,
        req.signedAction.agentFingerprint,
      );
    } else {
      if (getWorldConfig().strict) {
        throw httpError('Signed worker submission required when WORLD_ID_STRICT is enabled', 401, 'AUTH_REQUIRED');
      }

      const demoIdentity = buildDemoAgentIdentity(req);
      result = await submitJob(
        jobId,
        req,
        demoIdentity.accountAddress,
        demoIdentity.fingerprint,
      );
    }

    return c.json(result);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const code = (err as { code?: string }).code ?? 'SUBMIT_FAILED';
    return c.json({ error: { code, message: String(err) } }, status as 401 | 403 | 404 | 409 | 500);
  }
});

jobsRouter.post('/:jobId/spend', zValidator('json', JobSpendCreateRequestSchema), async (c) => {
  const { jobId } = c.req.param();
  const req = c.req.valid('json');

  try {
    const sessionAccountAddress = await getSessionAccountAddress(c);
    if (!sessionAccountAddress && getWorldConfig().strict) {
      throw httpError('Authenticated worker session required to record spend events', 401, 'AUTH_REQUIRED');
    }
    if (sessionAccountAddress && getWorldConfig().strict) {
      await requireWorldRoleIfStrict(sessionAccountAddress, 'worker');
    }

    const workerId = sessionAccountAddress
      ? normalizeAccountAddress(sessionAccountAddress)
      : normalizeAccountAddress(req.workerId);

    const result = await recordSpendEvent(jobId, {
      workerId,
      vendor: req.vendor,
      purpose: req.purpose,
      amountUsd: req.amountUsd,
      settlementRail: req.settlementRail,
      txHash: req.txHash,
    });

    return c.json(result, 201);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const code = (err as { code?: string }).code ?? 'SPEND_FAILED';
    return c.json({ error: { code, message: String(err) } }, status as 401 | 403 | 404 | 409 | 500);
  }
});

// POST /v1/cannes/jobs/:jobId/dispute — open a dispute for a job
jobsRouter.post(
  '/:jobId/dispute',
  zValidator('json', z.object({
    workerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    reviewerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  })),
  async (c) => {
    const { jobId } = c.req.param();
    const req = c.req.valid('json') as { workerAddress: string; reviewerAddress: string };

    try {
      const sessionAccountAddress = await getSessionAccountAddress(c);
      if (!sessionAccountAddress && getWorldConfig().strict) {
        throw httpError('Authenticated session required to open dispute', 401, 'AUTH_REQUIRED');
      }

      const contractAddress = process.env.DISPUTE_RESOLUTION_ADDRESS;
      if (!contractAddress || contractAddress.trim() === '') {
        return c.json({ error: 'DISPUTE_RESOLUTION_ADDRESS not configured' }, 500);
      }

      const privateKey = process.env.BROKER_ATTESTOR_PRIVATE_KEY;
      const rpcUrl = process.env.WORLDCHAIN_RPC_URL;
      const chainId = process.env.WORLDCHAIN_CHAIN_ID;

      if (!privateKey || !rpcUrl || !chainId) {
        return c.json({ error: 'Broker chain configuration not set' }, 500);
      }

      const account = privateKeyToAccount(privateKey as `0x${string}`);

      const chain = {
        id: Number(chainId),
        name: 'Worldchain Sepolia',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [rpcUrl] },
          public: { http: [rpcUrl] },
        },
      } as const;

      const walletClient = createWalletClient({
        account,
        chain,
        transport: http(),
      });

      const taskIdBytes32 = keccak256(toBytes(jobId));

      const hash = await walletClient.writeContract({
        address: contractAddress as `0x${string}`,
        abi: [
          {
            type: 'function',
            name: 'openDispute',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'taskId', type: 'bytes32' },
              { name: 'worker', type: 'address' },
              { name: 'reviewer', type: 'address' },
            ],
            outputs: [],
          },
        ],
        functionName: 'openDispute',
        args: [taskIdBytes32, req.workerAddress as `0x${string}`, req.reviewerAddress as `0x${string}`],
      });

      console.log(`[jobs:dispute] Opened dispute for jobId=${jobId} worker=${req.workerAddress} reviewer=${req.reviewerAddress} txHash=${hash}`);
      return c.json({ txHash: hash, message: 'Dispute opened. Post INTEL bond via disputeBond amount.' });
    } catch (err: unknown) {
      console.error('[jobs:dispute] Failed to open dispute:', err);
      const status = (err as { status?: number }).status ?? 500;
      const code = (err as { code?: string }).code ?? 'DISPUTE_FAILED';
      return c.json({ error: { code, message: String(err) } }, status as 401 | 403 | 404 | 409 | 500);
    }
  }
);

// GET /v1/cannes/jobs/:jobId/dispute — get dispute state for a job
jobsRouter.get('/:jobId/dispute', async (c) => {
  const { jobId } = c.req.param();

  try {
    const contractAddress = process.env.DISPUTE_RESOLUTION_ADDRESS;
    if (!contractAddress || contractAddress.trim() === '') {
      return c.json({ error: 'DISPUTE_RESOLUTION_ADDRESS not configured' }, 500);
    }

    const rpcUrl = process.env.WORLDCHAIN_RPC_URL;
    if (!rpcUrl) {
      return c.json({ error: 'WORLDCHAIN_RPC_URL not set' }, 500);
    }

    const publicClient = createPublicClient({
      transport: http(rpcUrl, {
        timeout: 10000,
        retryCount: 2,
      }),
    });

    const taskIdBytes32 = keccak256(toBytes(jobId));

    const dispute = await publicClient.readContract({
      address: contractAddress as `0x${string}`,
      abi: [
        {
          type: 'function',
          name: 'disputes',
          stateMutability: 'view',
          inputs: [
            { name: '', type: 'uint256' },
          ],
          outputs: [
            { name: 'taskId', type: 'bytes32' },
            { name: 'worker', type: 'address' },
            { name: 'reviewer', type: 'address' },
            { name: 'isOpen', type: 'bool' },
            { name: 'resolvedInFavorOfWorker', type: 'bool' },
          ],
        },
      ],
      functionName: 'disputes',
      args: [BigInt(taskIdBytes32)],
    });

    console.log(`[jobs:dispute] Retrieved dispute state for jobId=${jobId}`);
    return c.json({ dispute });
  } catch (err: unknown) {
    console.error('[jobs:dispute] Failed to get dispute state:', err);
    const status = (err as { status?: number }).status ?? 500;
    const code = (err as { code?: string }).code ?? 'DISPUTE_QUERY_FAILED';
    return c.json({ error: { code, message: String(err) } }, status as 401 | 403 | 404 | 409 | 500);
  }
});
