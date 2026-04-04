import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getIdea } from '../api';

export function IdeaDetail() {
  const { ideaId } = useParams<{ ideaId: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['idea', ideaId],
    queryFn: () => getIdea(ideaId!),
    enabled: !!ideaId,
    refetchInterval: 8000,
  });

  if (!ideaId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-lg w-full text-center space-y-4">
          <p className="text-gray-400">No idea ID provided.</p>
          <button className="btn-primary" onClick={() => navigate('/submit')}>Submit an Idea</button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="spinner" />
          <p className="text-gray-400 text-sm">Loading idea...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-lg w-full text-center space-y-4">
          <div className="text-4xl">❌</div>
          <h1 className="text-xl font-bold text-red-400">Failed to load idea</h1>
          <p className="text-gray-400 text-sm font-mono">{String(error || 'Unknown error')}</p>
          <button className="btn-primary" onClick={() => refetch()}>Retry</button>
        </div>
      </div>
    );
  }

  const { idea, brief, jobs } = data;

  const jobsByMilestone = ['brief', 'tasks', 'scaffold', 'review'].map(type => ({
    type,
    job: jobs.find(j => j.milestoneType === type),
  }));

  const acceptedCount = jobs.filter(j => j.status === 'accepted').length;
  const totalCount = jobs.length;
  const allAccepted = totalCount > 0 && acceptedCount === totalCount;
  const anyActive = jobs.some(j => ['claimed', 'running', 'submitted'].includes(j.status));
  const progressPct = totalCount > 0 ? Math.round((acceptedCount / totalCount) * 100) : 0;

  return (
    <div className="page">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <button
              className="text-sm text-gray-500 hover:text-gray-300 flex items-center gap-1 mb-2"
              onClick={() => navigate('/ideas')}
            >
              ← My Ideas
            </button>
            <h1 className="text-2xl font-bold text-white break-words">{idea.title}</h1>
            <p className="text-gray-400 text-sm mt-1">
              Posted {new Date(idea.createdAt).toLocaleDateString()} · Budget: <span className="text-white font-medium">${idea.budgetUsd} USDC</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className={`badge badge-${idea.fundingStatus}`}>{idea.fundingStatus.toUpperCase()}</span>
            {allAccepted && <span className="badge bg-emerald-900 text-emerald-200">COMPLETE</span>}
            {anyActive && <span className="badge bg-blue-900 text-blue-200 animate-pulse">ACTIVE</span>}
          </div>
        </div>

        {/* Idea summary */}
        <div className="card space-y-3">
          <h2 className="section-label">Prompt</h2>
          <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">{idea.prompt}</p>
          {idea.escrowTxHash && (
            <div className="pt-2 border-t border-gray-800">
              <p className="text-gray-500 text-xs">Arc Escrow TX</p>
              <p className="text-gray-400 font-mono text-xs break-all mt-0.5">{idea.escrowTxHash}</p>
            </div>
          )}
        </div>

        {/* BuildBrief */}
        {brief ? (
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">BuildBrief</h2>
              <span className="badge badge-accepted">GENERATED</span>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">{brief.summary}</p>
            {brief.dossierUri && (
              <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3">
                <p className="text-blue-400 text-xs font-medium mb-1">0G Dossier</p>
                <p className="text-blue-300 font-mono text-xs break-all">{brief.dossierUri}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="card text-center py-8 space-y-3">
            <div className="text-3xl">📋</div>
            <p className="text-gray-400 text-sm">BuildBrief not yet generated.</p>
            <p className="text-gray-500 text-xs">The brief is auto-generated when you fund the idea.</p>
          </div>
        )}

        {/* Milestone Jobs */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Milestones</h2>
            <span className="text-gray-500 text-sm">{acceptedCount}/{totalCount} accepted</span>
          </div>

          {/* Progress bar */}
          {totalCount > 0 && (
            <div className="space-y-1">
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-600 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">{progressPct}% complete</p>
            </div>
          )}

          {jobs.length === 0 ? (
            <div className="text-center py-6 space-y-2">
              <div className="text-2xl">⏳</div>
              <p className="text-gray-400 text-sm">Milestones are created when the idea is funded.</p>
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
        </div>

        {/* Idea ID */}
        <div className="text-center">
          <p className="text-gray-600 text-xs font-mono">Idea ID: {ideaId}</p>
        </div>
      </div>
    </div>
  );
}

function MilestoneRow({
  index,
  milestoneType,
  job,
  onReview,
}: {
  index: number;
  milestoneType: string;
  job?: { jobId: string; milestoneType: string; status: string; budgetUsd: string; leaseExpiry?: string };
  onReview: () => void;
}) {
  if (!job) {
    return (
      <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-800/30 opacity-50">
        <div className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center text-xs text-gray-500 font-bold shrink-0">
          {index}
        </div>
        <div className="flex-1">
          <p className="text-gray-400 text-sm capitalize font-medium">{milestoneType}</p>
        </div>
        <span className="badge bg-gray-800 text-gray-600">PENDING</span>
      </div>
    );
  }

  const canReview = ['submitted', 'accepted', 'rejected', 'rework'].includes(job.status);
  const isActive = ['claimed', 'running'].includes(job.status);

  return (
    <div className={`flex items-center gap-4 p-3 rounded-lg transition-colors ${
      isActive ? 'bg-blue-900/20 border border-blue-900/50' :
      job.status === 'accepted' ? 'bg-green-900/10 border border-green-900/30' :
      'bg-gray-800/30'
    }`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
        job.status === 'accepted' ? 'bg-green-700 text-white' :
        job.status === 'submitted' ? 'bg-purple-700 text-white' :
        isActive ? 'bg-blue-700 text-white' :
        'bg-gray-700 text-gray-300'
      }`}>
        {job.status === 'accepted' ? '✓' : index}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-white text-sm capitalize font-medium">{milestoneType}</p>
        <p className="text-gray-500 text-xs mt-0.5">
          ${job.budgetUsd} USDC
          {job.leaseExpiry && isActive && (
            <> · Lease expires {new Date(job.leaseExpiry).toLocaleTimeString()}</>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className={`badge badge-${job.status}`}>{job.status.toUpperCase()}</span>
        {canReview && (
          <button
            className="btn-primary text-xs px-3 py-1.5"
            onClick={onReview}
          >
            {job.status === 'submitted' ? 'Review →' : 'View →'}
          </button>
        )}
      </div>
    </div>
  );
}
