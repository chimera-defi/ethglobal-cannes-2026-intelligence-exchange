import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getIdeas, cancelIdea } from '../api';
import { useBuyerSession } from '../session';

export function IdeasList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { buyerId } = useBuyerSession();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ideas', buyerId],
    queryFn: () => getIdeas(buyerId),
    refetchInterval: 10000,
  });

  const cancelMutation = useMutation({
    mutationFn: (ideaId: string) => cancelIdea(ideaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
    },
  });

  const ideas = data?.ideas ?? [];

  const fundingColor: Record<string, string> = {
    funded: 'badge-funded',
    unfunded: 'badge-unfunded',
    cancelled: 'badge bg-gray-700 text-gray-400',
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4 py-12">
          <div className="animate-spin text-4xl">⚙️</div>
          <p className="text-gray-400">Loading ideas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">My Ideas</h1>
            <p className="text-gray-400 mt-1">All posted ideas and their milestone status for {buyerId}.</p>
          </div>
          <button className="btn-primary" onClick={() => navigate('/buyer/new')}>
            + Post New Idea
          </button>
        </div>

        {error && (
          <div className="card text-center py-6 space-y-3">
            <p className="text-red-400 text-sm">{String(error)}</p>
            <button className="btn-primary" onClick={() => refetch()}>Retry</button>
          </div>
        )}

        {cancelMutation.isError && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
            Cancel failed: {String(cancelMutation.error)}
          </div>
        )}

        {ideas.length === 0 ? (
          <div className="card text-center py-16 space-y-4">
            <div className="text-4xl">💡</div>
            <h2 className="text-xl font-semibold text-white">No ideas yet</h2>
            <p className="text-gray-400 text-sm">Post your first funded idea and let AI agents build it.</p>
            <button className="btn-primary" onClick={() => navigate('/buyer/new')}>
              Post an Idea →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {ideas.map(idea => (
              <div key={idea.ideaId} className="card flex flex-col md:flex-row gap-4">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3
                      className="text-white font-semibold hover:text-blue-400 cursor-pointer transition-colors"
                      onClick={() => navigate(`/ideas/${idea.ideaId}`)}
                    >
                      {idea.title}
                    </h3>
                    <span className={fundingColor[idea.fundingStatus] ?? 'badge bg-gray-700 text-gray-300'}>
                      {idea.fundingStatus.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
                    <span>Budget: <span className="text-white font-medium">${idea.budgetUsd} USDC</span></span>
                    <span>Posted: {new Date(idea.createdAt).toLocaleDateString()}</span>
                    <span className="font-mono text-gray-600">{idea.ideaId.slice(0, 16)}...</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    className="btn-primary text-sm"
                    onClick={() => navigate(`/ideas/${idea.ideaId}`)}
                  >
                    View →
                  </button>
                  {['unfunded', 'funded'].includes(idea.fundingStatus) && (
                    <button
                      className="btn-danger text-sm"
                      onClick={() => {
                        if (confirm(`Cancel "${idea.title}"? This cannot be undone.`)) {
                          cancelMutation.mutate(idea.ideaId);
                        }
                      }}
                      disabled={cancelMutation.isPending}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
