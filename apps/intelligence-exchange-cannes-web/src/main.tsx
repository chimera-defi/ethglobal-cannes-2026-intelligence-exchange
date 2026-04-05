import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { defineChain } from 'viem';
import { RainbowKitProvider, getDefaultWallets, darkTheme } from '@rainbow-me/rainbowkit';
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import { metaMaskWallet, rainbowWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets';
import '@rainbow-me/rainbowkit/styles.css';
import { Nav } from './components/Nav';
import './index.css';

// Arc testnet (ETHGlobal Cannes 2026)
const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'ETH', symbol: 'ETH' },
  rpcUrls: {
    default: { http: ['https://rpc.arc.testnet.example'] },
  },
  testnet: true,
});

const worldChain = defineChain({
  id: Number(import.meta.env.VITE_WORLDCHAIN_CHAIN_ID ?? '4801'),
  name: 'World Chain Sepolia',
  nativeCurrency: { decimals: 18, name: 'ETH', symbol: 'ETH' },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_WORLDCHAIN_RPC_URL ?? 'https://worldchain-sepolia.g.alchemy.com/public'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Worldchain Sepolia Explorer',
      url: import.meta.env.VITE_WORLDCHAIN_EXPLORER_URL ?? 'https://worldchain-sepolia.explorer.alchemy.com',
    },
  },
});

const zeroGTestnet = defineChain({
  id: 16602,
  name: '0G Testnet',
  nativeCurrency: { decimals: 18, name: 'A0GI', symbol: 'A0GI' },
  rpcUrls: {
    default: { http: ['https://evmrpc-testnet.0g.ai'] },
  },
  blockExplorers: {
    default: {
      name: '0G Testnet Explorer',
      url: 'https://chainscan-galileo.0g.ai',
    },
  },
  testnet: true,
});

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

const connectors = projectId
  ? (() => {
      const { wallets } = getDefaultWallets({ appName: 'Intelligence Exchange', projectId });
      return connectorsForWallets(
        [
          ...wallets,
          {
            groupName: 'Other',
            wallets: [metaMaskWallet, rainbowWallet, walletConnectWallet],
          },
        ],
        { appName: 'Intelligence Exchange', projectId }
      );
    })()
  : [
      injected({ target: 'metaMask' }),
      injected(),
    ];

const wagmiConfig = createConfig({
  chains: [arcTestnet, worldChain, zeroGTestnet],
  connectors,
  transports: {
    [arcTestnet.id]: http(),
    [worldChain.id]: http(),
    [zeroGTestnet.id]: http(),
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5000 },
  },
});

const IdeaSubmission = React.lazy(() =>
  import('./pages/IdeaSubmission').then(m => ({ default: m.IdeaSubmission }))
);
const IdeasList = React.lazy(() =>
  import('./pages/IdeasList').then(m => ({ default: m.IdeasList }))
);
const IdeaDetail = React.lazy(() =>
  import('./pages/IdeaDetail').then(m => ({ default: m.IdeaDetail }))
);
const JobsBoard = React.lazy(() =>
  import('./pages/JobsBoard').then(m => ({ default: m.JobsBoard }))
);
const ReviewPanel = React.lazy(() =>
  import('./pages/ReviewPanel').then(m => ({ default: m.ReviewPanel }))
);
const BuyerWorkspace = React.lazy(() =>
  import('./pages/BuyerWorkspace').then(m => ({ default: m.BuyerWorkspace }))
);
const BuyerReviewQueue = React.lazy(() =>
  import('./pages/BuyerReviewQueue').then(m => ({ default: m.BuyerReviewQueue }))
);
const BuyerHistory = React.lazy(() =>
  import('./pages/BuyerHistory').then(m => ({ default: m.BuyerHistory }))
);
const AgentsPage = React.lazy(() =>
  import('./pages/AgentsPage').then(m => ({ default: m.AgentsPage }))
);
const LandingPage = React.lazy(() =>
  import('./pages/LandingPage').then(m => ({ default: m.LandingPage }))
);

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="spinner" />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#2563eb',
            accentColorForeground: 'white',
            borderRadius: 'large',
            overlayBlur: 'small',
          })}
        >
          <BrowserRouter>
            <Nav />
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/submit" element={<IdeaSubmission />} />
                <Route path="/ideas" element={<IdeasList />} />
                <Route path="/ideas/:ideaId" element={<IdeaDetail />} />
                <Route path="/jobs" element={<JobsBoard />} />
                <Route path="/agents" element={<AgentsPage />} />
                <Route path="/review/:jobId" element={<ReviewPanel />} />
                <Route path="/workspace" element={<BuyerWorkspace />} />
                <Route path="/workspace/review" element={<BuyerReviewQueue />} />
                <Route path="/workspace/history" element={<BuyerHistory />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
