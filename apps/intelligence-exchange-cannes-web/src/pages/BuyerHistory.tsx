import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { getBuyerWorkspace } from '../api';
import { useBuyerSession } from '../session';

export function BuyerHistory() {
  const navigate = useNavigate();
  const { buyerId } = useBuyerSession();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['buyer-history', buyerId],
    queryFn: () => getBuyerWorkspace(buyerId),
    refetchInterval: 10000,
  });

  if (isLoading) {
    return <HistoryState title="Loading buyer history..." />;
  }

  if (error || !data) {
    return (
      <HistoryState title="Failed to load buyer history">
        <button className="btn-primary" onClick={() => refetch()}>Retry</button>
      </HistoryState>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-blue-400">Buyer Archive</p>
            <h1 className="text-3xl font-bold text-white">Completed and cancelled jobs</h1>
            <p className="text-gray-400 mt-1">A truthful record of what shipped, what was cancelled, and which jobs finished the full review path.</p>
          </div>
          <button className="btn-primary bg-gray-700 hover:bg-gray-600" onClick={() => navigate('/buyer')}>
            Back to Workspace
          </button>
        </div>

        {data.historyIdeas.length === 0 ? (
          <HistoryState title="No archived jobs yet">
            <p className="text-sm text-gray-400">Completed and cancelled work will appear here once the first job closes out.</p>
          </HistoryState>
        ) : (
          <div className="space-y-3">
            {data.historyIdeas.map((detail) => {
              const acceptedCount = detail.jobs.filter((job) => job.status === 'accepted').length;
              return (
                <div key={detail.idea.ideaId} className="card flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-semibold text-white">{detail.idea.title}</h2>
                      <span className={`badge ${detail.idea.statusBucket === 'completed' ? 'bg-emerald-900 text-emerald-300' : 'bg-gray-800 text-gray-300'}`}>
                        {detail.idea.statusBucket}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-400">
                      <span>Funding: <span className="text-white">{detail.idea.fundingStatus}</span></span>
                      <span>Accepted milestones: <span className="text-white">{acceptedCount}/{detail.jobs.length}</span></span>
                      <span>Budget: <span className="text-white">${detail.idea.budgetUsd}</span></span>
                    </div>
                  </div>
                  <button className="btn-primary" onClick={() => navigate(`/ideas/${detail.idea.ideaId}`)}>
                    Open Record
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card max-w-xl mx-auto mt-16 text-center space-y-4">
      <p className="text-xl text-white">{title}</p>
      {children}
    </div>
  );
}
