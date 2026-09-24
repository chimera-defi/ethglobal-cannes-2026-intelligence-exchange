import { describe, expect, test } from 'bun:test';
import {
  addLiquidity,
  createConstantProductPool,
  lpPositionReserves,
  removeLiquidity,
  spotPriceStablePerIntel,
  swapIntelForStable,
  swapStableForIntel,
} from '../src/intel/amm';

// Helpers
const POOL_100_200 = createConstantProductPool(100, 200);

describe('createConstantProductPool', () => {
  test('sets reserves and computes geometric-mean LP shares', () => {
    const pool = createConstantProductPool(100, 400);
    expect(pool.reserveIntel).toBe(100);
    expect(pool.reserveStable).toBe(400);
    // sqrt(100 * 400) = 200
    expect(pool.totalLpShares).toBeCloseTo(200, 4);
  });

  test('applies default fee of 30 bps', () => {
    expect(POOL_100_200.feeBps).toBe(30);
  });

  test('applies custom fee bps', () => {
    const pool = createConstantProductPool(100, 100, 100);
    expect(pool.feeBps).toBe(100);
  });

  test('throws on non-positive reserve', () => {
    expect(() => createConstantProductPool(0, 100)).toThrow();
    expect(() => createConstantProductPool(100, 0)).toThrow();
    expect(() => createConstantProductPool(-1, 100)).toThrow();
  });
});

describe('spotPriceStablePerIntel', () => {
  test('returns stable/intel ratio', () => {
    const pool = createConstantProductPool(100, 300);
    expect(spotPriceStablePerIntel(pool)).toBeCloseTo(3, 4);
  });

  test('equal reserves give price of 1', () => {
    const pool = createConstantProductPool(50, 50);
    expect(spotPriceStablePerIntel(pool)).toBeCloseTo(1, 6);
  });
});

describe('addLiquidity', () => {
  test('mints LP shares proportional to the smaller ratio', () => {
    const result = addLiquidity(POOL_100_200, 10, 20);
    expect(result.mintedLpShares).toBeGreaterThan(0);
    expect(result.pool.reserveIntel).toBeGreaterThan(POOL_100_200.reserveIntel);
    expect(result.pool.totalLpShares).toBeGreaterThan(POOL_100_200.totalLpShares);
  });

  test('throws on zero or negative inputs', () => {
    expect(() => addLiquidity(POOL_100_200, 0, 10)).toThrow();
    expect(() => addLiquidity(POOL_100_200, 10, 0)).toThrow();
  });

  test('preserves constant-product invariant after add', () => {
    const result = addLiquidity(POOL_100_200, 10, 20);
    const kBefore = POOL_100_200.reserveIntel * POOL_100_200.reserveStable;
    const kAfter = result.pool.reserveIntel * result.pool.reserveStable;
    expect(kAfter).toBeGreaterThanOrEqual(kBefore);
  });
});

describe('removeLiquidity', () => {
  test('returns proportional reserves for LP shares', () => {
    const result = removeLiquidity(POOL_100_200, POOL_100_200.totalLpShares / 2);
    expect(result.intelOut).toBeCloseTo(50, 2);
    expect(result.stableOut).toBeCloseTo(100, 2);
  });

  test('removes all liquidity for full LP shares', () => {
    const result = removeLiquidity(POOL_100_200, POOL_100_200.totalLpShares);
    expect(result.pool.totalLpShares).toBeCloseTo(0, 4);
  });

  test('throws on zero LP shares', () => {
    expect(() => removeLiquidity(POOL_100_200, 0)).toThrow();
  });
});

describe('swapStableForIntel', () => {
  test('produces a positive INTEL output for stable input', () => {
    const result = swapStableForIntel(POOL_100_200, 10);
    expect(result.amountOut).toBeGreaterThan(0);
    expect(result.direction).toBe('stable_to_intel');
  });

  test('charges a fee and reduces output vs zero-fee', () => {
    const poolLowFee = createConstantProductPool(100, 200, 0);
    const withFee = swapStableForIntel(POOL_100_200, 10);
    const noFee = swapStableForIntel(poolLowFee, 10);
    expect(noFee.amountOut).toBeGreaterThan(withFee.amountOut);
  });

  test('stable reserve increases, intel reserve decreases', () => {
    const result = swapStableForIntel(POOL_100_200, 10);
    expect(result.pool.reserveStable).toBeGreaterThan(POOL_100_200.reserveStable);
    expect(result.pool.reserveIntel).toBeLessThan(POOL_100_200.reserveIntel);
  });

  test('throws on zero or negative input', () => {
    expect(() => swapStableForIntel(POOL_100_200, 0)).toThrow();
    expect(() => swapStableForIntel(POOL_100_200, -1)).toThrow();
  });
});

describe('swapIntelForStable', () => {
  test('produces a positive stable output for intel input', () => {
    const result = swapIntelForStable(POOL_100_200, 5);
    expect(result.amountOut).toBeGreaterThan(0);
    expect(result.direction).toBe('intel_to_stable');
  });

  test('intel reserve increases, stable reserve decreases', () => {
    const result = swapIntelForStable(POOL_100_200, 5);
    expect(result.pool.reserveIntel).toBeGreaterThan(POOL_100_200.reserveIntel);
    expect(result.pool.reserveStable).toBeLessThan(POOL_100_200.reserveStable);
  });

  test('throws on zero or negative input', () => {
    expect(() => swapIntelForStable(POOL_100_200, 0)).toThrow();
  });
});

