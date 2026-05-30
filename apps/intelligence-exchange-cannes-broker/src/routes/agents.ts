import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
  AgentAuthorizationCreateRequestSchema,
  AgentAuthorizationSyncRequestSchema,
} from 'intelligence-exchange-cannes-shared';
import { getSessionAccountAddress, requireWorldRoleIfStrict } from '../services/accessService';
import { createOrUpdateAgentAuthorization, listAgentAuthorizations, syncAgentRegistration } from '../services/authorizationService';
import { httpError } from '../services/errors';
import { syncIdentityGateRole } from '../services/worldchainService';
import { db } from '../db/client';
import { agentIdentities } from '../db/schema';

export const agentsRouter = new Hono();

agentsRouter.get('/authorizations', async (c) => {
  const accountAddress = await getSessionAccountAddress(c);
  if (!accountAddress) throw httpError('Authenticated session required', 401, 'AUTH_REQUIRED');
  return c.json({ authorizations: await listAgentAuthorizations(accountAddress) });
});

agentsRouter.post('/authorizations', zValidator('json', AgentAuthorizationCreateRequestSchema), async (c) => {
  const accountAddress = await getSessionAccountAddress(c);
  if (!accountAddress) throw httpError('Authenticated session required', 401, 'AUTH_REQUIRED');

  const req = c.req.valid('json');
  await requireWorldRoleIfStrict(accountAddress, req.role);
  const authorization = await createOrUpdateAgentAuthorization(accountAddress, req);
  return c.json({ authorization }, 201);
});

agentsRouter.post('/authorizations/:authorizationId/sync-registration', zValidator('json', AgentAuthorizationSyncRequestSchema), async (c) => {
  const accountAddress = await getSessionAccountAddress(c);
  if (!accountAddress) throw httpError('Authenticated session required', 401, 'AUTH_REQUIRED');

  const req = c.req.valid('json');
  const authorization = await syncAgentRegistration(accountAddress, c.req.param('authorizationId'), req);
  return c.json({ authorization });
});

agentsRouter.post('/worldchain/sync-role', zValidator('json', z.object({
  role: z.enum(['poster', 'worker', 'reviewer']),
})), async (c) => {
  const accountAddress = await getSessionAccountAddress(c);
  if (!accountAddress) throw httpError('Authenticated session required', 401, 'AUTH_REQUIRED');

  const { role } = c.req.valid('json');
  await requireWorldRoleIfStrict(accountAddress, role);
  const sync = await syncIdentityGateRole(accountAddress, role);
  return c.json({ sync });
});

// ─── External reputation query (SingularityNET-inspired, no auth required) ───
// Allows any external protocol to query portable agent reputation data.
// This is the first step toward cross-chain reputation composability.
agentsRouter.get('/reputation/:fingerprint', async (c) => {
  const fingerprint = c.req.param('fingerprint');
  if (!fingerprint || fingerprint.length < 10) throw httpError('Invalid fingerprint', 400, 'INVALID_FINGERPRINT');

  const agent = await db.query.agentIdentities.findFirst({
    where: eq(agentIdentities.fingerprint, fingerprint),
  });
  if (!agent) throw httpError('Agent not found', 404, 'AGENT_NOT_FOUND');

  return c.json({
    fingerprint: agent.fingerprint,
    agentType: agent.agentType,
    agentVersion: agent.agentVersion,
    acceptedCount: agent.acceptedCount,
    avgScore: Number(agent.avgScore),
    consecutiveAccepts: agent.consecutiveAccepts ?? 0,
    registeredAt: agent.registeredAt,
    // Schema version for external consumers to handle future additions
    schemaVersion: '1.0',
    // Signal to external protocols: this data is acceptance-gated (human reviewer required)
    verificationMethod: 'human-reviewed-acceptance',
  });
});
