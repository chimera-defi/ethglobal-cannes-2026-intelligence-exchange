import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, Eye, History, CheckCircle2, ChevronRight, DollarSign, LayoutDashboard } from 'lucide-react';
import { getIdeas, getJobs } from '../api';
import { useSession } from '../hooks/useSession';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function BuyerWorkspace() {
  const navigate = useNavigate();
  const { isConnected, address, session } = useSession();
  const posterId = session?.accountAddress;

  const ideasQuery = useQuery({
    queryKey: ['ideas', posterId ?? 'all'],
    queryFn: () => getIdeas(posterId),
    refetchInterval: 15000,
  });

  const pendingQuery = useQuery({
    queryKey: ['jobs', 'submitted'],
    queryFn: () => getJobs('submitted'),
    refetchInterval: 8000,
  });

  const ideas = ideasQuery.data?.ideas ?? [];
  const ideaIds = new Set(ideas.map((idea) => idea.ideaId));
  const pendingJobs = posterId
    ? (pendingQuery.data?.jobs ?? []).filter((job) => ideaIds.has(job.ideaId))
    : (pendingQuery.data?.jobs ?? []);
  const pendingCount = pendingJobs.length;

  const totalFunded = ideas
    .filter(i => i.fundingStatus === 'funded')
    .reduce((sum, i) => sum + parseFloat(i.budgetUsd || '0'), 0);

  const isLoading = ideasQuery.isLoading && pendingQuery.isLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="animate-spin h-8 w-8 text-gray-400 mx-auto" />
          <p className="text-gray-400 text-sm">Loading workspace...</p>
        </div>
      </div>
    );
  }

  const greeting = posterId
    ? `Welcome, ${posterId.slice(0, 6)}…${posterId.slice(-4)}`
    : isConnected && address
    ? `Welcome, ${address.slice(0, 6)}…${address.slice(-4)}`
    : 'Buyer Workspace';

  return (
    <div className="page">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <LayoutDashboard className="h-7 w-7 text-blue-400 shrink-0" />
          <div>
            <h1 className="text-3xl font-bold text-white">{greeting}</h1>
            <p className="text-gray-400 mt-1">Track your ideas, review agent work, and release payments.</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="text-center">
            <CardContent className="pt-6 space-y-1">
              <p className="text-3xl font-bold text-white">{ideas.length}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Ideas Posted</p>
            </CardContent>
          </Card>
          <Card className={pendingCount > 0 ? 'border-purple-800' : ''}>
            <CardContent className="pt-6 text-center space-y-1">
              <p className={`text-3xl font-bold ${pendingCount > 0 ? 'text-purple-300' : 'text-white'}`}>
                {pendingCount}
              </p>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Pending Reviews</p>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="pt-6 space-y-1">
              <p className="text-3xl font-bold text-green-400">${totalFunded.toFixed(0)}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wide">USDC Funded</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick actions */}
        <div className="flex gap-3 flex-wrap">
          <Button onClick={() => navigate('/submit')}>
            <Plus className="h-4 w-4" />
            Post New Idea
          </Button>
          <Button
            variant={pendingCount > 0 ? 'default' : 'secondary'}
            className={pendingCount > 0 ? 'bg-purple-700 hover:bg-purple-600' : ''}
            onClick={() => navigate('/workspace/review')}
          >
            <Eye className="h-4 w-4" />
            Review Queue {pendingCount > 0 && `(${pendingCount})`}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/workspace/history')}>
            <History className="h-4 w-4" />
            Payout History
          </Button>
        </div>

        {/* Main split */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pending reviews */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Pending Reviews</h2>
              {pendingCount > 3 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-blue-400 hover:text-blue-300 h-auto p-0"
                  onClick={() => navigate('/workspace/review')}
                >
                  View all {pendingCount}
                  <ChevronRight className="h-3 w-3" />
                </Button>
              )}
            </div>
            {pendingJobs.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8 space-y-2">
                  <CheckCircle2 className="h-8 w-8 text-green-400 mx-auto" />
                  <p className="text-gray-400 text-sm">All caught up — no pending reviews.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {pendingJobs.slice(0, 3).map(job => (
                  <Card key={job.jobId}>
                    <CardContent className="flex items-center justify-between gap-4 py-4">
                      <div className="min-w-0 space-y-1">
                        <p className="text-white font-medium capitalize text-sm">{job.milestoneType} Milestone</p>
                        <p className="text-gray-500 text-xs font-mono">{job.jobId.slice(0, 12)}...</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-green-400 font-bold text-sm">${job.budgetUsd}</span>
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

          {/* Recent ideas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Recent Ideas</h2>
              {ideas.length > 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-blue-400 hover:text-blue-300 h-auto p-0"
                  onClick={() => navigate('/ideas')}
                >
                  View all
                  <ChevronRight className="h-3 w-3" />
                </Button>
              )}
            </div>
            {ideas.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8 space-y-3">
                  <p className="text-gray-400 text-sm">No ideas posted yet.</p>
                  <Button size="sm" onClick={() => navigate('/submit')}>
                    <Plus className="h-4 w-4" />
                    Post Your First Idea
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {ideas.slice(0, 5).map(idea => (
                  <Card
                    key={idea.ideaId}
                    className="flex items-center justify-between gap-4 cursor-pointer hover:border-gray-700 transition-colors"
                    onClick={() => navigate(`/ideas/${idea.ideaId}`)}
                  >
                    <CardContent className="flex items-center justify-between gap-4 w-full py-4">
                      <div className="min-w-0">
                        <p className="text-white font-medium text-sm truncate">{idea.title}</p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          <DollarSign className="inline h-3 w-3" />
                          {idea.budgetUsd} · {new Date(idea.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant={idea.fundingStatus as 'funded' | 'unfunded' | 'default'} className="shrink-0">
                        {idea.fundingStatus.toUpperCase()}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
