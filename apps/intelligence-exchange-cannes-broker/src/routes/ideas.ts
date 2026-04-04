import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { desc, eq } from 'drizzle-orm';
import {
  AcceptJobRequestSchema,
  JobCreateRequestSchema,
  RejectJobRequestSchema,
} from 'intelligence-exchange-cannes-shared';
import { z } from 'zod';
import { db } from '../db/client';
import { briefs, ideas, jobs } from '../db/schema';
import { syncIdeaFunding, syncMilestoneReservation } from '../services/chainService';
import { getSessionAccountAddress, requireSessionAccountAddress, requireSessionWorldRole, requireWorldRole } from '../services/accessService';
import { httpError } from '../services/errors';
import { deriveDeterministicAddress, normalizeAccountAddress } from '../services/identityService';
import { createIdea, generateBrief, acceptJob, rejectJob } from '../services/jobService';
import { getWorldConfig } from '../services/sponsorConfig';
import { readWorldVerificationToken } from '../services/worldId';

export const ideasRouter = new Hono();
type CreateIdeaRequest = z.infer<typeof JobCreateRequestSchema>;

ideasRouter.get('/', async (c) => {
  const posterId = c.req.query('posterId');
  const allIdeas = posterId
    ? await db.select().from(ideas).where(eq(ideas.posterId, posterId)).orderBy(desc(ideas.createdAt))
    : await db.select().from(ideas).orderBy(desc(ideas.createdAt));
  return c.json({ ideas: allIdeas, count: allIdeas.length });
});

ideasRouter.post('/', zValidator('json', JobCreateRequestSchema), async (c) => {
  const req = c.req.valid('json');

  try {
    const worldConfig = getWorldConfig();
    const sessionAccountAddress = await getSessionAccountAddress(c);

    let accountAddress: string;
    let worldIdVerified = false;
    let worldIdProof: CreateIdeaRequest['worldIdProof'] | { nullifierHash: string } | undefined = req.worldIdProof;

    if (sessionAccountAddress) {
      await requireWorldRole(sessionAccountAddress, 'poster');
      accountAddress = sessionAccountAddress;
      worldIdVerified = true;
    } else if (worldConfig.strict) {
      throw httpError('Authenticated session required', 401, 'AUTH_REQUIRED');
    } else if (req.worldVerificationToken) {
      const claims = readWorldVerificationToken(req.worldVerificationToken);
      if (claims.role !== 'poster') {
        throw httpError('World verification token is not valid for poster role', 403, 'WORLD_ROLE_MISMATCH');
      }
      accountAddress = normalizeAccountAddress(
        req.posterAccountAddress
          ?? req.buyerId
          ?? `world-poster-${claims.nullifierHash.slice(0, 12)}`,
      );
      worldIdVerified = true;
      worldIdProof = worldIdProof ?? { nullifierHash: claims.nullifierHash };
    } else {
      accountAddress = normalizeAccountAddress(req.posterAccountAddress ?? req.buyerId ?? 'demo-poster');
      worldIdVerified = Boolean(req.worldIdProof?.nullifierHash);
    }

    const ideaId = await createIdea({
      ...req,
      worldIdProof: worldIdProof ? { nullifierHash: worldIdProof.nullifierHash } : undefined,
    }, accountAddress);
    return c.json({ ideaId, fundingStatus: 'unfunded', worldIdVerified }, 201);
  } catch (err: unknown) {
    console.error('[ideas:create] error', err);
    const status = (err as { status?: number }).status ?? 500;
    const code = (err as { code?: string }).code ?? 'CREATE_FAILED';
    return c.json({ error: { code, message: String(err) } }, status as 400 | 401 | 403 | 409 | 500);
  }
});

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

ideasRouter.post('/:ideaId/plan', async (c) => {
  const { ideaId } = c.req.param();

  try {
    const worldConfig = getWorldConfig();
    const [idea] = await db.select().from(ideas).where(eq(ideas.ideaId, ideaId));
    if (!idea) return c.json({ error: { code: 'NOT_FOUND', message: 'Idea not found' } }, 404);

    const sessionAccountAddress = await getSessionAccountAddress(c);
    const accountAddress = worldConfig.strict
      ? await requireSessionAccountAddress(c)
      : (sessionAccountAddress ?? idea.posterId);

    const briefId = await generateBrief(ideaId, accountAddress);

    if (!worldConfig.strict) {
      const generatedJobs = await db.select({ jobId: jobs.jobId })
        .from(jobs)
        .where(eq(jobs.briefId, briefId));

      if (generatedJobs.length > 0) {
        await syncMilestoneReservation({
          eventType: 'milestone_reserved',
          txHash: `0x${briefId.replace(/-/g, '').padEnd(64, 'd').slice(0, 64)}`,
          subjectId: ideaId,
          payload: { jobIds: generatedJobs.map((job) => job.jobId) },
          status: 'confirmed',
        });
      }
    }

    return c.json({ briefId, status: 'generated' });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const code = (err as { code?: string }).code ?? 'PLAN_FAILED';
    return c.json({ error: { code, message: String(err) } }, status as 401 | 403 | 404 | 409 | 500);
  }
});

