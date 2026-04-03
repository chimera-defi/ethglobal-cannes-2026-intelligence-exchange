import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { agentIdentities } from '../db/schema';
import { AgentMetadataSchema } from 'intelligence-exchange-cannes-shared';
import { computeAgentFingerprint } from '../services/jobService';
import { z } from 'zod';

export const workersRouter = new Hono();

const RegisterSchema = z.object({
  workerId: z.string(),
  capabilities: z.array(z.string()).min(1),
  agentMetadata: AgentMetadataSchema,
});

// POST /v1/cannes/workers/register — register agent capability profile
workersRouter.post('/register', zValidator('json', RegisterSchema), async (c) => {
  const { workerId, capabilities, agentMetadata } = c.req.valid('json');

  const fingerprint = computeAgentFingerprint(
    agentMetadata.agentType,
    agentMetadata.agentVersion ?? '0.0.0',
    agentMetadata.operatorAddress ?? '0x0000000000000000000000000000000000000000'
  );

  const existing = await db.select().from(agentIdentities).where(eq(agentIdentities.fingerprint, fingerprint));

  if (existing.length === 0) {
    await db.insert(agentIdentities).values({
      fingerprint,
      agentType: agentMetadata.agentType,
      agentVersion: agentMetadata.agentVersion,
      operatorAddress: agentMetadata.operatorAddress,
      acceptedCount: 0,
      avgScore: '0',
      createdAt: new Date(),
    });
  }

  console.log(`[worker:registered] workerId=${workerId} fingerprint=${fingerprint}`);
  return c.json({ workerId, fingerprint, capabilities, registered: true }, 201);
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
