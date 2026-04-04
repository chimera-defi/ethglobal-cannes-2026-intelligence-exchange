import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRouter } from './routes/auth';
import { agentsRouter } from './routes/agents';
import { chainRouter } from './routes/chain';
import { ideasRouter } from './routes/ideas';
import { integrationsRouter } from './routes/integrations';
import { jobsRouter } from './routes/jobs';
import { worldRouter } from './routes/world';
import { workersRouter } from './routes/workers';
import { migrate } from './db/migrate';
import { setupLeaseExpiryRequeue } from './queue/milestoneQueue';
import { db } from './db/client';

export const app = new Hono();

// Middleware
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use('*', logger());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', ts: new Date().toISOString() }));

// API routes
app.route('/v1/cannes/auth', authRouter);
app.route('/v1/cannes/world', worldRouter);
app.route('/v1/cannes/integrations', integrationsRouter);
app.route('/v1/cannes/agents', agentsRouter);
app.route('/v1/cannes/chain', chainRouter);
app.route('/v1/cannes/ideas', ideasRouter);
app.route('/v1/cannes/jobs', jobsRouter);
app.route('/v1/cannes/workers', workersRouter);

// Error handler
app.onError((err, c) => {
  console.error('[broker:error]', err);
  const status = (err as { status?: number }).status ?? 500;
  const code = (err as { code?: string }).code ?? 'INTERNAL_ERROR';
  return c.json({ error: { code, message: err.message } }, status as 400 | 401 | 403 | 404 | 409 | 500);
});

// Startup
const PORT = parseInt(process.env.PORT ?? '3001', 10);

let bootstrapPromise: Promise<void> | null = null;

export async function bootstrap() {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    await migrate();
    if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_LEASE_REQUEUE !== '1') {
      await setupLeaseExpiryRequeue(db);
    }
  })();

  return bootstrapPromise;
}

if (import.meta.main) {
  bootstrap()
    .then(() => {
      console.log(`✓ Lease expiry requeue active (${10}s interval)`);
      console.log(`✓ IEX Broker listening on port ${PORT}`);
    })
    .catch((err) => {
      console.error('[startup:error]', err);
      process.exit(1);
    });
}

export default {
  port: PORT,
  fetch: app.fetch,
};
