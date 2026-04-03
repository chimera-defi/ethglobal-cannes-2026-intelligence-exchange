import { eq, and, count } from 'drizzle-orm';
import { db } from '../db/client';
import { jobs, jobEvents, claims, submissions, agentIdentities, ideas, briefs, milestones } from '../db/schema';
import { scoreSubmission } from '../scoring/scorer';
import { milestoneQueue } from '../queue/milestoneQueue';
import { writeAcceptedJobDossier } from './dossierService';
import { assertWorldVerified } from './identityService';
import {
  DEFAULT_LEASE_DURATION_MS,
  PLATFORM_FEE_RATE,
  MILESTONE_ORDER,
  type JobResultSubmitRequest,
  type JobCreateRequest,
  type MilestoneType,
} from 'intelligence-exchange-cannes-shared';
import { keccak256, toBytes } from 'viem';
import { randomUUID } from 'crypto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function logEvent(jobId: string, state: string, actorId?: string, payload?: Record<string, unknown>) {
  // Append-only: insert a new row per state transition. NEVER update existing rows.
  return db.insert(jobEvents).values({
    eventId: randomUUID(),
    jobId,
    state,
    actorId,
    payload: payload ?? null,
    createdAt: new Date(),
  });
}

function computeAgentFingerprint(agentType: string, agentVersion: string, operatorAddress: string): string {
  const raw = `${agentType}:${agentVersion}:${operatorAddress.toLowerCase()}`;
  return keccak256(toBytes(raw));
}

// ─── Idea & Planning ──────────────────────────────────────────────────────────

export async function createIdea(req: JobCreateRequest, worldIdVerified: boolean): Promise<string> {
  const ideaId = randomUUID();
  const now = new Date();

  await db.insert(ideas).values({
    ideaId,
    posterId: req.buyerId,
    title: req.title,
    prompt: req.prompt,
    targetArtifact: req.targetArtifact ?? null,
    budgetUsd: req.budgetUsdMax.toString(),
    fundingStatus: 'unfunded',
    worldIdNullifierHash: req.worldIdProof?.nullifierHash ?? null,
    createdAt: now,
    updatedAt: now,
  });

  console.log(`[idea:created] ideaId=${ideaId} poster=${req.buyerId}`);
  return ideaId;
}

export async function generateBrief(ideaId: string): Promise<string> {
  const [idea] = await db.select().from(ideas).where(eq(ideas.ideaId, ideaId));
  if (!idea) throw new Error(`Idea not found: ${ideaId}`);

  const briefId = randomUUID();
  const now = new Date();

  // Calculate per-milestone budget: split evenly across MILESTONE_ORDER
  const totalBudget = parseFloat(idea.budgetUsd);
  const milestoneBudget = (totalBudget / MILESTONE_ORDER.length).toFixed(2);

  await db.insert(briefs).values({
    briefId,
    ideaId,
    summary: [
      `Build: ${idea.title}.`,
      idea.targetArtifact ? `Target repo/spec: ${idea.targetArtifact}.` : null,
      `Budget: $${idea.budgetUsd}.`,
      `Milestones: ${MILESTONE_ORDER.join(', ')}.`,
      'Expected delivery for implementation work: a reviewable pull request URL.',
    ].filter(Boolean).join(' '),
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
      description: [
        `Complete the ${mType} deliverable for: ${idea.title}.`,
        idea.targetArtifact ? `Work against: ${idea.targetArtifact}.` : null,
        mType === 'scaffold' || mType === 'review'
          ? 'Return a reviewable pull request URL as the primary artifact when possible.'
          : null,
      ].filter(Boolean).join(' '),
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

    await logEvent(jobId, 'created', 'broker', { ideaId, milestoneType: mType });

    // Enqueue in BullMQ
    await milestoneQueue.add(`job:${jobId}`, { jobId, milestoneType: mType }, {
      jobId: jobId,
      attempts: 3,
    });

    await db.update(jobs).set({ status: 'queued', updatedAt: now }).where(eq(jobs.jobId, jobId));
    await logEvent(jobId, 'queued', 'broker');

    console.log(`[job:queued] jobId=${jobId} type=${mType}`);
  }

  console.log(`[brief:generated] briefId=${briefId} ideaId=${ideaId}`);
  return briefId;
}

// ─── Job Claim ────────────────────────────────────────────────────────────────

export async function claimJob(jobId: string, workerId: string, agentMeta?: Record<string, unknown>) {
  await assertWorldVerified('worker', workerId);
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });
  if (job.status !== 'queued') throw Object.assign(new Error(`Job not claimable: status=${job.status}`), { status: 409 });

  const claimId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEFAULT_LEASE_DURATION_MS);

  await db.insert(claims).values({
    claimId,
    jobId,
    workerId,
    agentMetadata: agentMeta ?? null,
    claimedAt: now,
    expiresAt,
    status: 'active',
  });

  await db.update(jobs).set({
    status: 'claimed',
    activeClaimId: claimId,
    activeClaimWorkerId: workerId,
    leaseExpiry: expiresAt,
    updatedAt: now,
  }).where(eq(jobs.jobId, jobId));

  await logEvent(jobId, 'claimed', workerId, { claimId, expiresAt: expiresAt.toISOString() });
  console.log(`[job:claimed] jobId=${jobId} worker=${workerId} expires=${expiresAt.toISOString()}`);

  return { claimId, expiresAt };
}

