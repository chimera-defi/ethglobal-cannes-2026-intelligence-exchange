import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getIdeas, getJobs } from '../api';

export function BuyerWorkspace() {
  const navigate = useNavigate();

  const ideasQuery = useQuery({
    queryKey: ['ideas'],
    queryFn: () => getIdeas(),
    refetchInterval: 15000,
  });

  const pendingQuery = useQuery({
    queryKey: ['jobs', 'submitted'],
    queryFn: () => getJobs('submitted'),
    refetchInterval: 8000,
  });

  const ideas = ideasQuery.data?.ideas ?? [];
  const pendingJobs = pendingQuery.data?.jobs ?? [];
  const pendingCount = pendingQuery.data?.count ?? pendingJobs.length;

  const totalFunded = ideas
    .filter(i => i.fundingStatus === 'funded')
    .reduce((sum, i) => sum + parseFloat(i.budgetUsd || '0'), 0);

  const isLoading = ideasQuery.isLoading && pendingQuery.isLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="spinner" />
          <p className="text-gray-400 text-sm">Loading workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Buyer Workspace</h1>
          <p className="text-gray-400 mt-1">Track your ideas, review agent work, and release payments.</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card text-center space-y-1">
            <p className="text-3xl font-bold text-white">{ideas.length}</p>
            <p className="section-label">Ideas Posted</p>
          </div>
          <div className={`card text-center space-y-1 ${pendingCount > 0 ? 'border-purple-800' : ''}`}>
            <p className={`text-3xl font-bold ${pendingCount > 0 ? 'text-purple-300' : 'text-white'}`}>
              {pendingCount}
            </p>
            <p className="section-label">Pending Reviews</p>
          </div>
          <div className="card text-center space-y-1">
            <p className="text-3xl font-bold text-green-400">${totalFunded.toFixed(0)}</p>
            <p className="section-label">USDC Funded</p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-3 flex-wrap">
          <button className="btn-primary" onClick={() => navigate('/submit')}>
            + Post New Idea
          </button>
          <button
            className={`btn-primary ${pendingCount > 0 ? 'bg-purple-700 hover:bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
            onClick={() => navigate('/workspace/review')}
          >
            Review Queue {pendingCount > 0 && `(${pendingCount})`}
          </button>
          <button
            className="btn-primary bg-gray-700 hover:bg-gray-600"
            onClick={() => navigate('/workspace/history')}
          >
            Payout History →
          </button>
        </div>

        {/* Main split */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pending reviews */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Pending Reviews</h2>
              {pendingCount > 3 && (
                <button
                  className="text-sm text-blue-400 hover:text-blue-300"
                  onClick={() => navigate('/workspace/review')}
                >
                  View all {pendingCount} →
                </button>
              )}
            </div>
            {pendingJobs.length === 0 ? (
              <div className="card text-center py-8 space-y-2">
                <p className="text-2xl">✓</p>
                <p className="text-gray-400 text-sm">All caught up — no pending reviews.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingJobs.slice(0, 3).map(job => (
                  <div key={job.jobId} className="card flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0 space-y-1">
                      <p className="text-white font-medium capitalize text-sm">{job.milestoneType} Milestone</p>
                      <p className="text-gray-500 text-xs font-mono">{job.jobId.slice(0, 12)}...</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-green-400 font-bold text-sm">${job.budgetUsd}</span>
                      <button
                        className="btn-primary bg-purple-700 hover:bg-purple-600 text-sm px-3 py-1.5"
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

          {/* Recent ideas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Recent Ideas</h2>
              {ideas.length > 5 && (
                <button
                  className="text-sm text-blue-400 hover:text-blue-300"
                  onClick={() => navigate('/ideas')}
                >
                  View all →
                </button>
              )}
            </div>
            {ideas.length === 0 ? (
              <div className="card text-center py-8 space-y-3">
                <p className="text-gray-400 text-sm">No ideas posted yet.</p>
                <button className="btn-primary text-sm" onClick={() => navigate('/submit')}>
                  Post Your First Idea →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {ideas.slice(0, 5).map(idea => (
                  <div
                    key={idea.ideaId}
                    className="card flex items-center justify-between gap-4 py-4 cursor-pointer hover:border-gray-700 transition-colors"
                    onClick={() => navigate(`/ideas/${idea.ideaId}`)}
                  >
                    <div className="min-w-0">
                      <p className="text-white font-medium text-sm truncate">{idea.title}</p>
                      <p className="text-gray-500 text-xs mt-0.5">
                        ${idea.budgetUsd} · {new Date(idea.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`badge badge-${idea.fundingStatus} shrink-0`}>
                      {idea.fundingStatus.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
