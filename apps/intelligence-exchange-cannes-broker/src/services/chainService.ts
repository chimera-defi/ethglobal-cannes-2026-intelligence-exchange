import { randomUUID } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { AcceptedSubmissionAttestation, ChainReceiptSync } from 'intelligence-exchange-cannes-shared';
import { encodePacked, keccak256, toBytes, createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
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
    registryAddress: (process.env.IEX_AGENT_REGISTRY_ADDRESS ??
      process.env.AGENT_IDENTITY_REGISTRY_ADDRESS ??
      '0x0000000000000000000000000000000000000000') as `0x${string}`,
    chainId: BigInt(
      process.env.WORLDCHAIN_CHAIN_ID ??
      process.env.AGENT_IDENTITY_CHAIN_ID ??
      process.env.CHAIN_ID ??
      '31337',
    ),
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

export function hydrateAcceptedSubmissionAttestation(record: {
  jobId: string;
  agentFingerprint: string;
  score: number;
  reviewerAddress: string;
  payoutReleased: boolean;
  attestorAddress: string;
  signature: string;
  createdAt: Date | string;
}) {
  const { registryAddress, chainId } = getAttestationDomain();

  return {
    jobId: record.jobId,
    jobIdHash: getJobIdHash(record.jobId),
    agentFingerprint: record.agentFingerprint,
    score: record.score,
    reviewerAddress: record.reviewerAddress,
    payoutReleased: record.payoutReleased,
    attestorAddress: record.attestorAddress,
    registryAddress,
    chainId: Number(chainId),
    signature: record.signature,
    attestedAt: new Date(record.createdAt).toISOString(),
  };
}

export async function recordChainSync(input: ChainReceiptSync) {
  const [existing] = await db.select().from(chainSyncs).where(and(
    eq(chainSyncs.txHash, input.txHash),
    eq(chainSyncs.eventType, input.eventType),
  ));

  const confirmedAt = new Date();
  if (existing) {
    return {
      ...existing,
      alreadyRecorded: true as const,
    };
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
  return {
    ...sync!,
    alreadyRecorded: false as const,
  };
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
    ...hydrateAcceptedSubmissionAttestation({
      ...attestationBase,
      signature,
      createdAt,
    }),
  };
}

export async function syncIdeaFunding(input: ChainReceiptSync) {
  const sync = await recordChainSync(input);
  if (sync.alreadyRecorded) return sync;
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
  if (sync.alreadyRecorded) return sync;
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
  if (sync.alreadyRecorded) return sync;
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
  if (sync.alreadyRecorded) return sync;
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

export async function mintWorkReceipt(workerAddress: string, ideaId: string, agentFingerprint: string, score: number) {
  const contractAddress = process.env.WORK_RECEIPT_CONTRACT_ADDRESS;
  if (!contractAddress || contractAddress.trim() === '') {
    console.warn('[chain:mintWorkReceipt] WORK_RECEIPT_CONTRACT_ADDRESS not set — skipping on-chain mint (off-chain-only mode)');
    return;
  }

  const privateKey = process.env.BROKER_ATTESTOR_PRIVATE_KEY;
  if (!privateKey) {
    console.error('[chain:mintWorkReceipt] BROKER_ATTESTOR_PRIVATE_KEY not set — cannot mint WorkReceipt');
    return;
  }

  const rpcUrl = process.env.WORLDCHAIN_RPC_URL;
  const chainId = process.env.WORLDCHAIN_CHAIN_ID;
  if (!rpcUrl || !chainId) {
    console.error('[chain:mintWorkReceipt] WORLDCHAIN_RPC_URL or WORLDCHAIN_CHAIN_ID not set — cannot mint WorkReceipt');
    return;
  }

  try {
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    // Define minimal chain configuration for viem
    const chain = {
      id: Number(chainId),
      name: 'Worldchain Sepolia',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: {
        default: { http: [rpcUrl] },
        public: { http: [rpcUrl] },
      },
    } as const;

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(),
    });

    // Encode the mint function call: mint(address worker, bytes32 taskId, bytes32 workerFingerprint, uint8 score)
    const taskIdHash = keccak256(toBytes(ideaId));
    const workerFingerprintBytes = agentFingerprint as `0x${string}`;
    const scoreUint8 = Math.min(Math.max(score, 0), 100);

    const hash = await walletClient.writeContract({
      address: contractAddress as `0x${string}`,
      abi: [
        {
          type: 'function',
          name: 'mint',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'worker', type: 'address' },
            { name: 'taskId', type: 'bytes32' },
            { name: 'workerFingerprint', type: 'bytes32' },
            { name: 'score', type: 'uint8' },
          ],
          outputs: [{ name: 'tokenId', type: 'uint256' }],
        },
      ],
      functionName: 'mint',
      args: [workerAddress as `0x${string}`, taskIdHash, workerFingerprintBytes, scoreUint8],
    });

    console.log(`[chain:mintWorkReceipt] Minted WorkReceipt for worker=${workerAddress} ideaId=${ideaId} txHash=${hash}`);
  } catch (err) {
    console.error('[chain:mintWorkReceipt] Failed to mint WorkReceipt:', err);
    // Do not throw — minting failure must not block the acceptance flow
  }
}

