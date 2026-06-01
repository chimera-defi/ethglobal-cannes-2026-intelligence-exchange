import { randomUUID } from 'crypto';
import { desc, eq, sql } from 'drizzle-orm';
import {
  getCurvePriceUsdPerIntel,
  quoteMintIntel,
  splitSettlementIntel,
  type MintQuote,
  type PoolState,
} from 'intelligence-exchange-cannes-tokenomics';
import { db } from '../db/client';
import { ideaTokenReserves, tokenAccounts, tokenLedgerEntries, agentIdentities, jobs } from '../db/schema';
import { httpError } from './errors';
import { normalizeAccountAddress } from './identityService';
import { depositStakerYield, releaseTaskEscrow, depositReviewerFees } from './chainService';
import { getReferralBonus } from './referralService';

function parseBoolean(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function round(value: number, decimals = 8) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function getTokenomicsConfig() {
  const basePriceUsdPerIntel = toNumber(
    process.env.TOKEN_BASE_PRICE_USD_PER_INTEL ?? process.env.TOKEN_BASE_PRICE_USD_PER_IXP,
    1,
  );
  const targetSupplyIntel = toNumber(
    process.env.TOKEN_TARGET_SUPPLY_INTEL ?? process.env.TOKEN_TARGET_SUPPLY_IXP,
    100_000,
  );

  return {
    enabled: parseBoolean(process.env.TOKENOMICS_ENABLED, true),
    symbol: process.env.TOKEN_SYMBOL ?? 'INTEL',
    treasuryAccount: normalizeAccountAddress(process.env.TOKEN_TREASURY_ACCOUNT ?? 'treasury:protocol'),
    protocolFeeBps: Math.max(0, Math.min(10_000, Number.parseInt(process.env.TOKEN_PROTOCOL_FEE_BPS ?? '1000', 10) || 1000)),
    pool: {
      basePriceUsdPerIntel: basePriceUsdPerIntel,
      targetSupplyIntel: targetSupplyIntel,
      adjustmentPower: toNumber(process.env.TOKEN_ADJUSTMENT_POWER, 2),
      liquidityDepthUsd: toNumber(process.env.TOKEN_LIQUIDITY_DEPTH_USD, 50_000),
      slippageBps: toNumber(process.env.TOKEN_SLIPPAGE_BPS, 50),
    },
  };
}

async function getCurrentSupplyIntel() {
  const [row] = await db.select({
    total: sql<string>`COALESCE(SUM(${tokenAccounts.intelBalance} + ${tokenAccounts.intelReserved}), 0)`,
  }).from(tokenAccounts);
  return toNumber(row?.total, 0);
}

export async function getTokenPoolState(): Promise<PoolState> {
  const config = getTokenomicsConfig();
  const currentSupplyIntel = await getCurrentSupplyIntel();
  return {
    ...config.pool,
    currentSupplyIntel,
  };
}

export async function quoteStableMint(stableAmountUsd: number) {
  const pool = await getTokenPoolState();
  const quote = quoteMintIntel(stableAmountUsd, pool);
  return {
    pool: {
      basePriceUsdPerIntel: pool.basePriceUsdPerIntel,
      targetSupplyIntel: pool.targetSupplyIntel,
      adjustmentPower: pool.adjustmentPower,
      liquidityDepthUsd: pool.liquidityDepthUsd,
      slippageBps: pool.slippageBps,
      currentSupplyIntel: pool.currentSupplyIntel,
      spotPriceUsdPerIntel: getCurvePriceUsdPerIntel(pool),
    },
    quote: {
      stableAmountUsd: quote.stableAmountUsd,
      effectivePriceUsdPerIntel: quote.effectivePriceUsdPerIntel,
      mintedIntel: quote.mintedIntel,
      nextPriceUsdPerIntel: quote.nextPriceUsdPerIntel,
      nextSupplyIntel: quote.nextSupplyIntel,
    },
  };
}

async function ensureTokenAccount(accountAddress: string) {
  const normalized = normalizeAccountAddress(accountAddress);
  await db.insert(tokenAccounts).values({
    accountAddress: normalized,
    stableDepositedUsd: '0',
    intelBalance: '0',
    intelReserved: '0',
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();
  return normalized;
}

export async function mintAndReserveIdeaCredits(input: {
  ideaId: string;
  posterId: string;
  stableAmountUsd: number;
  txHash?: string;
}) {
  const config = getTokenomicsConfig();
  if (!config.enabled) return null;

  const stableAmountUsd = round(Math.max(0, input.stableAmountUsd), 6);
  if (stableAmountUsd <= 0) {
    throw httpError('Funding amount must be positive for token minting', 400, 'INVALID_MINT_AMOUNT');
  }

  const posterId = await ensureTokenAccount(input.posterId);
  const { quote } = await quoteStableMint(stableAmountUsd);
  if (quote.mintedIntel <= 0) {
    throw httpError('Mint quote returned zero INTEL', 409, 'MINT_QUOTE_ZERO');
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(tokenAccounts)
      .set({
        stableDepositedUsd: sql`${tokenAccounts.stableDepositedUsd} + ${stableAmountUsd}`,
        intelReserved: sql`${tokenAccounts.intelReserved} + ${quote.mintedIntel}`,
        updatedAt: now,
      })
      .where(eq(tokenAccounts.accountAddress, posterId));

    await tx.insert(tokenLedgerEntries).values([
      {
        entryId: randomUUID(),
        accountAddress: posterId,
        entryType: 'mint',
        deltaIntel: quote.mintedIntel.toFixed(8),
        deltaStableUsd: stableAmountUsd.toFixed(6),
        referenceType: 'idea',
        referenceId: input.ideaId,
        metadata: {
          txHash: input.txHash ?? null,
          effectivePriceUsdPerIntel: quote.effectivePriceUsdPerIntel,
        },
        createdAt: now,
      },
      {
        entryId: randomUUID(),
        accountAddress: posterId,
        entryType: 'reserve',
        deltaIntel: (-quote.mintedIntel).toFixed(8),
        deltaStableUsd: '0',
        referenceType: 'idea',
        referenceId: input.ideaId,
        metadata: {
          txHash: input.txHash ?? null,
          reason: 'idea_funding_reserve',
        },
        createdAt: now,
      },
    ]);

    const [existingReserve] = await tx.select().from(ideaTokenReserves).where(eq(ideaTokenReserves.ideaId, input.ideaId));
    if (!existingReserve) {
      await tx.insert(ideaTokenReserves).values({
        ideaId: input.ideaId,
        posterId,
        stableFundedUsd: stableAmountUsd.toFixed(6),
        avgMintPriceUsdPerIntel: quote.effectivePriceUsdPerIntel.toFixed(8),
        intelMinted: quote.mintedIntel.toFixed(8),
        intelReserved: quote.mintedIntel.toFixed(8),
        intelSpent: '0',
        intelProtocolFee: '0',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    const totalStable = toNumber(existingReserve.stableFundedUsd, 0) + stableAmountUsd;
    const totalMinted = toNumber(existingReserve.intelMinted, 0) + quote.mintedIntel;
    const avgMintPrice = totalMinted > 0 ? totalStable / totalMinted : quote.effectivePriceUsdPerIntel;

    await tx.update(ideaTokenReserves).set({
      stableFundedUsd: totalStable.toFixed(6),
      avgMintPriceUsdPerIntel: round(avgMintPrice, 8).toFixed(8),
      intelMinted: totalMinted.toFixed(8),
      intelReserved: (toNumber(existingReserve.intelReserved, 0) + quote.mintedIntel).toFixed(8),
      status: 'active',
      updatedAt: now,
    }).where(eq(ideaTokenReserves.ideaId, input.ideaId));
  });

  return {
    tokenSymbol: config.symbol,
    stableAmountUsd,
    mintedIntel: quote.mintedIntel,
    effectivePriceUsdPerIntel: quote.effectivePriceUsdPerIntel,
    nextPriceUsdPerIntel: quote.nextPriceUsdPerIntel,
  };
}

export async function settleAcceptedJobCredits(input: {
  ideaId: string;
  jobId: string;
  workerId: string;
  budgetUsd: number;
}) {
  const config = getTokenomicsConfig();
  if (!config.enabled) return null;

  // Idempotency guard: check if job is already settled
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, input.jobId));
  if (job && (job.status === 'settled' || job.onChainSettled)) {
    console.warn('[tokenomics] settlement already processed for job:', input.jobId);
    return { alreadySettled: true };
  }

  const [reserve] = await db.select().from(ideaTokenReserves).where(eq(ideaTokenReserves.ideaId, input.ideaId));
  if (!reserve) {
    return null;
  }

  const budgetUsd = round(Math.max(0, input.budgetUsd), 6);
  if (budgetUsd <= 0) {
    return null;
  }

  const avgMintPriceUsdPerIntel = Math.max(0.00000001, toNumber(reserve.avgMintPriceUsdPerIntel, 1));
  const remainingIxp = toNumber(reserve.intelReserved, 0);
  if (remainingIxp <= 0) {
    throw httpError('No reserved INTEL remaining for this idea', 409, 'INTEL_RESERVE_EMPTY');
  }

  const requestedGrossIntel = round(budgetUsd / avgMintPriceUsdPerIntel, 8);
  if (remainingIxp + 0.000001 < requestedGrossIntel) {
    throw httpError('Reserved INTEL is insufficient for this job budget', 409, 'INTEL_RESERVE_INSUFFICIENT');
  }

  const grossIntel = requestedGrossIntel;
  let split = splitSettlementIntel(grossIntel, { protocolFeeBps: config.protocolFeeBps, stakerYieldBps: 900 });

  // NOTE: Quality streak tracking requires schema migration to add consecutiveAccepts column
  // Quality streak bonus: workers with 5+ consecutive accepts get 10% bonus
  // const [workerIdentity] = await db.select().from(agentIdentities)
  //   .where(eq(agentIdentities.accountAddress, input.workerId));
  // const consecutiveAccepts = (workerIdentity as any)?.consecutiveAccepts ?? 0;
  // const streakMultiplier = consecutiveAccepts >= 5 ? 1.10 : 1.00;
  // if (streakMultiplier > 1.00) {
  //   const bonusAmount = split.workerPayoutIntel * (streakMultiplier - 1);
  //   split.workerPayoutIntel = round(split.workerPayoutIntel * streakMultiplier, 8);
  //   split.protocolFeeIntel = round(Math.max(0, split.protocolFeeIntel - bonusAmount), 8);
  // }

  // Poster rebate: high-acceptance-rate posters pay lower fees (worker gets 83% instead of 81%)
  const posterStats = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('accepted', 'settled', 'completed') THEN 1 ELSE 0 END) as accepted
    FROM jobs WHERE poster_id = ${reserve.posterId}
  `);
  const total = Number(posterStats[0]?.total ?? 0);
  const accepted = Number(posterStats[0]?.accepted ?? 0);
  const posterRebate = total >= 10 && accepted / total >= 0.90;
  if (posterRebate) {
    // Shift 2% from protocol fee to worker (poster rebate funded by protocol)
    const rebateAmount = grossIntel * 0.02;
    split.workerPayoutIntel = round(split.workerPayoutIntel + rebateAmount, 8);
    split.protocolFeeIntel = round(Math.max(0, split.protocolFeeIntel - rebateAmount), 8);
  }

  // Referral bonus: referrer earns 1% of worker's settlement yield for 6 months
  const refBonus = getReferralBonus(split.workerPayoutIntel, input.workerId);
  if (refBonus.referrer && refBonus.bonusAmount > 0) {
    split.protocolFeeIntel = round(split.protocolFeeIntel - refBonus.bonusAmount, 8);
    if (split.protocolFeeIntel < 0) split.protocolFeeIntel = 0;
    console.log('[referral] bonus to referrer:', refBonus.referrer, refBonus.bonusAmount);
    // NOTE: Referrer payout ledger entry not yet implemented - bonus calculated and logged but not persisted
  }

  const workerId = await ensureTokenAccount(input.workerId);
  const treasuryAccount = await ensureTokenAccount(config.treasuryAccount);
  const stakerYieldPoolAccount = await ensureTokenAccount('staker_yield_pool');
  const posterId = await ensureTokenAccount(reserve.posterId);

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(tokenAccounts)
      .set({
        intelReserved: sql`${tokenAccounts.intelReserved} - ${split.grossIntel}`,
        updatedAt: now,
      })
      .where(eq(tokenAccounts.accountAddress, posterId));

    await tx.update(tokenAccounts)
      .set({
        intelBalance: sql`${tokenAccounts.intelBalance} + ${split.workerPayoutIntel}`,
        updatedAt: now,
      })
      .where(eq(tokenAccounts.accountAddress, workerId));

    await tx.update(tokenAccounts)
      .set({
        intelBalance: sql`${tokenAccounts.intelBalance} + ${split.protocolFeeIntel}`,
        updatedAt: now,
      })
      .where(eq(tokenAccounts.accountAddress, treasuryAccount));

    await tx.update(tokenAccounts)
      .set({
        intelBalance: sql`${tokenAccounts.intelBalance} + ${split.stakerYieldIntel}`,
        updatedAt: now,
      })
      .where(eq(tokenAccounts.accountAddress, stakerYieldPoolAccount));

    const currentReserved = toNumber(reserve.intelReserved, 0);
    const nextReserved = round(Math.max(0, currentReserved - split.grossIntel), 8);

    await tx.update(ideaTokenReserves).set({
      intelReserved: nextReserved.toFixed(8),
      intelSpent: round(toNumber(reserve.intelSpent, 0) + split.workerPayoutIntel, 8).toFixed(8),
      intelProtocolFee: round(toNumber(reserve.intelProtocolFee, 0) + split.protocolFeeIntel, 8).toFixed(8),
      status: nextReserved <= 0 ? 'settled' : 'active',
      updatedAt: now,
    }).where(eq(ideaTokenReserves.ideaId, input.ideaId));

    await tx.insert(tokenLedgerEntries).values([
      {
        entryId: randomUUID(),
        accountAddress: posterId,
        entryType: 'settlement_debit',
        deltaIntel: (-split.grossIntel).toFixed(8),
        deltaStableUsd: '0',
        referenceType: 'job',
        referenceId: input.jobId,
        metadata: { ideaId: input.ideaId, budgetUsd },
        createdAt: now,
      },
      {
        entryId: randomUUID(),
        accountAddress: workerId,
        entryType: 'worker_payout',
        deltaIntel: split.workerPayoutIntel.toFixed(8),
        deltaStableUsd: '0',
        referenceType: 'job',
        referenceId: input.jobId,
        metadata: { ideaId: input.ideaId, budgetUsd },
        createdAt: now,
      },
      {
        entryId: randomUUID(),
        accountAddress: treasuryAccount,
        entryType: 'protocol_fee',
        deltaIntel: split.protocolFeeIntel.toFixed(8),
        deltaStableUsd: '0',
        referenceType: 'job',
        referenceId: input.jobId,
        metadata: { ideaId: input.ideaId, budgetUsd },
        createdAt: now,
      },
      {
        entryId: randomUUID(),
        accountAddress: stakerYieldPoolAccount,
        entryType: 'staker_yield_pool',
        deltaIntel: split.stakerYieldIntel.toFixed(8),
        deltaStableUsd: '0',
        referenceType: 'idea',
        referenceId: input.ideaId,
        metadata: { ideaId: input.ideaId, budgetUsd, jobId: input.jobId },
        createdAt: now,
      },
    ]);
  });

  // Deposit staker yield to IntelStaking contract on-chain
  // This is non-blocking: if it fails, we log and continue (off-chain-only mode for demo)
  if (split.stakerYieldIntel > 0) {
    await depositStakerYield(split.stakerYieldIntel);
  }

  // Release task escrow on-chain via TaskEscrow.release()
  // This is fire-and-forget: if it fails, we log and continue (off-chain-only mode for demo)
  const releaseTx = await releaseTaskEscrow(input.jobId, input.workerId);
  if (releaseTx) {
    console.log(`[settlement] TaskEscrow.release called, tx: ${releaseTx}`);
  }

  // Deposit reviewer fees to ReviewerStakeManager (1% of gross INTEL)
  const reviewerFeeShare = split.grossIntel * 0.01;
  if (reviewerFeeShare > 0) {
    depositReviewerFees(reviewerFeeShare).catch(err => console.error('[settlement] depositReviewerFees failed:', err));
  }

  return {
    tokenSymbol: config.symbol,
    grossIntel: split.grossIntel,
    workerPayoutIntel: split.workerPayoutIntel,
    stakerYieldIntel: split.stakerYieldIntel,
    protocolFeeIntel: split.protocolFeeIntel,
    budgetUsd,
    avgMintPriceUsdPerIntel: round(avgMintPriceUsdPerIntel, 8),
  };
}

export async function getTokenAccountSnapshot(accountAddress: string) {
  const normalized = normalizeAccountAddress(accountAddress);
  await ensureTokenAccount(normalized);

  const [account] = await db.select().from(tokenAccounts).where(eq(tokenAccounts.accountAddress, normalized));
  const ledger = await db.select().from(tokenLedgerEntries)
    .where(eq(tokenLedgerEntries.accountAddress, normalized))
    .orderBy(desc(tokenLedgerEntries.createdAt))
    .limit(50);

  return {
    accountAddress: normalized,
    stableDepositedUsd: toNumber(account?.stableDepositedUsd, 0),
    intelBalance: toNumber(account?.intelBalance, 0),
    intelReserved: toNumber(account?.intelReserved, 0),
    ledger: ledger.map((entry) => ({
      entryId: entry.entryId,
      accountAddress: entry.accountAddress,
      entryType: entry.entryType,
      deltaIntel: toNumber(entry.deltaIntel, 0),
      deltaStableUsd: toNumber(entry.deltaStableUsd, 0),
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      metadata: entry.metadata,
      createdAt: entry.createdAt,
    })),
  };
}

export async function getIdeaReserveSnapshot(ideaId: string) {
  const [reserve] = await db.select().from(ideaTokenReserves).where(eq(ideaTokenReserves.ideaId, ideaId));
  if (!reserve) return null;
  return {
    ideaId: reserve.ideaId,
    posterId: reserve.posterId,
    stableFundedUsd: toNumber(reserve.stableFundedUsd, 0),
    avgMintPriceUsdPerIntel: toNumber(reserve.avgMintPriceUsdPerIntel, 0),
    intelMinted: toNumber(reserve.intelMinted, 0),
    intelReserved: toNumber(reserve.intelReserved, 0),
    intelSpent: toNumber(reserve.intelSpent, 0),
    intelProtocolFee: toNumber(reserve.intelProtocolFee, 0),
    status: reserve.status,
    updatedAt: reserve.updatedAt,
  };
}

/**
 * Refund the reserved INTEL for a rejected job back to the idea's available pool.
 * Called by rejectJob() so buyers don't lose budget on a rework cycle.
 */
export async function refundRejectedJobCredits(input: {
  ideaId: string;
  jobId: string;
  budgetUsd: number;
}) {
  const config = getTokenomicsConfig();
  if (!config.enabled) return null;

  const [reserve] = await db.select().from(ideaTokenReserves).where(eq(ideaTokenReserves.ideaId, input.ideaId));
  if (!reserve) return null;

  const budgetUsd = round(Math.max(0, input.budgetUsd), 6);
  if (budgetUsd <= 0) return null;

  const avgMintPriceUsdPerIntel = Math.max(0.00000001, toNumber(reserve.avgMintPriceUsdPerIntel, 1));
  const refundedIntel = round(budgetUsd / avgMintPriceUsdPerIntel, 8);

  const posterId = await ensureTokenAccount(reserve.posterId);
  const now = new Date();

  await db.transaction(async (tx) => {
    // Restore the reserved INTEL to the idea pool
    await tx.update(ideaTokenReserves).set({
      intelReserved: sql`${ideaTokenReserves.intelReserved} + ${refundedIntel}`,
      status: 'active',
      updatedAt: now,
    }).where(eq(ideaTokenReserves.ideaId, input.ideaId));

    // Also restore the poster's token account reserve balance
    await tx.update(tokenAccounts).set({
      intelReserved: sql`${tokenAccounts.intelReserved} + ${refundedIntel}`,
      updatedAt: now,
    }).where(eq(tokenAccounts.accountAddress, posterId));

    // Ledger entry: rejection_refund
    await tx.insert(tokenLedgerEntries).values({
      entryId: randomUUID(),
      accountAddress: posterId,
      entryType: 'rejection_refund',
      deltaIntel: refundedIntel.toFixed(8),
      deltaStableUsd: '0',
      referenceType: 'job',
      referenceId: input.jobId,
      metadata: { ideaId: input.ideaId, budgetUsd },
      createdAt: now,
    });
  });

  return { tokenSymbol: config.symbol, refundedIntel, budgetUsd };
}

export async function getTokenomicsStatus() {
  const config = getTokenomicsConfig();
  const pool = await getTokenPoolState();
  return {
    enabled: config.enabled,
    symbol: config.symbol,
    protocolFeeBps: config.protocolFeeBps,
    treasuryAccount: config.treasuryAccount,
    pool: {
      basePriceUsdPerIntel: pool.basePriceUsdPerIntel,
      targetSupplyIntel: pool.targetSupplyIntel,
      adjustmentPower: pool.adjustmentPower,
      liquidityDepthUsd: pool.liquidityDepthUsd,
      slippageBps: pool.slippageBps,
      currentSupplyIntel: pool.currentSupplyIntel,
      spotPriceUsdPerIntel: getCurvePriceUsdPerIntel(pool),
    },
  };
}
