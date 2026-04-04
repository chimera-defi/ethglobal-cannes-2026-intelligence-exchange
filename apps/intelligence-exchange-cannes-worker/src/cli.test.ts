import { afterEach, describe, expect, test } from 'bun:test';
import { encodePacked, keccak256, recoverMessageAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { computeAgentFingerprint, createSignedAction } from './cli';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('worker CLI wallet flow', () => {
  test('computeAgentFingerprint matches the packed tuple used on-chain', () => {
    const account = privateKeyToAccount('0x8b3a350cf5c34c9194ca3ab0d454ef1d511f3f840f2f2ad0f43fc9b4f7f9f1d2');
    const expected = keccak256(encodePacked(
      ['string', 'string', 'address'],
      ['claude-code', '1.0.0', account.address.toLowerCase() as `0x${string}`],
    ));

    expect(computeAgentFingerprint('claude-code', '1.0.0', account.address)).toBe(expected);
  });

  test('createSignedAction signs the broker challenge with the operator wallet', async () => {
    const privateKey = '0x8b3a350cf5c34c9194ca3ab0d454ef1d511f3f840f2f2ad0f43fc9b4f7f9f1d2' as const;
    const account = privateKeyToAccount(privateKey);
    const fingerprint = computeAgentFingerprint('claude-code', '1.0.0', account.address);
    const message = [
      'Intelligence Exchange Authentication',
      'Purpose: worker_claim',
      `Account: ${account.address}`,
      'Nonce: challenge-nonce',
      'Expires At: 2026-04-04T12:00:00.000Z',
      'Job ID: job-123',
      `Agent Fingerprint: ${fingerprint}`,
    ].join('\n');

    let requestBody: unknown = null;
    globalThis.fetch = (async (_input, init) => {
      requestBody = init?.body ? JSON.parse(String(init.body)) : null;
      return new Response(JSON.stringify({
        challengeId: '11111111-1111-1111-1111-111111111111',
        message,
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const signedAction = await createSignedAction({
      accountAddress: account.address,
      purpose: 'worker_claim',
      agentFingerprint: fingerprint,
      jobId: 'job-123',
      privateKey,
    });

    expect(requestBody).toEqual({
      accountAddress: account.address,
      purpose: 'worker_claim',
      agentFingerprint: fingerprint,
      jobId: 'job-123',
    });
    expect(signedAction.challengeId).toBe('11111111-1111-1111-1111-111111111111');
    expect(signedAction.accountAddress).toBe(account.address);
    expect(signedAction.agentFingerprint).toBe(fingerprint);

    const recovered = await recoverMessageAddress({
      message,
      signature: signedAction.signature as `0x${string}`,
    });
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });
});
