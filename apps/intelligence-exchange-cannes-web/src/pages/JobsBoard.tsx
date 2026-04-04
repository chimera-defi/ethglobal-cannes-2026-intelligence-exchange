import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getJobs } from '../api';
import {
  formatMilestoneLabel,
  formatShortDateTime,
  formatUsd,
  truncateMiddle,
} from '../lib/formatters';
import { StatusBadge } from '../components/StatusBadge';

const STATUS_TABS = ['queued', 'claimed', 'submitted', 'accepted', 'rework'] as const;
type StatusTab = typeof STATUS_TABS[number];

type Job = {
  jobId: string;
  milestoneType: string;
  status: string;
  budgetUsd: string;
  ideaId: string;
  briefId: string;
  leaseExpiry?: string;
  activeClaimWorkerId?: string;
};

export function JobsBoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<StatusTab>('queued');
  const [claimingJobId, setClaimingJobId] = useState<string | null>(null);
  const [claimForm, setClaimForm] = useState({
    workerId: '',
    agentType: 'codex',
    agentVersion: '1.0.0',
  });
  const [claimResult, setClaimResult] = useState<{
    claimId: string;
    expiresAt: string;
    skillMdUrl: string;
  } | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['jobs', activeTab],
    queryFn: () => getJobs(activeTab),
    refetchInterval: 10000,
  });

  const jobs = data?.jobs ?? [];
  const laneBudget = jobs.reduce((sum, job) => sum + Number(job.budgetUsd), 0);
  const liveLeases = jobs.filter(job => ['claimed', 'running'].includes(job.status)).length;
  const activeIdeas = new Set(jobs.map(job => job.ideaId)).size;

  async function handleClaim(jobId: string) {
    if (!claimForm.workerId.trim()) {
      setClaimError('Worker ID is required');
      return;
    }

    setClaimError(null);

    try {
      const broker = import.meta.env.VITE_BROKER_URL ?? '/v1/cannes';
      const response = await fetch(`${broker}/jobs/${jobId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerId: claimForm.workerId,
          agentMetadata: {
            agentType: claimForm.agentType,
            agentVersion: claimForm.agentVersion,
            operatorAddress: '0x0000000000000000000000000000000000000000',
          },
        }),
      });

      const result = (await response.json()) as {
        claimId?: string;
        expiresAt?: string;
        skillMdUrl?: string;
        error?: { message: string };
      };

      if (!response.ok) {
        throw new Error(result.error?.message ?? `HTTP ${response.status}`);
      }

      setClaimResult({
        claimId: result.claimId!,
        expiresAt: result.expiresAt!,
        skillMdUrl: result.skillMdUrl!,
      });
      setClaimingJobId(null);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Claim failed');
    }
  }

  return (
    <div className="page-shell space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="surface surface-strong motion-rise">
          <p className="section-kicker">Worker Queue</p>
          <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <h1 className="section-title">Operate against a visible queue, lease, and review contract.</h1>
              <p className="eyebrow-copy">
                Workers do not need a decorative dashboard. They need the active lane, the claim contract, and the exact route back into review.
              </p>
            </div>
            <Link to="/" className="btn-secondary shrink-0">
              Exchange overview
            </Link>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <QueueNote title="Claim" detail="Worker identity and lease expiry stay attached to the job." />
            <QueueNote title="Execute" detail="The skill document carries the task spec and submission target." />
            <QueueNote title="Review" detail="Submitted work waits for explicit buyer approval before payout." />
          </div>
        </div>

        <aside className="surface motion-rise motion-rise-delay-1">
          <p className="section-kicker">Lane Metrics</p>
          <div className="mt-6 grid gap-5">
            <Metric label="Visible jobs" value={String(jobs.length).padStart(2, '0')} />
            <Metric label="Live leases" value={String(liveLeases).padStart(2, '0')} />
            <Metric label="Ideas represented" value={String(activeIdeas).padStart(2, '0')} />
            <Metric label="Budget in lane" value={formatUsd(laneBudget)} />
          </div>
        </aside>
      </section>

      {claimResult && (
        <section className="surface border-emerald-500/25 bg-emerald-500/10 motion-rise motion-rise-delay-2">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <p className="section-kicker text-emerald-300">Claim recorded</p>
              <h2 className="text-2xl font-semibold text-stone-50">The worker lease is live.</h2>
              <div className="grid gap-3 text-sm text-stone-300 md:grid-cols-2">
                <p>Claim ID: <span className="font-mono text-xs text-stone-100">{claimResult.claimId}</span></p>
                <p>Lease expires: <span className="text-stone-100">{formatShortDateTime(claimResult.expiresAt)}</span></p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href={claimResult.skillMdUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
              >
                Open skill.md
              </a>
              <button className="btn-secondary" onClick={() => setClaimResult(null)}>
                Dismiss
              </button>
            </div>
          </div>
        </section>
      )}

      {claimingJobId && (
        <section className="surface motion-rise motion-rise-delay-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="section-kicker">Claim Lease</p>
              <h2 className="mt-3 text-2xl font-semibold text-stone-50">Attach a worker identity to this job.</h2>
            </div>
            <button
              className="btn-secondary"
              onClick={() => {
                setClaimingJobId(null);
                setClaimError(null);
              }}
            >
              Close
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div>
              <label className="metric-label">Worker ID</label>
              <input
                className="input mt-3"
                placeholder="cannes-worker-001"
                value={claimForm.workerId}
                onChange={event => setClaimForm(current => ({ ...current, workerId: event.target.value }))}
              />
            </div>
            <div>
              <label className="metric-label">Agent type</label>
              <select
                className="input mt-3"
                value={claimForm.agentType}
                onChange={event => setClaimForm(current => ({ ...current, agentType: event.target.value }))}
              >
                <option value="codex">codex</option>
                <option value="claude-code">claude-code</option>
                <option value="gpt-4o">gpt-4o</option>
                <option value="gemini">gemini</option>
                <option value="custom">custom</option>
              </select>
            </div>
            <div>
              <label className="metric-label">Agent version</label>
              <input
                className="input mt-3"
                value={claimForm.agentVersion}
                onChange={event => setClaimForm(current => ({ ...current, agentVersion: event.target.value }))}
              />
            </div>
          </div>

          {claimError && (
            <div className="mt-4 rounded-[1.5rem] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {claimError}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button className="btn-primary" onClick={() => handleClaim(claimingJobId)}>
              Claim Job
            </button>
            <button className="btn-secondary" onClick={() => setClaimingJobId(null)}>
              Cancel
            </button>
          </div>
        </section>
      )}

      <section className="surface motion-rise motion-rise-delay-3">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="section-kicker">Queue Explorer</p>
            <h2 className="mt-3 text-2xl font-semibold text-stone-50">Status lanes</h2>
          </div>
          <div className="flex flex-wrap gap-2 rounded-full border border-white/10 bg-white/5 p-1">
            {STATUS_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setClaimingJobId(null);
                  setClaimResult(null);
                  setClaimError(null);
                }}
                className={`rounded-full px-4 py-2 text-sm font-medium capitalize transition-all duration-300 ${
                  activeTab === tab ? 'bg-white/10 text-stone-50' : 'text-stone-400 hover:text-stone-100'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="py-10 text-sm text-stone-400">Loading the current lane.</div>
        ) : error ? (
          <div className="mt-6 rounded-[1.5rem] border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-200">
            Failed to load jobs: {String(error)}
            <button className="ml-3 text-rose-50 underline underline-offset-4" onClick={() => refetch()}>
              Retry
            </button>
          </div>
        ) : jobs.length === 0 ? (
          <div className="py-10">
            <p className="text-lg font-medium text-stone-50">No {activeTab} jobs are visible right now.</p>
            <p className="mt-2 text-sm leading-6 text-stone-400">
              {activeTab === 'queued'
                ? 'Fund a buyer brief to generate the first milestone jobs.'
                : 'This lane will populate when job states move forward.'}
            </p>
          </div>
        ) : (
          <div className="mt-8">
            <div className="hidden grid-cols-[minmax(0,1.4fr)_0.7fr_0.6fr_auto] gap-4 border-b border-white/8 pb-3 text-[11px] uppercase tracking-[0.24em] text-stone-500 md:grid">
              <span>Job</span>
              <span>Status</span>
              <span>Budget</span>
              <span>Action</span>
            </div>
            <div className="divide-y divide-white/8">
              {jobs.map(job => (
                <JobRow
                  key={job.jobId}
                  job={job}
                  onClaim={() => {
                    setClaimingJobId(job.jobId);
                    setClaimResult(null);
                    setClaimError(null);
                  }}
                  onView={() => navigate(`/review/${job.jobId}`)}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-white/8 pb-4 last:border-b-0 last:pb-0">
      <p className="metric-label">{label}</p>
      <p className="metric-value text-right text-2xl md:text-3xl">{value}</p>
    </div>
  );
}

function QueueNote({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/8 bg-black/15 p-4">
      <p className="metric-label">{title}</p>
      <p className="mt-3 text-sm leading-6 text-stone-300">{detail}</p>
    </div>
  );
}

function JobRow({
  job,
  onClaim,
  onView,
}: {
  job: Job;
  onClaim: () => void;
  onView: () => void;
}) {
  const isClaimable = job.status === 'queued';
  const isReviewable = ['submitted', 'accepted', 'rejected', 'rework'].includes(job.status);
  const isActive = ['claimed', 'running'].includes(job.status);

  return (
    <div className="grid gap-4 py-5 md:grid-cols-[minmax(0,1.4fr)_0.7fr_0.6fr_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-medium text-stone-100">{formatMilestoneLabel(job.milestoneType)} milestone</p>
          {isActive && <StatusBadge status="live" label="Lease live" />}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-sm text-stone-400">
          <span className="font-mono text-xs text-stone-500">{truncateMiddle(job.jobId, 8, 8)}</span>
          <Link to={`/ideas/${job.ideaId}`} className="transition-colors hover:text-stone-100">
            Idea {truncateMiddle(job.ideaId, 6, 6)}
          </Link>
        </div>
        {(job.activeClaimWorkerId || job.leaseExpiry) && (
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-stone-400">
            {job.activeClaimWorkerId && <span>Worker {job.activeClaimWorkerId}</span>}
            {job.leaseExpiry && isActive && <span>Expires {formatShortDateTime(job.leaseExpiry)}</span>}
          </div>
        )}
      </div>

      <StatusBadge status={job.status} />

      <div className="text-sm text-stone-300 md:text-right">
        <p className="font-medium text-stone-50">{formatUsd(job.budgetUsd)}</p>
        <p className="mt-1 text-xs uppercase tracking-[0.24em] text-stone-500">USDC</p>
      </div>

      <div className="flex flex-wrap gap-3 md:justify-end">
        {isClaimable && (
          <button className="btn-primary px-4 py-2.5" onClick={onClaim}>
            Claim
          </button>
        )}
        {isReviewable && (
          <button className="btn-secondary px-4 py-2.5" onClick={onView}>
            {job.status === 'submitted' ? 'Review' : 'Inspect'}
          </button>
        )}
        {!isClaimable && !isReviewable && <span className="text-sm text-stone-500">Waiting</span>}
      </div>
    </div>
  );
}
