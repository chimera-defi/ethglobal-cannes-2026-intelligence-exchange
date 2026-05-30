import { Queue } from 'bullmq';
import { STALLED_JOB_INTERVAL_MS } from 'intelligence-exchange-cannes-shared';
import type { BrokerDb } from '../db/client';
import { logJobEvent } from '../services/jobEvents';

/*
 * PRODUCTION SECURITY: Redis must be hardened before exposing the stack publicly.
 *
 *   1. requirepass: Add `requirepass <strong-random-password>` to redis.conf and
 *      update REDIS_URL to redis://:<password>@127.0.0.1:6379
 *   2. bind: Ensure redis.conf has `bind 127.0.0.1` so Redis is NOT reachable
 *      from external interfaces.
 *   3. No pub/sub channels expose sensitive data — the milestone-jobs queue
 *      carries only job IDs and milestone types (no PII, no keys).
 */
const REDIS_URL = process.env.REDIS_URL
  ?? `redis://:${process.env.REDIS_PASSWORD ?? 'iex_redis_local_dev_only_change_me'}@localhost:6379`;

// Parse redis connection from URL, preserving auth and db
function parseRedisConnection(url: string) {
  try {
    const u = new URL(url);
    const connection: {
      host: string;
      port: number;
      username?: string;
      password?: string;
      db?: number;
    } = {
      host: u.hostname,
      port: parseInt(u.port || '6379', 10),
    };

    if (u.username) connection.username = decodeURIComponent(u.username);
    if (u.password) connection.password = decodeURIComponent(u.password);

    if (u.pathname && u.pathname !== '/') {
      const db = parseInt(u.pathname.slice(1), 10);
      if (!Number.isNaN(db)) connection.db = db;
    }

    return connection;
  } catch {
    return {
      host: 'localhost',
      port: 6379,
      password: process.env.REDIS_PASSWORD || undefined,
    };
  }
}

// Security: warn if REDIS_URL resolves to a non-loopback address in production
if (process.env.NODE_ENV === 'production') {
  try {
    const parsedRedis = new URL(REDIS_URL);
    const host = parsedRedis.hostname;
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (!isLocalhost) {
      console.warn(
        '[security:redis] WARNING: REDIS_URL points to a non-localhost host in production (' + host + '). ' +
        'Ensure Redis is firewalled and requirepass is set. ' +
        'See: https://redis.io/docs/manual/security/'
      );
    }
  } catch {
    // unparseable URL — leave connection setup to fail naturally
  }
}

const connection = parseRedisConnection(REDIS_URL);

let milestoneQueue: Queue | null = null;

function getMilestoneQueue() {
  if (milestoneQueue) return milestoneQueue;

  milestoneQueue = new Queue('milestone-jobs', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });

  return milestoneQueue;
}

// Re-queue stalled jobs (lease expired) back to the queue.
// This runs every STALLED_JOB_INTERVAL_MS (10s for demo responsiveness).
export async function setupLeaseExpiryRequeue(db: BrokerDb) {
  const { jobs, claims } = await import('../db/schema');
  const { eq, lt, and } = await import('drizzle-orm');

  setInterval(async () => {
    try {
      const now = new Date();

      // Find active claims that have expired
      const expiredClaims = await db.select({
        claimId: claims.claimId,
        jobId: claims.jobId,
        workerId: claims.workerId,
      })
        .from(claims)
        .where(
          and(
            eq(claims.status, 'active'),
            lt(claims.expiresAt, now)
          )
        );

      for (const claim of expiredClaims) {
        // Update claim status to expired
        await db.update(claims)
          .set({ status: 'expired' })
          .where(eq(claims.claimId, claim.claimId));

        // Unclaim the associated job
        await db.update(jobs).set({
          status: 'queued',
          activeClaimId: null,
          activeClaimWorkerId: null,
          leaseExpiry: null,
          updatedAt: now,
        }).where(eq(jobs.jobId, claim.jobId));

        // Re-add to BullMQ
        const [jobRow] = await db.select({ milestoneType: jobs.milestoneType })
          .from(jobs)
          .where(eq(jobs.jobId, claim.jobId));

        await getMilestoneQueue().add(`job:${claim.jobId}:requeue`, {
          jobId: claim.jobId,
          milestoneType: jobRow?.milestoneType ?? 'unknown',
          requeued: true,
        });

        await logJobEvent(claim.jobId, 'queued', 'system', {
          claimId: claim.claimId,
          workerId: claim.workerId,
          reason: 'lease_expired_auto_unclaim',
        });

        console.log(`[job:requeued] jobId=${claim.jobId} claimId=${claim.claimId} lease expired (auto-unclaim)`);
      }
    } catch (err) {
      console.error('[milestoneQueue] lease expiry requeue failed:', err);
    }
  }, STALLED_JOB_INTERVAL_MS);
}
