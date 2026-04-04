import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { agentIdentities } from '../db/schema';
import { AgentMetadataSchema } from 'intelligence-exchange-cannes-shared';
import { z } from 'zod';
import { requireAgentAuthorization, requireSessionWorldRole } from '../services/accessService';
import { computeAgentFingerprint } from '../services/identityService';
import { httpError } from '../services/errors';

export const workersRouter = new Hono();

const RegisterSchema = z.object({
  workerId: z.string(),
  capabilities: z.array(z.string()).min(1),
  agentMetadata: AgentMetadataSchema,
});

// POST /v1/cannes/workers/register — register agent capability profile
workersRouter.post('/register', zValidator('json', RegisterSchema), async (c) => {
  const { accountAddress } = await requireSessionWorldRole(c, 'worker');
  const { workerId, capabilities, agentMetadata } = c.req.valid('json');

  const fingerprint = computeAgentFingerprint(
    agentMetadata.agentType,
    agentMetadata.agentVersion ?? '0.0.0',
    agentMetadata.operatorAddress ?? accountAddress
  );

  if (fingerprint !== agentMetadata.fingerprint && agentMetadata.fingerprint) {
    throw httpError('Provided fingerprint does not match broker-computed fingerprint', 409, 'FINGERPRINT_MISMATCH');
  }

  await requireAgentAuthorization({
    accountAddress,
    fingerprint,
    role: 'worker',
    requiredPermissions: ['claim_jobs', 'submit_results'],
  });

  const [existing] = await db.select().from(agentIdentities).where(eq(agentIdentities.fingerprint, fingerprint));

  if (!existing) {
    throw httpError('On-chain synced agent identity required before worker registration', 409, 'AGENT_IDENTITY_REQUIRED');
  }

  console.log(`[worker:registered] workerId=${workerId} fingerprint=${fingerprint}`);
  return c.json({ workerId, fingerprint, capabilities, registered: true, accountAddress }, 201);
});

// POST /v1/cannes/workers/heartbeat — keep-alive
workersRouter.post('/heartbeat', zValidator('json', z.object({
  workerId: z.string(),
  status: z.enum(['idle', 'busy', 'offline']).default('idle'),
})), async (c) => {
  const { workerId, status } = c.req.valid('json');
  return c.json({ workerId, status, ts: new Date().toISOString() });
});

// GET /v1/cannes/workers/:fingerprint/reputation — query on-chain reputation mirror
workersRouter.get('/:fingerprint/reputation', async (c) => {
  const { fingerprint } = c.req.param();
  const [agent] = await db.select().from(agentIdentities).where(eq(agentIdentities.fingerprint, fingerprint));
  if (!agent) return c.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404);

  return c.json({
    fingerprint,
    agentType: agent.agentType,
    acceptedCount: agent.acceptedCount,
    avgScore: agent.avgScore,
    onChainTokenId: agent.onChainTokenId,
    registeredAt: agent.registeredAt,
  });
});
