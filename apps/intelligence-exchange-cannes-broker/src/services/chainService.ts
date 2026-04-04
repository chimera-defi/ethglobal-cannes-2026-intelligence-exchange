import { randomUUID } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { AcceptedSubmissionAttestation, ChainReceiptSync } from 'intelligence-exchange-cannes-shared';
import { encodePacked, keccak256, toBytes } from 'viem';
import { db } from '../db/client';
import {
  acceptedAttestations,
  agentIdentities,
  chainEvents,
  chainSyncs,
  escrowReleases,
  jobs,
  milestones,
  submissions,
  ideas,
} from '../db/schema';
import { httpError } from './errors';
import { getBrokerAttestorAccount } from './identityService';
import { logJobEvent } from './jobEvents';

function normalizePayload(payload: Record<string, unknown> | null | undefined) {
  return payload ?? {};
}

function getAttestationDomain() {
  return {
    registryAddress: (process.env.AGENT_IDENTITY_REGISTRY_ADDRESS ??
      '0x0000000000000000000000000000000000000000') as `0x${string}`,
    chainId: BigInt(process.env.AGENT_IDENTITY_CHAIN_ID ?? process.env.CHAIN_ID ?? '31337'),
  };
}

function getJobIdHash(jobId: string) {
  return keccak256(toBytes(jobId));
}

function getAttestationDigest(attestation: Omit<AcceptedSubmissionAttestation, 'signature' | 'attestedAt'>) {
  const { registryAddress, chainId } = getAttestationDomain();
  return keccak256(encodePacked(
    ['address', 'uint256', 'bytes32', 'bytes32', 'uint256', 'address', 'bool'],
    [
      registryAddress,
      chainId,
      attestation.agentFingerprint as `0x${string}`,
      getJobIdHash(attestation.jobId),
      BigInt(attestation.score),
      attestation.reviewerAddress as `0x${string}`,
      attestation.payoutReleased,
    ],
  ));
}

export async function recordChainSync(input: ChainReceiptSync) {
  const [existing] = await db.select().from(chainSyncs).where(and(
    eq(chainSyncs.txHash, input.txHash),
    eq(chainSyncs.eventType, input.eventType),
  ));

  const confirmedAt = new Date();
  if (existing) {
    return existing;
  }

  const syncId = input.syncId ?? randomUUID();
  await db.insert(chainSyncs).values({
    syncId,
    eventType: input.eventType,
    txHash: input.txHash,
    contractAddress: input.contractAddress ?? null,
    blockNumber: input.blockNumber ?? null,
    subjectId: input.subjectId,
    payload: normalizePayload(input.payload),
    status: input.status,
    confirmedAt,
    createdAt: confirmedAt,
  });

  await db.insert(chainEvents).values({
    eventId: randomUUID(),
    syncId,
    eventType: input.eventType,
    txHash: input.txHash,
    subjectId: input.subjectId,
    payload: normalizePayload(input.payload),
    recordedAt: confirmedAt,
  });

  const [sync] = await db.select().from(chainSyncs).where(eq(chainSyncs.syncId, syncId));
  return sync!;
}

export async function issueAcceptedSubmissionAttestation(input: {
  jobId: string;
  agentFingerprint: string;
  score: number;
  reviewerAddress: string;
  payoutReleased: boolean;
}) {
  const attestor = getBrokerAttestorAccount();
  const { registryAddress, chainId } = getAttestationDomain();
  const attestationBase = {
    jobId: input.jobId,
    jobIdHash: getJobIdHash(input.jobId),
    agentFingerprint: input.agentFingerprint,
    score: input.score,
    reviewerAddress: input.reviewerAddress,
    payoutReleased: input.payoutReleased,
    attestorAddress: attestor.address,
    registryAddress,
    chainId: Number(chainId),
  };

  const digest = getAttestationDigest(attestationBase);
  const signature = await attestor.signMessage({
    message: { raw: digest },
  });

  const attestationId = randomUUID();
  const createdAt = new Date();
  await db.insert(acceptedAttestations).values({
    attestationId,
    jobId: input.jobId,
    agentFingerprint: input.agentFingerprint,
    score: input.score,
    reviewerAddress: input.reviewerAddress,
    payoutReleased: input.payoutReleased,
    attestorAddress: attestor.address,
    signature,
    createdAt,
  });

  return {
    ...attestationBase,
    signature,
    attestedAt: createdAt.toISOString(),
  };
}

export async function syncIdeaFunding(input: ChainReceiptSync) {
  const sync = await recordChainSync(input);
  await db.update(ideas)
    .set({
      fundingStatus: 'funded',
      escrowTxHash: input.txHash,
      updatedAt: new Date(),
    })
    .where(eq(ideas.ideaId, input.subjectId));
  return sync;
}

