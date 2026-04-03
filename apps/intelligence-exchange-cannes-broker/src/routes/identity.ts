import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { WorldSubjectTypeSchema, WorldVerifyRequestSchema } from 'intelligence-exchange-cannes-shared';
import { getWorldVerificationStatus, verifyWorldIdentity } from '../services/identityService';

export const identityRouter = new Hono();

identityRouter.post('/world/verify', zValidator('json', WorldVerifyRequestSchema), async (c) => {
  const request = c.req.valid('json');
  try {
    const result = await verifyWorldIdentity(request);
    return c.json(result, 201);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    return c.json({ error: { code: 'WORLD_VERIFY_FAILED', message: String(err) } }, status as 400 | 500);
  }
});

identityRouter.get('/world/status', zValidator('query', z.object({
  subjectType: WorldSubjectTypeSchema,
  subjectId: z.string(),
})), async (c) => {
  const { subjectType, subjectId } = c.req.valid('query');
  const result = await getWorldVerificationStatus(subjectType, subjectId);
  return c.json(result);
});
