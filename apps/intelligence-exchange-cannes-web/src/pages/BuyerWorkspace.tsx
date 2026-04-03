import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { getBuyerWorkspace, type BuyerIdeaDetail } from '../api';
import { useBuyerSession } from '../session';

export function BuyerWorkspace() {
  const navigate = useNavigate();
  const { buyerId } = useBuyerSession();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['buyer-workspace', buyerId],
    queryFn: () => getBuyerWorkspace(buyerId),
    refetchInterval: 5000,
  });

  if (isLoading) {
    return <StateShell title="Loading buyer workspace..." />;
  }

  if (error || !data) {
    return (
      <StateShell title="Failed to load buyer workspace">
        <p className="text-gray-400 text-sm font-mono">{String(error || 'Unknown error')}</p>
        <button className="btn-primary" onClick={() => refetch()}>Retry</button>
      </StateShell>
    );
  }

  const { metrics, activeIdeas, reviewIdeas, historyIdeas } = data;

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <section className="card space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-blue-400">Buyer Workspace</p>
              <h1 className="text-3xl font-bold text-white">{buyerId}</h1>
              <p className="text-gray-400 mt-1">Post prompts, monitor agent progress, and release funds only after human review.</p>
            </div>
            <div className="flex gap-3">
              <button className="btn-primary" onClick={() => navigate('/buyer/new')}>Post New Job</button>
              <button className="btn-primary bg-gray-700 hover:bg-gray-600" onClick={() => navigate('/buyer/review')}>
                Open Review Queue
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <MetricCard label="Total Jobs" value={metrics.totalIdeas} />
            <MetricCard label="Active" value={metrics.activeIdeas} />
            <MetricCard label="Needs Review" value={metrics.reviewIdeas} />
            <MetricCard label="Completed" value={metrics.completedIdeas} />
            <MetricCard label="Cancelled" value={metrics.cancelledIdeas} />
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <section className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Posted Jobs</h2>
              <span className="text-sm text-gray-500">{activeIdeas.length} active</span>
            </div>
            {activeIdeas.length === 0 ? (
              <EmptyCard
                title="No active jobs"
                body="Your next prompt will appear here once it is posted."
                cta="Post a job"
                onClick={() => navigate('/buyer/new')}
              />
            ) : (
              <div className="space-y-3">
                {activeIdeas.map((detail) => (
                  <IdeaCard
                    key={detail.idea.ideaId}
                    detail={detail}
                    primaryLabel="Open workspace"
                    onPrimary={() => navigate(`/ideas/${detail.idea.ideaId}`)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-6">
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">Needs Review</h2>
                <button className="text-sm text-blue-400 hover:underline" onClick={() => navigate('/buyer/review')}>
                  View all
                </button>
              </div>
              {reviewIdeas.length === 0 ? (
                <p className="text-sm text-gray-400">No agent submissions are waiting for you right now.</p>
              ) : (
                reviewIdeas.slice(0, 3).map((detail) => (
                  <IdeaCard
                    key={detail.idea.ideaId}
                    detail={detail}
                    primaryLabel="Review output"
                    onPrimary={() => {
                      const submittedJob = detail.jobs.find((job) => job.status === 'submitted');
                      if (submittedJob) navigate(`/review/${submittedJob.jobId}`);
                    }}
                  />
                ))
              )}
            </div>

            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">Recent History</h2>
                <button className="text-sm text-blue-400 hover:underline" onClick={() => navigate('/buyer/history')}>
                  View archive
                </button>
              </div>
              {historyIdeas.length === 0 ? (
                <p className="text-sm text-gray-400">Completed and cancelled jobs will accumulate here.</p>
              ) : (
                historyIdeas.slice(0, 3).map((detail) => (
                  <IdeaCard
                    key={detail.idea.ideaId}
                    detail={detail}
                    primaryLabel="Open record"
                    onPrimary={() => navigate(`/ideas/${detail.idea.ideaId}`)}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StateShell({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card max-w-lg w-full text-center space-y-4">
        <p className="text-lg text-white">{title}</p>
        {children}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}

function EmptyCard({ title, body, cta, onClick }: { title: string; body: string; cta: string; onClick: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/60 p-6 text-center space-y-3">
      <p className="text-lg font-semibold text-white">{title}</p>
      <p className="text-sm text-gray-400">{body}</p>
      <button className="btn-primary" onClick={onClick}>{cta}</button>
    </div>
  );
}

function IdeaCard({
  detail,
  primaryLabel,
  onPrimary,
}: {
  detail: BuyerIdeaDetail;
  primaryLabel: string;
  onPrimary: () => void;
}) {
  const submittedCount = detail.jobs.filter((job) => job.status === 'submitted').length;
  const completedCount = detail.jobs.filter((job) => job.status === 'accepted').length;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">{detail.idea.title}</h3>
          <p className="text-sm text-gray-400">${detail.idea.budgetUsd} USDC · {detail.jobs.length} milestones</p>
        </div>
        <span className="badge bg-gray-800 text-gray-300 uppercase">{detail.idea.statusBucket}</span>
      </div>
      <div className="grid gap-2 text-sm text-gray-400 md:grid-cols-3">
        <span>Funding: <span className="text-white">{detail.idea.fundingStatus}</span></span>
        <span>Needs review: <span className="text-white">{submittedCount}</span></span>
        <span>Accepted: <span className="text-white">{completedCount}</span></span>
      </div>
      <p className="text-sm text-gray-500 line-clamp-2">{detail.idea.prompt}</p>
      <button className="btn-primary" onClick={onPrimary}>{primaryLabel}</button>
    </div>
  );
}
