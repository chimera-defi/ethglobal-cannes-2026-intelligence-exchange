import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  getIdeaReserveSnapshot,
  getTokenAccountSnapshot,
  getTokenomicsStatus,
  quoteStableMint,
} from '../services/tokenomicsService';

export const tokenomicsRouter = new Hono();

tokenomicsRouter.get('/status', async (c) => {
  const status = await getTokenomicsStatus();
  return c.json(status);
});

tokenomicsRouter.post('/quote/mint', zValidator('json', z.object({
  stableAmountUsd: z.number().positive(),
})), async (c) => {
  const { stableAmountUsd } = c.req.valid('json');
  const quote = await quoteStableMint(stableAmountUsd);
  return c.json(quote);
});

tokenomicsRouter.get('/accounts/:accountAddress', async (c) => {
  const { accountAddress } = c.req.param();
  const snapshot = await getTokenAccountSnapshot(accountAddress);
  return c.json(snapshot);
});

tokenomicsRouter.get('/ideas/:ideaId', async (c) => {
  const { ideaId } = c.req.param();
  const reserve = await getIdeaReserveSnapshot(ideaId);
  if (!reserve) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Idea token reserve not found' } }, 404);
  }
  return c.json(reserve);
});
