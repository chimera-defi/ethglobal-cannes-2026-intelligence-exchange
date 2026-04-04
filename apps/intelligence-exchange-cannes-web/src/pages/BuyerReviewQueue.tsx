import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getJobs } from '../api';

export function BuyerReviewQueue() {
  const navigate = useNavigate();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['jobs', 'submitted'],
    queryFn: () => getJobs('submitted'),
    refetchInterval: 8000,
  });

  const jobs = data?.jobs ?? [];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="spinner" />
          <p className="text-gray-400 text-sm">Loading review queue...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="max-w-3xl mx-auto">
          <div className="card text-center space-y-4 py-10">
            <p className="text-red-400">Failed to load review queue</p>
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
              <h1 className="text-3xl font-bold text-white">Review Queue</h1>
              <p className="text-gray-400 mt-1">
                {jobs.length === 0
                  ? 'All caught up.'
                  : `${jobs.length} milestone${jobs.length !== 1 ? 's' : ''} awaiting your review.`}
              </p>
            </div>
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="card text-center py-16 space-y-4">
            <p className="text-4xl">✓</p>
            <h2 className="text-xl font-semibold text-white">All caught up!</h2>
            <p className="text-gray-400 text-sm">No milestones are waiting for review right now.</p>
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
                className="card flex flex-col md:flex-row md:items-center gap-4 border-purple-900/40 hover:border-purple-700/60 transition-colors"
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold capitalize">{job.milestoneType} Milestone</span>
                    <span className="badge badge-submitted">SUBMITTED</span>
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
                    <span className="font-mono text-gray-600">{job.jobId.slice(0, 12)}...</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-green-400 font-bold">${job.budgetUsd}</p>
                    <p className="text-gray-500 text-xs">USDC</p>
                  </div>
                  <button
                    className="btn-primary bg-purple-700 hover:bg-purple-600 text-sm"
                    onClick={() => navigate(`/review/${job.jobId}`)}
                  >
                    Review →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
