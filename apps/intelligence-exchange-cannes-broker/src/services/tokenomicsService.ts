import { randomUUID } from 'crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  getCurvePriceUsdPerIxp,
  quoteMintIxp,
  splitSettlementIxp,
  type MintQuote,
  type PoolState,
} from 'intelligence-exchange-cannes-tokenomics';
import { db } from '../db/client';
import { ideaTokenReserves, tokenAccounts, tokenLedgerEntries } from '../db/schema';
import { httpError } from './errors';
import { normalizeAccountAddress } from './identityService';

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
  return {
    enabled: parseBoolean(process.env.TOKENOMICS_ENABLED, true),
    symbol: process.env.TOKEN_SYMBOL ?? 'IXP',
    treasuryAccount: normalizeAccountAddress(process.env.TOKEN_TREASURY_ACCOUNT ?? 'treasury:protocol'),
    protocolFeeBps: Math.max(0, Math.min(10_000, Number.parseInt(process.env.TOKEN_PROTOCOL_FEE_BPS ?? '1000', 10) || 1000)),
    pool: {
      basePriceUsdPerIxp: toNumber(process.env.TOKEN_BASE_PRICE_USD_PER_IXP, 1),
      targetSupplyIxp: toNumber(process.env.TOKEN_TARGET_SUPPLY_IXP, 100_000),
      adjustmentPower: toNumber(process.env.TOKEN_ADJUSTMENT_POWER, 2),
      liquidityDepthUsd: toNumber(process.env.TOKEN_LIQUIDITY_DEPTH_USD, 50_000),
      slippageBps: toNumber(process.env.TOKEN_SLIPPAGE_BPS, 50),
    },
  };
}

async function getCurrentSupplyIxp() {
  const [row] = await db.select({
    total: sql<string>`COALESCE(SUM(${tokenAccounts.ixpBalance} + ${tokenAccounts.ixpReserved}), 0)`,
  }).from(tokenAccounts);
  return toNumber(row?.total, 0);
}

export async function getTokenPoolState(): Promise<PoolState> {
  const config = getTokenomicsConfig();
  const currentSupplyIxp = await getCurrentSupplyIxp();
  return {
    ...config.pool,
    currentSupplyIxp,
  };
}

export async function quoteStableMint(stableAmountUsd: number) {
  const pool = await getTokenPoolState();
  const quote = quoteMintIxp(stableAmountUsd, pool);
  return {
    pool,
    quote,
  };
}

