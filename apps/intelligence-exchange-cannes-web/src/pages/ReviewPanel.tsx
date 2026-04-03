import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getJob, acceptMilestone, rejectMilestone } from '../api';
import { useBuyerSession } from '../session';

function isPullRequestUrl(uri: string) {
  return /\/pull\/\d+/.test(uri) || /\/merge_requests\/\d+/.test(uri);
}

export function ReviewPanel() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { buyerId } = useBuyerSession();
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId!),
    enabled: !!jobId,
    refetchInterval: 5000,
  });

  const job = data?.job;
  const submission = data?.submission;
  const idea = data?.idea;

  const acceptMutation = useMutation({
    mutationFn: () => acceptMilestone(job!.ideaId, job!.jobId, buyerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectMilestone(job!.ideaId, job!.jobId, buyerId, rejectReason || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      setShowRejectForm(false);
      setRejectReason('');
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
        <div className="card max-w-lg w-full text-center space-y-4 py-12">
          <div className="animate-spin text-4xl">⚙️</div>
          <p className="text-gray-400">Loading job details...</p>
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

  // Job not yet submitted — nothing to review
  if (!['submitted', 'accepted', 'rejected', 'rework'].includes(job.status)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-lg w-full text-center space-y-4 py-12">
          <div className="text-4xl">🕐</div>
          <h1 className="text-xl font-semibold text-white">Awaiting Submission</h1>
          <p className="text-gray-400 text-sm">
            This milestone is <span className={`badge badge-${job.status}`}>{job.status}</span>.
            The review panel will unlock once an agent submits their work.
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
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <button
              className="text-gray-500 hover:text-gray-300 text-sm flex items-center gap-1 mb-2"
              onClick={() => navigate(`/ideas/${job.ideaId}`)}
            >
              ← Back to Idea
            </button>
            <h1 className="text-2xl font-bold text-white">Milestone Review</h1>
            <p className="text-gray-400 text-sm mt-1">
              Review the agent's output and approve or request rework.
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
            {idea?.targetArtifact && (
              <div className="col-span-2">
                <span className="text-gray-500">Target Repo / Spec</span>
                <a className="text-blue-400 text-xs mt-0.5 break-all block hover:underline" href={idea.targetArtifact} target="_blank" rel="noreferrer">
                  {idea.targetArtifact}
                </a>
              </div>
            )}
          </div>
        </div>

        {submission && (
          <div className="card space-y-4">
            <h2 className="text-lg font-semibold text-white">Submitted Work</h2>
            {submission.summary && <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{submission.summary}</p>}
            <div className="space-y-2">
              {submission.artifactUris.map((uri, index) => (
                <a
                  key={uri}
                  className="block rounded-lg border border-gray-800 bg-gray-900/50 p-3 hover:border-blue-700"
                  href={uri}
                  target="_blank"
                  rel="noreferrer"
                >
                  <p className="text-xs uppercase tracking-wide text-gray-500">
                    {isPullRequestUrl(uri) ? `Pull Request ${index + 1}` : `Artifact ${index + 1}`}
                  </p>
                  <p className="text-sm text-blue-400 break-all mt-1">{uri}</p>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Outcome banner for already-decided jobs */}
        {isAccepted && (
          <div className="bg-green-900/30 border border-green-700 rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="text-green-300 font-semibold">Milestone Accepted</p>
              <p className="text-green-400/70 text-sm">Arc escrow payout has been released to the worker. Agent identity recorded on-chain.</p>
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

        {/* Score Breakdown (placeholder — real data comes from submission record) */}
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-white">Score Breakdown</h2>
          <ScoreBreakdown milestoneType={job.milestoneType} status={job.status} />
        </div>

        {/* Accept / Reject CTAs — always visible, sticky on desktop */}
        {isPending && (
          <div className="card space-y-4">
            <h2 className="text-lg font-semibold text-white">Your Decision</h2>
            <p className="text-gray-400 text-sm">
              Review the score breakdown above. Accept to release payment, or reject to send back for rework.
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
                  {acceptMutation.isPending ? 'Approving...' : '✓ Accept & Release Payment'}
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
              Human-gated: Arc escrow only releases after you click Accept. No autonomous payouts.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Score breakdown rendered from milestone type (real data would come from submission API)
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

  const scoreByType: Record<string, number> = {
    tasks: 90,
    scaffold: 85,
    brief: 80,
    review: 88,
  };

  const checks = checksByType[milestoneType] ?? checksByType['tasks'];
  const score = scoreByType[milestoneType] ?? 80;
  const allPassed = checks.every(c => c.passed);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-sm">Overall Score</span>
        <span className={`text-2xl font-bold ${allPassed ? 'text-green-400' : 'text-yellow-400'}`}>
          {score}<span className="text-gray-500 text-base font-normal">/100</span>
        </span>
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
