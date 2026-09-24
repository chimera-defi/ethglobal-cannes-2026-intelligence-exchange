import { describe, expect, test } from 'bun:test';
import { getCurvePriceUsdPerIntel, quoteMintIntel, splitSettlementIntel } from '../src/engine';

const BASE_STATE = {
  basePriceUsdPerIntel: 1,
  targetSupplyIntel: 100_000,
  adjustmentPower: 2,
  liquidityDepthUsd: 50_000,
  slippageBps: 50,
  currentSupplyIntel: 0,
};

// ---------------------------------------------------------------------------
// getCurvePriceUsdPerIntel — untested edge cases
// ---------------------------------------------------------------------------

describe('getCurvePriceUsdPerIntel — edge cases', () => {
  test('adjustmentPower=0 returns base price regardless of supply', () => {
    const price = getCurvePriceUsdPerIntel({ ...BASE_STATE, adjustmentPower: 0, currentSupplyIntel: 90_000 });
    // exp(0 * anything) = 1, so curveMultiplier = 1
    expect(price).toBe(1);
  });

  test('zero currentSupply returns base price (no curve growth yet)', () => {
    const price = getCurvePriceUsdPerIntel({ ...BASE_STATE, currentSupplyIntel: 0 });
    expect(price).toBe(1);
  });

  test('negative currentSupply is clamped to 0', () => {
    const priceNeg = getCurvePriceUsdPerIntel({ ...BASE_STATE, currentSupplyIntel: -1000 });
    const priceZero = getCurvePriceUsdPerIntel({ ...BASE_STATE, currentSupplyIntel: 0 });
    expect(priceNeg).toBe(priceZero);
  });

  test('non-finite basePriceUsdPerIntel falls back to 1', () => {
    const priceNaN = getCurvePriceUsdPerIntel({ ...BASE_STATE, basePriceUsdPerIntel: NaN });
    const priceInf = getCurvePriceUsdPerIntel({ ...BASE_STATE, basePriceUsdPerIntel: -Infinity });
    expect(priceNaN).toBe(1);
    expect(priceInf).toBe(1);
  });

  test('non-finite targetSupplyIntel falls back to 1', () => {
    const price = getCurvePriceUsdPerIntel({ ...BASE_STATE, targetSupplyIntel: NaN });
    // utilization = currentSupply / 1 = 0, so result = basePrice * exp(0) = 1
    expect(price).toBe(1);
  });

  test('non-finite adjustmentPower treated as 0', () => {
    const price = getCurvePriceUsdPerIntel({ ...BASE_STATE, adjustmentPower: NaN, currentSupplyIntel: 50_000 });
    // NaN is finite? No: Number.isFinite(NaN) = false → fallback 0 → exp(0) = 1
    expect(price).toBe(1);
  });

  test('price is positive and finite for supplies within and at target', () => {
    for (const supply of [0, 1000, 50_000, 99_999]) {
      const price = getCurvePriceUsdPerIntel({ ...BASE_STATE, currentSupplyIntel: supply });
      expect(price).toBeGreaterThan(0);
      expect(Number.isFinite(price)).toBe(true);
    }
  });

  test('price overflows to Infinity for supply vastly exceeding target (known curve behaviour)', () => {
    // utilization = 1_000_000 / 100_000 = 10
    // exp(2 * 10^3) = exp(2000) → Infinity — this is intentional bonding-curve behaviour
    const price = getCurvePriceUsdPerIntel({ ...BASE_STATE, currentSupplyIntel: 1_000_000 });
    expect(price).toBe(Infinity);
  });
});

// ---------------------------------------------------------------------------
// quoteMintIntel — untested edge cases
// ---------------------------------------------------------------------------

