import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { acceptedAttestations, agentSpendEvents, briefs, ideas, jobs, milestones, submissions } from '../db/schema';
import { claimJob, recordSpendEvent, submitJob } from '../services/jobService';
import {
  JobClaimRequestSchema,
  JobResultSubmitRequestSchema,
  JobSpendCreateRequestSchema,
  type JobClaimRequest,
  type JobResultSubmitRequest,
} from 'intelligence-exchange-cannes-shared';
import { MILESTONE_ORDER } from 'intelligence-exchange-cannes-shared';
import { getSessionAccountAddress, requireAgentAuthorization, requireWorldRole } from '../services/accessService';
import { consumeChallenge } from '../services/authService';
import { hydrateAcceptedSubmissionAttestation } from '../services/chainService';
import { computeAgentFingerprint, normalizeAccountAddress } from '../services/identityService';
import { httpError } from '../services/errors';
import { getWorldConfig } from '../services/sponsorConfig';
import { keccak256, toBytes } from 'viem';

export const jobsRouter = new Hono();

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

// GET /v1/cannes/jobs — list available (queued) jobs
jobsRouter.get('/', async (c) => {
  const statusFilter = c.req.query('status') ?? 'queued';
  const jobsList = await db.select().from(jobs).where(eq(jobs.status, statusFilter));
  return c.json({ jobs: jobsList, count: jobsList.length });
});

// GET /v1/cannes/jobs/:jobId — get job details
jobsRouter.get('/:jobId', async (c) => {
  const { jobId } = c.req.param();
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) return c.json({ error: { code: 'NOT_FOUND', message: 'Job not found' } }, 404);
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

  return c.json({
    job: {
      ...job,
      posterId: idea?.posterId ?? null,
    },
    spendEvents,
    latestSubmission,
    latestAttestation: latestAttestationRecord
      ? hydrateAcceptedSubmissionAttestation(latestAttestationRecord)
      : null,
  });
});

// GET /v1/cannes/jobs/:jobId/skill.md — serve skill.md task file for agents
jobsRouter.get('/:jobId/skill.md', async (c) => {
  const { jobId } = c.req.param();
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) return c.json({ error: { code: 'NOT_FOUND', message: 'Job not found' } }, 404);
  if (job.status !== 'queued' && job.status !== 'claimed') {
    return c.json({ error: { code: 'NOT_AVAILABLE', message: `Job status: ${job.status}` } }, 409);
  }

  const [milestone] = await db.select().from(milestones).where(eq(milestones.milestoneId, job.milestoneId));
  const [brief] = await db.select().from(briefs).where(eq(briefs.briefId, job.briefId));

  const milestoneIdx = MILESTONE_ORDER.indexOf(job.milestoneType as typeof MILESTONE_ORDER[number]);
  const leaseDeadline = new Date(Date.now() + 45 * 60 * 1000).toISOString();

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

  return new Response(skillMd, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
});

// POST /v1/cannes/jobs/:jobId/claim — agent claims a milestone
jobsRouter.post('/:jobId/claim', zValidator('json', JobClaimRequestSchema), async (c) => {
  const { jobId } = c.req.param();
  const req = c.req.valid('json');

  try {
    let result: Awaited<ReturnType<typeof claimJob>>;

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

      await requireWorldRole(req.signedAction.accountAddress, 'worker');
      await requireAgentAuthorization({
        accountAddress: req.signedAction.accountAddress,
        fingerprint: req.signedAction.agentFingerprint,
        role: 'worker',
        requiredPermissions: ['claim_jobs'],
      });

      result = await claimJob(jobId, req.signedAction.accountAddress, req.signedAction.agentFingerprint);
    } else {
      if (getWorldConfig().strict) {
        throw httpError('Signed worker claim required when WORLD_ID_STRICT is enabled', 401, 'AUTH_REQUIRED');
      }

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

      await requireWorldRole(req.signedAction.accountAddress, 'worker');
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
    if (sessionAccountAddress) {
      await requireWorldRole(sessionAccountAddress, 'worker');
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
