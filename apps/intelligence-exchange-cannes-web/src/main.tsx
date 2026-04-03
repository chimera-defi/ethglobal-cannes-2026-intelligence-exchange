import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { IdeaSubmission } from './pages/IdeaSubmission';
import { IdeasList } from './pages/IdeasList';
import { JobsBoard } from './pages/JobsBoard';
import { ReviewPanel } from './pages/ReviewPanel';
import { IdeaDetail } from './pages/IdeaDetail';
import { Nav } from './components/Nav';
import { BuyerSessionProvider } from './session';
import { BuyerWorkspace } from './pages/BuyerWorkspace';
import { BuyerReviewQueue } from './pages/BuyerReviewQueue';
import { BuyerHistory } from './pages/BuyerHistory';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5000 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BuyerSessionProvider>
        <BrowserRouter>
          <Nav />
          <Routes>
            <Route path="/" element={<Navigate to="/buyer" replace />} />
            <Route path="/submit" element={<Navigate to="/buyer/new" replace />} />
            <Route path="/ideas" element={<Navigate to="/buyer" replace />} />
            <Route path="/buyer" element={<BuyerWorkspace />} />
            <Route path="/buyer/new" element={<IdeaSubmission />} />
            <Route path="/buyer/review" element={<BuyerReviewQueue />} />
            <Route path="/buyer/history" element={<BuyerHistory />} />
            <Route path="/ideas/:ideaId" element={<IdeaDetail />} />
            <Route path="/jobs" element={<JobsBoard />} />
            <Route path="/review/:jobId" element={<ReviewPanel />} />
            <Route path="*" element={<Navigate to="/buyer" replace />} />
          </Routes>
        </BrowserRouter>
      </BuyerSessionProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