describe('quoteMintIntel — edge cases', () => {
  test('zero stable returns zero-mint result', () => {
    const quote = quoteMintIntel(0, BASE_STATE);
    expect(quote.stableAmountUsd).toBe(0);
    expect(quote.mintedIntel).toBe(0);
    expect(quote.nextSupplyIntel).toBe(0);
  });

  test('negative stable returns zero-mint result', () => {
    const quote = quoteMintIntel(-50, BASE_STATE);
    expect(quote.stableAmountUsd).toBe(0);
    expect(quote.mintedIntel).toBe(0);
  });

  test('zero slippageBps means slippage multiplier of 1', () => {
    const noSlippage = quoteMintIntel(100, { ...BASE_STATE, slippageBps: 0, currentSupplyIntel: 0 });
    const curvePrice = getCurvePriceUsdPerIntel({ ...BASE_STATE, slippageBps: 0, currentSupplyIntel: 0 });
    // With 0 slippage, effective price = curvePrice * (1 + 0) = curvePrice
    expect(noSlippage.effectivePriceUsdPerIntel).toBe(curvePrice);
  });

  test('nextSupplyIntel = currentSupplyIntel + mintedIntel', () => {
    const quote = quoteMintIntel(100, { ...BASE_STATE, currentSupplyIntel: 10_000 });
    expect(quote.nextSupplyIntel).toBeCloseTo(10_000 + quote.mintedIntel, 5);
  });

  test('larger stable amount produces larger mint amount', () => {
    const small = quoteMintIntel(10, BASE_STATE);
    const large = quoteMintIntel(1000, BASE_STATE);
    expect(large.mintedIntel).toBeGreaterThan(small.mintedIntel);
  });

  test('stableAmountUsd field matches input when positive', () => {
    const quote = quoteMintIntel(250, BASE_STATE);
    expect(quote.stableAmountUsd).toBe(250);
  });

  test('zero-mint result still contains effectivePriceUsdPerIntel', () => {
    const quote = quoteMintIntel(0, BASE_STATE);
    expect(typeof quote.effectivePriceUsdPerIntel).toBe('number');
    expect(Number.isFinite(quote.effectivePriceUsdPerIntel)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// splitSettlementIntel — untested edge cases
// ---------------------------------------------------------------------------

describe('splitSettlementIntel — edge cases', () => {
  test('zero gross returns all-zero split', () => {
    const split = splitSettlementIntel(0, { protocolFeeBps: 1000, stakerYieldBps: 900 });
    expect(split.grossIntel).toBe(0);
    expect(split.workerPayoutIntel).toBe(0);
    expect(split.protocolFeeIntel).toBe(0);
    expect(split.stakerYieldIntel).toBe(0);
  });

  test('policy overflow throws with descriptive message', () => {
    expect(() =>
      splitSettlementIntel(100, { protocolFeeBps: 6000, stakerYieldBps: 5000 }),
    ).toThrow(/overflow/i);
  });

  test('protocolFeeBps clamped at 10_000', () => {
    // 10_000 + 0 = 10_000, not overflow
    const split = splitSettlementIntel(100, { protocolFeeBps: 99_999, stakerYieldBps: 0 });
    expect(split.protocolFeeIntel).toBe(100);
    expect(split.stakerYieldIntel).toBe(0);
    expect(split.workerPayoutIntel).toBe(0);
  });

  test('stakerYieldBps clamped to 0 when negative', () => {
    const split = splitSettlementIntel(100, { protocolFeeBps: 1000, stakerYieldBps: -500 });
    expect(split.stakerYieldIntel).toBe(0);
    expect(split.protocolFeeIntel).toBe(10);
    expect(split.workerPayoutIntel).toBe(90);
  });

  test('stakerYieldBps defaults to 900 when undefined', () => {
    const split = splitSettlementIntel(100, { protocolFeeBps: 1000, stakerYieldBps: undefined as unknown as number });
    expect(split.stakerYieldIntel).toBe(9);
  });

  test('worker payout = gross - protocolFee - stakerYield (round-trip)', () => {
    const split = splitSettlementIntel(1000, { protocolFeeBps: 500, stakerYieldBps: 300 });
    const reconstructed = split.workerPayoutIntel + split.protocolFeeIntel + split.stakerYieldIntel;
    expect(reconstructed).toBeCloseTo(split.grossIntel, 6);
  });

  test('non-finite gross falls back to 0', () => {
    const split = splitSettlementIntel(NaN, { protocolFeeBps: 1000, stakerYieldBps: 900 });
    expect(split.grossIntel).toBe(0);
    expect(split.workerPayoutIntel).toBe(0);
  });

  test('result fields are all finite numbers', () => {
    const split = splitSettlementIntel(500, { protocolFeeBps: 2000, stakerYieldBps: 1000 });
    for (const v of [split.grossIntel, split.workerPayoutIntel, split.protocolFeeIntel, split.stakerYieldIntel]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});
