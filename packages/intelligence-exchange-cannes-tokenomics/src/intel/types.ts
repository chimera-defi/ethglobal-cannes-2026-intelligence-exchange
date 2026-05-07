export const BPS_SCALE = 10_000;

export type TaskSettlementPolicy = {
  workerBps: number;
  stakerBps: number;
  treasuryBps: number;
};

export type MintInflowPolicy = {
  polBps: number;
  stakerBps: number;
  treasuryBps: number;
};

export type TaskSettlementSplit = {
  grossIntel: number;
  workerIntel: number;
  stakerIntel: number;
  treasuryIntel: number;
};

export type MintInflowSplit = {
  stableInflow: number;
  polStable: number;
  stakerStable: number;
  treasuryStable: number;
};

export type StakeAllowanceInput = {
  stakedIntel: number;
  k: number;
  walletCap: number;
  globalCapRemaining: number;
};

export type StakeAllowanceResult = {
  allowanceIntel: number;
  rawAllowanceIntel: number;
  cappedBy: 'none' | 'wallet_cap' | 'global_cap';
};

export type StakerDistribution = {
  totalDistributedIntel: number;
  payoutsIntel: Record<string, number>;
};

export type ConstantProductPool = {
  reserveIntel: number;
  reserveStable: number;
  totalLpShares: number;
  feeBps: number;
};

export type AddLiquidityResult = {
  pool: ConstantProductPool;
  mintedLpShares: number;
  intelUsed: number;
  stableUsed: number;
};

export type RemoveLiquidityResult = {
  pool: ConstantProductPool;
  burnedLpShares: number;
  intelOut: number;
  stableOut: number;
};

export type SwapResult = {
  pool: ConstantProductPool;
  amountIn: number;
  amountOut: number;
  feeCharged: number;
  direction: 'stable_to_intel' | 'intel_to_stable';
};

