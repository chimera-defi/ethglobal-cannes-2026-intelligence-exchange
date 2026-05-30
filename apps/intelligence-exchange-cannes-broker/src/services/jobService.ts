import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { jobs, claims, submissions, ideas, briefs, milestones, agentSpendEvents, agentIdentities } from '../db/schema';
import { scoreSubmission } from '../scoring/scorer';
import {
  MILESTONE_ORDER,
  type JobResultSubmitRequest,
  type JobCreateRequest,
  type MilestoneType,
} from 'intelligence-exchange-cannes-shared';
import { randomUUID } from 'crypto';
import { httpError } from './errors';
import { issueAcceptedSubmissionAttestation, mintWorkReceipt, recordReviewerReview, setWorkerOnEscrow, clearWorkerOnEscrow, recordCategoryCompletion, evaluateReviewerTier, checkReviewerAssignment, refundTaskEscrow } from './chainService';
import { logJobEvent } from './jobEvents';
import { refundRejectedJobCredits, settleAcceptedJobCredits } from './tokenomicsService';
import { saveAIUSnapshot } from './aiuService';

type SpendEventInput = {
  workerId: string;
  vendor: string;
  purpose: string;
  amountUsd: number;
  settlementRail: 'demo' | 'arc' | 'intel';
  txHash?: string;
};

// ─── Idea & Planning ──────────────────────────────────────────────────────────

export async function createIdea(
  req: Omit<JobCreateRequest, 'worldIdProof'> & { worldIdProof?: { nullifierHash: string } },
  posterAddress: string,
): Promise<string> {
  const ideaId = randomUUID();
  const now = new Date();

  await db.insert(ideas).values({
    ideaId,
    posterId: posterAddress,
    title: req.title,
    prompt: req.prompt,
    budgetUsd: req.budgetUsdMax.toString(),
    fundingStatus: 'unfunded',
    worldIdNullifierHash: req.worldIdProof?.nullifierHash ?? null,
    createdAt: now,
    updatedAt: now,
  });

  console.log(`[idea:created] ideaId=${ideaId} poster=${posterAddress}`);
  return ideaId;
}

export async function generateBrief(ideaId: string, posterAddress: string): Promise<string> {
  const [idea] = await db.select().from(ideas).where(eq(ideas.ideaId, ideaId));
  if (!idea) throw httpError(`Idea not found: ${ideaId}`, 404, 'IDEA_NOT_FOUND');
  if (idea.posterId !== posterAddress) throw httpError('Only the poster can plan the idea', 403, 'UNAUTHORIZED_IDEA_ACCESS');
  if (idea.fundingStatus !== 'funded') throw httpError('Idea must be chain-synced as funded before planning', 409, 'IDEA_NOT_FUNDED');

  const [existingBrief] = await db.select().from(briefs).where(eq(briefs.ideaId, ideaId));
  if (existingBrief) return existingBrief.briefId;

  const briefId = randomUUID();
  const now = new Date();

  // Calculate per-milestone budget: split evenly across MILESTONE_ORDER
  const totalBudget = parseFloat(idea.budgetUsd);
  const milestoneBudget = (totalBudget / MILESTONE_ORDER.length).toFixed(2);

  await db.insert(briefs).values({
    briefId,
    ideaId,
    summary: `Build: ${idea.title}. Budget: $${idea.budgetUsd}. Milestones: ${MILESTONE_ORDER.join(', ')}.`,
    acceptanceRubric: { milestoneTypes: MILESTONE_ORDER, scoringMode: 'deterministic' },
    generatedAt: now,
  });

  // Create milestones in order
  for (let i = 0; i < MILESTONE_ORDER.length; i++) {
    const mType = MILESTONE_ORDER[i] as MilestoneType;
    const milestoneId = randomUUID();
    await db.insert(milestones).values({
      milestoneId,
      briefId,
      ideaId,
      milestoneType: mType,
      title: `${mType.charAt(0).toUpperCase() + mType.slice(1)} milestone`,
      description: `Complete the ${mType} deliverable for: ${idea.title}`,
      budgetUsd: milestoneBudget,
      order: i,
    });

    // Create job for each milestone and enqueue it
    const jobId = randomUUID();
    await db.insert(jobs).values({
      jobId,
      milestoneId,
      briefId,
      ideaId,
      milestoneType: mType,
      budgetUsd: milestoneBudget,
      status: 'created',
      createdAt: now,
      updatedAt: now,
    });

    await logJobEvent(jobId, 'created', 'broker', { ideaId, milestoneType: mType });
    console.log(`[job:created] jobId=${jobId} type=${mType}`);
  }

  console.log(`[brief:generated] briefId=${briefId} ideaId=${ideaId}`);
  return briefId;
}