// ─── Job Submission ───────────────────────────────────────────────────────────

export async function submitJob(jobId: string, req: JobResultSubmitRequest) {
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });

  // Claim ownership check: reject if submitter doesn't own the active claim
  if (job.activeClaimWorkerId && job.activeClaimWorkerId !== req.workerId) {
    throw Object.assign(
      new Error(`Claim ownership violation: job claimed by ${job.activeClaimWorkerId}, submitted by ${req.workerId}`),
      { status: 409, code: 'CLAIM_OWNERSHIP_VIOLATION' }
    );
  }

  // Lease expiry check
  if (job.leaseExpiry && new Date() > job.leaseExpiry) {
    throw Object.assign(new Error('Claim lease expired'), { status: 409, code: 'LEASE_EXPIRED' });
  }

  if (!['claimed', 'running'].includes(job.status)) {
    throw Object.assign(new Error(`Job not in submittable state: ${job.status}`), { status: 409 });
  }

  const submissionId = randomUUID();
  const now = new Date();
  const milestoneType = job.milestoneType as MilestoneType;

  // Score the submission
  const scoreBreakdown = scoreSubmission(req, milestoneType);

  await db.insert(submissions).values({
    submissionId,
    jobId,
    claimId: req.claimId,
    workerId: req.workerId,
    artifactUris: req.artifactUris,
    traceUri: req.traceUri ?? null,
    summary: req.summary ?? null,
    agentMetadata: (req.agentMetadata as Record<string, unknown>) ?? null,
    scoreBreakdown: scoreBreakdown as unknown as Record<string, unknown>,
    scoreStatus: scoreBreakdown.scoreStatus,
    telemetry: (req.telemetry as Record<string, unknown>) ?? null,
    submittedAt: now,
  });

  const newStatus = scoreBreakdown.scoreStatus === 'passed' ? 'submitted' : 'rework';
  await db.update(jobs).set({ status: newStatus, updatedAt: now }).where(eq(jobs.jobId, jobId));
  await logEvent(jobId, newStatus, req.workerId, {
    submissionId,
    scoreStatus: scoreBreakdown.scoreStatus,
    totalScore: scoreBreakdown.totalScore,
  });

  console.log(`[job:submitted] jobId=${jobId} scoreStatus=${scoreBreakdown.scoreStatus}`);

  // Register agent identity if not already registered
  if (req.agentMetadata && scoreBreakdown.scoreStatus === 'passed') {
    await upsertAgentIdentity(req.agentMetadata as Record<string, string>);
  }

  return { submissionId, scoreBreakdown };
}

