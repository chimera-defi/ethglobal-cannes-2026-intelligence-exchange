import { describe, expect, test } from 'bun:test';
import {
  splitTaskSettlementIntel,
  splitMintInflowStable,
  computeStakeMintAllowance,
  distributeIntelToStakers,
  DEFAULT_TASK_SETTLEMENT_POLICY,
  DEFAULT_MINT_INFLOW_POLICY,
} from '../src/intel/distribution';

// ── assertBpsTotal error path ─────────────────────────────────────────────────

describe('splitTaskSettlementIntel — invalid policy', () => {
  test('throws when policy bps do not sum to 10000', () => {
    expect(() =>
      splitTaskSettlementIntel(100, { workerBps: 8000, stakerBps: 900, treasuryBps: 900 }),
    ).toThrow('Task settlement policy must sum to 10000 bps');
  });

  test('throws when policy is under 10000 bps', () => {
    expect(() =>
      splitTaskSettlementIntel(100, { workerBps: 5000, stakerBps: 1000, treasuryBps: 1000 }),
    ).toThrow();
  });
});

describe('splitMintInflowStable — invalid policy', () => {
  test('throws when policy bps do not sum to 10000', () => {
    expect(() =>
      splitMintInflowStable(100, { polBps: 5000, stakerBps: 4000, treasuryBps: 400 }),
    ).toThrow();
  });
});

// ── toPositiveNumber guard ────────────────────────────────────────────────────

describe('splitTaskSettlementIntel — toPositiveNumber guard', () => {
  test('returns zero distribution for negative grossIntel', () => {
    const result = splitTaskSettlementIntel(-50);
    expect(result.grossIntel).toBe(0);
    expect(result.workerIntel).toBe(0);
    expect(result.stakerIntel).toBe(0);
    expect(result.treasuryIntel).toBe(0);
  });

  test('returns zero distribution for zero grossIntel', () => {
    const result = splitTaskSettlementIntel(0);
    expect(result.grossIntel).toBe(0);
    expect(result.workerIntel + result.stakerIntel + result.treasuryIntel).toBe(0);
  });

  test('returns zero distribution for Infinity grossIntel', () => {
    const result = splitTaskSettlementIntel(Infinity);
    expect(result.grossIntel).toBe(0);
  });

  test('returns zero distribution for NaN grossIntel', () => {
    const result = splitTaskSettlementIntel(NaN);
    expect(result.grossIntel).toBe(0);
  });
});

describe('splitMintInflowStable — toPositiveNumber guard', () => {
  test('returns zero split for negative stableInflow', () => {
    const result = splitMintInflowStable(-100);
    expect(result.stableInflow).toBe(0);
    expect(result.polStable + result.stakerStable + result.treasuryStable).toBe(0);
  });

  test('returns zero split for NaN stableInflow', () => {
    const result = splitMintInflowStable(NaN);
    expect(result.stableInflow).toBe(0);
  });
});

// ── splitTaskSettlementIntel — totals preserved ───────────────────────────────

describe('splitTaskSettlementIntel — total preservation', () => {
  test('worker + staker + treasury equals gross (default policy)', () => {
    const gross = 1234.5678;
    const result = splitTaskSettlementIntel(gross);
    const total = result.workerIntel + result.stakerIntel + result.treasuryIntel;
    expect(total).toBeCloseTo(result.grossIntel, 6);
  });

  test('uses default policy when none provided', () => {
    const result = splitTaskSettlementIntel(1000);
    expect(result.workerIntel).toBeCloseTo(810, 1);
    expect(result.stakerIntel).toBeCloseTo(90, 1);
    expect(result.treasuryIntel).toBeCloseTo(100, 1);
  });
});

// ── computeStakeMintAllowance — edge cases ────────────────────────────────────

