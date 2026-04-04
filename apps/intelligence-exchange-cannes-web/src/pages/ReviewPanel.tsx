import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  ShieldCheck,
  Wallet,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { acceptMilestone, rejectMilestone, syncChainReceipt, getJob } from '../api';
import { useSession } from '../hooks/useSession';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusVariant(status: string) {
  const map: Record<string, string> = {
    queued: 'queued',
    claimed: 'claimed',
    submitted: 'submitted',
    accepted: 'accepted',
    rejected: 'rejected',
    rework: 'rework',
    settled: 'settled',
    created: 'created',
  };
  return (map[status] ?? 'default') as
    | 'queued'
    | 'claimed'
    | 'submitted'
    | 'accepted'
    | 'rejected'
    | 'rework'
    | 'settled'
    | 'created'
    | 'default';
}

// ─── Auth gate ────────────────────────────────────────────────────────────────

function AuthGate({
  isConnected,
  hasSession,
  canReview,
  isPoster,
  isReviewerVerified,
  onSignIn,
  isSigningIn,
}: {
  isConnected: boolean;
  hasSession: boolean;
  canReview: boolean;
  isPoster: boolean;
  isReviewerVerified: boolean;
  onSignIn: () => Promise<void>;
  isSigningIn: boolean;
}) {
  if (canReview) return null;

  return (
    <Card className="border-yellow-800 bg-yellow-900/10">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center gap-2 text-yellow-300 font-medium text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Review requires authentication
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-gray-600 shrink-0" />
            )}
            <span className={isConnected ? 'text-gray-300' : 'text-gray-500'}>
              Wallet connected
            </span>
          </div>

          <div className="flex items-center gap-2">
            {hasSession ? (
              <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-gray-600 shrink-0" />
            )}
            <span className={hasSession ? 'text-gray-300' : 'text-gray-500'}>
              Broker session active
            </span>
            {isConnected && !hasSession && (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={onSignIn}
                disabled={isSigningIn}
              >
                {isSigningIn ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Sign in
              </Button>
            )}
          </div>

          {!isPoster && (
            <div className="flex items-center gap-2">
              {isReviewerVerified ? (
                <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-gray-600 shrink-0" />
              )}
              <span className={isReviewerVerified ? 'text-gray-300' : 'text-gray-500'}>
                Reviewer World verified
              </span>
              {!isReviewerVerified && (
                <span className="text-gray-600 text-xs ml-auto">
                  Verify via World ID
                </span>
              )}
            </div>
          )}
        </div>

        {isPoster && hasSession && (
          <p className="text-xs text-gray-500">
            You are the poster — reviewer World verification is not required.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Attestation panel ────────────────────────────────────────────────────────

function AttestationPanel({
  attestationPayload,
  ideaId,
  jobId,
  onReleaseSynced,
  onAttestationSynced,
}: {
  attestationPayload: unknown;
  ideaId: string;
  jobId: string;
  onReleaseSynced: () => void;
  onAttestationSynced: () => void;
}) {
  const [releaseTxHash, setReleaseTxHash] = useState('');
  const [attestTxHash, setAttestTxHash] = useState('');
  const [releaseSyncing, setReleaseSyncing] = useState(false);
  const [attestSyncing, setAttestSyncing] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [attestError, setAttestError] = useState<string | null>(null);
  const [releaseComplete, setReleaseComplete] = useState(false);
  const [attestComplete, setAttestComplete] = useState(false);

  async function syncRelease() {
    if (!releaseTxHash.trim()) return;
    setReleaseSyncing(true);
    setReleaseError(null);
    try {
      await syncChainReceipt({
        eventType: 'milestone_released',
        txHash: releaseTxHash.trim(),
        subjectId: ideaId,
        payload: { jobId },
      });
      setReleaseComplete(true);
      onReleaseSynced();
    } catch (err) {
      setReleaseError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setReleaseSyncing(false);
    }
  }

  async function syncAttestation() {
    if (!attestTxHash.trim()) return;
    setAttestSyncing(true);
    setAttestError(null);
    try {
      await syncChainReceipt({
        eventType: 'accepted_submission_attested',
        txHash: attestTxHash.trim(),
        subjectId: ideaId,
        payload: { jobId, attestationPayload },
      });
      setAttestComplete(true);
      onAttestationSynced();
    } catch (err) {
      setAttestError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setAttestSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Attestation payload */}
      {attestationPayload != null && (
        <div className="rounded-lg bg-gray-800/50 border border-gray-700 p-3 space-y-1">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            Attestation Payload
          </p>
          <pre className="text-xs text-gray-300 font-mono overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(attestationPayload, null, 2)}
          </pre>
        </div>
      )}

      {/* Release tx sync */}
      <div className="space-y-2">
        <Label className="text-gray-300 text-sm">
          Release transaction hash
          <span className="text-gray-500 font-normal ml-1">(poster submits release tx)</span>
        </Label>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm font-mono text-gray-200 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="0x…"
            value={releaseTxHash}
            onChange={e => setReleaseTxHash(e.target.value)}
            disabled={releaseComplete}
          />
          <Button
            size="sm"
            variant={releaseComplete ? 'secondary' : 'default'}
            onClick={syncRelease}
            disabled={!releaseTxHash.trim() || releaseSyncing || releaseComplete}
          >
            {releaseSyncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : releaseComplete ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            ) : null}
            {releaseComplete ? 'Synced' : 'Sync Release'}
          </Button>
        </div>
        {releaseError && (
          <p className="text-xs text-red-400">{releaseError}</p>
        )}
      </div>

      {/* Attestation tx sync */}
      <div className="space-y-2">
        <Label className="text-gray-300 text-sm">
          Attestation transaction hash
          <span className="text-gray-500 font-normal ml-1">(reputation attestation)</span>
        </Label>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm font-mono text-gray-200 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="0x…"
            value={attestTxHash}
            onChange={e => setAttestTxHash(e.target.value)}
            disabled={attestComplete}
          />
          <Button
            size="sm"
            variant={attestComplete ? 'secondary' : 'outline'}
            onClick={syncAttestation}
            disabled={!attestTxHash.trim() || attestSyncing || attestComplete}
          >
            {attestSyncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : attestComplete ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            ) : null}
            {attestComplete ? 'Synced' : 'Sync Attestation'}
          </Button>
        </div>
        {attestError && (
          <p className="text-xs text-red-400">{attestError}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ReviewPanel() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { isConnected, address, session, isReviewerVerified, signIn } = useSession();

  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [attestationPayload, setAttestationPayload] = useState<unknown>(null);
  const [showReleaseFlow, setShowReleaseFlow] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const hasSession = !!session;

  const { data, isLoading, error } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId!),
    enabled: !!jobId,
    refetchInterval: 5_000,
  });

  const job = data?.job;
  const latestSubmission = data?.latestSubmission;

  // Determine if current user is the poster of this idea.
  // The broker session contains accountAddress; the idea/job has posterId.
  // We compare case-insensitively.
  const isPoster =
    !!address &&
    !!job &&
    // posterId might be stored as wallet address
    (job as { posterId?: string }).posterId?.toLowerCase() === address.toLowerCase();

  const canReview =
    isConnected &&
    hasSession &&
    (isPoster || isReviewerVerified);

  async function handleSignIn() {
    setIsSigningIn(true);
    setSignInError(null);
    try {
      await signIn();
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setIsSigningIn(false);
    }
  }

  const acceptMutation = useMutation({
    mutationFn: () => acceptMilestone(job!.ideaId, job!.jobId),
    onSuccess: result => {
      if (result.attestationPayload) {
        setAttestationPayload(result.attestationPayload);
        setShowReleaseFlow(true);
      }
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectMilestone(job!.ideaId, job!.jobId, rejectReason || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      setShowRejectForm(false);
      setRejectReason('');
    },
  });

  // ── Loading / error states ───────────────────────────────────────────────

  if (!jobId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg w-full border-gray-700">
          <CardContent className="text-center space-y-4 py-10">
            <AlertCircle className="h-8 w-8 text-gray-500 mx-auto" />
            <p className="text-gray-400">No job ID provided.</p>
            <Button variant="secondary" onClick={() => navigate('/')}>
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <Loader2 className="h-6 w-6 animate-spin text-gray-500 mx-auto" />
          <p className="text-gray-400 text-sm">Loading job details…</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg w-full border-red-900">
          <CardContent className="text-center space-y-4 py-10">
            <XCircle className="h-8 w-8 text-red-500 mx-auto" />
            <h1 className="text-xl font-bold text-red-400">Failed to load job</h1>
            <p className="text-gray-400 text-sm font-mono">
              {String(error || 'Unknown error')}
            </p>
            <Button
              variant="secondary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['job', jobId] })}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!['submitted', 'accepted', 'rejected', 'rework'].includes(job.status)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg w-full border-gray-700">
          <CardContent className="text-center space-y-4 py-12">
            <Clock className="h-8 w-8 text-gray-500 mx-auto" />
            <h1 className="text-xl font-semibold text-white">Awaiting Submission</h1>
            <p className="text-gray-400 text-sm">
              This milestone is{' '}
              <Badge variant={statusVariant(job.status)}>{job.status}</Badge>.{' '}
              The review panel unlocks once a worker submits their work.
            </p>
            {job.leaseExpiry && (
              <p className="text-gray-500 text-xs">
                Lease expires: {new Date(job.leaseExpiry).toLocaleString()}
              </p>
            )}
            <Button
              variant="secondary"
              onClick={() => navigate(`/ideas/${job.ideaId}`)}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Idea
            </Button>
          </CardContent>
        </Card>
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <button
              className="text-sm text-gray-500 hover:text-gray-300 flex items-center gap-1 mb-2"
              onClick={() => navigate(`/ideas/${job.ideaId}`)}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Idea
            </button>
            <h1 className="text-2xl font-bold text-white">Milestone Review</h1>
            <p className="text-gray-400 text-sm mt-1">
              Review the worker output and accept or request rework.
            </p>
          </div>
          <Badge variant={statusVariant(job.status)} className="text-sm px-3 py-1 shrink-0">
            {job.status.toUpperCase()}
          </Badge>
        </div>

        {/* Reviewer identity strip */}
        {isConnected && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="info" className="gap-1">
              <Wallet className="h-3 w-3" />
              {address?.slice(0, 6)}…{address?.slice(-4)}
            </Badge>
            {hasSession && (
              <Badge variant="success" className="gap-1">
                <ShieldCheck className="h-3 w-3" />
                Session active
              </Badge>
            )}
            {isPoster && (
              <Badge variant="info" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Poster
              </Badge>
            )}
            {!isPoster && isReviewerVerified && (
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Reviewer verified
              </Badge>
            )}
          </div>
        )}

        {/* Auth gate */}
        {signInError && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
            <XCircle className="h-4 w-4 shrink-0" />
            {signInError}
          </div>
        )}
        <AuthGate
          isConnected={isConnected}
          hasSession={hasSession}
          canReview={canReview}
          isPoster={isPoster}
          isReviewerVerified={isReviewerVerified}
          onSignIn={handleSignIn}
          isSigningIn={isSigningIn}
        />

        {/* Job info */}
        <Card className="border-gray-700 bg-gray-900/40">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white capitalize">
                {job.milestoneType} Milestone
              </h2>
              <span className="text-green-400 font-bold">${job.budgetUsd} USDC</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500 text-xs">Job ID</span>
                <p className="text-gray-300 font-mono text-xs mt-0.5 break-all">{job.jobId}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Idea ID</span>
                <p className="text-gray-300 font-mono text-xs mt-0.5 break-all">{job.ideaId}</p>
              </div>
              {job.activeClaimWorkerId && (
                <div className="col-span-2">
                  <span className="text-gray-500 text-xs">Worker</span>
                  <p className="text-gray-300 font-mono text-xs mt-0.5 break-all">
                    {job.activeClaimWorkerId}
                  </p>
                </div>
              )}
            </div>

            {/* Submission artifact */}
            {job.submission && (
              <div className="pt-3 border-t border-gray-800 space-y-2">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                  Submitted Work
                </p>
                {job.submission.artifactUri && (
                  <a
                    href={job.submission.artifactUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-sm font-mono break-all flex items-center gap-1"
                  >
                    {job.submission.artifactUri}
                    <ExternalLink className="h-3 w-3 shrink-0" />
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

            {/* Score breakdown from latest submission */}
            {latestSubmission?.scoreBreakdown && (
              <div className="pt-3 border-t border-gray-800 space-y-2">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                  Score Breakdown
                </p>
                <div className="space-y-1.5">
                  {latestSubmission.scoreBreakdown.checks.map((check, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 rounded-lg bg-gray-800/50 px-3 py-2"
                    >
                      {check.passed ? (
                        <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-gray-200">{check.name}</p>
                        {check.detail && (
                          <p className="text-xs text-gray-500 mt-0.5">{check.detail}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-gray-500 text-xs">Total score</span>
                  <span
                    className={cn(
                      'text-lg font-bold',
                      latestSubmission.scoreBreakdown.totalScore >= 70
                        ? 'text-green-400'
                        : 'text-yellow-400'
                    )}
                  >
                    {latestSubmission.scoreBreakdown.totalScore}
                    <span className="text-gray-500 text-sm font-normal">/100</span>
                  </span>
                </div>
                {latestSubmission.scoreBreakdown.rejectionReason && (
                  <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg px-3 py-2 text-yellow-300 text-xs">
                    {latestSubmission.scoreBreakdown.rejectionReason}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Outcome banners */}
        {isAccepted && !showReleaseFlow && (
          <div className="bg-green-900/30 border border-green-700 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-green-300 font-semibold">Milestone Accepted</p>
              <p className="text-green-400/80 text-sm mt-0.5">
                The submission has been accepted. Submit the on-chain release transaction and sync
                the attestation below.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => setShowReleaseFlow(true)}
              >
                Proceed to release sync
              </Button>
            </div>
          </div>
        )}

        {isRejected && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 flex items-start gap-3">
            <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-300 font-semibold">Sent for Rework</p>
              <p className="text-red-400/80 text-sm mt-0.5">
                The milestone has been returned to the queue. An agent can re-claim and resubmit.
              </p>
            </div>
          </div>
        )}

        {/* Release and attestation sync flow (shown after accept) */}
        {showReleaseFlow && (
          <Card className="border-gray-700 bg-gray-900/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-white">Release & Attestation Sync</CardTitle>
            </CardHeader>
            <CardContent>
              <AttestationPanel
                attestationPayload={attestationPayload}
                ideaId={job.ideaId}
                jobId={job.jobId}
                onReleaseSynced={() =>
                  queryClient.invalidateQueries({ queryKey: ['job', jobId] })
                }
                onAttestationSynced={() =>
                  queryClient.invalidateQueries({ queryKey: ['job', jobId] })
                }
              />
            </CardContent>
          </Card>
        )}

        {/* Decision panel */}
        {isPending && (
          <Card className="border-gray-700 bg-gray-900/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-white">Your Decision</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-400 text-sm">
                Accept to mark the milestone payout-ready, or request rework. Acceptance is the
                on-chain release gate.
              </p>

              {(acceptMutation.isError || rejectMutation.isError) && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 text-sm flex items-start gap-2">
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  {String(acceptMutation.error || rejectMutation.error || 'Action failed')}
                </div>
              )}

              {!showRejectForm ? (
                <div className="flex gap-3">
                  <Button
                    variant="success"
                    className="flex-1 py-5 text-base"
                    onClick={() => acceptMutation.mutate()}
                    disabled={isProcessing || !canReview}
                    title={!canReview ? 'Complete authentication to review' : undefined}
                  >
                    {acceptMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ThumbsUp className="h-4 w-4" />
                    )}
                    Accept Milestone
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1 py-5 text-base"
                    onClick={() => setShowRejectForm(true)}
                    disabled={isProcessing || !canReview}
                    title={!canReview ? 'Complete authentication to review' : undefined}
                  >
                    <ThumbsDown className="h-4 w-4" />
                    Request Rework
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Label className="text-gray-300">
                    Reason for rework{' '}
                    <span className="text-gray-500 font-normal">(optional)</span>
                  </Label>
                  <Textarea
                    className="min-h-24 resize-none bg-gray-800 border-gray-700 text-gray-200"
                    placeholder="Explain what needs to be fixed or improved…"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                  />
                  <div className="flex gap-3">
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => rejectMutation.mutate()}
                      disabled={isProcessing}
                    >
                      {rejectMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ThumbsDown className="h-4 w-4" />
                      )}
                      Confirm Rework Request
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowRejectForm(false);
                        setRejectReason('');
                      }}
                      disabled={isProcessing}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              <p className="text-gray-600 text-xs">
                Human-gated: approval is the on-chain release gate. No autonomous payouts.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
