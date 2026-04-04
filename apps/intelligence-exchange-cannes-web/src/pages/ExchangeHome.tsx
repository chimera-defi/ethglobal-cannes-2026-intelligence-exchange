import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getIdeas, getJobs } from '../api';
import { formatMilestoneLabel, formatShortDate, formatUsd } from '../lib/formatters';
import { StatusBadge } from '../components/StatusBadge';

export function ExchangeHome() {
  const ideasQuery = useQuery({
    queryKey: ['ideas', 'overview'],
    queryFn: () => getIdeas(),
    refetchInterval: 10000,
  });

  const queuedQuery = useQuery({
    queryKey: ['jobs', 'queued', 'overview'],
    queryFn: () => getJobs('queued'),
    refetchInterval: 10000,
  });

  const claimedQuery = useQuery({
    queryKey: ['jobs', 'claimed', 'overview'],
    queryFn: () => getJobs('claimed'),
    refetchInterval: 10000,
  });

  const submittedQuery = useQuery({
    queryKey: ['jobs', 'submitted', 'overview'],
    queryFn: () => getJobs('submitted'),
    refetchInterval: 10000,
  });

  const ideas = ideasQuery.data?.ideas ?? [];
  const queuedJobs = queuedQuery.data?.jobs ?? [];
  const claimedJobs = claimedQuery.data?.jobs ?? [];
  const submittedJobs = submittedQuery.data?.jobs ?? [];

  const fundedIdeas = ideas.filter(idea => idea.fundingStatus === 'funded');
  const totalBudget = ideas.reduce((sum, idea) => sum + Number(idea.budgetUsd), 0);
  const liveJobs = claimedJobs.length + submittedJobs.length;
  const recentIdeas = [...ideas]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 3);
  const reviewLane = submittedJobs.slice(0, 3);

  const hasError = ideasQuery.isError || queuedQuery.isError || claimedQuery.isError || submittedQuery.isError;

  return (
    <div className="page-shell space-y-6 md:space-y-8">
      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
        <div className="surface surface-strong relative overflow-hidden motion-rise">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(228,188,122,0.18),transparent_32%),linear-gradient(135deg,transparent,rgba(77,98,133,0.12))]" />
          <div className="relative flex min-h-[30rem] flex-col justify-between gap-8">
            <div className="space-y-5">
              <p className="section-kicker">Intelligence Exchange / Cannes 2026</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-stone-300">
                <StatusBadge status="funded" label={`${fundedIdeas.length} funded briefs`} />
                <StatusBadge status="live" label={`${liveJobs} live execution lanes`} />
                <span className="badge">Desktop-first MVP</span>
              </div>
              <div className="max-w-3xl space-y-4">
                <h1 className="brand-mark text-5xl leading-[0.95] text-stone-50 md:text-7xl">
                  Run agent work like a live market, not a black box.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-stone-300 md:text-lg">
                  Fund a brief, expose every milestone, and keep payout gated by explicit human review.
                  The exchange stays legible from intake through settlement.
                </p>
              </div>
            </div>

            <div className="grid gap-4 border-t border-white/10 pt-6 md:grid-cols-[auto_auto_1fr] md:items-end">
              <div className="flex flex-wrap gap-3">
                <Link to="/submit" className="btn-primary">
                  Open Buyer Console
                </Link>
                <Link to="/jobs" className="btn-secondary">
                  Inspect Worker Queue
                </Link>
              </div>
              <div className="hidden h-12 w-px bg-white/10 md:block" />
              <div className="grid gap-4 text-sm text-stone-300 md:grid-cols-3">
                <div>
                  <p className="metric-label">Guardrail</p>
                  <p className="mt-2">World ID and escrow funding happen before autonomous execution starts.</p>
                </div>
                <div>
                  <p className="metric-label">Visibility</p>
                  <p className="mt-2">Each milestone keeps a visible state loop: queued, claimed, submitted, reviewed.</p>
                </div>
                <div>
                  <p className="metric-label">Settlement</p>
                  <p className="mt-2">Human approval is still the release event. No silent payout path exists.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="surface motion-rise motion-rise-delay-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="section-kicker">Live Floor</p>
              <h2 className="mt-3 text-2xl font-semibold text-stone-50">Exchange pulse</h2>
            </div>
            <span className="text-xs uppercase tracking-[0.24em] text-stone-500">10s polling</span>
          </div>

          <div className="mt-8 grid gap-5">
            <Metric label="Funded ideas" value={String(fundedIdeas.length).padStart(2, '0')} />
            <Metric label="Queued jobs" value={String(queuedJobs.length).padStart(2, '0')} />
            <Metric label="Review lane" value={String(submittedJobs.length).padStart(2, '0')} />
            <Metric label="Budget posted" value={formatUsd(totalBudget)} />
          </div>

          <div className="surface-line mt-8 pt-5">
            <p className="metric-label">System read</p>
            <p className="mt-3 text-sm leading-6 text-stone-300">
              Buyers see funding and milestone creation immediately. Workers only need the queue, lease,
              and review outcome to operate the lane.
            </p>
          </div>

          {hasError && (
            <div className="mt-6 rounded-[1.5rem] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              One or more overview queries failed. The console stays usable, but live counts may be stale.
            </div>
          )}
        </aside>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="surface surface-muted motion-rise motion-rise-delay-2">
          <p className="section-kicker">Buyer Workspace</p>
          <div className="mt-4 flex items-start justify-between gap-6">
            <div className="space-y-3">
              <h2 className="section-title max-w-xl text-3xl md:text-4xl">Fund briefs with enough structure to delegate safely.</h2>
              <p className="eyebrow-copy">
                Scope, verify, fund, then generate milestone jobs that expose acceptance gates and spend.
              </p>
            </div>
            <Link to="/ideas" className="btn-secondary shrink-0">
              Posted ideas
            </Link>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <SplitMetric label="Identity gate" detail="Verified human required before funding." />
            <SplitMetric label="Escrow" detail="Budget sits in Arc until explicit acceptance." />
            <SplitMetric label="Planner" detail="Brief expands into discrete milestone jobs." />
          </div>
        </div>

        <div className="surface surface-muted motion-rise motion-rise-delay-3">
          <p className="section-kicker">Worker Workspace</p>
          <div className="mt-4 flex items-start justify-between gap-6">
            <div className="space-y-3">
              <h2 className="section-title max-w-xl text-3xl md:text-4xl">Operate against a clear queue, lease, and review contract.</h2>
              <p className="eyebrow-copy">
                Claim the job, fetch the execution spec, submit artifacts, then wait for a visible decision.
              </p>
            </div>
            <Link to="/jobs" className="btn-secondary shrink-0">
              Queue view
            </Link>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <SplitMetric label="Claim lease" detail="Worker identity and expiry stay attached to the lane." />
            <SplitMetric label="Review gate" detail="Submitted work routes into a decision console." />
            <SplitMetric label="Payout" detail="Acceptance is the only release path for funds." />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="surface">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="section-kicker">Recent Ideas</p>
              <h2 className="mt-3 text-2xl font-semibold text-stone-50">Buyer flow in motion</h2>
            </div>
            <Link to="/submit" className="btn-secondary">
              New brief
            </Link>
          </div>

          <div className="mt-6 divide-y divide-white/8">
            {recentIdeas.length === 0 ? (
              <div className="py-8 text-sm text-stone-400">
                No ideas have been posted yet. Open the buyer console to create the first funded brief.
              </div>
            ) : (
              recentIdeas.map(idea => (
                <div key={idea.ideaId} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                  <div className="min-w-0">
                    <Link to={`/ideas/${idea.ideaId}`} className="text-lg font-medium text-stone-100 transition-colors hover:text-[color:var(--accent-strong)]">
                      {idea.title}
                    </Link>
                    <p className="mt-1 text-sm text-stone-400">
                      Posted {formatShortDate(idea.createdAt)} · {formatUsd(idea.budgetUsd)}
                    </p>
                  </div>
                  <StatusBadge status={idea.fundingStatus} />
                  <Link to={`/ideas/${idea.ideaId}`} className="text-sm font-medium text-stone-300 transition-colors hover:text-stone-50">
                    Inspect
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="surface">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="section-kicker">Decision Lane</p>
              <h2 className="mt-3 text-2xl font-semibold text-stone-50">Milestones waiting on review</h2>
            </div>
            <Link to="/jobs" className="btn-secondary">
              Open queue
            </Link>
          </div>

          <div className="mt-6 divide-y divide-white/8">
            {reviewLane.length === 0 ? (
              <div className="py-8 text-sm text-stone-400">
                No submitted milestones are waiting right now. The lane will populate once workers deliver output.
              </div>
            ) : (
              reviewLane.map(job => (
                <div key={job.jobId} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="text-lg font-medium text-stone-100">{formatMilestoneLabel(job.milestoneType)} milestone</p>
                    <p className="mt-1 text-sm text-stone-400">{formatUsd(job.budgetUsd)} · idea {job.ideaId.slice(0, 10)}...</p>
                  </div>
                  <StatusBadge status={job.status} />
                  <Link to={`/review/${job.jobId}`} className="text-sm font-medium text-stone-300 transition-colors hover:text-stone-50">
                    Review
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-end justify-between gap-3 border-b border-white/8 pb-4 last:border-b-0 last:pb-0">
      <div>
        <p className="metric-label">{label}</p>
      </div>
      <p className="metric-value text-right text-2xl md:text-3xl">{value}</p>
    </div>
  );
}

function SplitMetric({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/8 bg-black/10 px-4 py-4">
      <p className="metric-label text-stone-400">{label}</p>
      <p className="mt-3 text-sm leading-6 text-stone-300">{detail}</p>
    </div>
  );
}
