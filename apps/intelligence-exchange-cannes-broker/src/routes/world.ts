import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { WorldVerificationRequestSchema } from 'intelligence-exchange-cannes-shared';
import { getSessionAccountAddress } from '../services/accessService';
import { httpError } from '../services/errors';
import { getWorldStatus, verifyWorldRoleProof } from '../services/worldService';

export const worldRouter = new Hono();

worldRouter.post('/verify', zValidator('json', WorldVerificationRequestSchema), async (c) => {
  const accountAddress = await getSessionAccountAddress(c);
  if (!accountAddress) throw httpError('Authenticated session required for World verification', 401, 'AUTH_REQUIRED');

  const req = c.req.valid('json');
  const verification = await verifyWorldRoleProof({
    accountAddress,
    role: req.role,
    proof: req.proof,
  });

  return c.json({ verification }, 201);
});

worldRouter.get('/status', async (c) => {
  const accountAddress = await getSessionAccountAddress(c);
  if (!accountAddress) throw httpError('Authenticated session required', 401, 'AUTH_REQUIRED');
  return c.json(await getWorldStatus(accountAddress));
});
