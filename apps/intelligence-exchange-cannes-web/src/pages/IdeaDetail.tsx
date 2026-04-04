import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Clock,
  AlertCircle,
  Zap,
  FileText,
  DollarSign,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getIdea } from '../api';

// ─── Job lifecycle ─────────────────────────────────────────────────────────────
// created → queued → claimed → submitted → accepted → settled

type JobStatus =
  | 'created'
  | 'queued'
  | 'claimed'
  | 'running'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'rework'
  | 'settled';

const JOB_STATUS_ORDER: JobStatus[] = [
  'created',
  'queued',
  'claimed',
  'submitted',
  'accepted',
  'settled',
];

function jobStatusIndex(status: string): number {
  const idx = JOB_STATUS_ORDER.indexOf(status as JobStatus);
  return idx === -1 ? 0 : idx;
}

// ─── Chain sync state helpers ─────────────────────────────────────────────────

interface SyncRowProps {
  label: string;
  txHash?: string | null;
  synced: boolean;
  icon: React.ReactNode;
}

function ChainSyncRow({ label, txHash, synced, icon }: SyncRowProps) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
          synced ? 'bg-green-900/60' : 'bg-gray-800'
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('text-sm font-medium', synced ? 'text-gray-200' : 'text-gray-500')}>
            {label}
          </span>
          <Badge variant={synced ? 'success' : 'default'}>{synced ? 'Synced' : 'Pending'}</Badge>
        </div>
        {txHash ? (
          <p className="text-xs font-mono text-gray-500 break-all mt-0.5">{txHash}</p>
        ) : (
          <p className="text-xs text-gray-600 mt-0.5">No transaction hash yet</p>
        )}
      </div>
    </div>
  );
}

// ─── Milestone row ────────────────────────────────────────────────────────────

interface MilestoneJob {
  jobId: string;
  milestoneType: string;
  status: string;
  budgetUsd: string;
  leaseExpiry?: string;
}

function statusBadgeVariant(
  status: string
): React.ComponentProps<typeof Badge>['variant'] {
  switch (status) {
    case 'queued': return 'queued';
    case 'claimed':
    case 'running': return 'claimed';
    case 'submitted': return 'submitted';
    case 'accepted': return 'accepted';
    case 'rejected': return 'rejected';
    case 'rework': return 'rejected';
    case 'settled': return 'settled';
    case 'created': return 'created';
    default: return 'default';
  }
}