// ─── Job Claim ────────────────────────────────────────────────────────────────

export async function claimJob(jobId: string, accountAddress: string, agentFingerprint: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) throw httpError('Job not found', 404, 'JOB_NOT_FOUND');
  if (!['queued', 'rework'].includes(job.status)) {
    throw httpError(`Job not claimable: status=${job.status}`, 409, 'JOB_NOT_CLAIMABLE');
  }

  const claimId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (45 * 60 * 1000));

  await db.insert(claims).values({
    claimId,
    jobId,
    workerId: accountAddress,
    accountAddress,
    agentFingerprint,
    agentMetadata: { fingerprint: agentFingerprint },
    claimedAt: now,
    expiresAt,
    status: 'active',
  });

  await db.update(jobs).set({
    status: 'claimed',
    activeClaimId: claimId,
    activeClaimWorkerId: accountAddress,
    leaseExpiry: expiresAt,
    updatedAt: now,
  }).where(eq(jobs.jobId, jobId));

  await logJobEvent(jobId, 'claimed', accountAddress, {
    claimId,
    expiresAt: expiresAt.toISOString(),
    agentFingerprint,
  });
  console.log(`[job:claimed] jobId=${jobId} worker=${accountAddress} expires=${expiresAt.toISOString()}`);

  // Set worker on TaskEscrow after successful claim
  setWorkerOnEscrow(jobId, accountAddress).catch(err => console.error('[claimJob] setWorkerOnEscrow failed:', err));

  return { claimId, expiresAt };
}

export async function unclaimJob(jobId: string, accountAddress: string, agentFingerprint?: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) throw httpError('Job not found', 404, 'JOB_NOT_FOUND');
  if (job.status !== 'claimed') {
    throw httpError(`Job not unclaimable: status=${job.status}`, 409, 'JOB_NOT_UNCLAIMABLE');
  }
  if (!job.activeClaimId || !job.activeClaimWorkerId) {
    throw httpError('Job has no active claim to release', 409, 'JOB_NOT_CLAIMED');
  }
  if (job.activeClaimWorkerId !== accountAddress) {
    throw httpError(
      `Claim ownership violation: job claimed by ${job.activeClaimWorkerId}, released by ${accountAddress}`,
      409,
      'CLAIM_OWNERSHIP_VIOLATION',
    );
  }

  const now = new Date();

  await db.update(jobs).set({
    status: 'queued',
    activeClaimId: null,
    activeClaimWorkerId: null,
    leaseExpiry: null,
    updatedAt: now,
  }).where(eq(jobs.jobId, jobId));

  await db.update(claims)
    .set({ status: 'cancelled' })
    .where(eq(claims.claimId, job.activeClaimId));

  await logJobEvent(jobId, 'queued', accountAddress, {
    releasedClaimId: job.activeClaimId,
    previousWorkerId: job.activeClaimWorkerId,
    reason: 'worker_unclaim',
    agentFingerprint: agentFingerprint ?? null,
  });
  console.log(`[job:unclaimed] jobId=${jobId} worker=${accountAddress}`);

  // Clear worker on TaskEscrow after successful unclaim
  clearWorkerOnEscrow(jobId).catch(err => console.error('[unclaimJob] clearWorkerOnEscrow failed:', err));

  return { unclaimed: true, status: 'queued' as const };
}

/**
 * Compute worker availability scores based on unclaim rate.
 * Workers who are reliably available earn higher availability scores.
 * Availability score (0-1.0): unclaim rate < 10% → 1.0, 10-30% → 0.8, > 30% → 0.5
 */
