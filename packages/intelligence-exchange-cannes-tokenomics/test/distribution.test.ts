import { describe, expect, test } from 'bun:test';
import { distributeIntelToStakers } from '../src/intel/distribution';

describe('distributeIntelToStakers', () => {
  test('returns zero distribution when totalIntel is zero', () => {
    const result = distributeIntelToStakers(0, { alice: 100 });
    expect(result.totalDistributedIntel).toBe(0);
    expect(result.payoutsIntel).toEqual({});
  });

  test('returns zero distribution when totalIntel is negative', () => {
    const result = distributeIntelToStakers(-50, { alice: 100 });
    expect(result.totalDistributedIntel).toBe(0);
    expect(result.payoutsIntel).toEqual({});
  });

  test('returns zero distribution when stakes is empty', () => {
    const result = distributeIntelToStakers(1000, {});
    expect(result.totalDistributedIntel).toBe(0);
    expect(result.payoutsIntel).toEqual({});
  });

  test('returns zero distribution when all stakes are zero', () => {
    const result = distributeIntelToStakers(1000, { alice: 0, bob: 0 });
    expect(result.totalDistributedIntel).toBe(0);
    expect(result.payoutsIntel).toEqual({});
  });

  test('returns zero distribution when all stakes are negative', () => {
    const result = distributeIntelToStakers(1000, { alice: -10, bob: -5 });
    expect(result.totalDistributedIntel).toBe(0);
    expect(result.payoutsIntel).toEqual({});
  });

  test('distributes all intel to single staker', () => {
    const result = distributeIntelToStakers(1000, { alice: 500 });
    expect(result.totalDistributedIntel).toBeCloseTo(1000, 6);
    expect(result.payoutsIntel['alice']).toBeCloseTo(1000, 6);
  });

  test('distributes proportionally with equal stakes', () => {
    const result = distributeIntelToStakers(1000, { alice: 100, bob: 100 });
    expect(result.payoutsIntel['alice']).toBeCloseTo(500, 6);
    expect(result.payoutsIntel['bob']).toBeCloseTo(500, 6);
    expect(result.totalDistributedIntel).toBeCloseTo(1000, 6);
  });

  test('distributes proportionally with unequal stakes', () => {
    const result = distributeIntelToStakers(1000, { alice: 300, bob: 700 });
    expect(result.payoutsIntel['alice']).toBeCloseTo(300, 4);
    expect(result.payoutsIntel['bob']).toBeCloseTo(700, 4);
    expect(result.totalDistributedIntel).toBeCloseTo(1000, 6);
  });

  test('total distributed equals totalIntel (remainder goes to last staker)', () => {
    const result = distributeIntelToStakers(100, { alice: 1, bob: 1, carol: 1 });
    const sum = Object.values(result.payoutsIntel).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(result.totalDistributedIntel, 6);
    expect(result.totalDistributedIntel).toBeCloseTo(100, 6);
  });

  test('skips zero-stake accounts and distributes only to positive ones', () => {
    const result = distributeIntelToStakers(1000, { alice: 0, bob: 500, carol: 500 });
    expect('alice' in result.payoutsIntel).toBe(false);
    expect(result.payoutsIntel['bob']).toBeCloseTo(500, 6);
    expect(result.payoutsIntel['carol']).toBeCloseTo(500, 6);
  });

  test('skips negative-stake accounts', () => {
    const result = distributeIntelToStakers(1000, { alice: -100, bob: 1000 });
    expect('alice' in result.payoutsIntel).toBe(false);
    expect(result.payoutsIntel['bob']).toBeCloseTo(1000, 6);
  });

  test('three stakers with 1:2:7 ratio', () => {
    const result = distributeIntelToStakers(1000, { alice: 100, bob: 200, carol: 700 });
    expect(result.payoutsIntel['alice']).toBeCloseTo(100, 4);
    expect(result.payoutsIntel['bob']).toBeCloseTo(200, 4);
    expect(result.payoutsIntel['carol']).toBeCloseTo(700, 4);
    expect(result.totalDistributedIntel).toBeCloseTo(1000, 6);
  });

  test('result object has correct shape', () => {
    const result = distributeIntelToStakers(100, { a: 1 });
    expect(typeof result.totalDistributedIntel).toBe('number');
    expect(typeof result.payoutsIntel).toBe('object');
  });
});
