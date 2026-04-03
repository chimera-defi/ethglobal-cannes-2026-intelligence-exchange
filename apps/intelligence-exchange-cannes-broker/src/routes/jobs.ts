import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { jobs, milestones, briefs, submissions, ideas } from '../db/schema';
import { claimJob, submitJob } from '../services/jobService';
import { JobClaimRequestSchema, JobResultSubmitRequestSchema } from 'intelligence-exchange-cannes-shared';
import { MILESTONE_ORDER } from 'intelligence-exchange-cannes-shared';

export const jobsRouter = new Hono();

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
  const [submission] = await db.select().from(submissions)
    .where(eq(submissions.jobId, jobId))
    .orderBy(desc(submissions.submittedAt));
  const [idea] = await db.select().from(ideas).where(eq(ideas.ideaId, job.ideaId));
  return c.json({ job, submission: submission ?? null, idea: idea ?? null });
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
  const [idea] = await db.select().from(ideas).where(eq(ideas.ideaId, job.ideaId));

  const milestoneIdx = MILESTONE_ORDER.indexOf(job.milestoneType as typeof MILESTONE_ORDER[number]);
  const leaseDeadline = new Date(Date.now() + 45 * 60 * 1000).toISOString();

  const skillMd = `---
job_id: ${jobId}
milestone_type: ${job.milestoneType}
budget_usd: ${job.budgetUsd}
deadline: ${leaseDeadline}
submission_endpoint: POST ${process.env.BROKER_URL ?? 'http://localhost:3001'}/v1/cannes/jobs/${jobId}/submit
---

# ${milestone?.title ?? `Milestone: ${job.milestoneType}`}

## Context
${brief?.summary ?? 'Build the requested deliverable.'}
${idea?.targetArtifact ? `\nTarget repo/spec: ${idea.targetArtifact}` : ''}

## Your Task
Complete the **${job.milestoneType}** milestone (step ${milestoneIdx + 1} of ${MILESTONE_ORDER.length}).

${milestone?.description ?? ''}

## Acceptance Criteria
- Provide at least one artifact URI (file URL, GitHub gist, or data URI)
- For implementation work, prefer a GitHub pull request URL as the first artifact
- Include a summary (≥50 chars for review milestones, ≥20 chars for others)
- Submit with status: "completed"

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
  "workerId": "<your-worker-id>",
  "claimId": "<claim-id-from-claim-response>",
  "status": "completed",
  "artifactUris": ["<your-pull-request-or-artifact-url>"],
  "summary": "<what you built and why>",
  "agentMetadata": {
    "agentType": "claude-code",
    "agentVersion": "1.0.0",
    "operatorAddress": "<your-evm-address-optional>"
  }
}
\`\`\`

Your agent fingerprint will be computed as:
\`keccak256(agentType + ":" + agentVersion + ":" + operatorAddress)\`

On first accepted submission, your identity will be registered on-chain in the AgentIdentityRegistry.
Subsequent accepted submissions increase your reputation score.
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
    const result = await claimJob(jobId, req.workerId, req.agentMetadata as Record<string, unknown>);
    return c.json({ ...result, jobId, skillMdUrl: `/v1/cannes/jobs/${jobId}/skill.md` });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    return c.json({ error: { code: 'CLAIM_FAILED', message: String(err) } }, status as 404 | 409 | 500);
  }
});

// POST /v1/cannes/jobs/:jobId/submit — agent submits output
jobsRouter.post('/:jobId/submit', zValidator('json', JobResultSubmitRequestSchema), async (c) => {
  const { jobId } = c.req.param();
  const req = c.req.valid('json');

  try {
    const result = await submitJob(jobId, req);
    return c.json(result);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const code = (err as { code?: string }).code ?? 'SUBMIT_FAILED';
    return c.json({ error: { code, message: String(err) } }, status as 404 | 409 | 500);
  }
});
