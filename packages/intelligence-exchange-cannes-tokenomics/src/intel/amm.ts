import {
  type AddLiquidityResult,
  type ConstantProductPool,
  type RemoveLiquidityResult,
  type SwapResult,
} from './types';

function round(value: number, decimals = 8) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toPositiveNumber(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function clampFeeBps(feeBps: number) {
  if (!Number.isFinite(feeBps)) return 30;
  return Math.min(2000, Math.max(0, Math.floor(feeBps)));
}

function assertPool(pool: ConstantProductPool) {
  if (pool.reserveIntel <= 0 || pool.reserveStable <= 0 || pool.totalLpShares <= 0) {
    throw new Error('Pool must have non-zero reserves and LP supply');
  }
}

export function createConstantProductPool(
  reserveIntel: number,
  reserveStable: number,
  feeBps = 30,
): ConstantProductPool {
  const intel = toPositiveNumber(reserveIntel);
  const stable = toPositiveNumber(reserveStable);
  if (intel <= 0 || stable <= 0) {
    throw new Error('Initial reserves must be positive');
  }

  return {
    reserveIntel: round(intel),
    reserveStable: round(stable),
    totalLpShares: round(Math.sqrt(intel * stable)),
    feeBps: clampFeeBps(feeBps),
  };
}

export function addLiquidity(
  pool: ConstantProductPool,
  intelDesired: number,
  stableDesired: number,
): AddLiquidityResult {
  assertPool(pool);
  const intel = toPositiveNumber(intelDesired);
  const stable = toPositiveNumber(stableDesired);
  if (intel <= 0 || stable <= 0) {
    throw new Error('Liquidity inputs must be positive');
  }

  const sharesFromIntel = (intel * pool.totalLpShares) / pool.reserveIntel;
  const sharesFromStable = (stable * pool.totalLpShares) / pool.reserveStable;
  const mintedLpShares = round(Math.min(sharesFromIntel, sharesFromStable));
  if (mintedLpShares <= 0) {
    throw new Error('Liquidity addition minted zero LP shares');
  }

  const intelUsed = round((mintedLpShares * pool.reserveIntel) / pool.totalLpShares);
  const stableUsed = round((mintedLpShares * pool.reserveStable) / pool.totalLpShares);

  return {
    mintedLpShares,
    intelUsed,
    stableUsed,
    pool: {
      ...pool,
      reserveIntel: round(pool.reserveIntel + intelUsed),
      reserveStable: round(pool.reserveStable + stableUsed),
      totalLpShares: round(pool.totalLpShares + mintedLpShares),
    },
  };
}

export function removeLiquidity(pool: ConstantProductPool, lpShares: number): RemoveLiquidityResult {
  assertPool(pool);
  const shares = toPositiveNumber(lpShares);
  if (shares <= 0) {
    throw new Error('LP shares must be positive');
  }
  if (shares > pool.totalLpShares + 0.00000001) {
    throw new Error('Cannot remove more LP shares than total supply');
  }

  const ratio = shares / pool.totalLpShares;
  const intelOut = round(pool.reserveIntel * ratio);
  const stableOut = round(pool.reserveStable * ratio);

  return {
    burnedLpShares: round(shares),
    intelOut,
    stableOut,
    pool: {
      ...pool,
      reserveIntel: round(Math.max(0, pool.reserveIntel - intelOut)),
      reserveStable: round(Math.max(0, pool.reserveStable - stableOut)),
      totalLpShares: round(Math.max(0, pool.totalLpShares - shares)),
    },
  };
}

export function swapStableForIntel(pool: ConstantProductPool, stableIn: number): SwapResult {
  assertPool(pool);
  const input = toPositiveNumber(stableIn);
  if (input <= 0) throw new Error('Swap amount must be positive');

  const feeCharged = round((input * pool.feeBps) / 10_000);
  const stableEffective = input - feeCharged;

  const outputIntel = round((pool.reserveIntel * stableEffective) / (pool.reserveStable + stableEffective));
  if (outputIntel <= 0 || outputIntel >= pool.reserveIntel) {
    throw new Error('Swap output out of bounds');
  }

  return {
    direction: 'stable_to_intel',
    amountIn: round(input),
    amountOut: outputIntel,
    feeCharged,
    pool: {
      ...pool,
      reserveStable: round(pool.reserveStable + input),
      reserveIntel: round(pool.reserveIntel - outputIntel),
    },
  };
}

export function swapIntelForStable(pool: ConstantProductPool, intelIn: number): SwapResult {
  assertPool(pool);
  const input = toPositiveNumber(intelIn);
  if (input <= 0) throw new Error('Swap amount must be positive');

  const feeCharged = round((input * pool.feeBps) / 10_000);
  const intelEffective = input - feeCharged;

  const outputStable = round((pool.reserveStable * intelEffective) / (pool.reserveIntel + intelEffective));
  if (outputStable <= 0 || outputStable >= pool.reserveStable) {
    throw new Error('Swap output out of bounds');
  }

  return {
    direction: 'intel_to_stable',
    amountIn: round(input),
    amountOut: outputStable,
    feeCharged,
    pool: {
      ...pool,
      reserveIntel: round(pool.reserveIntel + input),
      reserveStable: round(pool.reserveStable - outputStable),
    },
  };
}

export function spotPriceStablePerIntel(pool: ConstantProductPool) {
  assertPool(pool);
  return round(pool.reserveStable / pool.reserveIntel, 8);
}

export function lpPositionReserves(pool: ConstantProductPool, lpShares: number) {
  assertPool(pool);
  const shares = toPositiveNumber(lpShares);
  if (shares <= 0) {
    return { intel: 0, stable: 0 };
  }
  const ratio = Math.min(1, shares / pool.totalLpShares);
  return {
    intel: round(pool.reserveIntel * ratio),
    stable: round(pool.reserveStable * ratio),
  };
}

