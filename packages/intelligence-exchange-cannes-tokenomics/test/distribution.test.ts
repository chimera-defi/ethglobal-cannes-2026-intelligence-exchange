import { describe, expect, test } from 'bun:test';
import {
  computeStakeMintAllowance,
  distributeIntelToStakers,
  splitMintInflowStable,
  splitTaskSettlementIntel,
} from '../src/intel/distribution';

describe('splitTaskSettlementIntel', () => {
  test('default policy: split sums to grossIntel', () => {
    const r = splitTaskSettlementIntel(1000);
    expect(r.workerIntel + r.stakerIntel + r.treasuryIntel).toBeCloseTo(1000, 6);
  });

  test('default policy: 81/9/10 bps split on 10000', () => {
    const r = splitTaskSettlementIntel(10000);
    expect(r.workerIntel).toBeCloseTo(8100, 6);
    expect(r.stakerIntel).toBeCloseTo(900, 6);
    expect(r.treasuryIntel).toBeCloseTo(1000, 6);
  });

  test('zero grossIntel produces all-zero split', () => {
    const r = splitTaskSettlementIntel(0);
    expect(r.grossIntel).toBe(0);
    expect(r.workerIntel).toBe(0);
    expect(r.stakerIntel).toBe(0);
    expect(r.treasuryIntel).toBe(0);
  });

  test('negative grossIntel treated as zero', () => {
    const r = splitTaskSettlementIntel(-500);
    expect(r.grossIntel).toBe(0);
    expect(r.workerIntel).toBe(0);
  });

  test('custom policy respected', () => {
    const policy = { workerBps: 5000, stakerBps: 2500, treasuryBps: 2500 };
    const r = splitTaskSettlementIntel(10000, policy);
    expect(r.workerIntel).toBeCloseTo(5000, 6);
    expect(r.stakerIntel).toBeCloseTo(2500, 6);
    expect(r.treasuryIntel).toBeCloseTo(2500, 6);
  });

  test('invalid policy (bps sum ≠ 10000) throws', () => {
    const policy = { workerBps: 5000, stakerBps: 1000, treasuryBps: 1000 };
    expect(() => splitTaskSettlementIntel(100, policy)).toThrow();
  });

  test('grossIntel field matches rounded input', () => {
    const r = splitTaskSettlementIntel(999.99);
    expect(r.grossIntel).toBeCloseTo(999.99, 4);
  });
});

describe('splitMintInflowStable', () => {
  test('default policy: split sums to stableInflow', () => {
    const r = splitMintInflowStable(1000);
    expect(r.polStable + r.stakerStable + r.treasuryStable).toBeCloseTo(1000, 6);
  });

  test('default policy: 50/45/5 bps split on 10000', () => {
    const r = splitMintInflowStable(10000);
    expect(r.polStable).toBeCloseTo(5000, 6);
    expect(r.stakerStable).toBeCloseTo(4500, 6);
    expect(r.treasuryStable).toBeCloseTo(500, 6);
  });

  test('zero inflow produces all zeros', () => {
    const r = splitMintInflowStable(0);
    expect(r.stableInflow).toBe(0);
    expect(r.polStable).toBe(0);
    expect(r.stakerStable).toBe(0);
    expect(r.treasuryStable).toBe(0);
  });

  test('negative inflow treated as zero', () => {
    const r = splitMintInflowStable(-100);
    expect(r.stableInflow).toBe(0);
  });

  test('invalid policy (bps sum ≠ 10000) throws', () => {
    const policy = { polBps: 1000, stakerBps: 1000, treasuryBps: 1000 };
    expect(() => splitMintInflowStable(100, policy)).toThrow();
  });

  test('custom policy respected', () => {
    const policy = { polBps: 3000, stakerBps: 3000, treasuryBps: 4000 };
    const r = splitMintInflowStable(10000, policy);
    expect(r.polStable).toBeCloseTo(3000, 6);
    expect(r.stakerStable).toBeCloseTo(3000, 6);
    expect(r.treasuryStable).toBeCloseTo(4000, 6);
  });
});

