import { encodePacked, keccak256, recoverMessageAddress, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export function normalizeAccountAddress(accountAddress: string): string {
  return accountAddress.toLowerCase();
}

export function sameAccount(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return normalizeAccountAddress(a) === normalizeAccountAddress(b);
}

export function computeAgentFingerprint(agentType: string, agentVersion: string, accountAddress: string): string {
  return keccak256(encodePacked(
    ['string', 'string', 'address'],
    [agentType, agentVersion, normalizeAccountAddress(accountAddress) as `0x${string}`],
  ));
}

export function deriveDeterministicAddress(seed: string): `0x${string}` {
  return `0x${keccak256(toBytes(seed)).slice(2, 42)}` as `0x${string}`;
}

export function hashPermissionScope(scope: string[]): string {
  return keccak256(toBytes([...scope].sort().join('|')));
}

export async function verifyMessageSignature(message: string, signature: string, expectedAddress: string): Promise<boolean> {
  const recovered = await recoverMessageAddress({ message, signature: signature as `0x${string}` });
  return sameAccount(recovered, expectedAddress);
}

export function getBrokerAttestorAccount() {
  const privateKey = process.env.BROKER_ATTESTOR_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('BROKER_ATTESTOR_PRIVATE_KEY is required for attestation signing. Set it in your environment.');
  }
  return privateKeyToAccount(privateKey as `0x${string}`);
}