export async function depositStakerYield(amountIntel: number) {
  const contractAddress = process.env.INTEL_STAKING_CONTRACT_ADDRESS;
  if (!contractAddress || contractAddress.trim() === '') {
    console.warn('[chain:depositStakerYield] INTEL_STAKING_CONTRACT_ADDRESS not set — skipping on-chain yield deposit (off-chain-only mode)');
    return;
  }

  const privateKey = process.env.BROKER_ATTESTOR_PRIVATE_KEY;
  if (!privateKey) {
    console.error('[chain:depositStakerYield] BROKER_ATTESTOR_PRIVATE_KEY not set — cannot deposit staker yield');
    return;
  }

  const rpcUrl = process.env.WORLDCHAIN_RPC_URL;
  const chainId = process.env.WORLDCHAIN_CHAIN_ID;
  if (!rpcUrl || !chainId) {
    console.error('[chain:depositStakerYield] WORLDCHAIN_RPC_URL or WORLDCHAIN_CHAIN_ID not set — cannot deposit staker yield');
    return;
  }

  const intelTokenAddress = process.env.INTEL_TOKEN_CONTRACT_ADDRESS;
  if (!intelTokenAddress || intelTokenAddress.trim() === '') {
    console.error('[chain:depositStakerYield] INTEL_TOKEN_CONTRACT_ADDRESS not set — cannot deposit staker yield');
    return;
  }

  try {
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    // Define minimal chain configuration for viem
    const chain = {
      id: Number(chainId),
      name: 'Worldchain Sepolia',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: {
        default: { http: [rpcUrl] },
        public: { http: [rpcUrl] },
      },
    } as const;

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(),
    });

    // Convert INTEL amount to wei (18 decimals)
    const amountWei = BigInt(Math.floor(amountIntel * 1e18));

    // First approve the IntelStaking contract to spend INTEL
    const approveHash = await walletClient.writeContract({
      address: intelTokenAddress as `0x${string}`,
      abi: [
        {
          type: 'function',
          name: 'approve',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [{ name: 'success', type: 'bool' }],
        },
      ],
      functionName: 'approve',
      args: [contractAddress as `0x${string}`, amountWei],
    });

    console.log(`[chain:depositStakerYield] Approved IntelStaking to spend ${amountIntel} INTEL txHash=${approveHash}`);

    // Then deposit the yield
    const depositHash = await walletClient.writeContract({
      address: contractAddress as `0x${string}`,
      abi: [
        {
          type: 'function',
          name: 'depositYield',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'amount', type: 'uint256' },
          ],
        },
      ],
      functionName: 'depositYield',
      args: [amountWei],
    });

    console.log(`[chain:depositStakerYield] Deposited ${amountIntel} INTEL staker yield txHash=${depositHash}`);
  } catch (err) {
    console.error('[chain:depositStakerYield] Failed to deposit staker yield:', err);
    // Do not throw — deposit failure must not block the settlement flow
  }
}

