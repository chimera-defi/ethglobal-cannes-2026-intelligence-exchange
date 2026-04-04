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
  const privateKey = (process.env.BROKER_ATTESTOR_PRIVATE_KEY ??
    '0x59c6995e998f97a5a0044976f5d6f5f45e26d4e9f8f6b0c27a8c34f6f14e4a72') as `0x${string}`;
  return privateKeyToAccount(privateKey);
}
