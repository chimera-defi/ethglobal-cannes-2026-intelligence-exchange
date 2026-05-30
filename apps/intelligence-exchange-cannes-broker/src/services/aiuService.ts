import { randomUUID } from 'crypto';
import { desc, gte, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { acceptedAttestations, aiuSnapshots, jobs, tokenLedgerEntries } from '../db/schema';
import { getTokenomicsConfig } from './tokenomicsService';

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function round(value: number, decimals = 8): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Compute the current AIU (Accepted Intelligence Unit) index from DB records.
 *
 * AIU price = total INTEL paid to workers / total accepted jobs
 *
 * This is the market-discovered price of one unit of verified AI work output —
 * the foundation for the intelligence derivatives layer.
 */
export async function computeAIUIndex() {
  const config = getTokenomicsConfig();

  // Total accepted jobs (from attestation records, not just job status)
  const [attestationCount] = await db
    .select({ count: sql<string>`COUNT(*)` })
    .from(acceptedAttestations);
  const totalAcceptedJobs = Number.parseInt(attestationCount?.count ?? '0', 10);

  // Total INTEL paid out to workers (worker_payout entries)
  const [payoutSum] = await db
    .select({ total: sql<string>`COALESCE(SUM(delta_intel::numeric), 0)` })
    .from(tokenLedgerEntries)
    .where(sql`entry_type = 'worker_payout'`);
  const totalIntelPaidOut = round(toNumber(payoutSum?.total, 0), 8);

  // AIU price: INTEL per accepted job (0 if no jobs yet)
  const aiuPriceIntel = totalAcceptedJobs > 0
    ? round(totalIntelPaidOut / totalAcceptedJobs, 8)
    : 0;

  // Weekly window (last 7 days)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [weeklyAttestation] = await db
    .select({ count: sql<string>`COUNT(*)` })
    .from(acceptedAttestations)
    .where(gte(acceptedAttestations.createdAt, weekAgo));
  const weeklyAcceptedJobs = Number.parseInt(weeklyAttestation?.count ?? '0', 10);

  const [weeklyPayout] = await db
    .select({ total: sql<string>`COALESCE(SUM(delta_intel::numeric), 0)` })
    .from(tokenLedgerEntries)
    .where(sql`entry_type = 'worker_payout' AND created_at >= ${weekAgo.toISOString()}`);
  const weeklyIntelPaidOut = round(toNumber(weeklyPayout?.total, 0), 8);

  // Total jobs submitted (for acceptance rate)
  const [submittedCount] = await db
    .select({ count: sql<string>`COUNT(*)` })
    .from(jobs)
    .where(sql`status IN ('submitted', 'accepted', 'settled', 'rework')`);
  const totalReviewed = Number.parseInt(submittedCount?.count ?? '0', 10);
  const acceptanceRate = totalReviewed > 0
    ? round(totalAcceptedJobs / totalReviewed, 4)
    : null;

  // Fetch.ai-inspired availability signal: workers with low unclaim rates earn up to +20% on AIU contribution
  const availabilityRows = await db.execute(sql`
    SELECT
      claimed_by AS worker,
      COUNT(*) AS total_claimed,
      SUM(CASE WHEN status = 'open' AND claimed_by IS NOT NULL THEN 1 ELSE 0 END) AS unclaimed
    FROM jobs
    WHERE claimed_by IS NOT NULL
    GROUP BY claimed_by
  `);
  const workerAvailability = new Map<string, number>();
  for (const row of availabilityRows.rows as Array<{ worker: string; total_claimed: string; unclaimed: string }>) {
    const total = Number(row.total_claimed);
    const unclaimed = Number(row.unclaimed);
    const rate = total > 0 ? unclaimed / total : 0;
    workerAvailability.set(row.worker, rate < 0.10 ? 1.0 : rate < 0.30 ? 0.8 : 0.5);
  }

  return {
    tokenSymbol: config.symbol,
    totalAcceptedJobs,
    totalIntelPaidOut,
    aiuPriceIntel,
    weeklyAcceptedJobs,
    weeklyIntelPaidOut,
    acceptanceRate,
    workerAvailability: Object.fromEntries(workerAvailability),
    computedAt: new Date().toISOString(),
  };
}

/**
 * Save an AIU snapshot to the aiu_snapshots table for historical tracking.
 * Called on every acceptance to build the index time series.
 */
export async function saveAIUSnapshot() {
  const index = await computeAIUIndex();
  const now = new Date();

  await db.insert(aiuSnapshots).values({
    snapshotId: randomUUID(),
    computedAt: now,
    totalAcceptedJobs: index.totalAcceptedJobs,
    totalIntelPaidOut: index.totalIntelPaidOut.toFixed(8),
    aiuPriceIntel: index.aiuPriceIntel.toFixed(8),
    periodAcceptedJobs: index.weeklyAcceptedJobs,
    periodIntelPaidOut: index.weeklyIntelPaidOut.toFixed(8),
    acceptanceRate: index.acceptanceRate != null ? index.acceptanceRate.toFixed(4) : null,
    createdAt: now,
  });

  return index;
}

/**
 * Return the last N days of AIU snapshots for the history chart.
 */
export async function getAIUHistory(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(aiuSnapshots)
    .where(gte(aiuSnapshots.createdAt, since))
    .orderBy(desc(aiuSnapshots.createdAt))
    .limit(days * 24); // up to hourly snapshots

  return rows.map((r) => ({
    snapshotId: r.snapshotId,
    computedAt: r.computedAt,
    totalAcceptedJobs: r.totalAcceptedJobs,
    totalIntelPaidOut: toNumber(r.totalIntelPaidOut),
    aiuPriceIntel: toNumber(r.aiuPriceIntel),
    periodAcceptedJobs: r.periodAcceptedJobs,
    periodIntelPaidOut: toNumber(r.periodIntelPaidOut),
    acceptanceRate: r.acceptanceRate != null ? toNumber(r.acceptanceRate) : null,
  }));
}