export async function getWorkerAvailabilityScores(): Promise<Map<string, number>> {
  const workerAvailability = await db.execute(sql`
    SELECT
      active_claim_worker_id as worker,
      COUNT(*) as total_claimed,
      SUM(CASE WHEN status = 'queued' AND active_claim_worker_id IS NOT NULL THEN 1 ELSE 0 END) as unclaimed
    FROM jobs
    WHERE active_claim_worker_id IS NOT NULL
    GROUP BY active_claim_worker_id
  `);

  const availabilityMap = new Map<string, number>();

  for (const row of workerAvailability.rows) {
    const worker = row.worker as string;
    const totalClaimed = Number(row.total_claimed ?? 0);
    const unclaimed = Number(row.unclaimed ?? 0);

    if (totalClaimed === 0) {
      availabilityMap.set(worker, 1.0);
      continue;
    }

    const unclaimRate = unclaimed / totalClaimed;
    let availability: number;

    if (unclaimRate < 0.10) {
      availability = 1.0;
    } else if (unclaimRate <= 0.30) {
      availability = 0.8;
    } else {
      availability = 0.5;
    }

    availabilityMap.set(worker, availability);
  }

  return availabilityMap;
}

// ─── Job Submission ───────────────────────────────────────────────────────────

export async function submitJob(jobId: string, req: JobResultSubmitRequest, accountAddress: string, agentFingerprint: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) throw httpError('Job not found', 404, 'JOB_NOT_FOUND');

  // Agent fingerprint verification: cross-check against registered fingerprint
  const [registeredIdentity] = await db.select().from(agentIdentities)
    .where(eq(agentIdentities.accountAddress, accountAddress));
  if (registeredIdentity && registeredIdentity.fingerprint !== agentFingerprint) {
    throw httpError('Agent fingerprint mismatch', 403, 'FINGERPRINT_MISMATCH');
  }

  // Claim ownership check: reject if submitter doesn't own the active claim
  if (job.activeClaimWorkerId && job.activeClaimWorkerId !== accountAddress) {
    throw httpError(
      `Claim ownership violation: job claimed by ${job.activeClaimWorkerId}, submitted by ${accountAddress}`,
      409,
      'CLAIM_OWNERSHIP_VIOLATION',
    );
  }

  // Lease expiry check
  if (job.leaseExpiry && new Date() > job.leaseExpiry) {
    throw httpError('Claim lease expired', 409, 'LEASE_EXPIRED');
  }

  if (!['claimed', 'running'].includes(job.status)) {
    throw httpError(`Job not in submittable state: ${job.status}`, 409, 'JOB_NOT_SUBMITTABLE');
  }

  const submissionId = randomUUID();
  const now = new Date();
  const milestoneType = job.milestoneType as MilestoneType;

  // Score the submission
  const scoreBreakdown = scoreSubmission(req, milestoneType);
  const newStatus = scoreBreakdown.scoreStatus === 'passed' ? 'submitted' : 'rework';

  await db.insert(submissions).values({
    submissionId,
    jobId,
    claimId: req.claimId,
    workerId: accountAddress,
    accountAddress,
    agentFingerprint,
    artifactUris: req.artifactUris,
    traceUri: req.traceUri ?? null,
    summary: req.summary ?? null,
    agentMetadata: { fingerprint: agentFingerprint },
    scoreBreakdown: scoreBreakdown as unknown as Record<string, unknown>,
    scoreStatus: scoreBreakdown.scoreStatus,
    telemetry: (req.telemetry as Record<string, unknown>) ?? null,
    submittedAt: now,
  });

  await db.update(jobs).set({
    status: newStatus,
    updatedAt: now,
    activeClaimId: newStatus === 'rework' ? null : job.activeClaimId,
    activeClaimWorkerId: newStatus === 'rework' ? null : job.activeClaimWorkerId,
    leaseExpiry: newStatus === 'rework' ? null : job.leaseExpiry,
  }).where(eq(jobs.jobId, jobId));
  if (job.activeClaimId) {
    await db.update(claims)
      .set({ status: newStatus === 'rework' ? 'cancelled' : 'submitted' })
      .where(eq(claims.claimId, job.activeClaimId));
  }
  await logJobEvent(jobId, newStatus, accountAddress, {
    submissionId,
    scoreStatus: scoreBreakdown.scoreStatus,
    totalScore: scoreBreakdown.totalScore,
    agentFingerprint,
  });

  console.log(`[job:submitted] jobId=${jobId} scoreStatus=${scoreBreakdown.scoreStatus}`);

  return { submissionId, scoreBreakdown };
}

