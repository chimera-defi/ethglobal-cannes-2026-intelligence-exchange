import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Eye, XCircle, AlertCircle } from 'lucide-react';
import { getIdeas, cancelIdea } from '../api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useSession } from '../hooks/useSession';

export function IdeasList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const posterId = session?.accountAddress;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ideas', posterId ?? 'all'],
    queryFn: () => getIdeas(posterId),
    refetchInterval: 10000,
  });

  const cancelMutation = useMutation({
    mutationFn: (ideaId: string) => cancelIdea(ideaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
    },
  });

  const ideas = data?.ideas ?? [];

  const totalFunded = ideas
    .filter(i => i.fundingStatus === 'funded')
    .reduce((sum, i) => sum + parseFloat(i.budgetUsd || '0'), 0);

  const fundingVariant: Record<string, 'funded' | 'unfunded' | 'default'> = {
    funded: 'funded',
    unfunded: 'unfunded',
    cancelled: 'default',
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="animate-spin h-8 w-8 text-gray-400 mx-auto" />
          <p className="text-gray-400 text-sm">Loading ideas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">My Ideas</h1>
            <p className="text-gray-400 mt-1">
              {ideas.length} idea{ideas.length !== 1 ? 's' : ''}
              {totalFunded > 0 && (
                <> · <span className="text-green-400 font-medium">${totalFunded.toFixed(0)} USDC funded</span></>
              )}
            </p>
          </div>
          <Button className="shrink-0" onClick={() => navigate('/submit')}>
            <Plus className="h-4 w-4" />
            Post New Idea
          </Button>
        </div>

        {error && (
          <Card>
            <CardContent className="text-center py-6 space-y-3">
              <AlertCircle className="h-6 w-6 text-red-400 mx-auto" />
              <p className="text-red-400 text-sm">{String(error)}</p>
              <Button onClick={() => refetch()}>Retry</Button>
            </CardContent>
          </Card>
        )}

        {cancelMutation.isError && (
          <div className="flex items-center gap-2 bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Cancel failed: {String(cancelMutation.error)}
          </div>
        )}

        {ideas.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16 space-y-4">
              <div className="h-12 w-12 rounded-full bg-yellow-900/40 flex items-center justify-center mx-auto">
                <Plus className="h-6 w-6 text-yellow-300" />
              </div>
              <h2 className="text-xl font-semibold text-white">No ideas yet</h2>
              <p className="text-gray-400 text-sm">Post your first funded idea and let worker capacity pick it up.</p>
              <Button onClick={() => navigate('/submit')}>
                <Plus className="h-4 w-4" />
                Post an Idea
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {ideas.map(idea => (
              <Card key={idea.ideaId} className={`border-l-2 hover:border-slate-600 transition-colors ${idea.fundingStatus === 'funded' ? 'border-l-emerald-500' : idea.fundingStatus === 'cancelled' ? 'border-l-red-500' : 'border-l-slate-700'}`}>
                <CardContent className="flex flex-col md:flex-row gap-4 py-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3
                        className="text-white font-semibold hover:text-blue-400 cursor-pointer transition-colors"
                        onClick={() => navigate(`/ideas/${idea.ideaId}`)}
                      >
                        {idea.title}
                      </h3>
                      <Badge variant={fundingVariant[idea.fundingStatus] ?? 'default'}>
                        {idea.fundingStatus.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
                      <span>Budget: <span className="text-white font-medium">${idea.budgetUsd} USDC</span></span>
                      <span>Posted: {new Date(idea.createdAt).toLocaleDateString()}</span>
                      <span className="font-mono text-gray-600">{idea.ideaId.slice(0, 16)}...</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/ideas/${idea.ideaId}`)}
                    >
                      <Eye className="h-3 w-3" />
                      View
                    </Button>
                    {['unfunded', 'funded'].includes(idea.fundingStatus) && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (confirm(`Cancel "${idea.title}"? This cannot be undone.`)) {
                            cancelMutation.mutate(idea.ideaId);
                          }
                        }}
                        disabled={cancelMutation.isPending}
                      >
                        {cancelMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        Cancel
                      </Button>
                    )}
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