// ─── WorkerStakeManager Integration ─────────────────────────────────────────────

export async function checkWorkerStake(workerAddress: string, taskValueWei: bigint): Promise<{ canClaim: boolean; error?: string }> {
  const contractAddress = process.env.WORKER_STAKE_MANAGER_ADDRESS;
  if (!contractAddress || contractAddress.trim() === '') {
    console.warn('[chain:checkWorkerStake] WORKER_STAKE_MANAGER_ADDRESS not set — allowing claim without stake check (off-chain-only mode)');
    return { canClaim: true };
  }

  const rpcUrl = process.env.WORLDCHAIN_RPC_URL;
  if (!rpcUrl) {
    console.warn('[chain:checkWorkerStake] WORLDCHAIN_RPC_URL not set — allowing claim without stake check (off-chain-only mode)');
    return { canClaim: true };
  }

  try {
    const publicClient = createPublicClient({
      transport: http(rpcUrl, {
        timeout: 10000,
        retryCount: 2,
      }),
    });

    const canClaim = await publicClient.readContract({
      address: contractAddress as `0x${string}`,
      abi: [
        {
          type: 'function',
          name: 'canClaim',
          stateMutability: 'view',
          inputs: [
            { name: 'worker', type: 'address' },
            { name: 'taskValueWei', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
        },
      ],
      functionName: 'canClaim',
      args: [workerAddress as `0x${string}`, taskValueWei],
    });

    return { canClaim: canClaim as boolean };
  } catch (err) {
    console.error('[chain:checkWorkerStake] Failed to check worker stake:', err);
    // Degrade gracefully — allow claim to proceed if contract call fails
    return { canClaim: true, error: String(err) };
  }
}

// ─── ReviewerStakeManager Integration ───────────────────────────────────────────

export async function recordReviewerReview(reviewerAddress: string, taskValueIntel: bigint): Promise<{ success: boolean; error?: string }> {
  const contractAddress = process.env.REVIEWER_STAKE_MANAGER_ADDRESS;
  if (!contractAddress || contractAddress.trim() === '') {
    console.warn('[chain:recordReviewerReview] REVIEWER_STAKE_MANAGER_ADDRESS not set — skipping on-chain record (off-chain-only mode)');
    return { success: true };
  }

  const privateKey = process.env.BROKER_ATTESTOR_PRIVATE_KEY;
  if (!privateKey) {
    console.error('[chain:recordReviewerReview] BROKER_ATTESTOR_PRIVATE_KEY not set — cannot record review');
    return { success: false, error: 'BROKER_ATTESTOR_PRIVATE_KEY not set' };
  }

  const rpcUrl = process.env.WORLDCHAIN_RPC_URL;
  const chainId = process.env.WORLDCHAIN_CHAIN_ID;
  if (!rpcUrl || !chainId) {
    console.error('[chain:recordReviewerReview] WORLDCHAIN_RPC_URL or WORLDCHAIN_CHAIN_ID not set — cannot record review');
    return { success: false, error: 'WORLDCHAIN_RPC_URL or WORLDCHAIN_CHAIN_ID not set' };
  }

  try {
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    const chain = {
      id: Number(chainId),
      name: 'Worldchain Sepolia',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: {
        default: { http: [rpcUrl] },
        public: { http: [rpcUrl] },
      },
    } as const;

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(),
    });

    const hash = await walletClient.writeContract({
      address: contractAddress as `0x${string}`,
      abi: [
        {
          type: 'function',
          name: 'recordReview',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'reviewer', type: 'address' },
            { name: 'taskValue', type: 'uint256' },
          ],
          outputs: [],
        },
      ],
      functionName: 'recordReview',
      args: [reviewerAddress as `0x${string}`, taskValueIntel],
    });

    console.log(`[chain:recordReviewerReview] Recorded review for reviewer=${reviewerAddress} taskValue=${taskValueIntel} txHash=${hash}`);
    return { success: true };
  } catch (err) {
    console.error('[chain:recordReviewerReview] Failed to record review:', err);
    // Fire-and-forget — never block the acceptance flow
    return { success: false, error: String(err) };
  }
}
