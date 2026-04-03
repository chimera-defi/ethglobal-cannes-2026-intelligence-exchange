import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig, RainbowKitProvider, ConnectButton } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { mainnet, sepolia, localhost } from 'wagmi/chains';
import type { Chain } from 'viem';
import type { ReactNode } from 'react';

const arcChain: Chain = {
  id: 60808,
  name: 'Arc',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_ARC_RPC_URL ?? 'https://rpc.arc.xyz'] },
    public: { http: [import.meta.env.VITE_ARC_RPC_URL ?? 'https://rpc.arc.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: import.meta.env.VITE_ARC_EXPLORER_URL ?? 'https://explorer.arc.xyz' },
  },
  testnet: false,
};

const config = getDefaultConfig({
  appName: 'Intelligence Exchange Cannes',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? 'demo-walletconnect-project-id',
  chains: [localhost, sepolia, mainnet, arcChain],
  ssr: false,
});

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <RainbowKitProvider>
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}

export { ConnectButton };
