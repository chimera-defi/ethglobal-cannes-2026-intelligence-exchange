/**
 * Arc Escrow Router
 * 
 * API endpoints for AdvancedArcEscrow integration.
 * Supports Prize 1 criteria: conditional escrow, disputes, vesting, USDC operations.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { jobs, ideas, milestones, escrowReleases } from '../db/schema';
import { requireSessionAccountAddress, requireWorldRole } from '../services/accessService';
import { httpError } from '../services/errors';
import { randomUUID } from 'crypto';
import {
  getArcIntegrationStatus,
  getEscrowConfig,
  getEscrowIdeaBalance,
  getMilestoneStatus,
  getMilestoneDetails,
  getMilestoneStatusName,
  getReleasableAmount,
  getVestingProgress,
  getDisputeDetails,
  canAutoRelease,
  canAutoResolve,
  calculatePlatformFee,
  buildUSDCApprovalTx,
  buildFundIdeaTx,
  buildReserveMilestoneTx,
  buildSubmitMilestoneTx,
  buildStartReviewTx,
  buildApproveMilestoneTx,
  buildReleaseMilestoneTx,
  buildRaiseDisputeTx,
  formatUSDC,
  parseUSDC,
  getArcExplorerUrl,
  getArcAddressExplorerUrl,
  MilestoneStatus,
  DisputeResolution,
} from '../services/arcEscrowService';
import { getIntegrationStatus } from '../services/sponsorConfig';

export const arcRouter = new Hono();

function toBytes32Id(value: string): `0x${string}` {
  return `0x${Buffer.from(value).toString('hex').padStart(64, '0')}`;
}

function getDisputeResolutionName(resolution: number) {
  const entry = Object.entries(DisputeResolution).find(([, value]) => value === resolution);
  return entry?.[0] ?? 'None';
}

// ═════════════════════════════════════════════════════════════════════════════
// Schemas
// ═════════════════════════════════════════════════════════════════════════════

const FundIdeaSchema = z.object({
  ideaId: z.string(),
  amount: z.string().regex(/^\d+\.?\d{0,6}$/), // USDC with 6 decimals
});

const ReserveMilestoneSchema = z.object({
  ideaId: z.string(),
  milestoneId: z.string(),
  amount: z.string().regex(/^\d+\.?\d{0,6}$/),
  vestingDuration: z.number().int().min(0).default(0), // seconds
  vestingCliff: z.number().int().min(0).default(0), // seconds
  linearVesting: z.boolean().default(true),
});

const SubmitMilestoneSchema = z.object({
  jobId: z.string(),
  submissionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

const ReviewMilestoneSchema = z.object({
  jobId: z.string(),
  attestationHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  action: z.enum(['approve', 'reject', 'dispute']),
  disputeReasonHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
});

const ReleaseMilestoneSchema = z.object({
  jobId: z.string(),
  autoRelease: z.boolean().default(false),
});

const ResolveDisputeSchema = z.object({
  jobId: z.string(),
  resolution: z.enum(['workerWins', 'posterWins', 'split']),
  workerPayoutBps: z.number().int().min(0).max(10000).optional(), // For split resolution
});

// ═════════════════════════════════════════════════════════════════════════════
// Status & Config Routes
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /v1/cannes/arc/status
 * Get Arc integration status and configuration
 */
arcRouter.get('/status', async (c) => {
  const status = getArcIntegrationStatus();
  const escrowConfig = await getEscrowConfig().catch(() => null);
  
  return c.json({
    status,
    escrowConfig: escrowConfig ? {
      platformFeeBps: Number(escrowConfig.platformFeeBps),
      platformFeePercent: Number(escrowConfig.platformFeeBps) / 100,
      reviewTimeout: escrowConfig.reviewTimeout,
      disputeWindow: escrowConfig.disputeWindow,
      usdcAddress: escrowConfig.usdc,
    } : null,
    prize1Criteria: {
      conditionalEscrow: true,
      disputeMechanism: true,
      automaticRelease: true,
      programmableVesting: true,
      usdcNative: true,
      platformFeeSplit: true,
    },
  });
});

/**
 * GET /v1/cannes/arc/config
 * Get contract configuration for frontend
 */
