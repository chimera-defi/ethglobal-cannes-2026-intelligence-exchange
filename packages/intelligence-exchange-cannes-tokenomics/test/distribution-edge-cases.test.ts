import { describe, expect, test } from 'bun:test';
import {
  distributeIntelToStakers,
  splitMintInflowStable,
  splitTaskSettlementIntel,
} from '../src/intel';
import { splitSettlementIntel } from '../src/engine';

// ---------------------------------------------------------------------------
// splitTaskSettlementIntel — edge cases
// ---------------------------------------------------------------------------

describe('splitTaskSettlementIntel edge cases', () => {
  test('zero grossIntel returns all-zero split', () => {
    const split = splitTaskSettlementIntel(0);
    expect(split.workerIntel).toBe(0);
    expect(split.stakerIntel).toBe(0);
    expect(split.treasuryIntel).toBe(0);
    expect(split.grossIntel).toBe(0);
  });

  test('negative grossIntel treated as zero', () => {
    const split = splitTaskSettlementIntel(-50);
    expect(split.workerIntel).toBe(0);
    expect(split.grossIntel).toBe(0);
  });

  test('fractional gross preserves total', () => {
    const split = splitTaskSettlementIntel(1);
    expect(split.workerIntel + split.stakerIntel + split.treasuryIntel).toBe(split.grossIntel);
  });

  test('large value preserves 81/9/10 ratio', () => {
    const split = splitTaskSettlementIntel(1_000_000);
    expect(split.workerIntel).toBe(810_000);
    expect(split.stakerIntel).toBe(90_000);
    expect(split.treasuryIntel).toBe(100_000);
  });

  test('custom policy: 70/20/10', () => {
    const split = splitTaskSettlementIntel(100, {
      workerBps: 7000,
      stakerBps: 2000,
      treasuryBps: 1000,
    });
    expect(split.workerIntel).toBe(70);
    expect(split.stakerIntel).toBe(20);
    expect(split.treasuryIntel).toBe(10);
  });

  test('custom policy throws when bps do not sum to 10_000', () => {
    expect(() =>
      splitTaskSettlementIntel(100, { workerBps: 7000, stakerBps: 2000, treasuryBps: 500 }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// splitMintInflowStable — edge cases
// ---------------------------------------------------------------------------

describe('splitMintInflowStable edge cases', () => {
  test('zero inflow returns all-zero split', () => {
    const split = splitMintInflowStable(0);
    expect(split.polStable).toBe(0);
    expect(split.stakerStable).toBe(0);
    expect(split.treasuryStable).toBe(0);
    expect(split.stableInflow).toBe(0);
  });

  test('negative inflow treated as zero', () => {
    const split = splitMintInflowStable(-100);
    expect(split.polStable).toBe(0);
    expect(split.stableInflow).toBe(0);
  });

  test('preserves total across all destinations', () => {
    const split = splitMintInflowStable(777);
    expect(split.polStable + split.stakerStable + split.treasuryStable).toBe(split.stableInflow);
  });
});

// ---------------------------------------------------------------------------
// splitSettlementIntel (engine.ts) — error path
// ---------------------------------------------------------------------------

describe('splitSettlementIntel error cases', () => {
  test('throws when protocolFeeBps + stakerYieldBps exceed 10_000', () => {
    expect(() =>
      splitSettlementIntel(100, { protocolFeeBps: 6000, stakerYieldBps: 5000 }),
    ).toThrow('FeePolicy overflow');
  });

  test('zero grossIntel returns all-zero split', () => {
    const split = splitSettlementIntel(0, { protocolFeeBps: 1000, stakerYieldBps: 900 });
    expect(split.grossIntel).toBe(0);
    expect(split.workerPayoutIntel).toBe(0);
    expect(split.protocolFeeIntel).toBe(0);
    expect(split.stakerYieldIntel).toBe(0);
  });

  test('zero fees: worker receives full gross', () => {
    const split = splitSettlementIntel(50, { protocolFeeBps: 0, stakerYieldBps: 0 });
    expect(split.workerPayoutIntel).toBe(50);
    expect(split.protocolFeeIntel).toBe(0);
    expect(split.stakerYieldIntel).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// distributeIntelToStakers — edge cases
// ---------------------------------------------------------------------------

describe('distributeIntelToStakers edge cases', () => {
  test('empty stakes returns zero distribution', () => {
    const result = distributeIntelToStakers(100, {});
    expect(result.totalDistributedIntel).toBe(0);
    expect(result.payoutsIntel).toEqual({});
  });

  test('all-zero stakes treated as empty', () => {
    const result = distributeIntelToStakers(100, { alice: 0, bob: 0 });
    expect(result.totalDistributedIntel).toBe(0);
    expect(result.payoutsIntel).toEqual({});
  });

  test('negative stakes are filtered out', () => {
    const result = distributeIntelToStakers(100, { alice: -50, bob: 100 });
    expect(result.payoutsIntel.alice).toBeUndefined();
    expect(result.payoutsIntel.bob).toBe(100);
  });

  test('zero totalIntel returns zero distribution', () => {
    const result = distributeIntelToStakers(0, { alice: 100, bob: 200 });
    expect(result.totalDistributedIntel).toBe(0);
    expect(result.payoutsIntel).toEqual({});
  });

  test('single staker receives full payout', () => {
    const result = distributeIntelToStakers(50, { solo: 1 });
    expect(result.payoutsIntel.solo).toBe(50);
    expect(result.totalDistributedIntel).toBe(50);
  });

  test('total distributed equals gross for integer-divisible stakes', () => {
    const result = distributeIntelToStakers(10, { a: 500, b: 500 });
    expect(result.totalDistributedIntel).toBe(10);
    expect(result.payoutsIntel.a).toBe(5);
    expect(result.payoutsIntel.b).toBe(5);
  });

  test('remainder assigned to last staker to avoid rounding loss', () => {
    const result = distributeIntelToStakers(1, { a: 1, b: 1, c: 1 });
    const total = Object.values(result.payoutsIntel).reduce((s, v) => s + v, 0);
    // Total must equal gross (no intel lost)
    expect(result.totalDistributedIntel).toBe(total);
    expect(total).toBeCloseTo(1, 6);
  });
});