export async function syncMilestoneReservation(input: ChainReceiptSync) {
  const sync = await recordChainSync(input);
  const payload = normalizePayload(input.payload) as { jobIds?: string[] };
  const jobIds = Array.isArray(payload.jobIds) ? payload.jobIds : [];

  if (jobIds.length === 0) {
    throw httpError('milestone_reserved sync requires payload.jobIds[]', 400, 'INVALID_CHAIN_SYNC_PAYLOAD');
  }

  await db.update(jobs)
    .set({ status: 'queued', updatedAt: new Date() })
    .where(inArray(jobs.jobId, jobIds));

  for (const jobId of jobIds) {
    await logJobEvent(jobId, 'queued', 'chain-sync', { txHash: input.txHash });
  }

  return sync;
}

export async function syncMilestoneRelease(input: ChainReceiptSync) {
  const sync = await recordChainSync(input);
  const payload = normalizePayload(input.payload) as {
    jobId?: string;
    milestoneId?: string;
    payee?: string;
    amountUsd?: number;
  };

  if (!payload.jobId || !payload.milestoneId || !payload.payee || payload.amountUsd == null) {
    throw httpError('milestone_released sync requires jobId, milestoneId, payee, amountUsd', 400, 'INVALID_CHAIN_SYNC_PAYLOAD');
  }

  await db.insert(escrowReleases).values({
    releaseId: randomUUID(),
    jobId: payload.jobId,
    ideaId: input.subjectId,
    milestoneId: payload.milestoneId,
    payer: 'poster',
    payee: payload.payee,
    amountUsd: payload.amountUsd.toString(),
    txHash: input.txHash,
    status: 'confirmed',
    releasedAt: new Date(),
    createdAt: new Date(),
  });

  await db.update(jobs)
    .set({ status: 'settled', updatedAt: new Date() })
    .where(eq(jobs.jobId, payload.jobId));

  return sync;
}

export async function syncAcceptedSubmissionAttestation(input: ChainReceiptSync) {
  const sync = await recordChainSync(input);
  const payload = normalizePayload(input.payload) as AcceptedSubmissionAttestation;

  if (!payload.jobId || !payload.agentFingerprint || payload.score == null || !payload.signature) {
    throw httpError('accepted_submission_attested sync requires a full attestation payload', 400, 'INVALID_CHAIN_SYNC_PAYLOAD');
  }

  const [attestation] = await db.select().from(acceptedAttestations).where(and(
    eq(acceptedAttestations.jobId, payload.jobId),
    eq(acceptedAttestations.agentFingerprint, payload.agentFingerprint),
    eq(acceptedAttestations.signature, payload.signature),
  ));
  if (!attestation) throw httpError('Attestation not found', 404, 'ATTESTATION_NOT_FOUND');

  const [identity] = await db.select().from(agentIdentities).where(eq(agentIdentities.fingerprint, payload.agentFingerprint));
  if (!identity) throw httpError('Agent identity not found', 404, 'AGENT_IDENTITY_NOT_FOUND');

  const nextAcceptedCount = (identity.acceptedCount ?? 0) + 1;
  const cumulativeScore = (Number(identity.avgScore) * (identity.acceptedCount ?? 0)) + payload.score;
  const nextAvgScore = cumulativeScore / nextAcceptedCount;

  await db.update(agentIdentities).set({
    acceptedCount: nextAcceptedCount,
    avgScore: nextAvgScore.toFixed(2),
  }).where(eq(agentIdentities.fingerprint, payload.agentFingerprint));

  return sync;
}

export async function applyChainSync(input: ChainReceiptSync) {
  switch (input.eventType) {
    case 'idea_funded':
      return syncIdeaFunding(input);
    case 'milestone_reserved':
      return syncMilestoneReservation(input);
    case 'milestone_released':
      return syncMilestoneRelease(input);
    case 'accepted_submission_attested':
      return syncAcceptedSubmissionAttestation(input);
    default:
      return recordChainSync(input);
  }
}

export async function resolveMilestoneIdForJob(jobId: string) {
  const [job] = await db.select({
    milestoneId: jobs.milestoneId,
  }).from(jobs).where(eq(jobs.jobId, jobId));

  if (!job) throw httpError('Job not found for release sync', 404, 'JOB_NOT_FOUND');

  const [milestone] = await db.select().from(milestones).where(eq(milestones.milestoneId, job.milestoneId));
  if (!milestone) throw httpError('Milestone not found for release sync', 404, 'MILESTONE_NOT_FOUND');

  return milestone.milestoneId;
}

export async function getLatestSubmissionForJob(jobId: string) {
  const [submission] = await db.select().from(submissions).where(eq(submissions.jobId, jobId));
  if (!submission) throw httpError('Submission not found for job', 404, 'SUBMISSION_NOT_FOUND');
  return submission;
}
