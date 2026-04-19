import { describe, expect, test } from 'bun:test';
import { getCurvePriceUsdPerIxp, quoteMintIxp, splitSettlementIxp } from '../src/engine';

describe('tokenomics engine', () => {
  test('curve price grows with supply utilization', () => {
    const lowSupply = getCurvePriceUsdPerIxp({
      basePriceUsdPerIxp: 1,
      targetSupplyIxp: 100_000,
      adjustmentPower: 2,
      liquidityDepthUsd: 50_000,
      slippageBps: 50,
      currentSupplyIxp: 0,
    });

    const highSupply = getCurvePriceUsdPerIxp({
      basePriceUsdPerIxp: 1,
      targetSupplyIxp: 100_000,
      adjustmentPower: 2,
      liquidityDepthUsd: 50_000,
      slippageBps: 50,
      currentSupplyIxp: 90_000,
    });

    expect(highSupply).toBeGreaterThan(lowSupply);
  });

  test('mint quote applies slippage and returns non-zero mint', () => {
    const quote = quoteMintIxp(100, {
      basePriceUsdPerIxp: 1,
      targetSupplyIxp: 100_000,
      adjustmentPower: 2,
      liquidityDepthUsd: 10_000,
      slippageBps: 100,
      currentSupplyIxp: 10_000,
    });

    expect(quote.stableAmountUsd).toBe(100);
    expect(quote.mintedIxp).toBeGreaterThan(0);
    expect(quote.effectivePriceUsdPerIxp).toBeGreaterThan(0);
    expect(quote.nextSupplyIxp).toBeGreaterThan(10_000);
  });

  test('settlement split preserves total gross amount', () => {
    const split = splitSettlementIxp(25, { protocolFeeBps: 1000 });
    expect(split.workerPayoutIxp + split.protocolFeeIxp).toBe(split.grossIxp);
    expect(split.protocolFeeIxp).toBe(2.5);
    expect(split.workerPayoutIxp).toBe(22.5);
  });
});