describe('computeStakeMintAllowance', () => {
  test('uncapped: returns raw allowance, cappedBy=none', () => {
    // k=2, sqrt(100)=10 → raw=20; caps far above
    const r = computeStakeMintAllowance({ stakedIntel: 100, k: 2, walletCap: 1000, globalCapRemaining: 1000 });
    expect(r.rawAllowanceIntel).toBeCloseTo(20, 4);
    expect(r.allowanceIntel).toBeCloseTo(20, 4);
    expect(r.cappedBy).toBe('none');
  });

  test('wallet cap limits allowance', () => {
    const r = computeStakeMintAllowance({ stakedIntel: 100, k: 2, walletCap: 5, globalCapRemaining: 1000 });
    expect(r.allowanceIntel).toBe(5);
    expect(r.cappedBy).toBe('wallet_cap');
  });

  test('global cap limits allowance', () => {
    const r = computeStakeMintAllowance({ stakedIntel: 100, k: 2, walletCap: 1000, globalCapRemaining: 3 });
    expect(r.allowanceIntel).toBe(3);
    expect(r.cappedBy).toBe('global_cap');
  });

  test('zero stakedIntel → zero allowance', () => {
    const r = computeStakeMintAllowance({ stakedIntel: 0, k: 2, walletCap: 1000, globalCapRemaining: 1000 });
    expect(r.allowanceIntel).toBe(0);
    expect(r.rawAllowanceIntel).toBe(0);
  });

  test('k=0 → zero allowance regardless of stake', () => {
    const r = computeStakeMintAllowance({ stakedIntel: 10000, k: 0, walletCap: 1000, globalCapRemaining: 1000 });
    expect(r.allowanceIntel).toBe(0);
  });

  test('negative walletCap clamped to zero', () => {
    const r = computeStakeMintAllowance({ stakedIntel: 100, k: 2, walletCap: -10, globalCapRemaining: 1000 });
    expect(r.allowanceIntel).toBe(0);
  });

  test('non-finite k treated as zero', () => {
    const r = computeStakeMintAllowance({ stakedIntel: 100, k: NaN, walletCap: 1000, globalCapRemaining: 1000 });
    expect(r.allowanceIntel).toBe(0);
  });
});

describe('distributeIntelToStakers', () => {
  test('empty stakes returns zero distribution', () => {
    const r = distributeIntelToStakers(100, {});
    expect(r.totalDistributedIntel).toBe(0);
    expect(r.payoutsIntel).toEqual({});
  });

  test('zero totalIntel returns zero distribution regardless of stakes', () => {
    const r = distributeIntelToStakers(0, { alice: 100, bob: 50 });
    expect(r.totalDistributedIntel).toBe(0);
    expect(r.payoutsIntel).toEqual({});
  });

  test('negative totalIntel treated as zero', () => {
    const r = distributeIntelToStakers(-100, { alice: 100 });
    expect(r.totalDistributedIntel).toBe(0);
  });

  test('single staker receives full payout', () => {
    const r = distributeIntelToStakers(100, { alice: 50 });
    expect(r.payoutsIntel.alice).toBeCloseTo(100, 6);
    expect(r.totalDistributedIntel).toBeCloseTo(100, 6);
  });

  test('proportional split across two stakers', () => {
    const r = distributeIntelToStakers(300, { alice: 200, bob: 100 });
    expect(r.payoutsIntel.alice).toBeCloseTo(200, 4);
    expect(r.payoutsIntel.bob).toBeCloseTo(100, 4);
    expect(r.totalDistributedIntel).toBeCloseTo(300, 6);
  });

  test('total distributed matches totalIntel across many stakers', () => {
    const r = distributeIntelToStakers(1000, { a: 3, b: 7, c: 10 });
    expect(r.totalDistributedIntel).toBeCloseTo(1000, 4);
  });

  test('stakers with zero or negative stake are excluded from payout', () => {
    const r = distributeIntelToStakers(100, { alice: 100, bob: 0, carol: -5 });
    expect(Object.keys(r.payoutsIntel)).toContain('alice');
    expect(r.payoutsIntel.bob).toBeUndefined();
    expect(r.payoutsIntel.carol).toBeUndefined();
  });

  test('equal stakes produce equal payouts', () => {
    const r = distributeIntelToStakers(100, { a: 1, b: 1, c: 1, d: 1 });
    for (const k of ['a', 'b', 'c', 'd']) {
      expect(r.payoutsIntel[k]).toBeCloseTo(25, 4);
    }
  });
});
