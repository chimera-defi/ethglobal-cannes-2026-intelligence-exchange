import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSignMessage } from 'wagmi';
import {
  Wallet,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  ExternalLink,
  Clock,
  AlertCircle,
  Key,
  Link2,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  claimJob,
  claimJobDemo,
  createAuthChallenge,
  listAgentAuthorizations,
  createAgentAuthorization,
  getJobBoard,
  getIntegrationsStatus,
  submitJob,
  submitJobDemo,
  unclaimJob,
  unclaimJobDemo,
  type AgentAuthorization,
  type JobBoardGroup,
  type JobBoardMilestone,
  type SubmissionResponse,
} from '../api';
import { useSession } from '../hooks/useSession';
import { makeDemoAddress } from '../lib/demo';

const STATUS_TABS = ['queued', 'claimed', 'submitted', 'accepted', 'rework'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

// ─── Onboarding checklist ────────────────────────────────────────────────────

interface CheckItemProps {
  done: boolean;
  loading?: boolean;
  label: string;
  detail?: string;
  action?: React.ReactNode;
}

function CheckItem({ done, loading, label, detail, action }: CheckItemProps) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 shrink-0">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        ) : done ? (
          <CheckCircle2 className="h-4 w-4 text-green-400" />
        ) : (
          <XCircle className="h-4 w-4 text-gray-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium', done ? 'text-gray-200' : 'text-gray-500')}>
          {label}
        </p>
        {detail && <p className="text-xs text-gray-600 mt-0.5">{detail}</p>}
      </div>
      {!done && !loading && action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function shortId(value?: string | null, head = 6, tail = 4) {
  if (!value) return 'unknown';
  if (tail <= 0) return value.length <= head ? value : `${value.slice(0, head)}…`;
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function normalizeId(value?: string | null) {
  return value?.toLowerCase() ?? '';
}

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function AgentPickupGuide() {
  return (
    <Card className="border-gray-700 bg-gray-900/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-white">Local Agent Pickup</CardTitle>
        <CardDescription>
          Use the local worker CLI or the web board to claim one job, run its task file, and submit
          a proof URL such as a GitHub pull request when the work is ready for review.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-2 text-gray-300 md:grid-cols-2">
          <p>1. Build the local worker binary.</p>
          <p>2. Set <span className="font-mono text-gray-200">BROKER_URL</span> and <span className="font-mono text-gray-200">WORKER_PRIVATE_KEY</span>.</p>
          <p>3. List queued work and select a concrete <span className="font-mono text-gray-200">jobId</span>.</p>
          <p>4. Claim, execute <span className="font-mono text-gray-200">skill.md</span>, then submit a proof URI or unclaim.</p>
        </div>

        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Local CLI</p>
            <pre className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-950/80 p-3 text-xs leading-6 text-gray-200">
{`corepack pnpm --filter intelligence-exchange-cannes-worker build
export BROKER_URL=http://localhost:3001
export WORKER_PRIVATE_KEY=0x...

./apps/intelligence-exchange-cannes-worker/dist/iex-bridge list --status queued
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge claim --job-id <job-id> --agent-type claude-code
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge submit --job-id <job-id> --claim-id <claim-id> --artifact <artifact-uri> --summary "what was completed" --agent-type claude-code
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge unclaim --job-id <job-id> --agent-type claude-code`}
            </pre>
          </div>

          <p className="text-xs text-gray-500">
            This is a local operator-driven pickup loop. Agents can autonomously browse and execute
            tasks from this machine, then hand back a proof URL for the board or CLI submit step.
            The 0G dossier upload still happens after authenticated human acceptance.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Worker onboarding panel ─────────────────────────────────────────────────

function WorkerOnboarding({
  isConnected,
  address,
  hasSession,
  isWorkerVerified,
  activeAuthorization,
  onSignIn,
  onCreateAuthorization,
  isSigningIn,
  isCreatingAuth,
}: {
  isConnected: boolean;
  address?: string;
  hasSession: boolean;
  isWorkerVerified: boolean;
  activeAuthorization: AgentAuthorization | null;
  onSignIn: () => Promise<void>;
  onCreateAuthorization: () => Promise<void>;
  isSigningIn: boolean;
  isCreatingAuth: boolean;
}) {
  const isRegistrationSynced =
    activeAuthorization?.status === 'active' ||
    !!activeAuthorization?.onChainTokenId;

  return (
    <Card className="border-gray-700 bg-gray-900/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-white flex items-center gap-2">
          <User className="h-4 w-4 text-blue-400" />
          Worker Setup
        </CardTitle>
        <CardDescription>
          Complete all steps before claiming a job.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-gray-800">
        <CheckItem
          done={isConnected}
          label="Wallet connected"
          detail={
            isConnected && address
              ? `${address.slice(0, 6)}…${address.slice(-4)}`
              : 'Connect your wallet via the nav bar'
          }
        />

        <CheckItem
          done={hasSession}
          loading={isSigningIn}
          label="Broker session active"
          detail={hasSession ? 'Signed in' : 'Sign the broker challenge to create a session'}
          action={
            isConnected && !hasSession ? (
              <Button size="sm" variant="outline" onClick={onSignIn} disabled={isSigningIn}>
                Sign in
              </Button>
            ) : undefined
          }
        />

        <CheckItem
          done={isWorkerVerified}
          label="Worker World verified"
          detail={
            isWorkerVerified
              ? 'World ID verified for worker role'
              : 'Visit World ID verification to verify as a worker'
          }
        />

        <CheckItem
          done={!!activeAuthorization}
          loading={isCreatingAuth}
          label="Worker agent authorization created"
          detail={
            activeAuthorization
              ? `${activeAuthorization.agentType} v${activeAuthorization.agentVersion} — fingerprint: ${activeAuthorization.fingerprint ?? 'pending'}`
              : 'Create an authorization to bind an agent identity to your wallet'
          }
          action={
            hasSession && isWorkerVerified && !activeAuthorization ? (
              <Button
                size="sm"
                variant="outline"
                onClick={onCreateAuthorization}
                disabled={isCreatingAuth}
              >
                <Key className="h-3.5 w-3.5" />
                Authorize
              </Button>
            ) : undefined
          }
        />

        <CheckItem
          done={isRegistrationSynced}
          label="On-chain registration synced"
          detail={
            isRegistrationSynced && activeAuthorization?.onChainTokenId
              ? `Token ID: ${activeAuthorization.onChainTokenId}`
              : activeAuthorization
              ? 'Sync your on-chain ERC-8004 registration through the CLI or wallet flow'
              : 'Create authorization first'
          }
        />
      </CardContent>
    </Card>
  );
}

// ─── Claim dialog ─────────────────────────────────────────────────────────────

interface ClaimDialogProps {
  open: boolean;
  jobId: string;
  address: string;
  authorization: AgentAuthorization;
  onClose: () => void;
  onSuccess: (result: { claimId: string; expiresAt: string; skillMdUrl: string }) => void;
}

function ClaimDialog({
  open,
  jobId,
  address,
  authorization,
  onClose,
  onSuccess,
}: ClaimDialogProps) {
  const { signMessageAsync } = useSignMessage();
  const [status, setStatus] = useState<'idle' | 'challenging' | 'signing' | 'claiming' | 'error'>(
    'idle'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClaim() {
    setStatus('challenging');
    setErrorMessage(null);
    try {
      const fingerprint = authorization.fingerprint ?? authorization.authorizationId;
      const { challengeId, message } = await createAuthChallenge(address, 'worker_claim', {
        agentFingerprint: fingerprint,
        jobId,
      });
      setStatus('signing');
      const signature = await signMessageAsync({ message });
      setStatus('claiming');
      const result = await claimJob(jobId, {
        accountAddress: address,
        agentFingerprint: fingerprint,
        challengeId,
        signature,
      });
      onSuccess(result);
      setStatus('idle');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Claim failed');
      setStatus('error');
    }
  }

  function handleClose() {
    setStatus('idle');
    setErrorMessage(null);
    onClose();
  }

  const isProcessing = ['challenging', 'signing', 'claiming'].includes(status);

  const statusLabel: Record<typeof status, string> = {
    idle: 'Sign & Claim',
    challenging: 'Creating challenge…',
    signing: 'Waiting for signature…',
    claiming: 'Claiming job…',
    error: 'Retry',
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Claim Job</DialogTitle>
          <DialogDescription>
            Your wallet will sign a{' '}
            <span className="font-mono text-gray-300">worker_claim</span> challenge. No gas is
            spent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-lg bg-gray-800/60 p-3 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">Operator wallet</span>
              <span className="font-mono text-gray-300">
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Agent type</span>
              <span className="text-gray-300">{authorization.agentType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Fingerprint</span>
              <span className="font-mono text-gray-300 text-xs truncate max-w-[160px]">
                {authorization.fingerprint ?? authorization.authorizationId}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Job ID</span>
              <span className="font-mono text-gray-300 text-xs">{jobId.slice(0, 14)}…</span>
            </div>
          </div>

          {status === 'signing' && (
            <div className="flex items-center gap-2 text-yellow-400 text-xs bg-yellow-900/20 border border-yellow-800 rounded-lg px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Check your wallet for a signature request.
            </div>
          )}

          {status === 'error' && errorMessage && (
            <div className="flex items-start gap-2 text-red-400 text-xs bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {errorMessage}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={handleClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleClaim} disabled={isProcessing}>
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {statusLabel[status]}
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                {statusLabel[status]}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface UnclaimDialogProps {
  open: boolean;
  job: JobBoardMilestone;
  demoMode: boolean;
  address?: string;
  authorization?: AgentAuthorization | null;
  onClose: () => void;
  onSuccess: () => void;
}

function UnclaimDialog({
  open,
  job,
  demoMode,
  address,
  authorization,
  onClose,
  onSuccess,
}: UnclaimDialogProps) {
  const { signMessageAsync } = useSignMessage();
  const [status, setStatus] = useState<'idle' | 'challenging' | 'signing' | 'releasing' | 'error'>(
    'idle'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleUnclaim() {
    setStatus('challenging');
    setErrorMessage(null);
    try {
      if (demoMode) {
        setStatus('releasing');
        await unclaimJobDemo(job.jobId, {
          workerId: job.activeClaimWorkerId ?? makeDemoAddress(`demo-worker:${job.jobId}`),
        });
        onSuccess();
        setStatus('idle');
        return;
      }

      if (!address || !authorization) {
        throw new Error('Wallet-connected worker authorization required');
      }

      const fingerprint = authorization.fingerprint ?? authorization.authorizationId;
      const { challengeId, message } = await createAuthChallenge(address, 'worker_unclaim', {
        agentFingerprint: fingerprint,
        jobId: job.jobId,
      });
      setStatus('signing');
      const signature = await signMessageAsync({ message });
      setStatus('releasing');
      await unclaimJob(job.jobId, {
        accountAddress: address,
        agentFingerprint: fingerprint,
        challengeId,
        signature,
      });
      onSuccess();
      setStatus('idle');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unclaim failed');
      setStatus('error');
    }
  }

  function handleClose() {
    setStatus('idle');
    setErrorMessage(null);
    onClose();
  }

  const isProcessing = ['challenging', 'signing', 'releasing'].includes(status);

  const statusLabel: Record<typeof status, string> = {
    idle: 'Unclaim Job',
    challenging: 'Creating challenge…',
    signing: 'Waiting for signature…',
    releasing: 'Releasing claim…',
    error: 'Retry',
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && handleClose()}>
      <DialogContent className="max-w-md border-gray-700 bg-gray-900">
        <DialogHeader>
          <DialogTitle className="text-white">Unclaim Job</DialogTitle>
          <DialogDescription>
            Release this claimed job back to the queue so another worker can claim it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="space-y-2 rounded-lg bg-gray-800/60 p-3">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Milestone</span>
              <span className="capitalize text-gray-300">{job.milestoneType}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Job ID</span>
              <span className="font-mono text-xs text-gray-300">{job.jobId.slice(0, 14)}…</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Claimed by</span>
              <span className="font-mono text-xs text-gray-300">
                {job.activeClaimWorkerId ?? 'unknown'}
              </span>
            </div>
          </div>

          {status === 'signing' && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-800 bg-yellow-900/20 px-3 py-2 text-xs text-yellow-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Check your wallet for a signature request.
            </div>
          )}

          {status === 'error' && errorMessage && (
            <div className="flex items-start gap-2 rounded-lg border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-400">
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {errorMessage}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={handleClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleUnclaim} disabled={isProcessing}>
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {statusLabel[status]}
              </>
            ) : (
              statusLabel[status]
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SubmitProofDialogProps {
  open: boolean;
  job: JobBoardMilestone;
  demoMode: boolean;
  address?: string;
  authorization?: AgentAuthorization | null;
  onClose: () => void;
  onSuccess: (result: {
    jobId: string;
    artifactUri: string;
    submissionId: string;
    scoreBreakdown: SubmissionResponse['scoreBreakdown'];
  }) => void;
}

function SubmitProofDialog({
  open,
  job,
  demoMode,
  address,
  authorization,
  onClose,
  onSuccess,
}: SubmitProofDialogProps) {
  const { signMessageAsync } = useSignMessage();
  const [artifactUri, setArtifactUri] = useState('');
  const [traceUri, setTraceUri] = useState('');
  const [summary, setSummary] = useState('');
  const [status, setStatus] = useState<'idle' | 'challenging' | 'signing' | 'submitting' | 'error'>(
    'idle',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit() {
    setErrorMessage(null);

    const trimmedArtifactUri = artifactUri.trim();
    const trimmedTraceUri = traceUri.trim();
    const trimmedSummary = summary.trim();

    if (!job.activeClaimId) {
      setStatus('error');
      setErrorMessage('This claim is missing a claim ID. Refresh the board and try again.');
      return;
    }
    if (!trimmedArtifactUri || !isValidUrl(trimmedArtifactUri)) {
      setStatus('error');
      setErrorMessage('Enter a valid proof URL. A GitHub pull request link is acceptable.');
      return;
    }
    if (trimmedTraceUri && !isValidUrl(trimmedTraceUri)) {
      setStatus('error');
      setErrorMessage('Trace URL must be a valid URL.');
      return;
    }

    const submission = {
      claimId: job.activeClaimId,
      status: 'completed' as const,
      artifactUris: [trimmedArtifactUri],
      summary: trimmedSummary || undefined,
      traceUri: trimmedTraceUri || undefined,
    };

    try {
      if (demoMode) {
        setStatus('submitting');
        const result = await submitJobDemo(job.jobId, {
          ...submission,
          workerId: job.activeClaimWorkerId ?? makeDemoAddress(`demo-worker:${job.jobId}`),
          agentMetadata: {
            agentType: 'demo-web-worker',
            agentVersion: '0.1.0',
            operatorAddress: makeDemoAddress('demo-web-operator'),
          },
        });
        onSuccess({
          jobId: job.jobId,
          artifactUri: trimmedArtifactUri,
          submissionId: result.submissionId,
          scoreBreakdown: result.scoreBreakdown,
        });
        setStatus('idle');
        return;
      }

      if (!address || !authorization) {
        throw new Error('Wallet-connected worker authorization required');
      }

      const fingerprint = authorization.fingerprint ?? authorization.authorizationId;
      setStatus('challenging');
      const { challengeId, message } = await createAuthChallenge(address, 'worker_submit', {
        agentFingerprint: fingerprint,
        jobId: job.jobId,
      });
      setStatus('signing');
      const signature = await signMessageAsync({ message });
      setStatus('submitting');
      const result = await submitJob(job.jobId, submission, {
        accountAddress: address,
        agentFingerprint: fingerprint,
        challengeId,
        signature,
      });
      onSuccess({
        jobId: job.jobId,
        artifactUri: trimmedArtifactUri,
        submissionId: result.submissionId,
        scoreBreakdown: result.scoreBreakdown,
      });
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Proof submission failed');
    }
  }

  function handleClose() {
    setStatus('idle');
    setErrorMessage(null);
    onClose();
  }

  const isProcessing = ['challenging', 'signing', 'submitting'].includes(status);

  const statusLabel: Record<typeof status, string> = {
    idle: 'Submit Proof',
    challenging: 'Creating challenge…',
    signing: 'Waiting for signature…',
    submitting: 'Submitting proof…',
    error: 'Retry',
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && handleClose()}>
      <DialogContent className="max-w-lg border-gray-700 bg-gray-900">
        <DialogHeader>
          <DialogTitle className="text-white">Submit Proof</DialogTitle>
          <DialogDescription>
            Paste the artifact URL for this claimed job. A GitHub pull request link is enough for
            the demo and review flow.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2 rounded-lg bg-gray-800/60 p-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Milestone</span>
              <span className="capitalize text-gray-300">{job.milestoneType}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Job ID</span>
              <span className="font-mono text-xs text-gray-300">{shortId(job.jobId, 14, 0)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Claim ID</span>
              <span className="font-mono text-xs text-gray-300">
                {shortId(job.activeClaimId, 14, 6)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Submitting as</span>
              <span className="font-mono text-xs text-gray-300">
                {demoMode
                  ? shortId(job.activeClaimWorkerId ?? makeDemoAddress(`demo-worker:${job.jobId}`))
                  : shortId(address)}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="artifact-uri" className="text-gray-300">
              Proof URL
            </Label>
            <Input
              id="artifact-uri"
              value={artifactUri}
              onChange={(event) => setArtifactUri(event.target.value)}
              placeholder="https://github.com/org/repo/pull/123"
              className="border-gray-700 bg-gray-950 text-gray-100"
              disabled={isProcessing}
            />
            <p className="text-xs text-gray-500">
              Use a GitHub PR, commit compare link, artifact bundle, or other reviewable URL.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="proof-summary" className="text-gray-300">
              Summary
            </Label>
            <Textarea
              id="proof-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="What the agent built, what changed, and how to review it."
              className="min-h-[110px] border-gray-700 bg-gray-950 text-gray-100"
              disabled={isProcessing}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trace-uri" className="text-gray-300">
              Trace URL
            </Label>
            <Input
              id="trace-uri"
              value={traceUri}
              onChange={(event) => setTraceUri(event.target.value)}
              placeholder="https://example.com/agent-trace.json"
              className="border-gray-700 bg-gray-950 text-gray-100"
              disabled={isProcessing}
            />
            <p className="text-xs text-gray-500">
              Optional. The 0G dossier is assembled after human acceptance, not at submit time.
            </p>
          </div>

          {status === 'signing' && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-800 bg-yellow-900/20 px-3 py-2 text-xs text-yellow-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Check your wallet for a signature request.
            </div>
          )}

          {status === 'error' && errorMessage && (
            <div className="flex items-start gap-2 rounded-lg border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-400">
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {errorMessage}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={handleClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isProcessing}>
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {statusLabel[status]}
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4" />
                {statusLabel[status]}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Claim success banner ─────────────────────────────────────────────────────

function ClaimSuccessBanner({
  result,
  onDismiss,
}: {
  result: { claimId: string; expiresAt: string; skillMdUrl: string };
  onDismiss: () => void;
}) {
  return (
    <div className="bg-green-900/30 border border-green-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
        <p className="text-green-300 font-semibold text-sm">Job claimed successfully</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-gray-500 text-xs">Claim ID</span>
          <p className="text-gray-200 font-mono text-xs break-all mt-0.5">{result.claimId}</p>
        </div>
        <div>
          <span className="text-gray-500 text-xs">Lease expires</span>
          <p className="text-gray-200 text-xs mt-0.5">
            {new Date(result.expiresAt).toLocaleString()}
          </p>
        </div>
      </div>
      <p className="text-gray-400 text-xs">
        Fetch <span className="font-mono text-blue-400">skill.md</span> and run it with your agent
        stack. Then use <span className="font-medium text-gray-300">Submit Proof</span> on the
        claimed row to attach a GitHub PR or other artifact URL.
      </p>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" asChild>
          <a href={result.skillMdUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            Open skill.md
          </a>
        </Button>
        <Button size="sm" variant="secondary" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function SubmissionSuccessBanner({
  result,
  onDismiss,
}: {
  result: {
    artifactUri: string;
    submissionId: string;
    scoreBreakdown: SubmissionResponse['scoreBreakdown'];
  };
  onDismiss: () => void;
}) {
  const passed = result.scoreBreakdown.scoreStatus === 'passed';

  return (
    <div
      className={cn(
        'space-y-3 rounded-xl border p-4',
        passed ? 'border-green-700 bg-green-900/30' : 'border-yellow-700 bg-yellow-900/20',
      )}
    >
      <div className="flex items-center gap-2">
        {passed ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
        ) : (
          <AlertCircle className="h-4 w-4 shrink-0 text-yellow-400" />
        )}
        <p className={cn('text-sm font-semibold', passed ? 'text-green-300' : 'text-yellow-200')}>
          {passed ? 'Proof submitted for review' : 'Submission needs rework'}
        </p>
      </div>
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <div>
          <span className="text-xs text-gray-500">Submission ID</span>
          <p className="mt-0.5 break-all font-mono text-xs text-gray-200">{result.submissionId}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500">Score</span>
          <p className="mt-0.5 text-xs text-gray-200">
            {result.scoreBreakdown.totalScore}/100 · {result.scoreBreakdown.scoreStatus}
          </p>
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Judges can now see the submitted proof on the board. The accepted dossier is uploaded to
        0G only after authenticated human acceptance.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" asChild>
          <a href={result.artifactUri} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            Open Proof
          </a>
        </Button>
        <Button size="sm" variant="secondary" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

// ─── Grouped job board ────────────────────────────────────────────────────────

function MilestoneTaskRow({
  milestone,
  activeTab,
  canClaim,
  claimDisabled,
  claimLabel,
  ownershipLabel,
  canSubmit,
  canUnclaim,
  onUnclaim,
  onClaim,
  onSubmit,
  onView,
}: {
  milestone: JobBoardMilestone;
  activeTab: StatusTab;
  canClaim: boolean;
  claimDisabled?: boolean;
  claimLabel?: string;
  ownershipLabel?: string | null;
  canSubmit?: boolean;
  canUnclaim?: boolean;
  onUnclaim?: () => void;
  onClaim: () => void;
  onSubmit?: () => void;
  onView: () => void;
}) {
  const isClaimable = milestone.status === 'queued';
  const isReviewable = ['submitted', 'accepted', 'rework'].includes(milestone.status);
  const isActive = ['claimed', 'running'].includes(milestone.status);
  const isMatchingTab = milestone.status === activeTab;
  const canResume = milestone.status === 'claimed';
  const latestArtifactUris = milestone.latestSubmission?.artifactUris ?? [];

  const statusVariant = (
    ['queued', 'claimed', 'submitted', 'accepted', 'rejected', 'rework', 'settled', 'created'] as const
  ).includes(milestone.status as never)
    ? (milestone.status as 'queued' | 'claimed' | 'submitted' | 'accepted' | 'rejected' | 'rework' | 'settled' | 'created')
    : 'default' as const;

  return (
    <div
      className={cn(
        'rounded-xl border bg-gray-950/60 p-4',
        ownershipLabel
          ? 'border-emerald-700/50 bg-emerald-950/10'
          : isMatchingTab
          ? 'border-blue-800/70'
          : 'border-gray-800'
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold capitalize text-white">
              {milestone.milestoneType} task
            </span>
            <Badge variant={statusVariant}>{milestone.status.toUpperCase()}</Badge>
            {isMatchingTab && <Badge variant="info">IN THIS TAB</Badge>}
            {ownershipLabel && <Badge variant="success">{ownershipLabel}</Badge>}
            {isActive && (
              <Badge variant="info" className="animate-pulse">
                LIVE
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-300">{milestone.title}</p>
          <p className="text-xs text-gray-500">{milestone.description}</p>
          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            <span>
              Job:{' '}
              <span className="font-mono text-gray-400">{milestone.jobId.slice(0, 12)}…</span>
            </span>
          </div>
          {milestone.activeClaimWorkerId && (
            <p className="text-xs text-gray-500">
              Claimed by:{' '}
              <span className="font-mono text-gray-400">{milestone.activeClaimWorkerId}</span>
              {milestone.activeClaimAgentFingerprint && (
                <>
                  {' · '}
                  <span className="text-gray-500">Agent </span>
                  <span className="font-mono text-gray-400">
                    {shortId(milestone.activeClaimAgentFingerprint, 10, 6)}
                  </span>
                </>
              )}
            </p>
          )}
          {milestone.leaseExpiry && isActive && (
            <p className="flex items-center gap-1 text-xs text-yellow-500">
              <Clock className="h-3 w-3" />
              Lease expires {new Date(milestone.leaseExpiry).toLocaleTimeString()}
            </p>
          )}
          {milestone.latestSubmission && (
            <div className="mt-3 space-y-2 rounded-lg border border-gray-800 bg-gray-900/80 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={milestone.latestSubmission.scoreStatus === 'passed' ? 'submitted' : 'warning'}>
                  Proof Submitted
                </Badge>
                <span className="text-gray-500">
                  {new Date(milestone.latestSubmission.submittedAt).toLocaleString()}
                </span>
                {milestone.latestSubmission.accountAddress && (
                  <span className="font-mono text-gray-400">
                    {shortId(milestone.latestSubmission.accountAddress)}
                  </span>
                )}
                {milestone.latestSubmission.agentFingerprint && (
                  <span className="font-mono text-gray-500">
                    {shortId(milestone.latestSubmission.agentFingerprint, 10, 6)}
                  </span>
                )}
              </div>
              {milestone.latestSubmission.summary && (
                <p className="text-xs text-gray-300">{milestone.latestSubmission.summary}</p>
              )}
              {latestArtifactUris.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {latestArtifactUris.slice(0, 2).map((artifactUri) => (
                    <Button key={artifactUri} size="sm" variant="secondary" asChild>
                      <a href={artifactUri} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open Proof
                      </a>
                    </Button>
                  ))}
                  {latestArtifactUris.length > 2 && (
                    <Badge variant="default">+{latestArtifactUris.length - 2} more</Badge>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <div className="text-right">
            <p className="font-bold text-green-400">${milestone.budgetUsd}</p>
            <p className="text-xs text-gray-500">USDC</p>
          </div>
          {canResume && (
            <Button size="sm" variant="secondary" asChild>
              <a href={milestone.skillMdUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                Open skill.md
              </a>
            </Button>
          )}
          {canResume && canSubmit && onSubmit && (
            <Button size="sm" onClick={onSubmit}>
              Submit Proof
            </Button>
          )}
          {canResume && canUnclaim && onUnclaim && (
            <Button size="sm" variant="outline" onClick={onUnclaim}>
              Unclaim
            </Button>
          )}
          {isClaimable && (
            <Button
              size="sm"
              onClick={onClaim}
              disabled={!canClaim || claimDisabled}
              title={canClaim ? undefined : 'Complete worker setup to claim jobs'}
            >
              {claimLabel ?? 'Claim'}
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
          {isReviewable && (
            <Button size="sm" variant="secondary" onClick={onView}>
              Review
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function JobGroupCard({
  group,
  activeTab,
  expanded,
  canClaim,
  claimDisabledJobId,
  claimLabelFor,
  getOwnershipLabel,
  canSubmit,
  canUnclaim,
  onToggle,
  onClaim,
  onUnclaim,
  onSubmit,
  onView,
  onViewIdea,
}: {
  group: JobBoardGroup;
  activeTab: StatusTab;
  expanded: boolean;
  canClaim: boolean;
  claimDisabledJobId?: string | null;
  claimLabelFor: (milestone: JobBoardMilestone) => string;
  getOwnershipLabel: (milestone: JobBoardMilestone) => string | null;
  canSubmit: (milestone: JobBoardMilestone) => boolean;
  canUnclaim: (milestone: JobBoardMilestone) => boolean;
  onToggle: () => void;
  onClaim: (milestone: JobBoardMilestone) => void;
  onUnclaim: (milestone: JobBoardMilestone) => void;
  onSubmit: (milestone: JobBoardMilestone) => void;
  onView: (milestone: JobBoardMilestone) => void;
  onViewIdea: () => void;
}) {
  const queuedCount = group.milestones.filter((milestone) => milestone.status === 'queued').length;
  const claimedCount = group.milestones.filter((milestone) => milestone.status === 'claimed').length;
  const myCount = group.milestones.filter((milestone) => getOwnershipLabel(milestone)).length;
  const proofCount = group.milestones.filter((milestone) => milestone.latestSubmission).length;
  const matchingLabel = `${group.matchingMilestoneCount} ${activeTab} ${
    group.matchingMilestoneCount === 1 ? 'task' : 'tasks'
  }`;

  return (
    <Card className="border-gray-800 bg-gray-900/40">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold text-white">{group.title}</span>
              <Badge variant="info">{matchingLabel}</Badge>
              <Badge variant="default">{group.milestones.length} total tasks</Badge>
              {queuedCount > 0 && <Badge variant="queued">{queuedCount} queued</Badge>}
              {claimedCount > 0 && <Badge variant="claimed">{claimedCount} claimed</Badge>}
              {myCount > 0 && <Badge variant="success">{myCount} mine</Badge>}
              {proofCount > 0 && <Badge variant="submitted">{proofCount} proof</Badge>}
            </div>
            <p className="text-sm text-gray-300">{group.prompt}</p>
            <p className="text-xs text-gray-500">{group.briefSummary}</p>
            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              <span>
                Brief:{' '}
                <span className="font-mono text-gray-400">{group.briefId.slice(0, 12)}…</span>
              </span>
              <span>Poster: <span className="font-mono text-gray-400">{group.posterId}</span></span>
              <span>Planned {new Date(group.generatedAt).toLocaleString()}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="text-right">
              <p className="font-bold text-green-400">${group.budgetUsd}</p>
              <p className="text-xs text-gray-500">Idea budget</p>
            </div>
            <Button size="sm" variant="secondary" onClick={onViewIdea}>
              View Idea
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" onClick={onToggle}>
              {expanded ? 'Hide tasks' : 'Browse tasks'}
              <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')} />
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="space-y-3 border-t border-gray-800 pt-4">
            {group.milestones.map((milestone) => (
              <MilestoneTaskRow
                key={milestone.jobId}
                milestone={milestone}
                activeTab={activeTab}
                canClaim={canClaim}
                claimDisabled={claimDisabledJobId === milestone.jobId}
                claimLabel={claimLabelFor(milestone)}
                ownershipLabel={getOwnershipLabel(milestone)}
                canSubmit={canSubmit(milestone)}
                canUnclaim={canUnclaim(milestone)}
                onClaim={() => onClaim(milestone)}
                onUnclaim={() => onUnclaim(milestone)}
                onSubmit={() => onSubmit(milestone)}
                onView={() => onView(milestone)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function JobsBoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isConnected, address, session, isWorkerVerified, signIn } = useSession();

  const [activeTab, setActiveTab] = useState<StatusTab>('queued');
  const [claimingJob, setClaimingJob] = useState<JobBoardMilestone | null>(null);
  const [claimResult, setClaimResult] = useState<{
    claimId: string;
    expiresAt: string;
    skillMdUrl: string;
  } | null>(null);
  const [submittingJob, setSubmittingJob] = useState<JobBoardMilestone | null>(null);
  const [submissionResult, setSubmissionResult] = useState<{
    artifactUri: string;
    submissionId: string;
    scoreBreakdown: SubmissionResponse['scoreBreakdown'];
  } | null>(null);
  const [demoClaimingJobId, setDemoClaimingJobId] = useState<string | null>(null);
  const [releasingJob, setReleasingJob] = useState<JobBoardMilestone | null>(null);
  const [expandedBriefs, setExpandedBriefs] = useState<Record<string, boolean>>({});

  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [isCreatingAuth, setIsCreatingAuth] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const hasSession = !!session;

  const { data: jobsData, isLoading, error, refetch } = useQuery({
    queryKey: ['job-board', activeTab],
    queryFn: () => getJobBoard(activeTab),
    refetchInterval: 10_000,
  });
  const { data: integrations } = useQuery({
    queryKey: ['integrations-status'],
    queryFn: getIntegrationsStatus,
    staleTime: 30_000,
  });

  const { data: authsData, refetch: refetchAuths } = useQuery({
    queryKey: ['agent-authorizations'],
    queryFn: listAgentAuthorizations,
    enabled: hasSession,
    staleTime: 30_000,
  });

  const workerAuths =
    authsData?.authorizations.filter(a => a.role === 'worker') ?? [];
  const activeAuthorization = workerAuths.find(
    a => a.status === 'active' || a.status === 'pending_registration'
  ) ?? workerAuths[0] ?? null;

  const isRegistrationSynced =
    activeAuthorization?.status === 'active' ||
    !!activeAuthorization?.onChainTokenId;

  const strictClaimReady =
    isConnected &&
    hasSession &&
    isWorkerVerified &&
    !!activeAuthorization &&
    isRegistrationSynced;
  const demoClaimEnabled = integrations?.world.strict === false;
  const canClaim = strictClaimReady || demoClaimEnabled;
  const currentWorkerAddress = normalizeId(session?.accountAddress ?? address);
  const currentAgentFingerprint = activeAuthorization?.fingerprint ?? activeAuthorization?.authorizationId ?? '';

  const groups = jobsData?.groups ?? [];

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

  async function handleCreateAuthorization() {
    setIsCreatingAuth(true);
    setAuthError(null);
    try {
      await createAgentAuthorization({
        agentType: 'claude-code',
        agentVersion: '1.0.0',
        role: 'worker',
        permissionScope: ['claim_jobs', 'submit_results'],
      });
      await refetchAuths();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authorization failed');
    } finally {
      setIsCreatingAuth(false);
    }
  }

  function switchTab(tab: StatusTab) {
    setActiveTab(tab);
    setClaimingJob(null);
    setSubmittingJob(null);
    setReleasingJob(null);
    setClaimResult(null);
    setSubmissionResult(null);
  }

  function toggleGroup(briefId: string) {
    setExpandedBriefs((current) => ({
      ...current,
      [briefId]: !current[briefId],
    }));
  }

  async function handleDemoClaim(job: JobBoardMilestone) {
    setDemoClaimingJobId(job.jobId);
    setSignInError(null);
    setAuthError(null);
    try {
      const result = await claimJobDemo(job.jobId, {
        workerId: makeDemoAddress(`demo-worker:${job.jobId}`),
        agentMetadata: {
          agentType: 'demo-web-worker',
          agentVersion: '0.1.0',
          operatorAddress: makeDemoAddress('demo-web-operator'),
        },
      });
      setClaimResult(result);
      setActiveTab('claimed');
      await queryClient.invalidateQueries({ queryKey: ['job-board'] });
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Demo claim failed');
    } finally {
      setDemoClaimingJobId(null);
    }
  }

  function getClaimLabel(job: JobBoardMilestone) {
    if (strictClaimReady) return 'Claim';
    return demoClaimingJobId === job.jobId ? 'Claiming...' : 'Demo Claim';
  }

  function isDemoOwnedJob(job: JobBoardMilestone) {
    const demoWorkerAddress = normalizeId(makeDemoAddress(`demo-worker:${job.jobId}`));
    return (
      normalizeId(job.activeClaimWorkerId) === demoWorkerAddress
      || normalizeId(job.latestSubmission?.accountAddress) === demoWorkerAddress
    );
  }

  function getMilestoneOwnership(job: JobBoardMilestone) {
    const matchesWorker = Boolean(
      currentWorkerAddress
      && (
        normalizeId(job.activeClaimWorkerId) === currentWorkerAddress
        || normalizeId(job.latestSubmission?.accountAddress) === currentWorkerAddress
      ),
    );
    if (matchesWorker) {
      return 'YOURS';
    }

    const matchesAgent = Boolean(
      currentAgentFingerprint
      && (
        job.activeClaimAgentFingerprint === currentAgentFingerprint
        || job.latestSubmission?.agentFingerprint === currentAgentFingerprint
      ),
    );
    if (matchesAgent) {
      return 'YOUR AGENT';
    }

    if (demoClaimEnabled && isDemoOwnedJob(job)) {
      return 'DEMO';
    }

    return null;
  }

  function canUnclaimJob(job: JobBoardMilestone) {
    if (job.status !== 'claimed') return false;
    if (demoClaimEnabled) return isDemoOwnedJob(job);
    return Boolean(
      strictClaimReady
      && currentWorkerAddress
      && job.activeClaimWorkerId
      && normalizeId(job.activeClaimWorkerId) === currentWorkerAddress
    );
  }

  function canSubmitProof(job: JobBoardMilestone) {
    if (job.status !== 'claimed' || !job.activeClaimId) return false;
    if (demoClaimEnabled) return isDemoOwnedJob(job);
    return Boolean(strictClaimReady && getMilestoneOwnership(job));
  }

  const myTaskCount = groups
    .flatMap((group) => group.milestones)
    .filter((milestone) => milestone.status === activeTab && getMilestoneOwnership(milestone)).length;
  const orderedGroups = [...groups].sort((left, right) => {
    const leftMine = left.milestones.some(
      (milestone) => milestone.status === activeTab && getMilestoneOwnership(milestone),
    );
    const rightMine = right.milestones.some(
      (milestone) => milestone.status === activeTab && getMilestoneOwnership(milestone),
    );
    return Number(rightMine) - Number(leftMine);
  });

  return (
    <div className="page">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Jobs Board</h1>
          <p className="text-gray-400 mt-1">
            Browse funded request briefs, expand them into milestone tasks, then claim one concrete
            job and run its <span className="font-mono text-blue-400">skill.md</span> with your
            agent stack.
          </p>
        </div>
        {demoClaimEnabled && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Demo mode is enabled. Unsigned browser claims are allowed while World strict mode is off.
            </AlertDescription>
          </Alert>
        )}

        <AgentPickupGuide />

        {/* Identity summary strip */}
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
            {isWorkerVerified && (
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Worker verified
              </Badge>
            )}
            {activeAuthorization && (
              <Badge variant={isRegistrationSynced ? 'success' : 'warning'} className="gap-1">
                <Key className="h-3 w-3" />
                {activeAuthorization.agentType}
                {isRegistrationSynced ? '' : ' (unsynced)'}
              </Badge>
            )}
            {isRegistrationSynced && activeAuthorization?.onChainTokenId && (
              <Badge variant="info" className="gap-1">
                <Link2 className="h-3 w-3" />
                Token #{activeAuthorization.onChainTokenId}
              </Badge>
            )}
          </div>
        )}

        {/* Worker onboarding checklist */}
        {!strictClaimReady && !demoClaimEnabled && (
          <WorkerOnboarding
            isConnected={isConnected}
            address={address}
            hasSession={hasSession}
            isWorkerVerified={isWorkerVerified}
            activeAuthorization={activeAuthorization}
            onSignIn={handleSignIn}
            onCreateAuthorization={handleCreateAuthorization}
            isSigningIn={isSigningIn}
            isCreatingAuth={isCreatingAuth}
          />
        )}

        {/* Inline errors */}
        {signInError && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{signInError}</AlertDescription>
          </Alert>
        )}
        {authError && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{authError}</AlertDescription>
          </Alert>
        )}

        {/* Claim success banner */}
        {claimResult && (
          <ClaimSuccessBanner result={claimResult} onDismiss={() => setClaimResult(null)} />
        )}
        {submissionResult && (
          <SubmissionSuccessBanner
            result={submissionResult}
            onDismiss={() => setSubmissionResult(null)}
          />
        )}

        {/* Status tabs */}
        <Tabs value={activeTab} onValueChange={(v) => switchTab(v as StatusTab)}>
          <TabsList>
            {STATUS_TABS.map(tab => (
              <TabsTrigger key={tab} value={tab} className="capitalize">{tab}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {activeTab !== 'queued' && (
          <Card className="border-gray-800 bg-gray-900/40">
            <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white">
                  {myTaskCount} {activeTab} task{myTaskCount === 1 ? '' : 's'} tied to this wallet
                  or selected agent.
                </p>
                <p className="text-xs text-gray-500">
                  {activeTab === 'claimed'
                    ? 'Use Submit Proof on your claimed task to attach a GitHub PR or other proof URL.'
                    : 'Submitted proof links are shown inline here so judges can inspect them from the board.'}
                </p>
              </div>
              {currentAgentFingerprint && (
                <Badge variant="info" className="font-mono">
                  Agent {shortId(currentAgentFingerprint, 10, 6)}
                </Badge>
              )}
            </CardContent>
          </Card>
        )}

        {/* Jobs list */}
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : error ? (
          <Card className="border-gray-700">
            <CardContent className="text-center py-8 space-y-3">
              <p className="text-red-400 text-sm">{String(error)}</p>
              <Button variant="secondary" onClick={() => refetch()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : groups.length === 0 ? (
          <Card className="border-gray-700">
            <CardContent className="text-center py-12 space-y-3">
              <AlertCircle className="h-8 w-8 text-gray-600 mx-auto" />
              <p className="text-gray-400">
                No <span className="text-white">{activeTab}</span> request briefs right now.
              </p>
              {activeTab === 'queued' && (
                <p className="text-gray-500 text-sm">
                  Post a funded idea to generate milestone jobs.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {orderedGroups.map((group) => (
              <JobGroupCard
                key={group.briefId}
                group={group}
                activeTab={activeTab}
                expanded={Boolean(expandedBriefs[group.briefId])}
                canClaim={canClaim}
                claimDisabledJobId={demoClaimingJobId}
                claimLabelFor={getClaimLabel}
                getOwnershipLabel={getMilestoneOwnership}
                canSubmit={canSubmitProof}
                canUnclaim={canUnclaimJob}
                onToggle={() => toggleGroup(group.briefId)}
                onClaim={(job) => {
                  setClaimResult(null);
                  setSubmissionResult(null);
                  if (strictClaimReady) {
                    setClaimingJob(job);
                    return;
                  }
                  void handleDemoClaim(job);
                }}
                onUnclaim={(job) => {
                  setClaimResult(null);
                  setReleasingJob(job);
                }}
                onSubmit={(job) => {
                  setClaimResult(null);
                  setSubmissionResult(null);
                  setSubmittingJob(job);
                }}
                onView={(job) => navigate(`/review/${job.jobId}`)}
                onViewIdea={() => navigate(`/ideas/${group.ideaId}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Claim dialog */}
      {claimingJob && address && activeAuthorization && strictClaimReady && (
        <ClaimDialog
          open={!!claimingJob}
          jobId={claimingJob.jobId}
          address={address}
          authorization={activeAuthorization}
          onClose={() => setClaimingJob(null)}
          onSuccess={result => {
            setClaimingJob(null);
            setClaimResult(result);
            setActiveTab('claimed');
            queryClient.invalidateQueries({ queryKey: ['job-board'] });
            queryClient.invalidateQueries({ queryKey: ['jobs'] });
          }}
        />
      )}

      {submittingJob && (
        <SubmitProofDialog
          open={!!submittingJob}
          job={submittingJob}
          demoMode={demoClaimEnabled}
          address={address}
          authorization={activeAuthorization}
          onClose={() => setSubmittingJob(null)}
          onSuccess={(result) => {
            setSubmittingJob(null);
            setSubmissionResult(result);
            setActiveTab(result.scoreBreakdown.scoreStatus === 'passed' ? 'submitted' : 'rework');
            queryClient.invalidateQueries({ queryKey: ['job-board'] });
            queryClient.invalidateQueries({ queryKey: ['jobs'] });
          }}
        />
      )}

      {releasingJob && (
        <UnclaimDialog
          open={!!releasingJob}
          job={releasingJob}
          demoMode={demoClaimEnabled}
          address={address}
          authorization={activeAuthorization}
          onClose={() => setReleasingJob(null)}
          onSuccess={() => {
            setReleasingJob(null);
            queryClient.invalidateQueries({ queryKey: ['job-board'] });
            queryClient.invalidateQueries({ queryKey: ['jobs'] });
          }}
        />
      )}
    </div>
  );
}
