import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ArrowLeft, CheckCircle2, ChevronRight, AlertCircle } from 'lucide-react';
import { getJobs } from '../api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export function BuyerReviewQueue() {
  const navigate = useNavigate();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['jobs', 'submitted'],
    queryFn: () => getJobs('submitted'),
    refetchInterval: 8000,
  });

  const jobs = data?.jobs ?? [];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="animate-spin h-8 w-8 text-gray-400 mx-auto" />
          <p className="text-gray-400 text-sm">Loading review queue...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="max-w-3xl mx-auto">
          <Card>
            <CardContent className="text-center space-y-4 py-10">
              <AlertCircle className="h-8 w-8 text-red-400 mx-auto" />
              <p className="text-red-400">Failed to load review queue</p>
              <Button onClick={() => refetch()}>Retry</Button>
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
              <h1 className="text-3xl font-bold text-white">Review Queue</h1>
              <p className="text-gray-400 mt-1">
                {jobs.length === 0
                  ? 'All caught up.'
                  : `${jobs.length} milestone${jobs.length !== 1 ? 's' : ''} awaiting your review.`}
              </p>
            </div>
          </div>
        </div>

        {jobs.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16 space-y-4">
              <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto" />
              <h2 className="text-xl font-semibold text-white">All caught up!</h2>
              <p className="text-gray-400 text-sm">No milestones are waiting for review right now.</p>
              <Button variant="secondary" onClick={() => navigate('/workspace')}>
                <ArrowLeft className="h-4 w-4" />
                Back to Workspace
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {jobs.map(job => (
              <Card
                key={job.jobId}
                className="border-purple-900/40 hover:border-purple-700/60 transition-colors"
              >
                <CardContent className="flex flex-col md:flex-row md:items-center gap-4 py-4">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold capitalize">{job.milestoneType} Milestone</span>
                      <Badge variant="submitted">SUBMITTED</Badge>
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
                      <span className="font-mono text-gray-600">{job.jobId.slice(0, 12)}...</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-green-400 font-bold">${job.budgetUsd}</p>
                      <p className="text-gray-500 text-xs">USDC</p>
                    </div>
                    <Button
                      size="sm"
                      className="bg-purple-700 hover:bg-purple-600"
                      onClick={() => navigate(`/review/${job.jobId}`)}
                    >
                      Review
                      <ChevronRight className="h-3 w-3" />
                    </Button>
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
