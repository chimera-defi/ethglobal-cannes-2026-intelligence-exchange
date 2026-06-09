import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  XCircle,
  ExternalLink,
  ShieldCheck,
  Lock,
  Coins,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getIdea, getIdeaTokenReserve, getArcIdeaBalance, getArcStatus } from '../api';

function shortHex(value?: string | null, head = 8, tail = 6) {
  if (!value) return 'Not available';
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function EscrowStatusPanel() {
  const { ideaId } = useParams<{ ideaId: string }>();
  const navigate = useNavigate();
  const showArc = true;

  const { data: idea, isLoading: ideaLoading } = useQuery({
    queryKey: ['idea', ideaId],
    queryFn: () => getIdea(ideaId!),
    enabled: !!ideaId,
  });

  const { data: tokenomics } = useQuery({
    queryKey: ['tokenomics', ideaId],
    queryFn: () => getIdeaTokenReserve(ideaId!),
    enabled: !!ideaId,
  });

  const { data: arcBalance, isLoading: arcLoading } = useQuery({
    queryKey: ['arc-balance', ideaId],
    queryFn: () => getArcIdeaBalance(ideaId!),
    enabled: !!ideaId && showArc,
  });

  const { data: arcStatus } = useQuery({
    queryKey: ['arc-status'],
    queryFn: getArcStatus,
    staleTime: 30_000,
  });

  const isLoading = ideaLoading;
  const explorerBaseUrl = arcStatus?.status?.explorerUrl ?? 'https://testnet.arcscan.app';
  const arcConfigured = arcStatus?.status?.configured ?? false;

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
          <p className="text-gray-400 text-sm">Loading escrow status…</p>
        </div>
      </div>
    );
  }

  if (!idea) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg w-full border-red-900">
          <CardContent className="text-center space-y-4 py-10">
            <XCircle className="h-8 w-8 text-red-500 mx-auto" />
            <h1 className="text-xl font-bold text-red-400">Failed to load idea</h1>
            <Button variant="secondary" onClick={() => navigate('/')}>
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
            <h1 className="text-2xl font-bold text-white">Escrow Status</h1>
            <p className="text-gray-400 text-sm mt-1">
              Funding, reserves, and onchain release state for this idea.
            </p>
          </div>
          <Badge
            variant={idea.idea.fundingStatus === 'funded' ? 'success' : 'default'}
            className="text-sm px-3 py-1 shrink-0"
          >
            {idea.idea.fundingStatus.toUpperCase()}
          </Badge>
        </div>

        {/* INTEL Tokenomics Reserve */}
        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Coins className="h-4 w-4 text-blue-400" />
              INTEL Reserve
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            {tokenomics ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500 text-xs">Stable Funded</span>
                  <p className="text-gray-200 font-mono">${tokenomics.stableFundedUsd}</p>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">Avg Mint Price</span>
                  <p className="text-gray-200 font-mono">${tokenomics.avgMintPriceUsdPerIntel.toFixed(4)}/INTEL</p>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">INTEL Minted</span>
                  <p className="text-blue-400 font-mono">{tokenomics.intelMinted.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">INTEL Reserved</span>
                  <p className="text-yellow-400 font-mono">{tokenomics.intelReserved.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">INTEL Spent</span>
                  <p className="text-gray-200 font-mono">{tokenomics.intelSpent.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">Protocol Fee</span>
                  <p className="text-gray-200 font-mono">{tokenomics.intelProtocolFee.toLocaleString()}</p>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No tokenomics data available.</p>
            )}
            {idea.idea.escrowTxHash && (
              <div className="pt-2 border-t border-slate-800">
                <span className="text-gray-500 text-xs">Funding TX</span>
                <a
                  href={`${explorerBaseUrl}/tx/${idea.idea.escrowTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 text-sm font-mono break-all flex items-center gap-1"
                >
                  {shortHex(idea.idea.escrowTxHash)}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Milestone Budget Breakdown */}
        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Lock className="h-4 w-4 text-yellow-400" />
              Milestone Budgets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            {idea.jobs.length === 0 ? (
              <p className="text-gray-500 text-sm">No milestones planned yet.</p>
            ) : (
              <div className="space-y-2">
                {idea.jobs.map((job) => (
                  <div
                    key={job.jobId}
                    className="flex items-center justify-between rounded-lg bg-slate-800/50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-gray-200 capitalize">{job.milestoneType}</p>
                      <p className="text-xs text-gray-500 font-mono">{shortHex(job.jobId, 6, 4)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm text-green-400 font-mono">${job.budgetUsd}</p>
                      <Badge variant={job.status as 'default'} className="text-xs">
                        {job.status}
                      </Badge>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <span className="text-sm text-gray-400">Total</span>
                  <span className="text-sm text-green-400 font-bold font-mono">
                    ${idea.jobs.reduce((sum, j) => sum + Number(j.budgetUsd), 0).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Arc Onchain Escrow */}
        {arcConfigured && (
          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-purple-400" />
                Arc Onchain Escrow
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {arcLoading ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading onchain state…
                </div>
              ) : arcBalance ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs">Available</span>
                    <p className="text-gray-200 font-mono">{arcBalance.availableFormatted} USDC</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Total Funded</span>
                    <p className="text-gray-200 font-mono">{arcBalance.totalFundedFormatted} USDC</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Platform Fees Reserved</span>
                    <p className="text-gray-200 font-mono">{arcBalance.platformFeesFormatted} USDC</p>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No Arc escrow data available.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Onchain tx links */}
        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white">Onchain Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4">
            {[
              { label: 'Funding', hash: idea.idea.escrowTxHash },
              { label: 'Reservation', hash: idea.idea.reservationTxHash },
              { label: 'Release', hash: idea.idea.releaseTxHash },
              { label: 'Attestation', hash: idea.idea.attestationTxHash },
            ].map(({ label, hash }) =>
              hash ? (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">{label}</span>
                  <a
                    href={`${explorerBaseUrl}/tx/${hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-sm font-mono flex items-center gap-1"
                  >
                    {shortHex(hash)}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
              ) : null
            )}
            {!idea.idea.escrowTxHash &&
              !idea.idea.reservationTxHash &&
              !idea.idea.releaseTxHash &&
              !idea.idea.attestationTxHash && (
                <p className="text-gray-500 text-sm">No onchain transactions recorded yet.</p>
              )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
