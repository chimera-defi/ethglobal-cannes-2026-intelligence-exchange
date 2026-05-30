import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { createLogger } from './lib/logger';
import { requestIdMiddleware, type RequestIdVariables } from './middleware/requestId';
import { aiuRouter } from './routes/aiu';
import { agentkitRouter } from './routes/agentkit';
import { arcRouter } from './routes/arc';
import { authRouter } from './routes/auth';
import { agentsRouter } from './routes/agents';
import { chainRouter } from './routes/chain';
import { githubRouter } from './routes/github';
import { ideasRouter } from './routes/ideas';
import { integrationsRouter } from './routes/integrations';
import { jobsRouter } from './routes/jobs';
import { tokenomicsRouter } from './routes/tokenomics';
import { worldRouter } from './routes/world';
import { workersRouter } from './routes/workers';
import { adminRouter } from './routes/admin';
import { migrate } from './db/migrate';
import { setupLeaseExpiryRequeue } from './queue/milestoneQueue';
import { STALLED_JOB_INTERVAL_MS } from 'intelligence-exchange-cannes-shared';
import { db } from './db/client';
import { rateLimit, walletRateLimit } from './middleware/rateLimit';
import { getSessionAccountAddress } from './services/accessService';

export const app = new Hono<{ Variables: RequestIdVariables }>();

/*
 * CORS security:
 * - Set CORS_ALLOWED_ORIGINS to a comma-separated list of allowed origins in production.
 *   Example: CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
 * - If CORS_ALLOWED_ORIGINS is not set in production, credentials are disabled to prevent
 *   cross-origin cookie/auth leakage (OWASP A05:2021 Security Misconfiguration).
 * - In development (NODE_ENV != production), WEB_APP_URL or localhost:3000 is used as a
 *   permissive fallback.
 */
function buildCorsConfig(): { origin: string | string[]; credentials: boolean } {
  const allowedOriginsEnv = process.env.CORS_ALLOWED_ORIGINS;
  const isProduction = process.env.NODE_ENV === 'production';

  if (allowedOriginsEnv) {
    const origins = allowedOriginsEnv.split(',').map((o) => o.trim()).filter(Boolean);
    return { origin: origins.length === 1 ? origins[0] : origins, credentials: true };
  }

  if (isProduction) {
    // No explicit allowlist set in production — fall back to WEB_APP_URL without credentials
    // to avoid wildcard + credentials misconfiguration.
    const origin = process.env.WEB_APP_URL ?? '';
    if (!origin) {
      console.warn(
        '[security:cors] WARNING: Neither CORS_ALLOWED_ORIGINS nor WEB_APP_URL is set in production. ' +
        'CORS credentials are disabled. Set CORS_ALLOWED_ORIGINS to your frontend domain.'
      );
    }
    return { origin: origin || 'null', credentials: false };
  }

  // Development fallback
  return { origin: process.env.WEB_APP_URL ?? 'http://localhost:3000', credentials: true };
}

const corsConfig = buildCorsConfig();

// Middleware
app.use('*', cors({
  origin: corsConfig.origin,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: corsConfig.credentials,
}));
app.use('*', requestIdMiddleware);
app.use('*', logger());
app.use('*', rateLimit());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', ts: new Date().toISOString() }));

// API routes — apply wallet rate limiting on mutation endpoints
app.route('/v1/cannes/auth', authRouter);
app.route('/v1/cannes/world', worldRouter);
app.route('/v1/cannes/integrations', integrationsRouter);
app.route('/v1/cannes/agents', agentsRouter);
app.route('/v1/cannes/agentkit', agentkitRouter);
app.route('/v1/cannes/github', githubRouter);
app.route('/v1/cannes/arc', arcRouter);
app.route('/v1/cannes/chain', chainRouter);
app.route('/v1/cannes/ideas', ideasRouter);
app.use('/v1/cannes/jobs/*', walletRateLimit(async (c) => getSessionAccountAddress(c)));
app.route('/v1/cannes/jobs', jobsRouter);
app.route('/v1/cannes/tokenomics', tokenomicsRouter);
app.route('/v1/cannes/aiu', aiuRouter);
app.route('/v1/cannes/workers', workersRouter);
app.route('/v1/cannes/admin', adminRouter);

const brokerLog = createLogger('broker:error');

// Error handler
app.onError((err, c) => {
  const status = (err as { status?: number }).status ?? 500;
  const code = (err as { code?: string }).code ?? 'INTERNAL_ERROR';
  const meta: Record<string, unknown> = {
    requestId: c.get('requestId') ?? 'unknown',
    method: c.req.method,
    path: c.req.path,
    status,
    code,
  };
  if (process.env.NODE_ENV !== 'production') meta.stack = err.stack;
  brokerLog.error(err.message, meta);
  return c.json({ error: { code, message: err.message } }, status as 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503);
});

// Startup
const PORT = parseInt(process.env.PORT ?? '3001', 10);

let bootstrapPromise: Promise<void> | null = null;

export async function bootstrap() {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    // Security check: validate ADMIN_API_KEY in production
    if (process.env.NODE_ENV === 'production') {
      const adminApiKey = process.env.ADMIN_API_KEY;
      if (!adminApiKey || adminApiKey.length < 32) {
        console.warn(
          '[security:admin-key] WARNING: ADMIN_API_KEY is not set or is too short in production. ' +
          'Generate a secure key with: openssl rand -hex 32'
        );
      }
    }

    await migrate();
    if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_LEASE_REQUEUE !== '1') {
      await setupLeaseExpiryRequeue(db);
    }
  })();

  return bootstrapPromise;
}

const startupLog = createLogger('broker:startup');

if (import.meta.main) {
  bootstrap()
    .then(() => {
      startupLog.info('Lease expiry requeue active', { intervalSec: STALLED_JOB_INTERVAL_MS / 1000 });
      startupLog.info('IEX Broker listening', { port: PORT });
    })
    .catch((err) => {
      startupLog.error('Bootstrap failed', { error: String(err), stack: err?.stack });
      process.exit(1);
    });
}

export default {
  port: PORT,
  fetch: app.fetch,
};