describe('lpPositionReserves', () => {
  test('half of LP shares yields half of each reserve', () => {
    const result = lpPositionReserves(POOL_100_200, POOL_100_200.totalLpShares / 2);
    expect(result.intel).toBeCloseTo(50, 2);
    expect(result.stable).toBeCloseTo(100, 2);
  });

  test('zero shares returns zeros', () => {
    const result = lpPositionReserves(POOL_100_200, 0);
    expect(result.intel).toBe(0);
    expect(result.stable).toBe(0);
  });

  test('excess shares capped at full reserves', () => {
    const result = lpPositionReserves(POOL_100_200, POOL_100_200.totalLpShares * 2);
    expect(result.intel).toBeCloseTo(100, 2);
    expect(result.stable).toBeCloseTo(200, 2);
  });
});

describe('feeBps clamping edge cases', () => {
  test('feeBps > 2000 is clamped to 2000', () => {
    const pool = createConstantProductPool(100, 100, 9999);
    expect(pool.feeBps).toBe(2000);
  });

  test('negative feeBps is clamped to 0', () => {
    const pool = createConstantProductPool(100, 100, -50);
    expect(pool.feeBps).toBe(0);
  });

  test('NaN feeBps falls back to default 30', () => {
    const pool = createConstantProductPool(100, 100, NaN);
    expect(pool.feeBps).toBe(30);
  });

  test('feeBps of exactly 2000 is accepted unchanged', () => {
    const pool = createConstantProductPool(100, 100, 2000);
    expect(pool.feeBps).toBe(2000);
  });

  test('zero-fee pool charges no fee on swap', () => {
    const pool = createConstantProductPool(100, 200, 0);
    const result = swapStableForIntel(pool, 10);
    expect(result.feeCharged).toBe(0);
  });
});

describe('removeLiquidity error on excess shares', () => {
  test('throws when lpShares exceeds totalLpShares', () => {
    expect(() => removeLiquidity(POOL_100_200, POOL_100_200.totalLpShares + 1)).toThrow();
  });

  test('does not throw for shares exactly equal to totalLpShares', () => {
    expect(() => removeLiquidity(POOL_100_200, POOL_100_200.totalLpShares)).not.toThrow();
  });
});

describe('feeCharged invariants', () => {
  test('swapStableForIntel feeCharged equals input * feeBps / 10000', () => {
    const stableIn = 20;
    const result = swapStableForIntel(POOL_100_200, stableIn);
    const expected = (stableIn * POOL_100_200.feeBps) / 10_000;
    expect(result.feeCharged).toBeCloseTo(expected, 6);
  });

  test('swapIntelForStable feeCharged equals input * feeBps / 10000', () => {
    const intelIn = 10;
    const result = swapIntelForStable(POOL_100_200, intelIn);
    const expected = (intelIn * POOL_100_200.feeBps) / 10_000;
    expect(result.feeCharged).toBeCloseTo(expected, 6);
  });

  test('feeCharged is positive for non-zero fee pool', () => {
    expect(swapStableForIntel(POOL_100_200, 5).feeCharged).toBeGreaterThan(0);
    expect(swapIntelForStable(POOL_100_200, 5).feeCharged).toBeGreaterThan(0);
  });
});

describe('addLiquidity with imbalanced inputs', () => {
  test('clips to the limiting side when ratios differ', () => {
    // Pool ratio is 1:2 (intel:stable). Providing 10:100 (1:10) means stable is excess.
    const result = addLiquidity(POOL_100_200, 10, 100);
    // Should mint proportional to intel (the limiting side) at 1:2 ratio
    expect(result.intelUsed).toBeCloseTo(10, 4);
    expect(result.stableUsed).toBeCloseTo(20, 4);
    expect(result.mintedLpShares).toBeGreaterThan(0);
  });

  test('intelUsed and stableUsed are within inputs', () => {
    const intelDesired = 15;
    const stableDesired = 50;
    const result = addLiquidity(POOL_100_200, intelDesired, stableDesired);
    expect(result.intelUsed).toBeLessThanOrEqual(intelDesired + 1e-8);
    expect(result.stableUsed).toBeLessThanOrEqual(stableDesired + 1e-8);
  });
});

describe('price impact and K-invariant', () => {
  test('larger swap has more slippage per unit than smaller swap', () => {
    const small = swapStableForIntel(POOL_100_200, 1);
    const large = swapStableForIntel(POOL_100_200, 50);
    const rateSmall = small.amountOut / 1;
    const rateLarge = large.amountOut / 50;
    expect(rateLarge).toBeLessThan(rateSmall);
  });

  test('K-invariant grows after a fee-bearing swap (fee accrues to pool)', () => {
    const kBefore = POOL_100_200.reserveIntel * POOL_100_200.reserveStable;
    const result = swapStableForIntel(POOL_100_200, 10);
    const kAfter = result.pool.reserveIntel * result.pool.reserveStable;
    expect(kAfter).toBeGreaterThanOrEqual(kBefore);
  });

  test('round-trip: add liquidity then remove all minted shares returns correct amounts', () => {
    const added = addLiquidity(POOL_100_200, 20, 40);
    const removed = removeLiquidity(added.pool, added.mintedLpShares);
    expect(removed.intelOut).toBeCloseTo(added.intelUsed, 4);
    expect(removed.stableOut).toBeCloseTo(added.stableUsed, 4);
  });
});
