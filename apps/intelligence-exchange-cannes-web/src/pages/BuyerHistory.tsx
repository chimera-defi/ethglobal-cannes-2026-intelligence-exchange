import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ArrowLeft, FileText, AlertCircle } from 'lucide-react';
import { getIdeas, getJobsByStatuses } from '../api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useSession } from '../hooks/useSession';

export function BuyerHistory() {
  const navigate = useNavigate();
  const { session } = useSession();
  const posterId = session?.accountAddress;

  const ideasQuery = useQuery({
    queryKey: ['ideas', posterId ?? 'all'],
    queryFn: () => getIdeas(posterId),
    refetchInterval: 15_000,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['jobs', 'accepted', 'settled'],
    queryFn: () => getJobsByStatuses(['accepted', 'settled']),
    refetchInterval: 30000,
  });

  const jobs = useMemo(() => {
    const allJobs = data?.jobs ?? [];
    if (!posterId) return allJobs;
    const ideaIds = new Set((ideasQuery.data?.ideas ?? []).map((idea) => idea.ideaId));
    return allJobs.filter((job) => ideaIds.has(job.ideaId));
  }, [data?.jobs, ideasQuery.data?.ideas, posterId]);
  const totalReleased = jobs
    .filter((job) => job.status === 'settled')
    .reduce((sum, j) => sum + parseFloat(j.budgetUsd || '0'), 0);

  if (isLoading || ideasQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="animate-spin h-8 w-8 text-gray-400 mx-auto" />
          <p className="text-gray-400 text-sm">Loading history...</p>
        </div>
      </div>
    );
  }

  if (error || ideasQuery.error) {
    return (
      <div className="page">
        <div className="max-w-3xl mx-auto">
          <Card>
            <CardContent className="text-center space-y-4 py-10">
              <AlertCircle className="h-8 w-8 text-red-400 mx-auto" />
              <p className="text-red-400">Failed to load history</p>
              <Button onClick={() => {
                void refetch();
                void ideasQuery.refetch();
              }}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-500 hover:text-gray-300 mb-2 h-auto p-0 gap-1"
            onClick={() => navigate('/workspace')}
          >
            <ArrowLeft className="h-3 w-3" />
            Workspace
          </Button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white">Payout History</h1>
              <p className="text-gray-400 mt-1">Accepted and settled milestones for the current poster scope.</p>
            </div>
            {jobs.length > 0 && (
              <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-green-400">${totalReleased.toFixed(2)}</p>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Total Released</p>
              </div>
            )}
          </div>
        </div>

        {jobs.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16 space-y-4">
              <FileText className="h-12 w-12 text-gray-500 mx-auto" />
              <h2 className="text-xl font-semibold text-white">No payouts yet</h2>
              <p className="text-gray-400 text-sm">Accepted milestones will appear here.</p>
              <Button variant="secondary" onClick={() => navigate('/workspace')}>
                <ArrowLeft className="h-4 w-4" />
                Back to Workspace
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {jobs.map(job => (
              <Card key={job.jobId} className="border-green-900/30">
                <CardContent className="flex flex-col md:flex-row md:items-center gap-4 py-4">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold capitalize">{job.milestoneType} Milestone</span>
                      <Badge variant={job.status === 'settled' ? 'settled' : 'accepted'}>
                        {job.status.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                      <span>
                        Idea:{' '}
                        <Button
                          variant="link"
                          size="sm"
                          className="text-blue-400 h-auto p-0 font-mono text-xs"
                          onClick={() => navigate(`/ideas/${job.ideaId}`)}
                        >
                          {job.ideaId.slice(0, 12)}...
                        </Button>
                      </span>
                      {job.activeClaimWorkerId && (
                        <span>
                          Worker: <span className="text-gray-400 font-mono">{job.activeClaimWorkerId}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-green-400 font-bold">${job.budgetUsd} USDC</p>
                      <p className="text-gray-500 text-xs">
                        {job.status === 'settled' ? 'Arc escrow released' : 'Accepted, release pending'}
                      </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
