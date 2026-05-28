import type { Context, Next } from 'hono';

/**
 * In-memory rate limiter for broker endpoints.
 *
 * PRODUCTION NOTE:
 *   This implementation uses a process-local Map, which means limits are NOT
 *   shared across multiple broker instances (e.g. horizontal scaling) and are
 *   reset on restart.
 *
 *   For production hardening:
 *   1. Replace with a Redis-backed rate limiter (e.g. `rate-limiter-flexible`
 *      with an ioredis store) so limits survive restarts and work across replicas.
 *   2. Consider adding Caddy-level rate limiting as a first line of defense
 *      (see infra/caddy/Caddyfile for configuration notes).
 *   3. The X-Forwarded-For header is trusted as-is — if behind a load balancer,
 *      ensure only trusted proxies can set this header to prevent IP spoofing.
 */
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 60;  // per window per IP

function getClientIdentifier(c: Context): string {
  // Prefer forwarded IP, fallback to direct connection
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  try {
    const info = c.env?.connInfo as { remote?: { address?: string } } | undefined;
    return info?.remote?.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function isLimitExceeded(key: string): boolean {
  const now = Date.now();
  const entry = requestCounts.get(key);
  if (!entry || now > entry.resetAt) {
    requestCounts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_REQUESTS;
}

/** Clean up stale entries periodically */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requestCounts) {
    if (now > entry.resetAt) requestCounts.delete(key);
  }
}, WINDOW_MS);

export function rateLimit() {
  return async (c: Context, next: Next) => {
    // Skip rate limiting in test mode — the in-memory Map persists across tests
    // and fires after ~60 requests, breaking any test that runs late in the suite.
    if (process.env.NODE_ENV === 'test') return next();
    const key = getClientIdentifier(c);
    if (isLimitExceeded(key)) {
      return c.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' } },
        429,
      );
    }
    await next();
  };
}

/** Stricter rate limit for authenticated mutation endpoints (per wallet) */
const WALLET_WINDOW_MS = 60_000;
const WALLET_MAX_REQUESTS = 20;

const walletCounts = new Map<string, { count: number; resetAt: number }>();

function isWalletLimitExceeded(key: string): boolean {
  const now = Date.now();
  const entry = walletCounts.get(key);
  if (!entry || now > entry.resetAt) {
    walletCounts.set(key, { count: 1, resetAt: now + WALLET_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > WALLET_MAX_REQUESTS;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of walletCounts) {
    if (now > entry.resetAt) walletCounts.delete(key);
  }
}, WALLET_WINDOW_MS);

export function walletRateLimit(getWalletKey: (c: Context) => string | null | Promise<string | null>) {
  return async (c: Context, next: Next) => {
    if (process.env.NODE_ENV === 'test') return next();
    const wallet = await getWalletKey(c);
    if (!wallet) return next(); // skip if no wallet identified
    if (isWalletLimitExceeded(wallet)) {
      return c.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many requests for this wallet.' } },
        429,
      );
    }
    await next();
  };
}
