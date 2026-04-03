import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { ideas, briefs, jobs, milestones } from '../db/schema';
import { createIdea, generateBrief, acceptJob, rejectJob } from '../services/jobService';
import { JobCreateRequestSchema } from 'intelligence-exchange-cannes-shared';
import { z } from 'zod';
import { assertWorldVerified } from '../services/identityService';

export const ideasRouter = new Hono();

// GET /v1/cannes/ideas — list all ideas (most recent first)
ideasRouter.get('/', async (c) => {
  const posterId = c.req.query('posterId');
  const allIdeas = posterId
    ? await db.select().from(ideas).where(eq(ideas.posterId, posterId)).orderBy(desc(ideas.createdAt))
    : await db.select().from(ideas).orderBy(desc(ideas.createdAt));
  return c.json({ ideas: allIdeas, count: allIdeas.length });
});

// POST /v1/cannes/ideas — submit a funded idea (World ID gate)
ideasRouter.post('/', zValidator('json', JobCreateRequestSchema), async (c) => {
  const req = c.req.valid('json');

  const worldIdVerified = Boolean(req.worldIdProof?.nullifierHash);
  if (!worldIdVerified) {
    await assertWorldVerified('buyer', req.buyerId);
  }

  try {
    const ideaId = await createIdea(req, worldIdVerified);
    return c.json({ ideaId, fundingStatus: 'unfunded', worldIdVerified }, 201);
  } catch (err: unknown) {
    console.error('[ideas:create] error', err);
    return c.json({ error: { code: 'CREATE_FAILED', message: String(err) } }, 500);
  }
});

// GET /v1/cannes/ideas/:ideaId — fetch idea state
ideasRouter.get('/:ideaId', async (c) => {
  const { ideaId } = c.req.param();
  const [idea] = await db.select().from(ideas).where(eq(ideas.ideaId, ideaId));
  if (!idea) return c.json({ error: { code: 'NOT_FOUND', message: 'Idea not found' } }, 404);

  const [brief] = await db.select().from(briefs).where(eq(briefs.ideaId, ideaId));
  const jobsList = brief
    ? await db.select().from(jobs).where(eq(jobs.briefId, brief.briefId))
    : [];

  return c.json({ idea, brief: brief ?? null, jobs: jobsList });
});

// POST /v1/cannes/ideas/:ideaId/plan — generate BuildBrief + milestone jobs
ideasRouter.post('/:ideaId/plan', async (c) => {
  const { ideaId } = c.req.param();
  try {
    const briefId = await generateBrief(ideaId);
    return c.json({ briefId, status: 'generated' });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    return c.json({ error: { code: 'PLAN_FAILED', message: String(err) } }, status as 404 | 500);
  }
});

// POST /v1/cannes/ideas/:ideaId/fund — record escrow funding (tx hash from frontend)
ideasRouter.post('/:ideaId/fund', zValidator('json', z.object({
  txHash: z.string(),
  amountUsd: z.number().positive(),
})), async (c) => {
  const { ideaId } = c.req.param();
  const { txHash, amountUsd } = c.req.valid('json');

  const [idea] = await db.select().from(ideas).where(eq(ideas.ideaId, ideaId));
  if (!idea) return c.json({ error: { code: 'NOT_FOUND', message: 'Idea not found' } }, 404);

  await db.update(ideas).set({
    fundingStatus: 'funded',
    escrowTxHash: txHash,
    updatedAt: new Date(),
  }).where(eq(ideas.ideaId, ideaId));

  return c.json({ ideaId, fundingStatus: 'funded', txHash });
});

// POST /v1/cannes/ideas/:ideaId/accept — human accepts milestone release
ideasRouter.post('/:ideaId/accept', zValidator('json', z.object({
  jobId: z.string(),
  reviewerId: z.string(),
})), async (c) => {
  const { jobId, reviewerId } = c.req.valid('json');
  try {
    await assertWorldVerified('buyer', reviewerId);
    const result = await acceptJob(jobId, reviewerId);
    return c.json(result);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    return c.json({ error: { code: 'ACCEPT_FAILED', message: String(err) } }, status as 404 | 409 | 500);
  }
});

// POST /v1/cannes/ideas/:ideaId/cancel — poster cancels their idea
ideasRouter.post('/:ideaId/cancel', async (c) => {
  const { ideaId } = c.req.param();
  const [idea] = await db.select().from(ideas).where(eq(ideas.ideaId, ideaId));
  if (!idea) return c.json({ error: { code: 'NOT_FOUND', message: 'Idea not found' } }, 404);
  if (!['unfunded', 'funded'].includes(idea.fundingStatus)) {
    return c.json({ error: { code: 'CANNOT_CANCEL', message: `Cannot cancel idea with status: ${idea.fundingStatus}` } }, 409);
  }
  await db.update(ideas).set({ fundingStatus: 'cancelled', updatedAt: new Date() }).where(eq(ideas.ideaId, ideaId));
  console.log(`[idea:cancelled] ideaId=${ideaId}`);
  return c.json({ ideaId, cancelled: true });
});

// POST /v1/cannes/ideas/:ideaId/reject — human rejects, triggers rework
ideasRouter.post('/:ideaId/reject', zValidator('json', z.object({
  jobId: z.string(),
  reviewerId: z.string(),
  reason: z.string().optional(),
})), async (c) => {
  const { jobId, reviewerId, reason } = c.req.valid('json');
  try {
    await assertWorldVerified('buyer', reviewerId);
    const result = await rejectJob(jobId, reviewerId, reason);
    return c.json(result);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    return c.json({ error: { code: 'REJECT_FAILED', message: String(err) } }, status as 404 | 409 | 500);
  }
});
