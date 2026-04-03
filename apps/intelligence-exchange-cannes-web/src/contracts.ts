import { keccak256, toBytes, type Address } from 'viem';

export const escrowAbi = [
  {
    type: 'function',
    name: 'fundIdea',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'ideaId', type: 'bytes32' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

export const mockUsdcAbi = [
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

export function toEscrowIdeaId(ideaId: string) {
  return keccak256(toBytes(ideaId));
}

export function localFundingAddresses() {
  return {
    chainId: Number(import.meta.env.VITE_ESCROW_CHAIN_ID ?? 31337),
    escrowAddress: (import.meta.env.VITE_ESCROW_ADDRESS ?? '0x5FbDB2315678afecb367f032d93F642f64180aa3') as Address,
    usdcAddress: (import.meta.env.VITE_USDC_ADDRESS ?? '0x9fE46736679d2D9a65F0992F2272De9f3c7fa6e0') as Address,
    localFaucet: (import.meta.env.VITE_LOCAL_USDC_FAUCET ?? '1') === '1',
  };
}
