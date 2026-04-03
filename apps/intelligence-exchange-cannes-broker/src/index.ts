import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { ideasRouter } from './routes/ideas';
import { jobsRouter } from './routes/jobs';
import { workersRouter } from './routes/workers';
import { identityRouter } from './routes/identity';
import { migrate } from './db/migrate';
import { setupLeaseExpiryRequeue } from './queue/milestoneQueue';
import { db } from './db/client';

const app = new Hono();

// Middleware
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use('*', logger());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', ts: new Date().toISOString() }));

// API routes
app.route('/v1/cannes/ideas', ideasRouter);
app.route('/v1/cannes/jobs', jobsRouter);
app.route('/v1/cannes/workers', workersRouter);
app.route('/v1/cannes/identity', identityRouter);
app.get('/v1/cannes/integrations/status', () => new Response(JSON.stringify({
  world: {
    enforced: process.env.WORLD_ENFORCE_VERIFIED === '1',
    mode: process.env.WORLD_ENFORCE_VERIFIED === '1' ? 'required' : 'demo-fallback',
  },
  zeroG: {
    mode: process.env.ZERO_G_WRITE_URL ? 'remote-writer' : 'local-dossier-fallback',
  },
  arc: {
    mode: 'contract-ready-web-funding-demo',
  },
}), { headers: { 'content-type': 'application/json' } }));

// Error handler
app.onError((err, c) => {
  console.error('[broker:error]', err);
  return c.json({ error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
});

// Startup
const PORT = parseInt(process.env.PORT ?? '3001', 10);

async function start() {
  try {
    await migrate();
    await setupLeaseExpiryRequeue(db);
    console.log(`✓ Lease expiry requeue active (${10}s interval)`);
    console.log(`✓ IEX Broker listening on port ${PORT}`);
  } catch (err) {
    console.error('[startup:error]', err);
    process.exit(1);
  }
}

start();

export default {
  port: PORT,
  fetch: app.fetch,
};
