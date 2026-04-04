import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getJobs } from '../api';

export function BuyerHistory() {
  const navigate = useNavigate();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['jobs', 'accepted'],
    queryFn: () => getJobs('accepted'),
    refetchInterval: 30000,
  });

  const jobs = data?.jobs ?? [];
  const totalReleased = jobs.reduce((sum, j) => sum + parseFloat(j.budgetUsd || '0'), 0);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="spinner" />
          <p className="text-gray-400 text-sm">Loading history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="max-w-3xl mx-auto">
          <div className="card text-center space-y-4 py-10">
            <p className="text-red-400">Failed to load history</p>
            <button className="btn-primary" onClick={() => refetch()}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <button
            className="text-sm text-gray-500 hover:text-gray-300 flex items-center gap-1 mb-2"
            onClick={() => navigate('/workspace')}
          >
            ← Workspace
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white">Payout History</h1>
              <p className="text-gray-400 mt-1">All accepted milestones and released payments.</p>
            </div>
            {jobs.length > 0 && (
              <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-green-400">${totalReleased.toFixed(2)}</p>
                <p className="section-label">Total Released</p>
              </div>
            )}
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="card text-center py-16 space-y-4">
            <div className="text-4xl">📋</div>
            <h2 className="text-xl font-semibold text-white">No payouts yet</h2>
            <p className="text-gray-400 text-sm">Accepted milestones will appear here.</p>
            <button
              className="btn-primary bg-gray-700 hover:bg-gray-600"
              onClick={() => navigate('/workspace')}
            >
              Back to Workspace
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map(job => (
              <div
                key={job.jobId}
                className="card flex flex-col md:flex-row md:items-center gap-4 border-green-900/30"
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold capitalize">{job.milestoneType} Milestone</span>
                    <span className="badge badge-accepted">ACCEPTED</span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                    <span>
                      Idea:{' '}
                      <button
                        className="text-blue-400 hover:underline font-mono"
                        onClick={() => navigate(`/ideas/${job.ideaId}`)}
                      >
                        {job.ideaId.slice(0, 12)}...
                      </button>
                    </span>
                    {job.activeClaimWorkerId && (
                      <span>
                        Worker: <span className="text-gray-400 font-mono">{job.activeClaimWorkerId}</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-green-400 font-bold">${job.budgetUsd} USDC</p>
                  <p className="text-gray-500 text-xs">Arc escrow released</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