describe('computeStakeMintAllowance — edge cases', () => {
  test('returns zero allowance when stakedIntel is zero', () => {
    const result = computeStakeMintAllowance({
      stakedIntel: 0,
      k: 1,
      walletCap: 1000,
      globalCapRemaining: 1000,
    });
    expect(result.allowanceIntel).toBe(0);
    expect(result.rawAllowanceIntel).toBe(0);
  });

  test('returns zero allowance when k is zero', () => {
    const result = computeStakeMintAllowance({
      stakedIntel: 100,
      k: 0,
      walletCap: 1000,
      globalCapRemaining: 1000,
    });
    expect(result.allowanceIntel).toBe(0);
  });

  test('capped by wallet_cap when wallet cap is the binding constraint', () => {
    const result = computeStakeMintAllowance({
      stakedIntel: 10000,
      k: 1,
      walletCap: 5,
      globalCapRemaining: 10000,
    });
    expect(result.cappedBy).toBe('wallet_cap');
    expect(result.allowanceIntel).toBe(5);
  });

  test('capped by global_cap when global cap is the binding constraint', () => {
    const result = computeStakeMintAllowance({
      stakedIntel: 10000,
      k: 1,
      walletCap: 10000,
      globalCapRemaining: 3,
    });
    expect(result.cappedBy).toBe('global_cap');
    expect(result.allowanceIntel).toBe(3);
  });

  test('not capped when both caps are non-binding', () => {
    const result = computeStakeMintAllowance({
      stakedIntel: 100,
      k: 0.1,
      walletCap: 1000,
      globalCapRemaining: 1000,
    });
    expect(result.cappedBy).toBe('none');
    expect(result.allowanceIntel).toBe(result.rawAllowanceIntel);
  });

  test('handles NaN k gracefully — returns zero allowance', () => {
    const result = computeStakeMintAllowance({
      stakedIntel: 100,
      k: NaN,
      walletCap: 1000,
      globalCapRemaining: 1000,
    });
    expect(result.allowanceIntel).toBe(0);
  });

  test('handles negative globalCapRemaining as zero', () => {
    const result = computeStakeMintAllowance({
      stakedIntel: 100,
      k: 1,
      walletCap: 1000,
      globalCapRemaining: -10,
    });
    expect(result.allowanceIntel).toBe(0);
  });
});

// ── distributeIntelToStakers — edge cases ────────────────────────────────────

describe('distributeIntelToStakers — edge cases', () => {
  test('returns empty distribution for zero totalIntel', () => {
    const result = distributeIntelToStakers(0, { alice: 100, bob: 200 });
    expect(result.totalDistributedIntel).toBe(0);
    expect(result.payoutsIntel).toEqual({});
  });

  test('returns empty distribution for negative totalIntel', () => {
    const result = distributeIntelToStakers(-50, { alice: 100 });
    expect(result.totalDistributedIntel).toBe(0);
    expect(result.payoutsIntel).toEqual({});
  });

  test('returns empty distribution for empty stakes map', () => {
    const result = distributeIntelToStakers(100, {});
    expect(result.totalDistributedIntel).toBe(0);
    expect(result.payoutsIntel).toEqual({});
  });

  test('skips stakers with zero or negative stake', () => {
    const result = distributeIntelToStakers(100, { alice: 100, bob: 0, carol: -10 });
    expect(result.payoutsIntel).not.toHaveProperty('bob');
    expect(result.payoutsIntel).not.toHaveProperty('carol');
    expect(result.payoutsIntel).toHaveProperty('alice');
  });

  test('single staker receives full amount via remainder path', () => {
    const result = distributeIntelToStakers(100, { alice: 500 });
    expect(result.payoutsIntel['alice']).toBe(100);
    expect(result.totalDistributedIntel).toBe(100);
  });

  test('total distributed equals totalIntel for multi-staker distribution', () => {
    const result = distributeIntelToStakers(1000, { alice: 30, bob: 70 });
    const sum = Object.values(result.payoutsIntel).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(result.totalDistributedIntel, 6);
    expect(result.totalDistributedIntel).toBeCloseTo(1000, 4);
  });

  test('distribution is proportional to stake weights', () => {
    const result = distributeIntelToStakers(100, { alice: 25, bob: 75 });
    expect(result.payoutsIntel['alice']).toBeCloseTo(25, 4);
    expect(result.payoutsIntel['bob']).toBeCloseTo(75, 4);
  });

  test('handles NaN totalIntel as zero', () => {
    const result = distributeIntelToStakers(NaN, { alice: 100 });
    expect(result.totalDistributedIntel).toBe(0);
  });
});
