import { describe, expect, test } from 'bun:test';
import { getCurvePriceUsdPerIntel, quoteMintIntel, splitSettlementIntel } from '../src/engine';

describe('tokenomics engine', () => {
  test('curve price grows with supply utilization', () => {
    const lowSupply = getCurvePriceUsdPerIntel({
      basePriceUsdPerIntel: 1,
      targetSupplyIntel: 100_000,
      adjustmentPower: 2,
      liquidityDepthUsd: 50_000,
      slippageBps: 50,
      currentSupplyIntel: 0,
    });

    const highSupply = getCurvePriceUsdPerIntel({
      basePriceUsdPerIntel: 1,
      targetSupplyIntel: 100_000,
      adjustmentPower: 2,
      liquidityDepthUsd: 50_000,
      slippageBps: 50,
      currentSupplyIntel: 90_000,
    });

    expect(highSupply).toBeGreaterThan(lowSupply);
  });

  test('mint quote applies slippage and returns non-zero mint', () => {
    const quote = quoteMintIntel(100, {
      basePriceUsdPerIntel: 1,
      targetSupplyIntel: 100_000,
      adjustmentPower: 2,
      liquidityDepthUsd: 10_000,
      slippageBps: 100,
      currentSupplyIntel: 10_000,
    });

    expect(quote.stableAmountUsd).toBe(100);
    expect(quote.mintedIntel).toBeGreaterThan(0);
    expect(quote.effectivePriceUsdPerIntel).toBeGreaterThan(0);
    expect(quote.nextSupplyIntel).toBeGreaterThan(10_000);
  });

  test('settlement split preserves total gross amount (81/9/10)', () => {
    const split = splitSettlementIntel(25, { protocolFeeBps: 1000, stakerYieldBps: 900 });
    expect(split.workerPayoutIntel + split.protocolFeeIntel + split.stakerYieldIntel).toBe(split.grossIntel);
    expect(split.protocolFeeIntel).toBe(2.5);
    expect(split.stakerYieldIntel).toBe(2.25);
    expect(split.workerPayoutIntel).toBe(20.25);
  });
});
