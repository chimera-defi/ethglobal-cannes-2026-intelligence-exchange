import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { escrowReleases, jobs } from '../db/schema';

export type SettlementRecordInput = {
  txHash: string;
  payer: string;
  payee: string;
  amountUsd: number;
};

export async function persistEscrowSettlement(jobId: string, settlement: SettlementRecordInput) {
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) {
    throw Object.assign(new Error('Job not found for settlement recording'), { status: 404 });
  }

  await db.insert(escrowReleases).values({
    releaseId: randomUUID(),
    jobId,
    ideaId: job.ideaId,
    milestoneId: job.milestoneId,
    payer: settlement.payer,
    payee: settlement.payee,
    amountUsd: settlement.amountUsd.toFixed(2),
    txHash: settlement.txHash,
    status: 'confirmed',
    releasedAt: new Date(),
  });
}