ideasRouter.post('/:ideaId/fund', zValidator('json', z.object({
  txHash: z.string(),
  amountUsd: z.number().positive(),
})), async (c) => {
  const { ideaId } = c.req.param();
  const { txHash, amountUsd } = c.req.valid('json');
  const worldConfig = getWorldConfig();

  const [idea] = await db.select().from(ideas).where(eq(ideas.ideaId, ideaId));
  if (!idea) return c.json({ error: { code: 'NOT_FOUND', message: 'Idea not found' } }, 404);

  const accountAddress = worldConfig.strict
    ? (await requireSessionWorldRole(c, 'poster')).accountAddress
    : (await getSessionAccountAddress(c)) ?? idea.posterId;

  if (normalizeAccountAddress(idea.posterId) !== normalizeAccountAddress(accountAddress)) {
    return c.json({ error: { code: 'UNAUTHORIZED_IDEA_ACCESS', message: 'Only the poster can fund the idea' } }, 403);
  }

  await syncIdeaFunding({
    eventType: 'idea_funded',
    txHash,
    subjectId: ideaId,
    payload: { amountUsd },
    status: 'confirmed',
  });

  return c.json({ ideaId, fundingStatus: 'funded', txHash });
});

ideasRouter.post('/:ideaId/accept', zValidator('json', AcceptJobRequestSchema), async (c) => {
  const { ideaId } = c.req.param();
  const { jobId } = c.req.valid('json');
  const worldConfig = getWorldConfig();

  const [idea] = await db.select().from(ideas).where(eq(ideas.ideaId, ideaId));
  if (!idea) return c.json({ error: { code: 'NOT_FOUND', message: 'Idea not found' } }, 404);

  try {
    const sessionAccountAddress = await getSessionAccountAddress(c);
    const accountAddress = worldConfig.strict
      ? await requireSessionAccountAddress(c)
      : sessionAccountAddress ?? deriveDeterministicAddress('demo-reviewer');

    if (
      normalizeAccountAddress(idea.posterId) !== normalizeAccountAddress(accountAddress)
      && (worldConfig.strict || Boolean(sessionAccountAddress))
    ) {
      await requireWorldRole(accountAddress, 'reviewer');
    }

    const result = await acceptJob(jobId, accountAddress);
    return c.json(result);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const code = (err as { code?: string }).code ?? 'ACCEPT_FAILED';
    return c.json({ error: { code, message: String(err) } }, status as 401 | 403 | 404 | 409 | 500);
  }
});

ideasRouter.post('/:ideaId/cancel', async (c) => {
  const { ideaId } = c.req.param();
  const [idea] = await db.select().from(ideas).where(eq(ideas.ideaId, ideaId));
  if (!idea) return c.json({ error: { code: 'NOT_FOUND', message: 'Idea not found' } }, 404);

  const accountAddress = getWorldConfig().strict
    ? await requireSessionAccountAddress(c)
    : (await getSessionAccountAddress(c)) ?? idea.posterId;

  if (normalizeAccountAddress(idea.posterId) !== normalizeAccountAddress(accountAddress)) {
    return c.json({ error: { code: 'UNAUTHORIZED_IDEA_ACCESS', message: 'Only the poster can cancel the idea' } }, 403);
  }
  if (!['unfunded', 'funded'].includes(idea.fundingStatus)) {
    return c.json({ error: { code: 'CANNOT_CANCEL', message: `Cannot cancel idea with status: ${idea.fundingStatus}` } }, 409);
  }
  await db.update(ideas).set({ fundingStatus: 'cancelled', updatedAt: new Date() }).where(eq(ideas.ideaId, ideaId));
  console.log(`[idea:cancelled] ideaId=${ideaId}`);
  return c.json({ ideaId, cancelled: true });
});

ideasRouter.post('/:ideaId/reject', zValidator('json', RejectJobRequestSchema), async (c) => {
  const { ideaId } = c.req.param();
  const { jobId, reason } = c.req.valid('json');
  const worldConfig = getWorldConfig();

  const [idea] = await db.select().from(ideas).where(eq(ideas.ideaId, ideaId));
  if (!idea) return c.json({ error: { code: 'NOT_FOUND', message: 'Idea not found' } }, 404);

  try {
    const sessionAccountAddress = await getSessionAccountAddress(c);
    const accountAddress = worldConfig.strict
      ? await requireSessionAccountAddress(c)
      : sessionAccountAddress ?? deriveDeterministicAddress('demo-reviewer');

    if (
      normalizeAccountAddress(idea.posterId) !== normalizeAccountAddress(accountAddress)
      && (worldConfig.strict || Boolean(sessionAccountAddress))
    ) {
      await requireWorldRole(accountAddress, 'reviewer');
    }

    const result = await rejectJob(jobId, accountAddress, reason);
    return c.json(result);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const code = (err as { code?: string }).code ?? 'REJECT_FAILED';
    return c.json({ error: { code, message: String(err) } }, status as 401 | 403 | 404 | 409 | 500);
  }
});