function MilestoneRow({
  index,
  milestoneType,
  job,
  onReview,
}: {
  index: number;
  milestoneType: string;
  job?: MilestoneJob;
  onReview: () => void;
}) {
  if (!job) {
    return (
      <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-800/30 opacity-40">
        <div className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center text-xs text-gray-500 font-bold shrink-0">
          {index}
        </div>
        <div className="flex-1">
          <p className="text-gray-400 text-sm capitalize font-medium">{milestoneType}</p>
          <p className="text-gray-600 text-xs mt-0.5">Not yet created</p>
        </div>
        <Badge variant="default">PENDING</Badge>
      </div>
    );
  }

  const statusIdx = jobStatusIndex(job.status);
  const isActive = job.status === 'claimed' || job.status === 'running';
  const canReview = ['submitted', 'accepted', 'rejected', 'rework'].includes(job.status);
  const isSettled = job.status === 'settled';
  const isCreated = job.status === 'created';

  return (
    <div
      className={cn(
        'flex items-start gap-4 p-3 rounded-lg transition-colors',
        isActive && 'bg-blue-900/20 border border-blue-900/40',
        job.status === 'accepted' && 'bg-green-900/10 border border-green-900/30',
        isSettled && 'bg-teal-900/10 border border-teal-900/30',
        !isActive && !['accepted', 'settled'].includes(job.status) && 'bg-gray-800/30'
      )}
    >
      {/* Step indicator */}
      <div
        className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5',
          isSettled && 'bg-teal-700 text-white',
          job.status === 'accepted' && 'bg-green-700 text-white',
          job.status === 'submitted' && 'bg-purple-700 text-white',
          isActive && 'bg-blue-700 text-white',
          isCreated && 'bg-gray-700 text-gray-400',
          job.status === 'queued' && 'bg-yellow-900 text-yellow-300',
          !['settled', 'accepted', 'submitted', 'claimed', 'running', 'created', 'queued'].includes(job.status) && 'bg-gray-700 text-gray-300'
        )}
      >
        {['accepted', 'settled'].includes(job.status) ? (
          <CheckCircle2 className="w-3.5 h-3.5" />
        ) : (
          index
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-white text-sm capitalize font-medium">{milestoneType}</p>
          <Badge variant={statusBadgeVariant(job.status)}>{job.status.toUpperCase()}</Badge>
          {isActive && (
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse inline-block" />
          )}
        </div>

        {/* Sub-status details */}
        <div className="mt-1 space-y-0.5">
          <p className="text-gray-500 text-xs">
            ${job.budgetUsd} USDC
            {isActive && job.leaseExpiry && (
              <> · Lease expires <span className="text-yellow-400">{new Date(job.leaseExpiry).toLocaleTimeString()}</span></>
            )}
          </p>

          {isCreated && (
            <p className="text-xs text-yellow-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Awaiting milestone reservation sync — job cannot be claimed yet
            </p>
          )}

          {isSettled && (
            <p className="text-xs text-teal-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Released and attested on-chain
            </p>
          )}

          <p className="text-gray-600 text-xs font-mono">ID: {job.jobId}</p>
        </div>

        {/* Lifecycle mini-progress for active or complete jobs */}
        {statusIdx > 0 && (
          <div className="mt-2 flex items-center gap-1">
            {JOB_STATUS_ORDER.map((s, i) => (
              <div
                key={s}
                className={cn(
                  'h-1 rounded-full flex-1',
                  i < statusIdx && 'bg-green-600',
                  i === statusIdx && 'bg-blue-500',
                  i > statusIdx && 'bg-gray-700'
                )}
                title={s}
              />
            ))}
          </div>
        )}
      </div>

      {canReview && (
        <Button size="sm" variant="secondary" onClick={onReview} className="shrink-0">
          {job.status === 'submitted' ? 'Review' : 'View'}
          <ExternalLink className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IdeaDetail() {
  const { ideaId } = useParams<{ ideaId: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['idea', ideaId],
    queryFn: () => getIdea(ideaId!),
    enabled: !!ideaId,
    refetchInterval: 8_000,
  });

  if (!ideaId) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <AlertCircle className="w-10 h-10 text-yellow-400 mx-auto" />
            <p className="text-gray-400">No idea ID provided.</p>
            <Button onClick={() => navigate('/submit')}>Submit an Idea</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <Loader2 className="animate-spin w-8 h-8 text-blue-400 mx-auto" />
          <p className="text-gray-400 text-sm">Loading idea…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <XCircle className="w-10 h-10 text-red-400 mx-auto" />
            <h1 className="text-xl font-bold text-red-400">Failed to load idea</h1>
            <p className="text-gray-400 text-sm font-mono break-all">
              {String(error || 'Unknown error')}
            </p>
            <Button onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { idea, brief, jobs } = data;

  // Derive lifecycle state
  const acceptedCount = jobs.filter(j => j.status === 'accepted').length;
  const settledCount = jobs.filter(j => j.status === 'settled').length;
  const totalCount = jobs.length;
  const anyActive = jobs.some(j => ['claimed', 'running'].includes(j.status));
  const allAccepted = totalCount > 0 && acceptedCount === totalCount;
  const allSettled = totalCount > 0 && settledCount === totalCount;
  const progressPct = totalCount > 0 ? Math.round((acceptedCount / totalCount) * 100) : 0;

  // Chain sync state from idea fields
  const escrowSynced = !!idea.escrowTxHash;
  const reservationSynced = !!idea.reservationTxHash;
  const releaseSynced = !!idea.releaseTxHash;
  const attestationSynced = !!idea.attestationTxHash;

  // Standard milestone types in order
  const MILESTONE_TYPES = ['brief', 'tasks', 'scaffold', 'review'];
  const jobsByMilestone = MILESTONE_TYPES.map(type => ({
    type,
    job: jobs.find(j => j.milestoneType === type),
  }));

  return (
    <div className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Button
              variant="ghost"
              size="sm"
              className="mb-2 -ml-2 text-gray-500"
              onClick={() => navigate('/ideas')}
            >
              <ArrowLeft className="w-4 h-4" />
              My Ideas
            </Button>
            <h1 className="text-2xl font-bold text-white break-words">{idea.title}</h1>
            <p className="text-gray-400 text-sm mt-1">
              Posted {new Date(idea.createdAt).toLocaleDateString()} ·{' '}
              Budget:{' '}
              <span className="text-white font-medium">${idea.budgetUsd} USDC</span>
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <Badge
              variant={
                idea.fundingStatus === 'funded'
                  ? 'funded'
                  : idea.fundingStatus === 'unfunded'
                  ? 'unfunded'
                  : 'default'
              }
            >
              {idea.fundingStatus.toUpperCase()}
            </Badge>
            {allSettled && <Badge variant="settled">SETTLED</Badge>}
            {!allSettled && allAccepted && <Badge variant="accepted">ALL ACCEPTED</Badge>}
            {anyActive && (
              <Badge variant="claimed" className="animate-pulse">
                ACTIVE
              </Badge>
            )}
          </div>
        </div>

        {/* Idea prompt */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4 text-gray-400" />
              Prompt
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
              {idea.prompt}
            </p>
          </CardContent>
        </Card>

        {/* Chain sync state */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="w-4 h-4 text-gray-400" />
              On-chain State
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-gray-800">
            <ChainSyncRow
              label="Escrow funded"
              txHash={idea.escrowTxHash}
              synced={escrowSynced}
              icon={<DollarSign className={cn('w-4 h-4', escrowSynced ? 'text-green-400' : 'text-gray-600')} />}
            />
            <ChainSyncRow
              label="Milestones reserved"
              txHash={idea.reservationTxHash}
              synced={reservationSynced}
              icon={<ShieldCheck className={cn('w-4 h-4', reservationSynced ? 'text-green-400' : 'text-gray-600')} />}
            />
            <ChainSyncRow
              label="Payment released"
              txHash={idea.releaseTxHash}
              synced={releaseSynced}
              icon={<DollarSign className={cn('w-4 h-4', releaseSynced ? 'text-green-400' : 'text-gray-600')} />}
            />
            <ChainSyncRow
              label="Reputation attested"
              txHash={idea.attestationTxHash}
              synced={attestationSynced}
              icon={<CheckCircle2 className={cn('w-4 h-4', attestationSynced ? 'text-green-400' : 'text-gray-600')} />}
            />
          </CardContent>
        </Card>

        {/* BuildBrief */}
        {brief ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="w-4 h-4 text-gray-400" />
                  BuildBrief
                </CardTitle>
                <Badge variant="accepted">GENERATED</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-gray-300 text-sm leading-relaxed">{brief.summary}</p>
              {brief.dossierUri && (
                <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3">
                  <p className="text-blue-400 text-xs font-medium mb-1">0G Dossier URI</p>
                  <p className="text-blue-300 font-mono text-xs break-all">{brief.dossierUri}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-8 text-center space-y-2">
              <Clock className="w-8 h-8 text-gray-600 mx-auto" />
              <p className="text-gray-400 text-sm">BuildBrief not yet generated.</p>
              <p className="text-gray-600 text-xs">
                Fund and plan the idea to generate the milestone brief.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Milestones */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="w-4 h-4 text-gray-400" />
                Milestones
              </CardTitle>
              <span className="text-gray-500 text-sm">
                {acceptedCount}/{totalCount} accepted
                {settledCount > 0 && settledCount < totalCount && (
                  <> · {settledCount} settled</>
                )}
                {allSettled && totalCount > 0 && (
                  <Badge variant="settled" className="ml-2">ALL SETTLED</Badge>
                )}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Reservation warning */}
            {!reservationSynced && jobs.length > 0 && jobs.some(j => j.status === 'created') && (
              <div className="flex items-start gap-2 bg-yellow-950 border border-yellow-800 rounded-lg p-3 text-yellow-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Reservation tx not yet synced. Jobs remain in{' '}
                  <span className="font-mono">created</span> state and cannot be claimed until
                  the reservation transaction is confirmed and synced.
                </span>
              </div>
            )}

            {/* Progress bar */}
            {totalCount > 0 && (
              <div className="space-y-1">
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-600 rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500">{progressPct}% accepted</p>
              </div>
            )}

            {jobs.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <Clock className="w-8 h-8 text-gray-700 mx-auto" />
                <p className="text-gray-400 text-sm">
                  Milestones are created when the idea is funded and planned.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobsByMilestone.map(({ type, job }, i) => (
                  <MilestoneRow
                    key={type}
                    index={i + 1}
                    milestoneType={type}
                    job={job}
                    onReview={() => job && navigate(`/review/${job.jobId}`)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Idea metadata footer */}
        <div className="text-center space-y-1">
          <p className="text-gray-600 text-xs font-mono">Idea ID: {ideaId}</p>
          {idea.posterId && (
            <p className="text-gray-700 text-xs font-mono">Poster: {idea.posterId}</p>
          )}
        </div>
      </div>
    </div>
  );
}
