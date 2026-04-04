import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  AgentAuthorizationCreateRequestSchema,
  AgentAuthorizationSyncRequestSchema,
} from 'intelligence-exchange-cannes-shared';
import { getSessionAccountAddress, requireWorldRole } from '../services/accessService';
import { createOrUpdateAgentAuthorization, listAgentAuthorizations, syncAgentRegistration } from '../services/authorizationService';
import { httpError } from '../services/errors';
import { syncIdentityGateRole } from '../services/worldchainService';

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
  await requireWorldRole(accountAddress, req.role);
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
  await requireWorldRole(accountAddress, role);
  const sync = await syncIdentityGateRole(accountAddress, role);
  return c.json({ sync });
});
