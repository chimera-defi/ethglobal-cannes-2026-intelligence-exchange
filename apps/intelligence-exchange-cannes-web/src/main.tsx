import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WagmiProvider, createConfig, http } from 'wagmi';
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

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? 'cannes2026demo';

const { wallets } = getDefaultWallets({ appName: 'Intelligence Exchange', projectId });

const connectors = connectorsForWallets(
  [
    ...wallets,
    {
      groupName: 'Other',
      wallets: [metaMaskWallet, rainbowWallet, walletConnectWallet],
    },
  ],
  { appName: 'Intelligence Exchange', projectId }
);

const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors,
  transports: {
    [arcTestnet.id]: http(),
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
                <Route path="/" element={<Navigate to="/workspace" replace />} />
                <Route path="/submit" element={<IdeaSubmission />} />
                <Route path="/ideas" element={<IdeasList />} />
                <Route path="/ideas/:ideaId" element={<IdeaDetail />} />
                <Route path="/jobs" element={<JobsBoard />} />
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