arcRouter.get('/config', async (c) => {
  const status = getArcIntegrationStatus();
  const integration = getIntegrationStatus();
  
  if (!status.configured) {
    return c.json({
      configured: false,
      message: 'Arc integration not fully configured',
    }, 503);
  }
  
  return c.json({
    configured: true,
    chainId: status.chainId,
    isTestnet: status.isTestnet,
    rpcUrl: status.rpcUrl,
    contracts: {
      advancedEscrow: status.escrowContractAddress,
      usdc: status.usdcAddress,
    },
    explorer: {
      baseUrl: status.explorerUrl,
      txUrl: `${status.explorerUrl}/tx`,
      addressUrl: `${status.explorerUrl}/address`,
    },
    faucets: status.isTestnet ? {
      circle: 'https://faucet.circle.com',
    } : undefined,
    usdc: {
      decimals: 6,
      symbol: 'USDC',
    },
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Read Routes
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /v1/cannes/arc/ideas/:ideaId/balance
 * Get on-chain balance for an idea
 */
arcRouter.get('/ideas/:ideaId/balance', async (c) => {
  const ideaId = c.req.param('ideaId');
  const ideaIdHash = toBytes32Id(ideaId);
  
  try {
    const balance = await getEscrowIdeaBalance(ideaIdHash);
    
    return c.json({
      ideaId,
      ideaIdHash,
      available: balance.available.toString(),
      availableFormatted: formatUSDC(balance.available),
      totalFunded: balance.totalFunded.toString(),
      totalFundedFormatted: formatUSDC(balance.totalFunded),
      platformFeesReserved: balance.platformFeesReserved.toString(),
      platformFeesFormatted: formatUSDC(balance.platformFeesReserved),
    });
  } catch (error) {
    return c.json({
      ideaId,
      ideaIdHash,
      error: 'Failed to fetch balance',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * GET /v1/cannes/arc/jobs/:jobId/escrow
 * Get full escrow details for a job/milestone
 */
arcRouter.get('/jobs/:jobId/escrow', async (c) => {
  const jobId = c.req.param('jobId');
  
  // Get job from database
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) throw httpError('Job not found', 404, 'JOB_NOT_FOUND');
  
  // Get milestone details
  const [milestone] = await db.select().from(milestones).where(eq(milestones.milestoneId, job.milestoneId));
  if (!milestone) throw httpError('Milestone not found', 404, 'MILESTONE_NOT_FOUND');
  
  const milestoneIdHash = toBytes32Id(milestone.milestoneId);
  
  try {
    const [
      status,
      statusName,
      details,
      releasable,
      vestingProgress,
      dispute,
      autoReleasePossible,
      autoResolvePossible,
    ] = await Promise.all([
      getMilestoneStatus(milestoneIdHash),
      getMilestoneStatusName(milestoneIdHash),
      getMilestoneDetails(milestoneIdHash).catch(() => null),
      getReleasableAmount(milestoneIdHash),
      getVestingProgress(milestoneIdHash).catch(() => null),
      getDisputeDetails(milestoneIdHash),
      canAutoRelease(milestoneIdHash),
      canAutoResolve(milestoneIdHash),
    ]);
    
    return c.json({
      jobId,
      milestoneId: milestone.milestoneId,
      milestoneIdHash,
      status: {
        code: status,
        name: statusName,
      },
      onChain: details ? {
        ideaId: details.ideaId,
        amount: details.amount.toString(),
        amountFormatted: formatUSDC(details.amount),
        worker: details.worker,
        reviewer: details.reviewer,
        submittedAt: details.submittedAt,
        reviewStartedAt: details.reviewStartedAt,
        approvedAt: details.approvedAt,
        submissionHash: details.submissionHash,
        attestationHash: details.attestationHash,
        releasedAmount: details.releasedAmount.toString(),
        releasedFormatted: formatUSDC(details.releasedAmount),
      } : null,
      vesting: vestingProgress ? {
        totalAmount: vestingProgress.totalAmount.toString(),
        releasedAmount: vestingProgress.releasedAmount.toString(),
        releasableNow: releasable.toString(),
        releasableFormatted: formatUSDC(releasable),
        startTime: vestingProgress.startTime,
        cliff: vestingProgress.cliff,
        duration: vestingProgress.duration,
        isLinear: vestingProgress.isLinear,
        progress: vestingProgress.duration > 0 
          ? Math.min(100, Math.round((Date.now() / 1000 - vestingProgress.startTime) / vestingProgress.duration * 100))
          : 100,
      } : null,
      dispute: dispute ? {
        disputant: dispute.disputant,
        reasonHash: dispute.reasonHash,
        raisedAt: dispute.raisedAt,
        resolutionDeadline: dispute.resolutionDeadline,
        resolution: dispute.resolved ? getDisputeResolutionName(dispute.resolution) : 'pending',
        resolved: dispute.resolved,
        resolver: dispute.resolver,
        canAutoResolve: autoResolvePossible,
      } : null,
      actions: {
        canAutoRelease: autoReleasePossible,
        canAutoResolve: autoResolvePossible,
      },
    });
  } catch (error) {
    return c.json({
      jobId,
      milestoneId: milestone.milestoneId,
      milestoneIdHash,
      error: 'Failed to fetch escrow details',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

/**
 * GET /v1/cannes/arc/jobs/:jobId/vesting
 * Get vesting progress for a milestone
 */
arcRouter.get('/jobs/:jobId/vesting', async (c) => {
  const jobId = c.req.param('jobId');
  
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) throw httpError('Job not found', 404, 'JOB_NOT_FOUND');
  
  const milestoneIdHash = toBytes32Id(job.milestoneId);
  
  try {
    const progress = await getVestingProgress(milestoneIdHash);
    const releasable = await getReleasableAmount(milestoneIdHash);
    
    const now = Math.floor(Date.now() / 1000);
    const elapsed = progress.startTime > 0 ? now - progress.startTime : 0;
    const percentVested = progress.duration > 0 
      ? Math.min(100, Math.round(elapsed / progress.duration * 100))
      : 100;
    
    return c.json({
      jobId,
      milestoneId: job.milestoneId,
      totalAmount: progress.totalAmount.toString(),
      totalFormatted: formatUSDC(progress.totalAmount),
      releasedAmount: progress.releasedAmount.toString(),
      releasedFormatted: formatUSDC(progress.releasedAmount),
      releasableNow: releasable.toString(),
      releasableFormatted: formatUSDC(releasable),
      remaining: (progress.totalAmount - progress.releasedAmount).toString(),
      remainingFormatted: formatUSDC(progress.totalAmount - progress.releasedAmount),
      schedule: {
        startTime: progress.startTime,
        cliff: progress.cliff,
        duration: progress.duration,
        isLinear: progress.isLinear,
        elapsed,
        percentVested,
      },
    });
  } catch (error) {
    return c.json({
      jobId,
      error: 'Failed to fetch vesting progress',
    }, 500);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Transaction Builder Routes (for frontend to sign)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POST /v1/cannes/arc/tx/fund-idea
 * Build transaction data for funding an idea
 */
arcRouter.post('/tx/fund-idea', zValidator('json', FundIdeaSchema), async (c) => {
  const accountAddress = await requireSessionAccountAddress(c);
  await requireWorldRole(accountAddress, 'poster');
  
  const { ideaId, amount } = c.req.valid('json');
  const ideaIdHash = toBytes32Id(ideaId);
  const amountUSDC = parseUSDC(amount);
  
  // Calculate platform fee
  const platformFee = await calculatePlatformFee(amountUSDC);
  const totalRequired = amountUSDC + platformFee;
  
  // Build approval + fund transactions
  const status = getArcIntegrationStatus();
  if (!status.escrowContractAddress) {
    throw httpError('Arc escrow contract not configured', 503, 'ARC_ESCROW_NOT_CONFIGURED');
  }
  
  const approvalTx = buildUSDCApprovalTx(
    status.escrowContractAddress as `0x${string}`,
    totalRequired
  );
  
  const fundTx = buildFundIdeaTx(ideaIdHash, amountUSDC);
  
  return c.json({
    ideaId,
    amount,
    amountUSDC: amountUSDC.toString(),
    platformFee: platformFee.toString(),
    platformFeeFormatted: formatUSDC(platformFee),
    totalRequired: totalRequired.toString(),
    totalFormatted: formatUSDC(totalRequired),
    transactions: [
      { ...approvalTx, description: 'Approve USDC spend' },
      { ...fundTx, description: 'Fund idea escrow' },
    ],
  });
});

/**
 * POST /v1/cannes/arc/tx/reserve-milestone
 * Build transaction data for reserving a milestone
 */
arcRouter.post('/tx/reserve-milestone', zValidator('json', ReserveMilestoneSchema), async (c) => {
  const accountAddress = await requireSessionAccountAddress(c);
  const { ideaId, milestoneId, amount, vestingDuration, vestingCliff, linearVesting } = c.req.valid('json');
  
  // Verify poster owns idea
  const [idea] = await db.select().from(ideas).where(eq(ideas.ideaId, ideaId));
  if (!idea) throw httpError('Idea not found', 404, 'IDEA_NOT_FOUND');
  if (idea.posterId !== accountAddress) {
    throw httpError('Only idea poster can reserve milestones', 403, 'UNAUTHORIZED');
  }
  
  const ideaIdHash = toBytes32Id(ideaId);
  const milestoneIdHash = toBytes32Id(milestoneId);
  const amountUSDC = parseUSDC(amount);
  
  const tx = buildReserveMilestoneTx(
    ideaIdHash,
    milestoneIdHash,
    amountUSDC,
    vestingDuration,
    vestingCliff,
    linearVesting
  );
  
  return c.json({
    ideaId,
    milestoneId,
    amount,
    amountUSDC: amountUSDC.toString(),
    vesting: {
      duration: vestingDuration,
      cliff: vestingCliff,
      linear: linearVesting,
    },
    transaction: { ...tx, description: 'Reserve milestone funds' },
  });
});

/**
 * POST /v1/cannes/arc/tx/submit-milestone
 * Build transaction data for worker submission
 */
arcRouter.post('/tx/submit-milestone', zValidator('json', SubmitMilestoneSchema), async (c) => {
  const accountAddress = await requireSessionAccountAddress(c);
  await requireWorldRole(accountAddress, 'worker');
  
  const { jobId, submissionHash } = c.req.valid('json');
  
  // Get job milestone
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) throw httpError('Job not found', 404, 'JOB_NOT_FOUND');
  if (job.activeClaimWorkerId !== accountAddress) {
    throw httpError('Only assigned worker can submit', 403, 'UNAUTHORIZED');
  }
  
  const milestoneIdHash = toBytes32Id(job.milestoneId);
  
  const tx = buildSubmitMilestoneTx(milestoneIdHash, submissionHash as `0x${string}`);
  
  return c.json({
    jobId,
    milestoneId: job.milestoneId,
    submissionHash,
    transaction: { ...tx, description: 'Submit milestone work' },
  });
});

/**
 * POST /v1/cannes/arc/tx/start-review
 * Build transaction for reviewer to start review
 */
arcRouter.post('/tx/start-review', async (c) => {
  const accountAddress = await requireSessionAccountAddress(c);
  await requireWorldRole(accountAddress, 'reviewer');
  
  const { jobId } = await c.req.json();
  
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) throw httpError('Job not found', 404, 'JOB_NOT_FOUND');
  
  const milestoneIdHash = toBytes32Id(job.milestoneId);
  
  const tx = buildStartReviewTx(milestoneIdHash);
  
  return c.json({
    jobId,
    milestoneId: job.milestoneId,
    transaction: { ...tx, description: 'Start milestone review' },
  });
});

/**
 * POST /v1/cannes/arc/tx/review-milestone
 * Build transaction for reviewer approval/dispute
 */
arcRouter.post('/tx/review-milestone', zValidator('json', ReviewMilestoneSchema), async (c) => {
  const accountAddress = await requireSessionAccountAddress(c);
  await requireWorldRole(accountAddress, 'reviewer');
  
  const { jobId, attestationHash, action, disputeReasonHash } = c.req.valid('json');
  
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) throw httpError('Job not found', 404, 'JOB_NOT_FOUND');
  
  const [idea] = await db.select().from(ideas).where(eq(ideas.ideaId, job.ideaId));
  if (!idea) throw httpError('Idea not found', 404, 'IDEA_NOT_FOUND');
  
  const milestoneIdHash = toBytes32Id(job.milestoneId);
  
  if (action === 'approve') {
    const tx = buildApproveMilestoneTx(milestoneIdHash, attestationHash as `0x${string}`);
    
    return c.json({
      jobId,
      action: 'approve',
      transaction: { ...tx, description: 'Approve milestone' },
    });
  } else if (action === 'dispute') {
    if (!disputeReasonHash) {
      throw httpError('Dispute reason hash required', 400, 'MISSING_DISPUTE_REASON');
    }
    
    const tx = buildRaiseDisputeTx(milestoneIdHash, disputeReasonHash as `0x${string}`);
    
    return c.json({
      jobId,
      action: 'dispute',
      transaction: { ...tx, description: 'Raise dispute' },
    });
  } else {
    // Reject - use refund path
    // This would require a refund transaction from poster
    return c.json({
      jobId,
      action: 'reject',
      message: 'Rejection handled off-chain. Poster should refund via contract directly.',
    });
  }
});

/**
 * POST /v1/cannes/arc/tx/release-milestone
 * Build transaction to release funds to worker
 */
arcRouter.post('/tx/release-milestone', zValidator('json', ReleaseMilestoneSchema), async (c) => {
  const accountAddress = await requireSessionAccountAddress(c);
  const { jobId, autoRelease } = c.req.valid('json');
  
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) throw httpError('Job not found', 404, 'JOB_NOT_FOUND');
  
  const [idea] = await db.select().from(ideas).where(eq(ideas.ideaId, job.ideaId));
  if (!idea) throw httpError('Idea not found', 404, 'IDEA_NOT_FOUND');
  
  // Can be called by worker (for their own jobs) or poster
  const isAuthorized = (
    job.activeClaimWorkerId === accountAddress ||
    idea.posterId === accountAddress
  );
  
  if (!isAuthorized && !autoRelease) {
    throw httpError('Unauthorized to release', 403, 'UNAUTHORIZED');
  }
  
  const milestoneIdHash = toBytes32Id(job.milestoneId);
  
  const tx = buildReleaseMilestoneTx(milestoneIdHash);
  
  return c.json({
    jobId,
    milestoneId: job.milestoneId,
    autoRelease,
    transaction: { ...tx, description: autoRelease ? 'Auto-release milestone' : 'Release milestone funds' },
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Webhook/Sync Routes
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POST /v1/cannes/arc/webhook/escrow-event
 * Receive escrow events from indexer/webhook
 */
arcRouter.post('/webhook/escrow-event', async (c) => {
  const event = await c.req.json();
  
  // Validate webhook signature (implement based on your indexer)
  // For now, accept and process
  
  const { eventType, txHash, milestoneId, ideaId, ...payload } = event;
  
  // Update database based on event type
  switch (eventType) {
    case 'MilestoneReleased':
    case 'MilestoneAutoReleased': {
      // Record release in database
      const [job] = await db.select().from(jobs).where(eq(jobs.milestoneId, milestoneId));
      if (job) {
        await db.insert(escrowReleases).values({
          releaseId: randomUUID(),
          jobId: job.jobId,
          ideaId: job.ideaId,
          milestoneId,
          payer: ideaId || 'poster',
          payee: payload.worker,
          amountUsd: payload.amount,
          txHash,
          status: 'confirmed',
          releasedAt: new Date(),
          createdAt: new Date(),
        });
        
        await db.update(jobs)
          .set({ status: 'settled', updatedAt: new Date() })
          .where(eq(jobs.jobId, job.jobId));
      }
      break;
    }
      
    case 'DisputeRaised': {
      const [job] = await db.select().from(jobs).where(eq(jobs.milestoneId, milestoneId));
      if (job) {
        await db.update(jobs)
          .set({ status: 'disputed', updatedAt: new Date() })
          .where(eq(jobs.jobId, job.jobId));
      }
      break;
    }
      
    case 'DisputeResolved': {
      const [job] = await db.select().from(jobs).where(eq(jobs.milestoneId, milestoneId));
      if (job) {
        await db.update(jobs)
          .set({ status: 'resolved', updatedAt: new Date() })
          .where(eq(jobs.jobId, job.jobId));
      }
      break;
    }
  }
  
  return c.json({ received: true, eventType });
});

// ═════════════════════════════════════════════════════════════════════════════
// Explorer Links
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /v1/cannes/arc/explorer/tx/:txHash
 * Redirect to Arc explorer transaction page
 */
arcRouter.get('/explorer/tx/:txHash', async (c) => {
  const txHash = c.req.param('txHash');
  const url = getArcExplorerUrl(txHash);
  return c.redirect(url);
});

/**
 * GET /v1/cannes/arc/explorer/address/:address
 * Redirect to Arc explorer address page
 */
arcRouter.get('/explorer/address/:address', async (c) => {
  const address = c.req.param('address');
  const url = getArcAddressExplorerUrl(address);
  return c.redirect(url);
});
