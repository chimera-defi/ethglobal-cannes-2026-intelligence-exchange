import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getIdea } from '../api';
import {
  formatMilestoneLabel,
  formatShortDate,
  formatShortDateTime,
  formatUsd,
  truncateMiddle,
} from '../lib/formatters';
import { StatusBadge } from '../components/StatusBadge';

const MILESTONES = [
  { type: 'brief', detail: 'Planner creates the operating brief and worker rubric.' },
  { type: 'tasks', detail: 'Task decomposition becomes executable job segments.' },
  { type: 'scaffold', detail: 'Implementation artifact is produced against the brief.' },
  { type: 'review', detail: 'Human reviewer accepts or sends the output back.' },
] as const;

export function IdeaDetail() {
  const { ideaId } = useParams<{ ideaId: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['idea', ideaId],
    queryFn: () => getIdea(ideaId!),
    enabled: !!ideaId,
    refetchInterval: 8000,
  });

  if (!ideaId) {
    return (
      <div className="page-shell">
        <div className="surface max-w-2xl">
          <p className="section-kicker">Idea Control Room</p>
          <h1 className="mt-3 text-3xl font-semibold text-stone-50">No idea ID was provided.</h1>
          <button className="btn-primary mt-6" onClick={() => navigate('/submit')}>
            Open Buyer Console
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="page-shell">
        <div className="surface max-w-3xl">
          <p className="section-kicker">Idea Control Room</p>
          <h1 className="mt-3 text-3xl font-semibold text-stone-50">Loading the funded brief.</h1>
          <p className="mt-3 text-sm text-stone-400">Milestones, escrow metadata, and job states are syncing.</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-shell">
        <div className="surface max-w-3xl border-rose-500/30 bg-rose-500/10">
          <p className="section-kicker text-rose-300">Idea Control Room</p>
          <h1 className="mt-3 text-3xl font-semibold text-stone-50">Failed to load this idea.</h1>
          <p className="mt-3 break-all font-mono text-sm text-rose-100/90">{String(error || 'Unknown error')}</p>
          <button className="btn-primary mt-6" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { idea, brief, jobs } = data;
  const jobsByMilestone = MILESTONES.map(item => ({
    ...item,
    job: jobs.find(job => job.milestoneType === item.type),
  }));
  const acceptedCount = jobs.filter(job => job.status === 'accepted').length;
  const activeCount = jobs.filter(job => ['claimed', 'running', 'submitted'].includes(job.status)).length;
  const allAccepted = jobs.length > 0 && jobs.every(job => job.status === 'accepted');

  return (
    <div className="page-shell space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="surface surface-strong motion-rise">
          <button
            className="text-sm font-medium text-stone-400 transition-colors hover:text-stone-100"
            onClick={() => navigate('/ideas')}
          >
            Back to buyer ledger
          </button>

          <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <p className="section-kicker">Idea Control Room</p>
              <h1 className="section-title break-words">{idea.title}</h1>
              <p className="eyebrow-copy">
                Posted {formatShortDate(idea.createdAt)}. This surface keeps the brief, milestone queue, and review state readable in one place.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <StatusBadge status={idea.fundingStatus} />
              {allAccepted && <StatusBadge status="complete" />}
              {activeCount > 0 && <StatusBadge status="live" label={`${activeCount} live`} />}
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <SummaryPanel label="Escrow budget" value={formatUsd(idea.budgetUsd)} />
            <SummaryPanel label="Accepted milestones" value={`${acceptedCount}/${jobs.length || 0}`} />
            <SummaryPanel label="Idea ID" value={truncateMiddle(idea.ideaId, 8, 8)} mono />
          </div>
        </div>

        <aside className="surface motion-rise motion-rise-delay-1 xl:sticky xl:top-28">
          <p className="section-kicker">Lifecycle Rail</p>
          <h2 className="mt-3 text-2xl font-semibold text-stone-50">Funding and review state</h2>

          <div className="mt-6 grid gap-4">
            <LifecycleMetric label="Funding" detail="Arc holds spend until a reviewer explicitly accepts the output.">
              <StatusBadge status={idea.fundingStatus} />
            </LifecycleMetric>
            <LifecycleMetric label="Planner" detail={brief ? 'Build brief generated and job graph is live.' : 'Planner has not generated the brief yet.'}>
              <StatusBadge status={brief ? 'accepted' : 'queued'} label={brief ? 'Ready' : 'Pending'} />
            </LifecycleMetric>
            <LifecycleMetric label="Queue health" detail={`${jobs.length} milestones are attached to this idea.`}>
              <StatusBadge status={activeCount > 0 ? 'live' : 'queued'} label={activeCount > 0 ? 'Active' : 'Idle'} />
            </LifecycleMetric>
          </div>

          {idea.escrowTxHash && (
            <div className="surface-line mt-6 pt-6">
              <p className="metric-label">Escrow transaction</p>
              <p className="mt-3 break-all font-mono text-xs leading-6 text-stone-400">{idea.escrowTxHash}</p>
            </div>
          )}

          <div className="surface-line mt-6 pt-6">
            <p className="metric-label">Next actions</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="btn-secondary px-4 py-2.5" onClick={() => navigate('/jobs')}>
                Open Queue
              </button>
              <button className="btn-secondary px-4 py-2.5" onClick={() => navigate('/submit')}>
                New Brief
              </button>
            </div>
          </div>
        </aside>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="surface motion-rise motion-rise-delay-2">
          <p className="section-kicker">Original Brief</p>
          <h2 className="mt-3 text-2xl font-semibold text-stone-50">Buyer prompt</h2>
          <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-stone-300">{idea.prompt}</p>
        </div>

        <div className="surface motion-rise motion-rise-delay-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="section-kicker">Planner Output</p>
              <h2 className="mt-3 text-2xl font-semibold text-stone-50">Build brief</h2>
            </div>
            {brief && <StatusBadge status="accepted" label="Generated" />}
          </div>

          {brief ? (
            <div className="mt-5 space-y-5">
              <p className="text-sm leading-7 text-stone-300">{brief.summary}</p>
              {brief.dossierUri && (
                <div className="rounded-[1.5rem] border border-white/8 bg-black/15 p-4">
                  <p className="metric-label">0G dossier</p>
                  <p className="mt-3 break-all font-mono text-xs leading-6 text-stone-400">{brief.dossierUri}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-5 text-sm leading-6 text-stone-400">
              The planner has not produced a build brief yet. Once funding completes, this panel becomes the source of milestone structure.
            </p>
          )}
        </div>
      </section>

      <section className="surface">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="section-kicker">Milestone Queue</p>
            <h2 className="mt-3 text-2xl font-semibold text-stone-50">State and action inspector</h2>
          </div>
          <p className="text-sm text-stone-400">{acceptedCount} accepted · {activeCount} active or awaiting review</p>
        </div>

        <div className="mt-8 divide-y divide-white/8">
          {jobsByMilestone.map((item, index) => (
            <MilestoneRow
              key={item.type}
              index={index + 1}
              milestoneType={item.type}
              detail={item.detail}
              job={item.job}
              onReview={() => item.job && navigate(`/review/${item.job.jobId}`)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function SummaryPanel({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[1.6rem] border border-white/8 bg-black/15 p-4">
      <p className="metric-label">{label}</p>
      <p className={`mt-3 text-xl font-semibold text-stone-50 ${mono ? 'font-mono text-sm' : ''}`}>{value}</p>
    </div>
  );
}

function LifecycleMetric({
  label,
  detail,
  children,
}: {
  label: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/8 bg-black/15 px-4 py-4">
      <div className="flex items-center justify-between gap-4">
        <p className="metric-label">{label}</p>
        {children}
      </div>
      <p className="mt-3 text-sm leading-6 text-stone-300">{detail}</p>
    </div>
  );
}

function MilestoneRow({
  index,
  milestoneType,
  detail,
  job,
  onReview,
}: {
  index: number;
  milestoneType: string;
  detail: string;
  job?: { jobId: string; milestoneType: string; status: string; budgetUsd: string; leaseExpiry?: string };
  onReview: () => void;
}) {
  if (!job) {
    return (
      <div className="grid gap-4 py-5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/8 bg-black/15 text-sm font-semibold text-stone-400">
          {String(index).padStart(2, '0')}
        </div>
        <div>
          <p className="text-lg font-medium text-stone-100">{formatMilestoneLabel(milestoneType)}</p>
          <p className="mt-2 text-sm leading-6 text-stone-400">{detail}</p>
        </div>
        <StatusBadge status="queued" label="Pending" />
      </div>
    );
  }

  const canReview = ['submitted', 'accepted', 'rejected', 'rework'].includes(job.status);
  const isActive = ['claimed', 'running'].includes(job.status);

  return (
    <div className="grid gap-4 py-5 md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:items-center">
      <div className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold ${
        isActive
          ? 'border-blue-400/30 bg-blue-400/10 text-blue-100'
          : job.status === 'accepted'
            ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
            : 'border-white/8 bg-black/15 text-stone-300'
      }`}>
        {String(index).padStart(2, '0')}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-medium text-stone-100">{formatMilestoneLabel(milestoneType)}</p>
          {isActive && <StatusBadge status="live" label="Lease live" />}
        </div>
        <p className="mt-2 text-sm leading-6 text-stone-400">{detail}</p>
        <div className="mt-2 flex flex-wrap gap-3 text-sm text-stone-400">
          <span>{formatUsd(job.budgetUsd)}</span>
          <span className="font-mono text-xs text-stone-500">{truncateMiddle(job.jobId, 8, 8)}</span>
          {job.leaseExpiry && isActive && <span>Lease expires {formatShortDateTime(job.leaseExpiry)}</span>}
        </div>
      </div>

      <StatusBadge status={job.status} />

      {canReview ? (
        <button className="btn-secondary px-4 py-2.5" onClick={onReview}>
          {job.status === 'submitted' ? 'Review' : 'Inspect'}
        </button>
      ) : (
        <div className="text-sm text-stone-500">Awaiting output</div>
      )}
    </div>
  );
}
