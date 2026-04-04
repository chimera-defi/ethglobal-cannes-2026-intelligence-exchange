import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { ChainReceiptSyncSchema } from 'intelligence-exchange-cannes-shared';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { ideas, jobs } from '../db/schema';
import { requireSessionAccountAddress, requireWorldRole } from '../services/accessService';
import { applyChainSync } from '../services/chainService';
import { httpError } from '../services/errors';

export const chainRouter = new Hono();

async function requirePosterOwnedIdea(accountAddress: string, ideaId: string) {
  await requireWorldRole(accountAddress, 'poster');

  const [idea] = await db.select().from(ideas).where(eq(ideas.ideaId, ideaId));
  if (!idea) throw httpError('Idea not found', 404, 'IDEA_NOT_FOUND');
  if (idea.posterId !== accountAddress) {
    throw httpError('Only the poster can sync escrow events for this idea', 403, 'UNAUTHORIZED_IDEA_ACCESS');
  }

  return idea;
}

chainRouter.post('/sync', zValidator('json', ChainReceiptSyncSchema), async (c) => {
  const accountAddress = await requireSessionAccountAddress(c);
  const req = c.req.valid('json');

  switch (req.eventType) {
    case 'idea_funded':
    case 'milestone_reserved':
    case 'milestone_released':
      await requirePosterOwnedIdea(accountAddress, req.subjectId);
      break;
    case 'accepted_submission_attested': {
      const jobId = typeof req.payload.jobId === 'string' ? req.payload.jobId : undefined;
      if (!jobId) {
        throw httpError('accepted_submission_attested sync requires payload.jobId', 400, 'INVALID_CHAIN_SYNC_PAYLOAD');
      }

      const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
      if (!job) throw httpError('Job not found', 404, 'JOB_NOT_FOUND');

      const [idea] = await db.select().from(ideas).where(eq(ideas.ideaId, job.ideaId));
      if (!idea) throw httpError('Idea not found', 404, 'IDEA_NOT_FOUND');

      if (idea.posterId !== accountAddress) {
        await requireWorldRole(accountAddress, 'reviewer');
      }
      break;
    }
    case 'agent_registered':
      throw httpError(
        'Use /v1/cannes/agents/authorizations/:authorizationId/sync-registration for agent registration sync',
        403,
        'CHAIN_SYNC_ROUTE_UNSUPPORTED',
      );
    default:
      break;
  }

  const sync = await applyChainSync(req);
  return c.json({ sync });
});
