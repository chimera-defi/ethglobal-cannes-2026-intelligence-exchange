import { keccak256, toBytes } from 'viem';

export function makeDemoTxHash(seed: string) {
  return keccak256(toBytes(seed));
}

export function makeDemoAddress(seed: string): `0x${string}` {
  const hash = makeDemoTxHash(seed);
  return `0x${hash.slice(2, 42)}` as `0x${string}`;
}

export function makeDemoWorldProof(seed: string) {
  return {
    nullifierHash: makeDemoTxHash(`world-nullifier:${seed}`),
    proof: makeDemoTxHash(`world-proof:${seed}`),
    merkleRoot: makeDemoTxHash(`world-root:${seed}`),
    verificationLevel: 'device',
  };
}
