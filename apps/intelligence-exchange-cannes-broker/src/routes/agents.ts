import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  AgentAuthorizationCreateRequestSchema,
  AgentAuthorizationSyncRequestSchema,
} from 'intelligence-exchange-cannes-shared';
import { getSessionAccountAddress, requireWorldRole } from '../services/accessService';
import { createOrUpdateAgentAuthorization, listAgentAuthorizations, syncAgentRegistration } from '../services/authorizationService';
import { httpError } from '../services/errors';

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
