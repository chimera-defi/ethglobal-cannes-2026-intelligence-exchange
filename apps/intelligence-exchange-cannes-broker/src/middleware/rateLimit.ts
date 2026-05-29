import type { Context, Next } from 'hono';
import { Redis } from 'ioredis';

/**
 * Redis-backed rate limiter for broker endpoints with graceful in-memory fallback.
 *
 * Uses a sliding window algorithm with INCR + EXPIRE for atomic rate limiting.
 * Falls back to in-memory Map if Redis is unavailable.
 *
 * PRODUCTION NOTE:
 *   1. Ensure REDIS_URL is set for production deployments.
 *   2. Consider adding Caddy-level rate limiting as a first line of defense
 *      (see infra/caddy/Caddyfile for configuration notes).
 *   3. The X-Forwarded-For header is trusted as-is — if behind a load balancer,
 *      ensure only trusted proxies can set this header to prevent IP spoofing.
 */
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 60;  // per window per IP

// Lazy Redis client singleton
let redisClient: Redis | null = null;
let redisAvailable = true;

function getRedis(): Redis | null {
  if (!redisAvailable) return null;

  if (redisClient) return redisClient;

  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => {
        if (times > 1) {
          redisAvailable = false;
          console.warn('[rateLimit] Redis unavailable, falling back to in-memory Map');
          return null;
        }
        return Math.min(times * 50, 200);
      },
    });

    redisClient.on('error', (err) => {
      console.warn('[rateLimit] Redis error:', err.message);
      redisAvailable = false;
      redisClient = null;
    });

    return redisClient;
  } catch (err) {
    console.warn('[rateLimit] Failed to create Redis client, falling back to in-memory Map:', err);
    redisAvailable = false;
    return null;
  }
}

// In-memory fallback
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function getClientIdentifier(c: Context): string {
  // Only trust X-Forwarded-For when request comes from Caddy (127.0.0.1).
  // Direct connections must use the raw socket IP to prevent rate-limit bypass via spoofed XFF.
  try {
    const info = c.env?.connInfo as { remote?: { address?: string } } | undefined;
    const remoteIp = info?.remote?.address ?? '';
    const isFromProxy = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '';
    if (isFromProxy) {
      const forwarded = c.req.header('x-forwarded-for');
      if (forwarded) return forwarded.split(',')[0].trim();
    }
    return remoteIp || 'unknown';
  } catch {
    return 'unknown';
  }
}

async function isLimitExceeded(key: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    try {
      const redisKey = `rl:${key}`;
      const ttl = WINDOW_MS / 1000;

      const current = await redis.incr(redisKey);
      if (current === 1) {
        await redis.expire(redisKey, ttl);
      }

      return current > MAX_REQUESTS;
    } catch (err) {
      console.warn('[rateLimit] Redis operation failed, falling back to in-memory Map:', err);
      redisAvailable = false;
      redisClient = null;
    }
  }

  // In-memory fallback
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
    if (await isLimitExceeded(key)) {
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

// In-memory fallback for wallet rate limiting
const walletCounts = new Map<string, { count: number; resetAt: number }>();

async function isWalletLimitExceeded(key: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    try {
      const redisKey = `rl:wallet:${key}`;
      const ttl = WALLET_WINDOW_MS / 1000;

      const current = await redis.incr(redisKey);
      if (current === 1) {
        await redis.expire(redisKey, ttl);
      }

      return current > WALLET_MAX_REQUESTS;
    } catch (err) {
      console.warn('[rateLimit] Redis wallet operation failed, falling back to in-memory Map:', err);
      redisAvailable = false;
      redisClient = null;
    }
  }

  // In-memory fallback
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
    if (await isWalletLimitExceeded(wallet)) {
      return c.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many requests for this wallet.' } },
        429,
      );
    }
    await next();
  };
}