// ─── Acceptance ───────────────────────────────────────────────────────────────

export async function acceptJob(jobId: string, reviewerId: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });
  if (job.status !== 'submitted') {
    throw Object.assign(new Error(`Job not in submitted state: ${job.status}`), { status: 409 });
  }

  const now = new Date();
  await db.update(jobs).set({ status: 'accepted', updatedAt: now }).where(eq(jobs.jobId, jobId));
  await logEvent(jobId, 'accepted', reviewerId, { humanApproved: true });

  console.log(`[job:accepted] jobId=${jobId} reviewer=${reviewerId}`);

  // Update claim status
  if (job.activeClaimId) {
    await db.update(claims).set({ status: 'submitted' }).where(eq(claims.claimId, job.activeClaimId));
  }

  // Update agent reputation (off-chain mirror, on-chain call happens separately via blockchain service)
  if (job.activeClaimWorkerId) {
    const [sub] = await db.select().from(submissions)
      .where(and(eq(submissions.jobId, jobId), eq(submissions.workerId, job.activeClaimWorkerId)));

    if (sub?.agentMetadata) {
      const meta = sub.agentMetadata as Record<string, string>;
      const fingerprint = computeAgentFingerprint(
        meta.agentType ?? 'unknown',
        meta.agentVersion ?? '0.0.0',
        meta.operatorAddress ?? '0x0000000000000000000000000000000000000000'
      );
      const score = (sub.scoreBreakdown as { totalScore?: number })?.totalScore ?? 0;

      await db.update(agentIdentities)
        .set({
          acceptedCount: Number(
            (await db.select({ value: count() })
              .from(submissions)
              .where(eq(submissions.workerId, job.activeClaimWorkerId)))[0]?.value ?? 0
          ),
          avgScore: score.toString(),
        })
        .where(eq(agentIdentities.fingerprint, fingerprint));

      console.log(`[agent:reputation] fingerprint=${fingerprint} score=${score}`);
    }
  }

  const dossierUri = await writeAcceptedJobDossier(jobId);
  await db.update(briefs)
    .set({ dossierUri })
    .where(eq(briefs.briefId, job.briefId));

  return { accepted: true, dossierUri };
}

export async function rejectJob(jobId: string, reviewerId: string, reason?: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });
  if (!['submitted', 'accepted'].includes(job.status)) {
    throw Object.assign(new Error(`Job not rejectable: ${job.status}`), { status: 409 });
  }

  const now = new Date();
  await db.update(jobs).set({ status: 'rework', updatedAt: now }).where(eq(jobs.jobId, jobId));
  await logEvent(jobId, 'rework', reviewerId, { reason });

  console.log(`[job:rejected→rework] jobId=${jobId} reason=${reason}`);
  return { rework: true };
}

// ─── Agent Identity ───────────────────────────────────────────────────────────

async function upsertAgentIdentity(meta: Record<string, string>) {
  const fingerprint = computeAgentFingerprint(
    meta.agentType ?? 'unknown',
    meta.agentVersion ?? '0.0.0',
    meta.operatorAddress ?? '0x0000000000000000000000000000000000000000'
  );

  const existing = await db.select().from(agentIdentities).where(eq(agentIdentities.fingerprint, fingerprint));

  if (existing.length === 0) {
    await db.insert(agentIdentities).values({
      fingerprint,
      agentType: meta.agentType ?? 'unknown',
      agentVersion: meta.agentVersion,
      operatorAddress: meta.operatorAddress,
      acceptedCount: 0,
      avgScore: '0',
      createdAt: new Date(),
    });
    console.log(`[agent:registered] fingerprint=${fingerprint} type=${meta.agentType}`);
  }

  return fingerprint;
}

export { computeAgentFingerprint };
