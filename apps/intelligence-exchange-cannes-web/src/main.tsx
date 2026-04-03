import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Nav } from './components/Nav';
import { BuyerSessionProvider } from './session';
import { WalletProvider } from './wallet';
import './index.css';

const BuyerWorkspace = lazy(async () => {
  const mod = await import('./pages/BuyerWorkspace');
  return { default: mod.BuyerWorkspace };
});
const IdeaSubmission = lazy(async () => {
  const mod = await import('./pages/IdeaSubmission');
  return { default: mod.IdeaSubmission };
});
const BuyerReviewQueue = lazy(async () => {
  const mod = await import('./pages/BuyerReviewQueue');
  return { default: mod.BuyerReviewQueue };
});
const BuyerHistory = lazy(async () => {
  const mod = await import('./pages/BuyerHistory');
  return { default: mod.BuyerHistory };
});
const IdeaDetail = lazy(async () => {
  const mod = await import('./pages/IdeaDetail');
  return { default: mod.IdeaDetail };
});
const JobsBoard = lazy(async () => {
  const mod = await import('./pages/JobsBoard');
  return { default: mod.JobsBoard };
});
const ReviewPanel = lazy(async () => {
  const mod = await import('./pages/ReviewPanel');
  return { default: mod.ReviewPanel };
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5000 },
  },
});

function RouteShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-80px)] flex items-center justify-center p-4">
          <div className="card max-w-md w-full text-center space-y-4 py-12">
            <div className="animate-spin text-4xl">⚙️</div>
            <p className="text-gray-400">Loading workspace…</p>
          </div>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WalletProvider>
      <QueryClientProvider client={queryClient}>
        <BuyerSessionProvider>
          <BrowserRouter>
            <Nav />
            <Routes>
              <Route path="/" element={<Navigate to="/buyer" replace />} />
              <Route path="/submit" element={<Navigate to="/buyer/new" replace />} />
              <Route path="/ideas" element={<Navigate to="/buyer" replace />} />
              <Route path="/buyer" element={<RouteShell><BuyerWorkspace /></RouteShell>} />
              <Route path="/buyer/new" element={<RouteShell><IdeaSubmission /></RouteShell>} />
              <Route path="/buyer/review" element={<RouteShell><BuyerReviewQueue /></RouteShell>} />
              <Route path="/buyer/history" element={<RouteShell><BuyerHistory /></RouteShell>} />
              <Route path="/ideas/:ideaId" element={<RouteShell><IdeaDetail /></RouteShell>} />
              <Route path="/jobs" element={<RouteShell><JobsBoard /></RouteShell>} />
              <Route path="/review/:jobId" element={<RouteShell><ReviewPanel /></RouteShell>} />
              <Route path="*" element={<Navigate to="/buyer" replace />} />
            </Routes>
          </BrowserRouter>
        </BuyerSessionProvider>
      </QueryClientProvider>
    </WalletProvider>
  </React.StrictMode>
);
