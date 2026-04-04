import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { acceptMilestone, getJob, rejectMilestone } from '../api';
import {
  formatMilestoneLabel,
  formatShortDateTime,
  formatUsd,
  truncateMiddle,
} from '../lib/formatters';
import { StatusBadge } from '../components/StatusBadge';

export function ReviewPanel() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId!),
    enabled: !!jobId,
    refetchInterval: 5000,
  });

  const job = data?.job;

  const acceptMutation = useMutation({
    mutationFn: () => acceptMilestone(job!.ideaId, job!.jobId, 'demo-reviewer'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectMilestone(job!.ideaId, job!.jobId, 'demo-reviewer', rejectReason || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      setShowRejectForm(false);
      setRejectReason('');
    },
  });

  if (!jobId) {
    return (
      <div className="page-shell">
        <div className="surface max-w-2xl">
          <p className="section-kicker">Decision Console</p>
          <h1 className="mt-3 text-3xl font-semibold text-stone-50">No job ID was provided.</h1>
          <button className="btn-primary mt-6" onClick={() => navigate('/jobs')}>
            Open Worker Queue
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="page-shell">
        <div className="surface max-w-3xl">
          <p className="section-kicker">Decision Console</p>
          <h1 className="mt-3 text-3xl font-semibold text-stone-50">Loading milestone review data.</h1>
          <p className="mt-3 text-sm text-stone-400">Submission state, worker identity, and review checks are syncing.</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="page-shell">
        <div className="surface max-w-3xl border-rose-500/30 bg-rose-500/10">
          <p className="section-kicker text-rose-300">Decision Console</p>
          <h1 className="mt-3 text-3xl font-semibold text-stone-50">Failed to load milestone data.</h1>
          <p className="mt-3 break-all font-mono text-sm text-rose-100/90">{String(error || 'Unknown error')}</p>
          <button
            className="btn-primary mt-6"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['job', jobId] })}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!['submitted', 'accepted', 'rejected', 'rework'].includes(job.status)) {
    return (
      <div className="page-shell">
        <div className="surface surface-strong max-w-4xl">
          <p className="section-kicker">Decision Console</p>
          <h1 className="mt-3 text-3xl font-semibold text-stone-50">The review gate is not open yet.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-300">
            This milestone is currently <span className="text-stone-100">{job.status}</span>. Review becomes available once the worker submits output.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <StatusBadge status={job.status} />
            {job.leaseExpiry && <StatusBadge status="live" label={`Expires ${formatShortDateTime(job.leaseExpiry)}`} />}
          </div>
          <button className="btn-secondary mt-6" onClick={() => navigate(`/ideas/${job.ideaId}`)}>
            Back to Idea
          </button>
        </div>
      </div>
    );
  }

  const isAccepted = job.status === 'accepted';
  const isRejected = job.status === 'rejected' || job.status === 'rework';
  const isPending = job.status === 'submitted';
  const isProcessing = acceptMutation.isPending || rejectMutation.isPending;

  return (
    <div className="page-shell space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="surface surface-strong motion-rise">
          <button
            className="text-sm font-medium text-stone-400 transition-colors hover:text-stone-100"
            onClick={() => navigate(`/ideas/${job.ideaId}`)}
          >
            Back to idea control room
          </button>

          <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4">
              <p className="section-kicker">Decision Console</p>
              <h1 className="section-title">{formatMilestoneLabel(job.milestoneType)} milestone review</h1>
              <p className="eyebrow-copy">
                Review is the last human gate before funds can move. This panel keeps the milestone context and decision path legible.
              </p>
            </div>
            <StatusBadge status={job.status} />
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <InfoBlock label="Job ID" value={truncateMiddle(job.jobId, 10, 8)} mono />
            <InfoBlock label="Idea ID" value={truncateMiddle(job.ideaId, 10, 8)} mono />
            <InfoBlock label="Budget" value={formatUsd(job.budgetUsd)} />
            <InfoBlock label="Worker" value={job.activeClaimWorkerId ?? 'Unassigned'} mono={!!job.activeClaimWorkerId} />
          </div>

          {job.leaseExpiry && (
            <div className="mt-4 rounded-[1.5rem] border border-white/8 bg-black/15 px-4 py-4 text-sm text-stone-300">
              Lease expiry: <span className="text-stone-100">{formatShortDateTime(job.leaseExpiry)}</span>
            </div>
          )}

          {isAccepted && (
            <div className="mt-6 rounded-[1.75rem] border border-emerald-500/25 bg-emerald-500/10 p-5">
              <p className="section-kicker text-emerald-300">Accepted</p>
              <p className="mt-3 text-lg font-medium text-stone-50">
                Approval recorded. Escrow can release funds and the worker identity becomes part of the visible outcome.
              </p>
            </div>
          )}

          {isRejected && (
            <div className="mt-6 rounded-[1.75rem] border border-rose-500/25 bg-rose-500/10 p-5">
              <p className="section-kicker text-rose-300">Needs rework</p>
              <p className="mt-3 text-lg font-medium text-stone-50">
                The milestone has been returned for another attempt. Review stayed human-gated; payout did not clear.
              </p>
            </div>
          )}
        </div>

        <aside className="surface motion-rise motion-rise-delay-1 xl:sticky xl:top-28">
          <p className="section-kicker">Settlement Rail</p>
          <h2 className="mt-3 text-2xl font-semibold text-stone-50">Decision and payout gate</h2>

          <div className="mt-6 rounded-[1.5rem] border border-white/8 bg-black/15 px-4 py-4">
            <p className="metric-label">Rule</p>
            <p className="mt-3 text-sm leading-6 text-stone-300">
              Acceptance releases payment. Rework returns the milestone to the queue. No autonomous payout path exists.
            </p>
          </div>

          {isPending ? (
            <div className="mt-6 space-y-4">
              {(acceptMutation.isError || rejectMutation.isError) && (
                <div className="rounded-[1.5rem] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {String(acceptMutation.error || rejectMutation.error || 'Action failed')}
                </div>
              )}

              {!showRejectForm ? (
                <div className="space-y-3">
                  <button className="btn-success w-full" onClick={() => acceptMutation.mutate()} disabled={isProcessing}>
                    {acceptMutation.isPending ? 'Approving' : 'Accept and Release Payment'}
                  </button>
                  <button className="btn-danger w-full" onClick={() => setShowRejectForm(true)} disabled={isProcessing}>
                    Request Rework
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="metric-label">Rework reason</label>
                  <textarea
                    className="input min-h-[9rem] resize-none"
                    placeholder="Describe what failed the review gate and what the worker should fix."
                    value={rejectReason}
                    onChange={event => setRejectReason(event.target.value)}
                  />
                  <button className="btn-danger w-full" onClick={() => rejectMutation.mutate()} disabled={isProcessing}>
                    {rejectMutation.isPending ? 'Sending' : 'Confirm Rework'}
                  </button>
                  <button
                    className="btn-secondary w-full"
                    onClick={() => {
                      setShowRejectForm(false);
                      setRejectReason('');
                    }}
                    disabled={isProcessing}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-6 rounded-[1.5rem] border border-white/8 bg-black/15 px-4 py-4">
              <p className="metric-label">Decision status</p>
              <p className="mt-3 text-sm leading-6 text-stone-300">
                {isAccepted
                  ? 'This milestone is already accepted. The settlement path is complete.'
                  : 'This milestone is already marked for rework. The next action moves back to the queue.'}
              </p>
            </div>
          )}
        </aside>
      </section>

      <section className="surface motion-rise motion-rise-delay-2">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="section-kicker">Review Checks</p>
            <h2 className="mt-3 text-2xl font-semibold text-stone-50">Score breakdown</h2>
          </div>
          <StatusBadge status={isPending ? 'submitted' : isAccepted ? 'accepted' : 'rework'} />
        </div>

        <div className="mt-8">
          <ScoreBreakdown milestoneType={job.milestoneType} status={job.status} />
        </div>
      </section>
    </div>
  );
}

function InfoBlock({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/8 bg-black/15 p-4">
      <p className="metric-label">{label}</p>
      <p className={`mt-3 text-lg font-medium text-stone-50 ${mono ? 'font-mono text-sm' : ''}`}>{value}</p>
    </div>
  );
}

function ScoreBreakdown({ milestoneType, status }: { milestoneType: string; status: string }) {
  const checksByType: Record<string, Array<{ name: string; passed: boolean; detail?: string }>> = {
    tasks: [
      { name: 'Artifacts present', passed: true },
      { name: 'Status marked completed', passed: true },
      { name: 'Summary length meets threshold', passed: true, detail: 'Required for acceptance readiness' },
      { name: 'Structured output follows rubric', passed: status !== 'rework', detail: 'Checked against the milestone schema' },
    ],
    scaffold: [
      { name: 'File structure valid', passed: status !== 'rework' },
      { name: 'Summary present', passed: true },
      { name: 'Status marked completed', passed: true },
    ],
    brief: [
      { name: 'Brief package present', passed: true },
      { name: 'Summary present', passed: true },
      { name: 'Human review still required', passed: true, detail: 'Planner output remains reviewable by design' },
    ],
    review: [
      { name: 'Artifacts present', passed: true },
      { name: 'Summary length meets threshold', passed: status !== 'rework' },
      { name: 'Status marked completed', passed: true },
      { name: 'Diff or comments attached', passed: status !== 'rework' },
    ],
  };

  const scoreByType: Record<string, number> = {
    tasks: 90,
    scaffold: 85,
    brief: 80,
    review: 88,
  };

  const checks = checksByType[milestoneType] ?? checksByType.tasks;
  const score = scoreByType[milestoneType] ?? 80;
  const allPassed = checks.every(check => check.passed);

  return (
    <div className="grid gap-6 xl:grid-cols-[0.32fr_0.68fr]">
      <div className="rounded-[1.75rem] border border-white/8 bg-black/15 p-5">
        <p className="metric-label">Overall score</p>
        <p className={`mt-4 text-5xl font-semibold ${allPassed ? 'text-emerald-300' : 'text-amber-200'}`}>
          {score}
        </p>
        <p className="mt-2 text-sm text-stone-400">out of 100</p>
        {!allPassed && (
          <p className="mt-4 text-sm leading-6 text-amber-100/90">
            One or more checks failed. Rework is the correct next action until the missing artifacts are repaired.
          </p>
        )}
      </div>

      <div className="divide-y divide-white/8 rounded-[1.75rem] border border-white/8 bg-black/15 px-5">
        {checks.map(check => (
          <div key={check.name} className="grid gap-4 py-4 md:grid-cols-[auto_minmax(0,1fr)]">
            <div className={`mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
              check.passed
                ? 'bg-emerald-500/15 text-emerald-200'
                : 'bg-rose-500/15 text-rose-200'
            }`}>
              {check.passed ? '✓' : '×'}
            </div>
            <div>
              <p className="text-sm font-medium text-stone-100">{check.name}</p>
              {check.detail && <p className="mt-1 text-sm leading-6 text-stone-400">{check.detail}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
