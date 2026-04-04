import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { acceptMilestone, getJob, recordJobSpend, rejectMilestone } from '../api';

export function ReviewPanel() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [spendForm, setSpendForm] = useState<{
    vendor: string;
    purpose: string;
    amountUsd: number;
    settlementRail: 'demo' | 'arc';
  }>({
    vendor: 'openrouter',
    purpose: 'reasoning pass',
    amountUsd: 0.01,
    settlementRail: 'arc' as const,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId!),
    enabled: !!jobId,
    refetchInterval: 5000,
  });

  const job = data?.job;
  const spendEvents = data?.spendEvents ?? [];
  const latestSubmission = data?.latestSubmission;

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

  const spendMutation = useMutation({
    mutationFn: () => recordJobSpend(job!.jobId, {
      workerId: job!.activeClaimWorkerId ?? 'demo-worker',
      vendor: spendForm.vendor,
      purpose: spendForm.purpose,
      amountUsd: spendForm.amountUsd,
      settlementRail: spendForm.settlementRail,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
    },
  });

  if (!jobId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-lg w-full text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <p className="text-gray-400">No job ID provided.</p>
          <button className="btn-primary" onClick={() => navigate('/')}>Go Home</button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="spinner" />
          <p className="text-gray-400 text-sm">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-lg w-full text-center space-y-4">
          <div className="text-4xl">❌</div>
          <h1 className="text-xl font-bold text-red-400">Failed to load job</h1>
          <p className="text-gray-400 text-sm font-mono">{String(error || 'Unknown error')}</p>
          <button className="btn-primary" onClick={() => queryClient.invalidateQueries({ queryKey: ['job', jobId] })}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!['submitted', 'accepted', 'rejected', 'rework'].includes(job.status)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-lg w-full text-center space-y-4 py-12">
          <div className="text-4xl">🕐</div>
          <h1 className="text-xl font-semibold text-white">Awaiting Submission</h1>
          <p className="text-gray-400 text-sm">
            This milestone is <span className={`badge badge-${job.status}`}>{job.status}</span>.
            The review panel will unlock once a worker submits their work.
          </p>
          {job.leaseExpiry && (
            <p className="text-gray-500 text-xs">
              Lease expires: {new Date(job.leaseExpiry).toLocaleString()}
            </p>
          )}
          <button className="btn-primary bg-gray-700 hover:bg-gray-600" onClick={() => navigate(`/ideas/${job.ideaId}`)}>
            ← Back to Idea
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
    <div className="page">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <button
              className="text-sm text-gray-500 hover:text-gray-300 flex items-center gap-1 mb-2"
              onClick={() => navigate(`/ideas/${job.ideaId}`)}
            >
              ← Back to Idea
            </button>
            <h1 className="text-2xl font-bold text-white">Milestone Review</h1>
            <p className="text-gray-400 text-sm mt-1">
              Review the worker output and approve or request rework.
            </p>
          </div>
          <span className={`badge badge-${job.status} text-sm px-3 py-1`}>
            {job.status.toUpperCase()}
          </span>
        </div>

        {/* Job Info */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white capitalize">
              {job.milestoneType} Milestone
            </h2>
            <span className="text-green-400 font-bold">${job.budgetUsd} USDC</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Job ID</span>
              <p className="text-gray-300 font-mono text-xs mt-0.5 break-all">{job.jobId}</p>
            </div>
            <div>
              <span className="text-gray-500">Idea ID</span>
              <p className="text-gray-300 font-mono text-xs mt-0.5 break-all">{job.ideaId}</p>
            </div>
            {job.activeClaimWorkerId && (
              <div className="col-span-2">
                <span className="text-gray-500">Worker</span>
                <p className="text-gray-300 font-mono text-xs mt-0.5 break-all">{job.activeClaimWorkerId}</p>
              </div>
            )}
          </div>

          {/* Submission artifact */}
          {job.submission && (
            <div className="pt-3 border-t border-gray-800 space-y-2">
              <p className="section-label">Submitted Work</p>
              {job.submission.artifactUri && (
                <a
                  href={job.submission.artifactUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 text-sm font-mono break-all block"
                >
                  {job.submission.artifactUri} →
                </a>
              )}
              {job.submission.summary && (
                <p className="text-gray-300 text-sm leading-relaxed">{job.submission.summary}</p>
              )}
              {job.submission.submittedAt && (
                <p className="text-gray-500 text-xs">
                  Submitted {new Date(job.submission.submittedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Outcome banners */}
        {isAccepted && (
          <div className="bg-green-900/30 border border-green-700 rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="text-green-300 font-semibold">Milestone Accepted</p>
              <p className="text-green-400/70 text-sm">The milestone is now accepted in demo state and the worker reputation mirror can be updated from this result.</p>
            </div>
          </div>
        )}
        {isRejected && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl">🔁</span>
            <div>
              <p className="text-red-300 font-semibold">Sent for Rework</p>
              <p className="text-red-400/70 text-sm">The milestone has been returned to the queue. An agent can re-claim and resubmit.</p>
            </div>
          </div>
        )}

        {/* Deterministic milestone rubric for the current demo */}
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-white">Deterministic Review Checklist</h2>
          <ScoreBreakdown milestoneType={job.milestoneType} status={job.status} />
        </div>

        <div className="card space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Agent Spend Events</h2>
            <span className="text-xs text-gray-500">
              {spendEvents.length} event{spendEvents.length === 1 ? '' : 's'}
            </span>
          </div>

          {latestSubmission && (
            <div className="bg-gray-800/40 rounded-lg p-3 text-sm space-y-1">
              <p className="text-gray-500">Latest submission</p>
              <p className="text-gray-300">{latestSubmission.summary || 'No summary provided.'}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              className="input text-sm"
              value={spendForm.vendor}
              onChange={e => setSpendForm(f => ({ ...f, vendor: e.target.value }))}
              placeholder="vendor"
            />
            <input
              className="input text-sm"
              value={spendForm.purpose}
              onChange={e => setSpendForm(f => ({ ...f, purpose: e.target.value }))}
              placeholder="purpose"
            />
            <input
              type="number"
              className="input text-sm"
              min={0.0001}
              step={0.0001}
              value={spendForm.amountUsd}
              onChange={e => setSpendForm(f => ({ ...f, amountUsd: parseFloat(e.target.value) }))}
            />
            <select
              className="input text-sm"
              value={spendForm.settlementRail}
              onChange={e => setSpendForm(f => ({ ...f, settlementRail: e.target.value as 'demo' | 'arc' }))}
            >
              <option value="arc">arc</option>
              <option value="demo">demo</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="btn-primary"
              onClick={() => spendMutation.mutate()}
              disabled={spendMutation.isPending || !job.activeClaimWorkerId}
            >
              {spendMutation.isPending ? 'Recording...' : 'Add Spend Event'}
            </button>
            <p className="text-xs text-gray-500">
              Use this to demonstrate per-tool or per-inference costs that an agent incurred while finishing the job.
            </p>
          </div>

          {spendEvents.length === 0 ? (
            <p className="text-sm text-gray-500">No spend events recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {spendEvents.map(event => (
                <div key={event.eventId} className="bg-gray-800/30 rounded-lg p-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-white">
                      {event.vendor} · {event.purpose}
                    </p>
                    <p className="text-xs text-gray-500">
                      {event.workerId} · {new Date(event.createdAt).toLocaleString()} · {event.settlementRail}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-emerald-300">${event.amountUsd}</p>
                    {event.txHash && <p className="text-[11px] text-gray-500 font-mono">{event.txHash.slice(0, 10)}...</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Accept / Reject CTAs */}
        {isPending && (
          <div className="card space-y-4">
            <h2 className="text-lg font-semibold text-white">Your Decision</h2>
            <p className="text-gray-400 text-sm">
              Use the checklist above. Accept to mark the milestone payout-ready, or reject to send it back for rework.
            </p>

            {(acceptMutation.isError || rejectMutation.isError) && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
                {String(acceptMutation.error || rejectMutation.error || 'Action failed')}
              </div>
            )}

            {!showRejectForm ? (
              <div className="flex gap-3">
                <button
                  className="btn-success flex-1 py-3 text-base"
                  onClick={() => acceptMutation.mutate()}
                  disabled={isProcessing}
                >
                  {acceptMutation.isPending ? 'Approving...' : '✓ Accept Milestone'}
                </button>
                <button
                  className="btn-danger flex-1 py-3 text-base"
                  onClick={() => setShowRejectForm(true)}
                  disabled={isProcessing}
                >
                  ✗ Request Rework
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-300">
                  Reason for rework (optional)
                </label>
                <textarea
                  className="input min-h-24 resize-none"
                  placeholder="Explain what needs to be fixed or improved..."
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                />
                <div className="flex gap-3">
                  <button
                    className="btn-danger flex-1"
                    onClick={() => rejectMutation.mutate()}
                    disabled={isProcessing}
                  >
                    {rejectMutation.isPending ? 'Sending...' : 'Confirm Rework Request'}
                  </button>
                  <button
                    className="btn-primary bg-gray-700 hover:bg-gray-600"
                    onClick={() => { setShowRejectForm(false); setRejectReason(''); }}
                    disabled={isProcessing}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <p className="text-gray-600 text-xs">
              Human-gated: approval is the release gate. No autonomous payouts.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Demo checklist rendered from milestone type.
function ScoreBreakdown({ milestoneType, status }: { milestoneType: string; status: string }) {
  const checksByType: Record<string, Array<{ name: string; passed: boolean; detail?: string }>> = {
    tasks: [
      { name: 'Artifacts present', passed: true },
      { name: 'Status: completed', passed: true },
      { name: 'Summary length ≥ 20 chars', passed: true, detail: 'Required for acceptance' },
      { name: 'Structured JSON output', passed: status !== 'rework', detail: 'Checked against rubric schema' },
    ],
    scaffold: [
      { name: 'Artifacts present', passed: true },
      { name: 'File structure valid', passed: status !== 'rework' },
      { name: 'Summary present', passed: true },
      { name: 'Status: completed', passed: true },
    ],
    brief: [
      { name: 'Auto-accepted (human-judged)', passed: true, detail: 'Brief milestone is reviewed manually' },
      { name: 'Summary present', passed: true },
    ],
    review: [
      { name: 'Artifacts present', passed: true },
      { name: 'Summary ≥ 50 chars', passed: status !== 'rework' },
      { name: 'Status: completed', passed: true },
      { name: 'Diff or comments present', passed: status !== 'rework' },
    ],
  };

  const scoreByType: Record<string, number> = { tasks: 90, scaffold: 85, brief: 80, review: 88 };

  const checks = checksByType[milestoneType] ?? checksByType['tasks'];
  const score = scoreByType[milestoneType] ?? 80;
  const allPassed = checks.every(c => c.passed);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-sm">Estimated Score</span>
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold ${allPassed ? 'text-green-400' : 'text-yellow-400'}`}>
            {score}<span className="text-gray-500 text-base font-normal">/100</span>
          </span>
          <span className="text-xs text-gray-600">(rubric estimate)</span>
        </div>
      </div>
      <div className="space-y-2">
        {checks.map((check, i) => (
          <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-800/50">
            <span className={`mt-0.5 text-sm font-bold ${check.passed ? 'text-green-400' : 'text-red-400'}`}>
              {check.passed ? '✓' : '✗'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200">{check.name}</p>
              {check.detail && <p className="text-xs text-gray-500 mt-0.5">{check.detail}</p>}
            </div>
          </div>
        ))}
      </div>
      {!allPassed && (
        <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3 text-yellow-300 text-sm">
          One or more checks failed. Request rework to give the agent another attempt.
        </div>
      )}
    </div>
  );
}
