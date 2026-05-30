import { randomUUID } from 'crypto';
import { createMiddleware } from 'hono/factory';

export type RequestIdVariables = { requestId: string };

export const requestIdMiddleware = createMiddleware<{ Variables: RequestIdVariables }>(async (c, next) => {
  const requestId = randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);
  await next();
});