async function ensureTokenAccount(accountAddress: string) {
  const normalized = normalizeAccountAddress(accountAddress);
  await db.insert(tokenAccounts).values({
    accountAddress: normalized,
    stableDepositedUsd: '0',
    ixpBalance: '0',
    ixpReserved: '0',
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
  if (quote.mintedIxp <= 0) {
    throw httpError('Mint quote returned zero IXP', 409, 'MINT_QUOTE_ZERO');
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(tokenAccounts)
      .set({
        stableDepositedUsd: sql`${tokenAccounts.stableDepositedUsd} + ${stableAmountUsd}`,
        ixpReserved: sql`${tokenAccounts.ixpReserved} + ${quote.mintedIxp}`,
        updatedAt: now,
      })
      .where(eq(tokenAccounts.accountAddress, posterId));

    await tx.insert(tokenLedgerEntries).values([
      {
        entryId: randomUUID(),
        accountAddress: posterId,
        entryType: 'mint',
        deltaIxp: quote.mintedIxp.toFixed(8),
        deltaStableUsd: stableAmountUsd.toFixed(6),
        referenceType: 'idea',
        referenceId: input.ideaId,
        metadata: {
          txHash: input.txHash ?? null,
          effectivePriceUsdPerIxp: quote.effectivePriceUsdPerIxp,
        },
        createdAt: now,
      },
      {
        entryId: randomUUID(),
        accountAddress: posterId,
        entryType: 'reserve',
        deltaIxp: (-quote.mintedIxp).toFixed(8),
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
        avgMintPriceUsdPerIxp: quote.effectivePriceUsdPerIxp.toFixed(8),
        ixpMinted: quote.mintedIxp.toFixed(8),
        ixpReserved: quote.mintedIxp.toFixed(8),
        ixpSpent: '0',
        ixpProtocolFee: '0',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    const totalStable = toNumber(existingReserve.stableFundedUsd, 0) + stableAmountUsd;
    const totalMinted = toNumber(existingReserve.ixpMinted, 0) + quote.mintedIxp;
    const avgMintPrice = totalMinted > 0 ? totalStable / totalMinted : quote.effectivePriceUsdPerIxp;

    await tx.update(ideaTokenReserves).set({
      stableFundedUsd: totalStable.toFixed(6),
      avgMintPriceUsdPerIxp: round(avgMintPrice, 8).toFixed(8),
      ixpMinted: totalMinted.toFixed(8),
      ixpReserved: (toNumber(existingReserve.ixpReserved, 0) + quote.mintedIxp).toFixed(8),
      status: 'active',
      updatedAt: now,
    }).where(eq(ideaTokenReserves.ideaId, input.ideaId));
  });

  return {
    tokenSymbol: config.symbol,
    stableAmountUsd,
    mintedIxp: quote.mintedIxp,
    effectivePriceUsdPerIxp: quote.effectivePriceUsdPerIxp,
    nextPriceUsdPerIxp: quote.nextPriceUsdPerIxp,
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

  const [reserve] = await db.select().from(ideaTokenReserves).where(eq(ideaTokenReserves.ideaId, input.ideaId));
  if (!reserve) {
    return null;
  }

  const budgetUsd = round(Math.max(0, input.budgetUsd), 6);
  if (budgetUsd <= 0) {
    return null;
  }

  const avgMintPriceUsdPerIxp = Math.max(0.00000001, toNumber(reserve.avgMintPriceUsdPerIxp, 1));
  const remainingIxp = toNumber(reserve.ixpReserved, 0);
  if (remainingIxp <= 0) {
    throw httpError('No reserved IXP remaining for this idea', 409, 'IXP_RESERVE_EMPTY');
  }

  const requestedGrossIxp = round(budgetUsd / avgMintPriceUsdPerIxp, 8);
  if (remainingIxp + 0.000001 < requestedGrossIxp) {
    throw httpError('Reserved IXP is insufficient for this job budget', 409, 'IXP_RESERVE_INSUFFICIENT');
  }

  const grossIxp = requestedGrossIxp;
  const split = splitSettlementIxp(grossIxp, { protocolFeeBps: config.protocolFeeBps });

  const workerId = await ensureTokenAccount(input.workerId);
  const treasuryAccount = await ensureTokenAccount(config.treasuryAccount);
  const posterId = await ensureTokenAccount(reserve.posterId);

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(tokenAccounts)
      .set({
        ixpReserved: sql`${tokenAccounts.ixpReserved} - ${split.grossIxp}`,
        updatedAt: now,
      })
      .where(eq(tokenAccounts.accountAddress, posterId));

    await tx.update(tokenAccounts)
      .set({
        ixpBalance: sql`${tokenAccounts.ixpBalance} + ${split.workerPayoutIxp}`,
        updatedAt: now,
      })
      .where(eq(tokenAccounts.accountAddress, workerId));

    await tx.update(tokenAccounts)
      .set({
        ixpBalance: sql`${tokenAccounts.ixpBalance} + ${split.protocolFeeIxp}`,
        updatedAt: now,
      })
      .where(eq(tokenAccounts.accountAddress, treasuryAccount));

    const currentReserved = toNumber(reserve.ixpReserved, 0);
    const nextReserved = round(Math.max(0, currentReserved - split.grossIxp), 8);

    await tx.update(ideaTokenReserves).set({
      ixpReserved: nextReserved.toFixed(8),
      ixpSpent: round(toNumber(reserve.ixpSpent, 0) + split.workerPayoutIxp, 8).toFixed(8),
      ixpProtocolFee: round(toNumber(reserve.ixpProtocolFee, 0) + split.protocolFeeIxp, 8).toFixed(8),
      status: nextReserved <= 0 ? 'settled' : 'active',
      updatedAt: now,
    }).where(eq(ideaTokenReserves.ideaId, input.ideaId));

    await tx.insert(tokenLedgerEntries).values([
      {
        entryId: randomUUID(),
        accountAddress: posterId,
        entryType: 'settlement_debit',
        deltaIxp: (-split.grossIxp).toFixed(8),
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
        deltaIxp: split.workerPayoutIxp.toFixed(8),
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
        deltaIxp: split.protocolFeeIxp.toFixed(8),
        deltaStableUsd: '0',
        referenceType: 'job',
        referenceId: input.jobId,
        metadata: { ideaId: input.ideaId, budgetUsd },
        createdAt: now,
      },
    ]);
  });

  return {
    tokenSymbol: config.symbol,
    grossIxp: split.grossIxp,
    workerPayoutIxp: split.workerPayoutIxp,
    protocolFeeIxp: split.protocolFeeIxp,
    budgetUsd,
    avgMintPriceUsdPerIxp: round(avgMintPriceUsdPerIxp, 8),
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
    ixpBalance: toNumber(account?.ixpBalance, 0),
    ixpReserved: toNumber(account?.ixpReserved, 0),
    ledger: ledger.map((entry) => ({
      ...entry,
      deltaIxp: toNumber(entry.deltaIxp, 0),
      deltaStableUsd: toNumber(entry.deltaStableUsd, 0),
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
    avgMintPriceUsdPerIxp: toNumber(reserve.avgMintPriceUsdPerIxp, 0),
    ixpMinted: toNumber(reserve.ixpMinted, 0),
    ixpReserved: toNumber(reserve.ixpReserved, 0),
    ixpSpent: toNumber(reserve.ixpSpent, 0),
    ixpProtocolFee: toNumber(reserve.ixpProtocolFee, 0),
    status: reserve.status,
    updatedAt: reserve.updatedAt,
  };
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
      ...pool,
      spotPriceUsdPerIxp: getCurvePriceUsdPerIxp(pool),
    },
  };
}