// ─── Acceptance ───────────────────────────────────────────────────────────────

export async function acceptJob(jobId: string, reviewerId: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) throw httpError('Job not found', 404, 'JOB_NOT_FOUND');
  if (job.status !== 'submitted') {
    throw httpError(`Job not in submitted state: ${job.status}`, 409, 'JOB_NOT_REVIEWABLE');
  }

  // SELF-ACCEPTANCE check: reviewer cannot be the same as the worker
  if (reviewerId.toLowerCase() === (job.activeClaimWorkerId ?? '').toLowerCase()) {
    throw httpError('Reviewer cannot be the same as the worker', 403, 'SELF_ACCEPTANCE_FORBIDDEN');
  }

  // POSTER-AS-REVIEWER check: poster cannot accept their own job
  const [idea] = await db.select().from(ideas).where(eq(ideas.ideaId, job.ideaId));
  if (idea && reviewerId.toLowerCase() === idea.posterId.toLowerCase()) {
    throw httpError('Poster cannot accept their own job', 403, 'POSTER_SELF_ACCEPTANCE_FORBIDDEN');
  }

  // ReviewerQueue enforcement check (soft enforcement — logs warning but proceeds)
  // TODO: Add monitoring counter in DB/log for ReviewerQueue bypasses to track potential collusion
  const isAssigned = await checkReviewerAssignment(jobId, reviewerId).catch(() => true);
  if (!isAssigned) {
    console.warn('[job:accept] Reviewer not assigned via ReviewerQueue — proceeding (soft enforcement)');
  }

  const [sub] = await db.select().from(submissions)
    .where(and(eq(submissions.jobId, jobId), eq(submissions.workerId, job.activeClaimWorkerId ?? '')));
  if (!sub?.agentFingerprint) {
    throw httpError('Accepted submission missing agent fingerprint', 409, 'AGENT_FINGERPRINT_REQUIRED');
  }

  const score = (sub.scoreBreakdown as { totalScore?: number })?.totalScore ?? 0;

  const now = new Date();
  await db.update(jobs).set({ status: 'accepted', updatedAt: now }).where(eq(jobs.jobId, jobId));
  await logJobEvent(jobId, 'accepted', reviewerId, { humanApproved: true });

  console.log(`[job:accepted] jobId=${jobId} reviewer=${reviewerId}`);

  // Update claim status
  if (job.activeClaimId) {
    await db.update(claims).set({ status: 'submitted' }).where(eq(claims.claimId, job.activeClaimId));
  }

  const settlement = await settleAcceptedJobCredits({
    ideaId: job.ideaId,
    jobId,
    workerId: job.activeClaimWorkerId ?? sub.workerId,
    budgetUsd: Number.parseFloat(job.budgetUsd),
  });

  const attestation = await issueAcceptedSubmissionAttestation({
    jobId,
    agentFingerprint: sub.agentFingerprint,
    score,
    reviewerAddress: reviewerId,
    payoutReleased: Boolean(settlement),
  });

  // Fire-and-forget on-chain WorkReceipt minting (must not block acceptance flow)
  mintWorkReceipt(
    job.activeClaimWorkerId ?? sub.workerId,
    job.ideaId,
    sub.agentFingerprint,
    score,
  ).catch((err) => console.error('[job:accept] Failed to mint WorkReceipt:', err));

  // Update agent reputation inline — increment acceptedCount + recalculate avgScore.
  // This replaces the manual chain/sync webhook dependency for off-chain reputation tracking.
  updateAgentReputation(sub.agentFingerprint, score)
    .catch((err) => console.error('[job:accept] Failed to update agent reputation:', err));

  // Snapshot the AIU index after every acceptance to build the time series.
  saveAIUSnapshot()
    .catch((err) => console.error('[job:accept] Failed to save AIU snapshot:', err));

  return { accepted: true, attestation, settlement };
}

