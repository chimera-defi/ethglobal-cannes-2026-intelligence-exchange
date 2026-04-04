import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getIntegrationStatus, getWorldConfig } from '../services/sponsorConfig';
import { createRpSignature, verifyWorldProof } from '../services/worldId';

export const integrationsRouter = new Hono();

integrationsRouter.get('/status', (c) => {
  return c.json(getIntegrationStatus());
});

integrationsRouter.post('/world/rp-signature', zValidator('json', z.object({
  action: z.string().optional(),
})), async (c) => {
  try {
    const { action } = c.req.valid('json');
    const config = getWorldConfig();
    const signature = createRpSignature(action ?? config.action);
    return c.json(signature);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    return c.json({ error: { code: 'WORLD_RP_SIGNATURE_FAILED', message: String(err) } }, status as 400 | 403 | 422 | 500 | 503);
  }
});

integrationsRouter.post('/world/verify', zValidator('json', z.object({
  role: z.enum(['poster', 'worker', 'reviewer']).default('poster'),
  idkitResponse: z.unknown(),
})), async (c) => {
  try {
    const { role, idkitResponse } = c.req.valid('json');
    const result = await verifyWorldProof(idkitResponse, role);
    return c.json(result);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const details = (err as { details?: unknown }).details;
    return c.json({
      error: {
        code: 'WORLD_VERIFY_FAILED',
        message: String(err),
        details,
      },
    }, status as 400 | 403 | 422 | 500 | 503);
  }
});
