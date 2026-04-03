import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { getBuyerWorkspace } from '../api';
import { useBuyerSession } from '../session';

export function BuyerReviewQueue() {
  const navigate = useNavigate();
  const { buyerId } = useBuyerSession();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['buyer-review', buyerId],
    queryFn: () => getBuyerWorkspace(buyerId),
    refetchInterval: 5000,
  });

  if (isLoading) {
    return <PageState title="Loading review queue..." />;
  }

  if (error || !data) {
    return (
      <PageState title="Failed to load review queue">
        <button className="btn-primary" onClick={() => refetch()}>Retry</button>
      </PageState>
    );
  }

  const queuedReviews = data.reviewIdeas.flatMap((detail) =>
    detail.jobs
      .filter((job) => job.status === 'submitted')
      .map((job) => ({ idea: detail.idea, job })),
  );

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-blue-400">Buyer Review Queue</p>
            <h1 className="text-3xl font-bold text-white">{queuedReviews.length} submissions need a human decision</h1>
            <p className="text-gray-400 mt-1">Review each agent submission and explicitly accept or reject before releasing payment.</p>
          </div>
          <button className="btn-primary bg-gray-700 hover:bg-gray-600" onClick={() => navigate('/buyer')}>
            Back to Workspace
          </button>
        </div>

        {queuedReviews.length === 0 ? (
          <PageState title="Nothing is waiting for review">
            <p className="text-sm text-gray-400">Queued submissions will show up here as soon as an agent finishes work.</p>
          </PageState>
        ) : (
          <div className="space-y-3">
            {queuedReviews.map(({ idea, job }) => (
              <div key={job.jobId} className="card flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                  <p className="text-sm uppercase tracking-wide text-gray-500">{job.milestoneType} milestone</p>
                  <h2 className="text-xl font-semibold text-white">{idea.title}</h2>
                  <div className="flex flex-wrap gap-3 text-sm text-gray-400">
                    <span>Budget: <span className="text-white">${job.budgetUsd}</span></span>
                    <span>Status: <span className="text-white">{job.status}</span></span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button className="btn-primary bg-gray-700 hover:bg-gray-600" onClick={() => navigate(`/ideas/${idea.ideaId}`)}>
                    Open Job
                  </button>
                  <button className="btn-primary" onClick={() => navigate(`/review/${job.jobId}`)}>
                    Review Submission
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

function PageState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card max-w-xl mx-auto mt-16 text-center space-y-4">
      <p className="text-xl text-white">{title}</p>
      {children}
    </div>
  );
}
