import { Queue } from 'bullmq';
import { STALLED_JOB_INTERVAL_MS } from 'intelligence-exchange-cannes-shared';
import type { BrokerDb } from '../db/client';

const REDIS_URL = process.env.REDIS_URL
  ?? `redis://:${process.env.REDIS_PASSWORD ?? 'iex_redis_local_dev_only_change_me'}@localhost:6379`;

// Parse redis connection from URL
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
      await getMilestoneQueue().add(`job:${job.jobId}:requeue`, {
        jobId: job.jobId,
        milestoneType: job.milestoneType,
        requeued: true,
      });

      console.log(`[job:requeued] jobId=${job.jobId} lease expired`);
    }
  }, STALLED_JOB_INTERVAL_MS);
}
