import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cancelIdea, getIdeas } from '../api';
import { formatShortDate, formatUsd, truncateMiddle } from '../lib/formatters';
import { StatusBadge } from '../components/StatusBadge';

export function IdeasList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ideas'],
    queryFn: () => getIdeas(),
    refetchInterval: 10000,
  });

  const cancelMutation = useMutation({
    mutationFn: (ideaId: string) => cancelIdea(ideaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
    },
  });

  const ideas = data?.ideas ?? [];
  const fundedIdeas = ideas.filter(idea => idea.fundingStatus === 'funded');
  const totalBudget = ideas.reduce((sum, idea) => sum + Number(idea.budgetUsd), 0);

  if (isLoading) {
    return (
      <div className="page-shell">
        <div className="surface max-w-3xl">
          <p className="section-kicker">Buyer Ledger</p>
          <h1 className="mt-3 text-3xl font-semibold text-stone-50">Loading posted briefs.</h1>
          <p className="mt-3 text-sm text-stone-400">The ledger is syncing the latest buyer activity.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="surface surface-strong motion-rise">
          <p className="section-kicker">Buyer Ledger</p>
          <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <h1 className="section-title">Track every funded brief, its state, and the queue it spawned.</h1>
              <p className="eyebrow-copy">
                This is the buyer-side ledger: funding status, posted budget, and the direct path into each idea control room.
              </p>
            </div>
            <button className="btn-primary shrink-0" onClick={() => navigate('/submit')}>
              Launch New Brief
            </button>
          </div>
        </div>

        <aside className="surface motion-rise motion-rise-delay-1">
          <p className="section-kicker">Ledger Totals</p>
          <div className="mt-6 grid gap-5">
            <LedgerMetric label="All ideas" value={String(ideas.length).padStart(2, '0')} />
            <LedgerMetric label="Funded" value={String(fundedIdeas.length).padStart(2, '0')} />
            <LedgerMetric label="Budget posted" value={formatUsd(totalBudget)} />
          </div>
        </aside>
      </section>

      {error && (
        <div className="rounded-[1.5rem] border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-200">
          Failed to load ideas: {String(error)}
          <button className="ml-3 text-rose-50 underline underline-offset-4" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}

      {cancelMutation.isError && (
        <div className="rounded-[1.5rem] border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-200">
          Cancel failed: {String(cancelMutation.error)}
        </div>
      )}

      <section className="surface motion-rise motion-rise-delay-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="section-kicker">Posted Ideas</p>
            <h2 className="mt-3 text-2xl font-semibold text-stone-50">Buyer-side inventory</h2>
          </div>
          <button className="btn-secondary" onClick={() => refetch()}>
            Refresh
          </button>
        </div>

        {ideas.length === 0 ? (
          <div className="py-10">
            <p className="text-lg font-medium text-stone-50">No ideas have been funded or drafted yet.</p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-stone-400">
              Open the buyer console to create the first brief and let the planner generate milestone jobs for the queue.
            </p>
            <button className="btn-primary mt-6" onClick={() => navigate('/submit')}>
              Create First Brief
            </button>
          </div>
        ) : (
          <div className="mt-8">
            <div className="hidden grid-cols-[minmax(0,1.4fr)_0.8fr_0.7fr_auto] gap-4 border-b border-white/8 pb-3 text-[11px] uppercase tracking-[0.24em] text-stone-500 md:grid">
              <span>Brief</span>
              <span>Status</span>
              <span>Budget</span>
              <span>Actions</span>
            </div>

            <div className="divide-y divide-white/8">
              {ideas.map(idea => (
                <div key={idea.ideaId} className="grid gap-4 py-5 md:grid-cols-[minmax(0,1.4fr)_0.8fr_0.7fr_auto] md:items-center">
                  <div className="min-w-0">
                    <button
                      className="text-left text-lg font-medium text-stone-100 transition-colors hover:text-[color:var(--accent-strong)]"
                      onClick={() => navigate(`/ideas/${idea.ideaId}`)}
                    >
                      {idea.title}
                    </button>
                    <div className="mt-2 flex flex-wrap gap-3 text-sm text-stone-400">
                      <span>Posted {formatShortDate(idea.createdAt)}</span>
                      <span className="font-mono text-xs text-stone-500">{truncateMiddle(idea.ideaId, 10, 8)}</span>
                    </div>
                  </div>

                  <div>
                    <StatusBadge status={idea.fundingStatus} />
                  </div>

                  <div className="text-sm text-stone-300 md:text-right">
                    <p className="font-medium text-stone-50">{formatUsd(idea.budgetUsd)}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.24em] text-stone-500">escrow budget</p>
                  </div>

                  <div className="flex flex-wrap gap-3 md:justify-end">
                    <button className="btn-secondary px-4 py-2.5" onClick={() => navigate(`/ideas/${idea.ideaId}`)}>
                      Open
                    </button>
                    {['unfunded', 'funded'].includes(idea.fundingStatus) && (
                      <button
                        className="btn-danger px-4 py-2.5"
                        onClick={() => {
                          if (confirm(`Cancel "${idea.title}"? This cannot be undone.`)) {
                            cancelMutation.mutate(idea.ideaId);
                          }
                        }}
                        disabled={cancelMutation.isPending}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function LedgerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-white/8 pb-4 last:border-b-0 last:pb-0">
      <p className="metric-label">{label}</p>
      <p className="metric-value text-right text-2xl md:text-3xl">{value}</p>
    </div>
  );
}
