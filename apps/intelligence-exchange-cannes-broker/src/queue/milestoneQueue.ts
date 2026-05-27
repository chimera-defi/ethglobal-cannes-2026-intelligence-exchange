import { Queue } from 'bullmq';
import { STALLED_JOB_INTERVAL_MS } from 'intelligence-exchange-cannes-shared';
import type { BrokerDb } from '../db/client';
import { logJobEvent } from '../services/jobEvents';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Parse redis connection from URL
function parseRedisConnection(url: string) {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: parseInt(u.port || '6379', 10) };
  } catch {
    return { host: 'localhost', port: 6379 };
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
