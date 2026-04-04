import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ExchangeHome } from './pages/ExchangeHome';
import { IdeaSubmission } from './pages/IdeaSubmission';
import { IdeasList } from './pages/IdeasList';
import { JobsBoard } from './pages/JobsBoard';
import { ReviewPanel } from './pages/ReviewPanel';
import { IdeaDetail } from './pages/IdeaDetail';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5000 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<ExchangeHome />} />
            <Route path="/submit" element={<IdeaSubmission />} />
            <Route path="/ideas" element={<IdeasList />} />
            <Route path="/ideas/:ideaId" element={<IdeaDetail />} />
            <Route path="/jobs" element={<JobsBoard />} />
            <Route path="/review/:jobId" element={<ReviewPanel />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
