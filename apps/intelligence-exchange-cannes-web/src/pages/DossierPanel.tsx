import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  XCircle,
  ExternalLink,
  FileText,
  CheckCircle2,
  XCircle as XIcon,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getIdea, getIntegrationsStatus } from '../api';
import { useSession } from '../hooks/useSession';

function shortHex(value?: string | null, head = 8, tail = 6) {
  if (!value) return 'Not available';
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function DossierPanel() {
  const { ideaId } = useParams<{ ideaId: string }>();
  const navigate = useNavigate();
  const { session } = useSession();
  const hasSession = !!session;

  const { data: idea, isLoading, error } = useQuery({
    queryKey: ['idea', ideaId],
    queryFn: () => getIdea(ideaId!),
    enabled: !!ideaId,
  });

  const { data: integrations } = useQuery({
    queryKey: ['integrations-status'],
    queryFn: getIntegrationsStatus,
    staleTime: 30_000,
  });

  const zeroGExplorer = integrations?.zeroG.explorerBaseUrl ?? 'https://chainscan-galileo.0g.ai/tx/';

  if (!ideaId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg w-full border-slate-800">
          <CardContent className="text-center space-y-4 py-10">
            <AlertCircle className="h-8 w-8 text-gray-500 mx-auto" />
            <p className="text-gray-400">No idea ID provided.</p>
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
          <p className="text-gray-400 text-sm">Loading dossier…</p>
        </div>
      </div>
    );
  }

  if (error || !idea) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg w-full border-red-900">
          <CardContent className="text-center space-y-4 py-10">
            <XCircle className="h-8 w-8 text-red-500 mx-auto" />
            <h1 className="text-xl font-bold text-red-400">Failed to load dossier</h1>
            <Button variant="secondary" onClick={() => navigate('/')}>
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const brief = idea.brief;
  const jobs = idea.jobs;

  return (
    <div className="page">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <button
              className="text-sm text-gray-500 hover:text-gray-300 flex items-center gap-1 mb-2"
              onClick={() => navigate(`/ideas/${ideaId}`)}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Idea
            </button>
            <h1 className="text-2xl font-bold text-white">Build Dossier</h1>
            <p className="text-gray-400 text-sm mt-1">
              Complete record of the idea, milestones, submissions, and acceptance.
            </p>
          </div>
        </div>

        {/* Idea metadata */}
        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white">Idea</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <div>
              <span className="text-gray-500 text-xs">Title</span>
              <p className="text-gray-200 text-sm">{idea.idea.title}</p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">Prompt</span>
              <p className="text-gray-300 text-sm leading-relaxed">{idea.idea.prompt}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500 text-xs">Budget</span>
                <p className="text-green-400 font-mono">${idea.idea.budgetUsd}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Status</span>
                <Badge
                  variant={idea.idea.fundingStatus === 'funded' ? 'success' : 'default'}
                  className="text-xs"
                >
                  {idea.idea.fundingStatus}
                </Badge>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Poster</span>
                <p className="text-gray-200 font-mono text-xs">{shortHex(idea.idea.posterId, 6, 4)}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Created</span>
                <p className="text-gray-200 text-xs">
                  {new Date(idea.idea.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Build Brief */}
        {brief && (
          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-400" />
                Build Brief
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              <div>
                <span className="text-gray-500 text-xs">Brief ID</span>
                <p className="text-gray-200 font-mono text-xs">{brief.briefId}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Summary</span>
                <p className="text-gray-300 text-sm leading-relaxed">{brief.summary}</p>
              </div>
              {brief.dossierUri && (
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-gray-500 text-xs">0G Dossier URI</span>
                  <a
                    href={brief.dossierUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-sm font-mono break-all flex items-center gap-1"
                  >
                    {brief.dossierUri}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Milestones */}
        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white">Milestones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            {jobs.length === 0 ? (
              <p className="text-gray-500 text-sm">No milestones yet.</p>
            ) : (
              <div className="space-y-3">
                {jobs.map((job, index) => (
                  <div
                    key={job.jobId}
                    className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-mono">#{index + 1}</span>
                        <span className="text-sm text-gray-200 capitalize font-medium">
                          {job.milestoneType}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-green-400 font-mono">${job.budgetUsd}</span>
                        <StatusBadge status={job.status} />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 font-mono">{shortHex(job.jobId, 6, 4)}</p>
                    {job.leaseExpiry && (
                      <p className="text-xs text-gray-500">
                        Lease expires: {new Date(job.leaseExpiry).toLocaleString()}
                      </p>
                    )}
                    {job.activeClaimWorkerId && (
                      <p className="text-xs text-gray-500">
                        Claimed by: {shortHex(job.activeClaimWorkerId, 6, 4)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Release evidence */}
        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white">Release Evidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4">
            {[
              { label: 'Funding TX', hash: idea.idea.escrowTxHash },
              { label: 'Reservation TX', hash: idea.idea.reservationTxHash },
              { label: 'Release TX', hash: idea.idea.releaseTxHash },
              { label: 'Attestation TX', hash: idea.idea.attestationTxHash },
            ].map(({ label, hash }) =>
              hash ? (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">{label}</span>
                  <span className="text-sm font-mono text-gray-300">{shortHex(hash)}</span>
                </div>
              ) : null
            )}
            {!idea.idea.escrowTxHash &&
              !idea.idea.reservationTxHash &&
              !idea.idea.releaseTxHash &&
              !idea.idea.attestationTxHash && (
                <p className="text-gray-500 text-sm">No release transactions recorded.</p>
              )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { color: string; icon: React.ReactNode }> = {
    created: { color: 'bg-gray-500/20 text-gray-300 border-gray-500/30', icon: <Clock className="h-3 w-3" /> },
    queued: { color: 'bg-blue-500/20 text-blue-300 border-blue-500/30', icon: <Clock className="h-3 w-3" /> },
    claimed: { color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', icon: <Clock className="h-3 w-3" /> },
    running: { color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', icon: <Clock className="h-3 w-3" /> },
    submitted: { color: 'bg-purple-500/20 text-purple-300 border-purple-500/30', icon: <FileText className="h-3 w-3" /> },
    accepted: { color: 'bg-green-500/20 text-green-300 border-green-500/30', icon: <CheckCircle2 className="h-3 w-3" /> },
    rejected: { color: 'bg-red-500/20 text-red-300 border-red-500/30', icon: <XIcon className="h-3 w-3" /> },
    rework: { color: 'bg-orange-500/20 text-orange-300 border-orange-500/30', icon: <Clock className="h-3 w-3" /> },
    settled: { color: 'bg-green-500/20 text-green-300 border-green-500/30', icon: <CheckCircle2 className="h-3 w-3" /> },
    expired: { color: 'bg-gray-500/20 text-gray-300 border-gray-500/30', icon: <Clock className="h-3 w-3" /> },
  };
  const v = variants[status] ?? variants.created;
  return (
    <Badge variant="default" className={`text-xs gap-1 ${v.color}`}>
      {v.icon}
      {status}
    </Badge>
  );
}
