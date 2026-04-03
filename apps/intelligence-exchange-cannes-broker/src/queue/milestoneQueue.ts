import { Queue, Worker } from 'bullmq';
import { STALLED_JOB_INTERVAL_MS } from 'intelligence-exchange-cannes-shared';
import type { BrokerDb } from '../db/client';

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

export const milestoneQueue = new Queue('milestone-jobs', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

// Re-queue stalled jobs (lease expired) back to the queue.
// This runs every STALLED_JOB_INTERVAL_MS (10s for demo responsiveness).
export async function setupLeaseExpiryRequeue(db: BrokerDb) {
  const { jobs } = await import('../db/schema');
  const { eq, lt, and, inArray } = await import('drizzle-orm');

  setInterval(async () => {
    const now = new Date();
    const stalled = await db.select({ jobId: jobs.jobId, milestoneType: jobs.milestoneType })
      .from(jobs)
      .where(
        and(
          inArray(jobs.status, ['claimed', 'running']),
          lt(jobs.leaseExpiry, now)
        )
      );

    for (const job of stalled) {
      await db.update(jobs).set({
        status: 'queued',
        activeClaimId: null,
        activeClaimWorkerId: null,
        leaseExpiry: null,
        updatedAt: now,
      }).where(eq(jobs.jobId, job.jobId));

      // Re-add to BullMQ
      await milestoneQueue.add(`job:${job.jobId}:requeue`, {
        jobId: job.jobId,
        milestoneType: job.milestoneType,
        requeued: true,
      });

      console.log(`[job:requeued] jobId=${job.jobId} lease expired`);
    }
  }, STALLED_JOB_INTERVAL_MS);
}
