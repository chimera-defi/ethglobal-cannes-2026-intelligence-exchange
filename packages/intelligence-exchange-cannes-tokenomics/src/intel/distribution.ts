import {
  BPS_SCALE,
  type MintInflowPolicy,
  type MintInflowSplit,
  type StakeAllowanceInput,
  type StakeAllowanceResult,
  type StakerDistribution,
  type TaskSettlementPolicy,
  type TaskSettlementSplit,
} from './types';

export const DEFAULT_TASK_SETTLEMENT_POLICY: TaskSettlementPolicy = {
  workerBps: 8100,
  stakerBps: 900,
  treasuryBps: 1000,
};

export const DEFAULT_MINT_INFLOW_POLICY: MintInflowPolicy = {
  polBps: 5000,
  stakerBps: 4500,
  treasuryBps: 500,
};

function round(value: number, decimals = 8) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toPositiveNumber(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function assertBpsTotal(total: number, label: string) {
  if (total !== BPS_SCALE) {
    throw new Error(`${label} must sum to ${BPS_SCALE} bps`);
  }
}

export function splitTaskSettlementIntel(
  grossIntel: number,
  policy: TaskSettlementPolicy = DEFAULT_TASK_SETTLEMENT_POLICY,
): TaskSettlementSplit {
  const gross = toPositiveNumber(grossIntel);
  assertBpsTotal(policy.workerBps + policy.stakerBps + policy.treasuryBps, 'Task settlement policy');

  const workerIntel = round((gross * policy.workerBps) / BPS_SCALE);
  const stakerIntel = round((gross * policy.stakerBps) / BPS_SCALE);
  const treasuryIntel = round(gross - workerIntel - stakerIntel);

  return {
    grossIntel: round(gross),
    workerIntel,
    stakerIntel,
    treasuryIntel,
  };
}

export function splitMintInflowStable(
  stableInflow: number,
  policy: MintInflowPolicy = DEFAULT_MINT_INFLOW_POLICY,
): MintInflowSplit {
  const inflow = toPositiveNumber(stableInflow);
  assertBpsTotal(policy.polBps + policy.stakerBps + policy.treasuryBps, 'Mint inflow policy');

  const polStable = round((inflow * policy.polBps) / BPS_SCALE);
  const stakerStable = round((inflow * policy.stakerBps) / BPS_SCALE);
  const treasuryStable = round(inflow - polStable - stakerStable);

  return {
    stableInflow: round(inflow),
    polStable,
    stakerStable,
    treasuryStable,
  };
}

export function computeStakeMintAllowance(input: StakeAllowanceInput): StakeAllowanceResult {
  const stakedIntel = toPositiveNumber(input.stakedIntel);
  const k = Math.max(0, Number.isFinite(input.k) ? input.k : 0);
  const walletCap = Math.max(0, Number.isFinite(input.walletCap) ? input.walletCap : 0);
  const globalCapRemaining = Math.max(0, Number.isFinite(input.globalCapRemaining) ? input.globalCapRemaining : 0);

  const rawAllowanceIntel = round(k * Math.sqrt(stakedIntel));
  const walletCapped = Math.min(rawAllowanceIntel, walletCap);
  const allowanceIntel = round(Math.min(walletCapped, globalCapRemaining));

  let cappedBy: StakeAllowanceResult['cappedBy'] = 'none';
  if (allowanceIntel < rawAllowanceIntel && allowanceIntel === walletCapped && walletCapped === walletCap) {
    cappedBy = 'wallet_cap';
  }
  if (allowanceIntel < walletCapped && allowanceIntel === globalCapRemaining) {
    cappedBy = 'global_cap';
  }

  return {
    allowanceIntel,
    rawAllowanceIntel,
    cappedBy,
  };
}

export function distributeIntelToStakers(totalIntel: number, stakes: Record<string, number>): StakerDistribution {
  const payoutBase = toPositiveNumber(totalIntel);
  const normalizedEntries = Object.entries(stakes)
    .map(([account, stake]) => [account, toPositiveNumber(stake)] as const)
    .filter(([, stake]) => stake > 0);

  if (payoutBase <= 0 || normalizedEntries.length === 0) {
    return {
      totalDistributedIntel: 0,
      payoutsIntel: {},
    };
  }

  const totalStake = normalizedEntries.reduce((sum, [, stake]) => sum + stake, 0);
  const payoutsIntel: Record<string, number> = {};
  let distributed = 0;

  normalizedEntries.forEach(([account, stake], idx) => {
    if (idx === normalizedEntries.length - 1) {
      const remainder = round(payoutBase - distributed);
      payoutsIntel[account] = remainder;
      distributed = round(distributed + remainder);
      return;
    }

    const payout = round((payoutBase * stake) / totalStake);
    payoutsIntel[account] = payout;
    distributed = round(distributed + payout);
  });

  return {
    totalDistributedIntel: distributed,
    payoutsIntel,
  };
}

