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
import {
  claimJob,
  createAuthChallenge,
  listAgentAuthorizations,
  createAgentAuthorization,
  getJobs,
  type AgentAuthorization,
} from '../api';
import { useSession } from '../hooks/useSession';

const STATUS_TABS = ['queued', 'claimed', 'submitted', 'accepted', 'rework'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

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
        stack. Submit your artifact URI and summary back to the broker once done.
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

// ─── Job card ─────────────────────────────────────────────────────────────────

function JobCard({
  job,
  canClaim,
  onClaim,
  onView,
  onViewIdea,
}: {
  job: Job;
  canClaim: boolean;
  onClaim: () => void;
  onView: () => void;
  onViewIdea: () => void;
}) {
  const isClaimable = job.status === 'queued';
  const isReviewable = ['submitted', 'accepted', 'rework'].includes(job.status);
  const isActive = ['claimed', 'running'].includes(job.status);

  const statusVariant = (
    ['queued', 'claimed', 'submitted', 'accepted', 'rejected', 'rework', 'settled', 'created'] as const
  ).includes(job.status as never)
    ? (job.status as 'queued' | 'claimed' | 'submitted' | 'accepted' | 'rejected' | 'rework' | 'settled' | 'created')
    : 'default' as const;

  return (
    <Card
      className={cn(
        'border-gray-800 bg-gray-900/40',
        isClaimable && 'border-yellow-900/60 hover:border-yellow-700/60 transition-colors'
      )}
    >
      <CardContent className="flex flex-col md:flex-row md:items-center gap-4 p-4">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-semibold capitalize">
              {job.milestoneType} Milestone
            </span>
            <Badge variant={statusVariant}>{job.status.toUpperCase()}</Badge>
            {isActive && (
              <Badge variant="info" className="animate-pulse">
                LIVE
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            <span>
              Job:{' '}
              <span className="font-mono text-gray-400">{job.jobId.slice(0, 12)}…</span>
            </span>
            <button className="text-blue-400 hover:underline" onClick={onViewIdea}>
              View Idea
              <ChevronRight className="inline h-3 w-3" />
            </button>
          </div>
          {job.activeClaimWorkerId && (
            <p className="text-xs text-gray-500">
              Claimed by:{' '}
              <span className="font-mono text-gray-400">{job.activeClaimWorkerId}</span>
            </p>
          )}
          {job.leaseExpiry && isActive && (
            <p className="text-xs text-yellow-500 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Lease expires {new Date(job.leaseExpiry).toLocaleTimeString()}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-green-400 font-bold">${job.budgetUsd}</p>
            <p className="text-gray-500 text-xs">USDC</p>
          </div>
          {isClaimable && (
            <Button
              size="sm"
              onClick={onClaim}
              disabled={!canClaim}
              title={canClaim ? undefined : 'Complete worker setup to claim jobs'}
            >
              Claim
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
  const [claimingJob, setClaimingJob] = useState<Job | null>(null);
  const [claimResult, setClaimResult] = useState<{
    claimId: string;
    expiresAt: string;
    skillMdUrl: string;
  } | null>(null);

  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [isCreatingAuth, setIsCreatingAuth] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const hasSession = !!session;

  const { data: jobsData, isLoading, error, refetch } = useQuery({
    queryKey: ['jobs', activeTab],
    queryFn: () => getJobs(activeTab),
    refetchInterval: 10_000,
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

  const canClaim =
    isConnected &&
    hasSession &&
    isWorkerVerified &&
    !!activeAuthorization &&
    isRegistrationSynced;

  const jobs = jobsData?.jobs ?? [];

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
    setClaimResult(null);
  }

  return (
    <div className="page">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Jobs Board</h1>
          <p className="text-gray-400 mt-1">
            Open milestone jobs. Complete worker setup, claim a job, fetch its{' '}
            <span className="font-mono text-blue-400">skill.md</span>, and run it with your agent
            stack.
          </p>
        </div>

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
        {!canClaim && (
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
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
            <XCircle className="h-4 w-4 shrink-0" />
            {signInError}
          </div>
        )}
        {authError && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
            <XCircle className="h-4 w-4 shrink-0" />
            {authError}
          </div>
        )}

        {/* Claim success banner */}
        {claimResult && (
          <ClaimSuccessBanner result={claimResult} onDismiss={() => setClaimResult(null)} />
        )}

        {/* Status tabs */}
        <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit">
          {STATUS_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => switchTab(tab)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize',
                activeTab === tab ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Jobs list */}
        {isLoading ? (
          <div className="text-center py-12 space-y-3">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500 mx-auto" />
            <p className="text-gray-400 text-sm">Loading jobs…</p>
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
        ) : jobs.length === 0 ? (
          <Card className="border-gray-700">
            <CardContent className="text-center py-12 space-y-3">
              <AlertCircle className="h-8 w-8 text-gray-600 mx-auto" />
              <p className="text-gray-400">
                No <span className="text-white">{activeTab}</span> jobs right now.
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
            {jobs.map(job => (
              <JobCard
                key={job.jobId}
                job={job}
                canClaim={canClaim}
                onClaim={() => {
                  setClaimResult(null);
                  setClaimingJob(job);
                }}
                onView={() => navigate(`/review/${job.jobId}`)}
                onViewIdea={() => navigate(`/ideas/${job.ideaId}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Claim dialog */}
      {claimingJob && address && activeAuthorization && (
        <ClaimDialog
          open={!!claimingJob}
          jobId={claimingJob.jobId}
          address={address}
          authorization={activeAuthorization}
          onClose={() => setClaimingJob(null)}
          onSuccess={result => {
            setClaimingJob(null);
            setClaimResult(result);
            queryClient.invalidateQueries({ queryKey: ['jobs'] });
          }}
        />
      )}
    </div>
  );
}