export async function rejectJob(jobId: string, reviewerId: string, reason?: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) throw httpError('Job not found', 404, 'JOB_NOT_FOUND');
  if (!['submitted', 'accepted'].includes(job.status)) {
    throw httpError(`Job not rejectable: ${job.status}`, 409, 'JOB_NOT_REJECTABLE');
  }

  const now = new Date();
  await db.update(jobs).set({
    status: 'rework',
    updatedAt: now,
    activeClaimId: null,
    activeClaimWorkerId: null,
    leaseExpiry: null,
  }).where(eq(jobs.jobId, jobId));
  if (job.activeClaimId) {
    await db.update(claims).set({ status: 'cancelled' }).where(eq(claims.claimId, job.activeClaimId));
  }
  await logJobEvent(jobId, 'rework', reviewerId, { reason });

  // Reset streak on rejection
  // TODO: Add consecutiveAccepts column to agentIdentities schema for quality streak tracking
  const claimedFingerprint = job.activeClaimWorkerId ? await db.select().from(agentIdentities)
    .where(eq(agentIdentities.accountAddress, job.activeClaimWorkerId)).then(rows => rows[0]?.fingerprint) : null;
  if (claimedFingerprint) {
    await db.update(agentIdentities)
      .set({ /* consecutiveAccepts: 0, */ updatedAt: new Date() })
      .where(eq(agentIdentities.fingerprint, claimedFingerprint));
  }

  // Return the reserved INTEL to the buyer's idea pool so they can re-post the job.
  const refund = await refundRejectedJobCredits({
    ideaId: job.ideaId,
    jobId,
    budgetUsd: Number.parseFloat(job.budgetUsd),
  }).catch((err) => {
    console.error('[job:reject] Failed to refund INTEL credits:', err);
    return null;
  });

  console.log(`[job:rejected→rework] jobId=${jobId} reason=${reason} refunded=${refund?.refundedIntel ?? 0}`);
  return { rework: true, refund };
}

async function updateAgentReputation(fingerprint: string, score: number) {
  const [identity] = await db.select().from(agentIdentities)
    .where(eq(agentIdentities.fingerprint, fingerprint));

  if (!identity) {
    // Agent identity not registered yet — skip silently (on-chain registry is the source of truth)
    console.warn(`[job:accept] agentIdentity not found for fingerprint=${fingerprint}, skipping reputation update`);
    return;
  }

  const nextAcceptedCount = (identity.acceptedCount ?? 0) + 1;
  const cumulativeScore = (Number(identity.avgScore) * (identity.acceptedCount ?? 0)) + score;
  const nextAvgScore = nextAcceptedCount > 0 ? cumulativeScore / nextAcceptedCount : score;

  // TODO: Add consecutiveAccepts column to agentIdentities schema for quality streak tracking
  // const prevConsecutive = (identity as any).consecutiveAccepts ?? 0;
  // const newConsecutive = prevConsecutive + 1;
  await db.update(agentIdentities).set({
    acceptedCount: nextAcceptedCount,
    avgScore: nextAvgScore.toFixed(2),
    // consecutiveAccepts: newConsecutive,
  }).where(eq(agentIdentities.fingerprint, fingerprint));
}

export async function recordSpendEvent(jobId: string, input: SpendEventInput) {
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) throw httpError('Job not found', 404, 'JOB_NOT_FOUND');
  if (!['claimed', 'running', 'submitted', 'accepted'].includes(job.status)) {
    throw httpError(`Job not in spendable state: ${job.status}`, 409, 'JOB_NOT_SPENDABLE');
  }
  if (job.activeClaimWorkerId && job.activeClaimWorkerId !== input.workerId) {
    throw httpError('Only the active worker can record a spend event', 409, 'SPEND_WORKER_MISMATCH');
  }

  const eventId = randomUUID();
  const createdAt = new Date();
  await db.insert(agentSpendEvents).values({
    eventId,
    jobId,
    workerId: input.workerId,
    vendor: input.vendor,
    purpose: input.purpose,
    amountUsd: input.amountUsd.toFixed(4),
    settlementRail: input.settlementRail,
    txHash: input.txHash ?? null,
    createdAt,
  });
  await logJobEvent(jobId, 'running', input.workerId, {
    spendEventId: eventId,
    vendor: input.vendor,
    purpose: input.purpose,
    amountUsd: input.amountUsd,
    settlementRail: input.settlementRail,
    txHash: input.txHash ?? null,
  });

  return {
    eventId,
    recordedAt: createdAt.toISOString(),
    settlementRail: input.settlementRail,
  };
}
