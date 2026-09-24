import { describe, expect, test } from 'bun:test';
import {
  PLATFORM_FEE_RATE,
  DEFAULT_LEASE_DURATION_MS,
  STALLED_JOB_INTERVAL_MS,
  FLOOR_PRICE_USD,
  DOSSIER_MAX_SIZE_BYTES,
  MILESTONE_ORDER,
  CHAIN_IDS,
  LOCAL_CHAIN_ID,
} from '../src/constants';

describe('shared constants', () => {
  test('PLATFORM_FEE_RATE is 10%', () => {
    expect(PLATFORM_FEE_RATE).toBe(0.10);
  });

  test('DEFAULT_LEASE_DURATION_MS is 45 minutes', () => {
    expect(DEFAULT_LEASE_DURATION_MS).toBe(45 * 60 * 1000);
  });

  test('STALLED_JOB_INTERVAL_MS is 10 seconds', () => {
    expect(STALLED_JOB_INTERVAL_MS).toBe(10_000);
  });

  test('FLOOR_PRICE_USD has all expected task types', () => {
    expect(FLOOR_PRICE_USD).toMatchObject({
      coding: 5.00,
      analysis: 3.00,
      research: 3.00,
      summarization: 1.00,
    });
  });

  test('FLOOR_PRICE_USD coding is the most expensive', () => {
    const values = Object.values(FLOOR_PRICE_USD);
    expect(FLOOR_PRICE_USD.coding).toBe(Math.max(...values));
  });

  test('DOSSIER_MAX_SIZE_BYTES is 10 MB', () => {
    expect(DOSSIER_MAX_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });

  test('MILESTONE_ORDER matches expected sequence', () => {
    expect(MILESTONE_ORDER).toEqual(['brief', 'tasks', 'scaffold', 'review']);
  });

  test('MILESTONE_ORDER has 4 entries', () => {
    expect(MILESTONE_ORDER).toHaveLength(4);
  });

  test('CHAIN_IDS contains expected networks', () => {
    expect(CHAIN_IDS.ETHEREUM_MAINNET).toBe(1);
    expect(CHAIN_IDS.BASE_MAINNET).toBe(8453);
    expect(CHAIN_IDS.SEPOLIA).toBe(11155111);
    expect(CHAIN_IDS.BASE_SEPOLIA).toBe(84532);
  });

  test('LOCAL_CHAIN_ID is Anvil default', () => {
    expect(LOCAL_CHAIN_ID).toBe(31337);
  });
});
