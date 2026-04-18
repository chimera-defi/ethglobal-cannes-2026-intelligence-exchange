import { describe, expect, test } from 'bun:test';
import {
  addLiquidity,
  computeStakeMintAllowance,
  createConstantProductPool,
  distributeIntelToStakers,
  lpPositionReserves,
  removeLiquidity,
  splitMintInflowStable,
  splitTaskSettlementIntel,
  spotPriceStablePerIntel,
  swapIntelForStable,
  swapStableForIntel,
} from '../src/intel';

describe('INTEL actor flow coverage', () => {
  test('task settlement split matches launch defaults and preserves total', () => {
    const split = splitTaskSettlementIntel(100);
    expect(split.workerIntel).toBe(81);
    expect(split.stakerIntel).toBe(9);
    expect(split.treasuryIntel).toBe(10);
    expect(split.workerIntel + split.stakerIntel + split.treasuryIntel).toBe(split.grossIntel);
  });

  test('mint inflow split routes to POL, stakers, and treasury', () => {
    const split = splitMintInflowStable(1000);
    expect(split.polStable).toBe(500);
    expect(split.stakerStable).toBe(450);
    expect(split.treasuryStable).toBe(50);
    expect(split.polStable + split.stakerStable + split.treasuryStable).toBe(split.stableInflow);
  });

  test('stake-to-mint allowance obeys sqrt scaling and wallet/global caps', () => {
    const uncapped = computeStakeMintAllowance({
      stakedIntel: 25_000,
      k: 3,
      walletCap: 2_000,
      globalCapRemaining: 5_000,
    });
    expect(uncapped.rawAllowanceIntel).toBe(474.34164903);
    expect(uncapped.allowanceIntel).toBe(474.34164903);
    expect(uncapped.cappedBy).toBe('none');

    const walletCapped = computeStakeMintAllowance({
      stakedIntel: 1_000_000,
      k: 3,
      walletCap: 2_500,
      globalCapRemaining: 10_000,
    });
    expect(walletCapped.allowanceIntel).toBe(2500);
    expect(walletCapped.cappedBy).toBe('wallet_cap');

    const globalCapped = computeStakeMintAllowance({
      stakedIntel: 1_000_000,
      k: 5,
      walletCap: 20_000,
      globalCapRemaining: 1_500,
    });
    expect(globalCapped.allowanceIntel).toBe(1500);
    expect(globalCapped.cappedBy).toBe('global_cap');
  });

  test('staker yield distribution is proportional and fully allocated', () => {
    const distribution = distributeIntelToStakers(9, {
      alice: 100,
      bob: 300,
      carol: 600,
    });

    expect(distribution.payoutsIntel.alice).toBe(0.9);
    expect(distribution.payoutsIntel.bob).toBe(2.7);
    expect(distribution.payoutsIntel.carol).toBe(5.4);
    expect(distribution.totalDistributedIntel).toBe(9);
  });

  test('holder round-trip trade loses value while LP captures fees', () => {
    let pool = createConstantProductPool(100_000, 100_000, 30);
    const protocolLpShares = pool.totalLpShares;
    const poolValueBefore = pool.reserveIntel + pool.reserveStable;

    const buy = swapStableForIntel(pool, 10_000);
    pool = buy.pool;
    const sell = swapIntelForStable(pool, buy.amountOut);
    pool = sell.pool;

    expect(sell.amountOut).toBeLessThan(10_000);
    const poolValueAfter = pool.reserveIntel + pool.reserveStable;
    expect(poolValueAfter).toBeGreaterThan(poolValueBefore);

    const lpReservesAfter = lpPositionReserves(pool, protocolLpShares);
    expect(lpReservesAfter.intel + lpReservesAfter.stable).toBeGreaterThan(poolValueBefore);
  });

  test('lp add/remove lifecycle preserves share accounting', () => {
    const pool0 = createConstantProductPool(50_000, 50_000);
    const add = addLiquidity(pool0, 10_000, 10_000);
    const pool1 = add.pool;

    expect(add.mintedLpShares).toBeGreaterThan(0);
    expect(add.intelUsed).toBe(10_000);
    expect(add.stableUsed).toBe(10_000);

    const removed = removeLiquidity(pool1, add.mintedLpShares);
    expect(removed.intelOut).toBe(10_000);
    expect(removed.stableOut).toBe(10_000);
  });

  test('spot price responds to order flow direction', () => {
    let pool = createConstantProductPool(20_000, 20_000);
    const priceBefore = spotPriceStablePerIntel(pool);

    const buy = swapStableForIntel(pool, 4_000);
    pool = buy.pool;
    const priceAfterBuy = spotPriceStablePerIntel(pool);
    expect(priceAfterBuy).toBeGreaterThan(priceBefore);

    const sell = swapIntelForStable(pool, buy.amountOut / 2);
    pool = sell.pool;
    const priceAfterSell = spotPriceStablePerIntel(pool);
    expect(priceAfterSell).toBeLessThan(priceAfterBuy);
  });
});

