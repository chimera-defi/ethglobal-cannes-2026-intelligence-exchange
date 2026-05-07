import { createPublicClient, createWalletClient, http, type Address, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// ─── Chain Configs ─────────────────────────────────────────────────────────

export const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
    public: { http: ['https://rpc.testnet.arc.network'] },
  },
} as const satisfies Chain;

export const worldchainMainnet = {
  id: 480,
  name: 'World Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://worldchain-mainnet.g.alchemy.com/public'] },
    public: { http: ['https://worldchain-mainnet.g.alchemy.com/public'] },
  },
} as const satisfies Chain;

export const zeroGTestnet = {
  id: 16602,
  name: '0G Testnet',
  nativeCurrency: { name: 'AOGI', symbol: 'AOGI', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://evmrpc-testnet.0g.ai'] },
    public: { http: ['https://evmrpc-testnet.0g.ai'] },
  },
} as const satisfies Chain;

// ─── Client Factory ──────────────────────────────────────────────────────────

export function getPublicClient(chain: Chain, rpcUrl?: string) {
  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
}

export function getWalletClient(chain: Chain, privateKey: `0x${string}`, rpcUrl?: string) {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });
}

// ─── Contract Addresses (placeholder — fill after deployment) ────────────────

export type ProtocolAddresses = {
  milestoneEscrow: Address;
  roleRegistry: Address;
  intelToken: Address;
  treasuryRouter: Address;
  pauseController: Address;
};

export const PROTOCOL_ADDRESSES: Record<number, ProtocolAddresses> = {
  [arcTestnet.id]: {
    milestoneEscrow: '0x0000000000000000000000000000000000000000',
    roleRegistry: '0x0000000000000000000000000000000000000000',
    intelToken: '0x0000000000000000000000000000000000000000',
    treasuryRouter: '0x0000000000000000000000000000000000000000',
    pauseController: '0x0000000000000000000000000000000000000000',
  },
  [worldchainMainnet.id]: {
    milestoneEscrow: '0x0000000000000000000000000000000000000000',
    roleRegistry: '0x0000000000000000000000000000000000000000',
    intelToken: '0x0000000000000000000000000000000000000000',
    treasuryRouter: '0x0000000000000000000000000000000000000000',
    pauseController: '0x0000000000000000000000000000000000000000',
  },
};
