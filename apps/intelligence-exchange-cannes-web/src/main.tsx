import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Nav } from './components/Nav';
import { BuyerSessionProvider } from './session';
import { WalletProvider } from './wallet';
import './index.css';

function lazyPage<T extends React.ComponentType<unknown>>(loader: () => Promise<{ default: T }>) {
  return lazy(loader);
}

const BuyerWorkspace = lazyPage(async () => ({ default: (await import('./pages/BuyerWorkspace')).BuyerWorkspace }));
const IdeaSubmission = lazyPage(async () => ({ default: (await import('./pages/IdeaSubmission')).IdeaSubmission }));
const BuyerReviewQueue = lazyPage(async () => ({ default: (await import('./pages/BuyerReviewQueue')).BuyerReviewQueue }));
const BuyerHistory = lazyPage(async () => ({ default: (await import('./pages/BuyerHistory')).BuyerHistory }));
const IdeaDetail = lazyPage(async () => ({ default: (await import('./pages/IdeaDetail')).IdeaDetail }));
const JobsBoard = lazyPage(async () => ({ default: (await import('./pages/JobsBoard')).JobsBoard }));
const ReviewPanel = lazyPage(async () => ({ default: (await import('./pages/ReviewPanel')).ReviewPanel }));

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
