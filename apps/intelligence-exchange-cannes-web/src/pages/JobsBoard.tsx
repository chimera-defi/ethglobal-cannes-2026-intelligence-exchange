import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getJobs } from '../api';

const STATUS_TABS = ['queued', 'claimed', 'submitted', 'accepted', 'rework'] as const;
type StatusTab = typeof STATUS_TABS[number];

export function JobsBoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<StatusTab>('queued');
  const [claimingJobId, setClaimingJobId] = useState<string | null>(null);
  const [claimForm, setClaimForm] = useState({ workerId: '', agentType: 'claude-code', agentVersion: '1.0.0' });
  const [claimResult, setClaimResult] = useState<{ claimId: string; expiresAt: string; skillMdUrl: string } | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['jobs', activeTab],
    queryFn: () => getJobs(activeTab),
    refetchInterval: 10000,
  });

  const jobs = data?.jobs ?? [];

  async function handleClaim(jobId: string) {
    if (!claimForm.workerId.trim()) {
      setClaimError('Worker ID is required');
      return;
    }
    setClaimError(null);
    try {
      const BROKER = import.meta.env.VITE_BROKER_URL ?? '/v1/cannes';
      const res = await fetch(`${BROKER}/jobs/${jobId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerId: claimForm.workerId,
          agentMetadata: {
            agentType: claimForm.agentType,
            agentVersion: claimForm.agentVersion,
            operatorAddress: '0x0000000000000000000000000000000000000000',
          },
        }),
      });
      const result = await res.json() as { claimId?: string; expiresAt?: string; skillMdUrl?: string; error?: { message: string } };
      if (!res.ok) throw new Error(result.error?.message ?? `HTTP ${res.status}`);
      setClaimResult({ claimId: result.claimId!, expiresAt: result.expiresAt!, skillMdUrl: result.skillMdUrl! });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Claim failed');
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Jobs Board</h1>
          <p className="text-gray-400 mt-1">
            Open milestone jobs. Claim one, fetch its <code className="text-blue-400">skill.md</code>, execute it with any AI agent.
          </p>
        </div>

        {/* How it works */}
        <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 text-sm text-gray-300 space-y-2">
          <p className="font-medium text-white">How agents claim and execute jobs:</p>
          <ol className="list-decimal list-inside space-y-1 text-gray-400">
            <li>Click <strong className="text-white">Claim Job</strong> — provide your worker ID + agent type</li>
            <li>Fetch the <code className="text-blue-400">skill.md</code> — it contains the full task spec and submission endpoint</li>
            <li>Execute the task with any AI agent (Claude Code, Codex, etc.)</li>
            <li>Submit your artifact URI + summary back to the broker</li>
            <li>Human buyer reviews — on acceptance, Arc escrow releases USDC payment</li>
          </ol>
        </div>

        {/* Claim success banner */}
        {claimResult && (
          <div className="bg-green-900/30 border border-green-700 rounded-xl p-4 space-y-3">
            <p className="text-green-300 font-semibold">Job claimed successfully!</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Claim ID</span>
                <p className="text-gray-200 font-mono text-xs break-all mt-0.5">{claimResult.claimId}</p>
              </div>
              <div>
                <span className="text-gray-500">Lease expires</span>
                <p className="text-gray-200 text-xs mt-0.5">{new Date(claimResult.expiresAt).toLocaleString()}</p>
              </div>
            </div>
            <a
              href={claimResult.skillMdUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex items-center gap-2 text-sm"
            >
              View skill.md →
            </a>
            <button
              className="btn-primary bg-gray-700 hover:bg-gray-600 text-sm ml-2"
              onClick={() => setClaimResult(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Claim modal */}
        {claimingJobId && !claimResult && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
            <h3 className="text-white font-semibold">Claim Job</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-1">
                <label className="block text-xs text-gray-400 mb-1">Worker ID</label>
                <input
                  className="input text-sm"
                  placeholder="my-agent-001"
                  value={claimForm.workerId}
                  onChange={e => setClaimForm(f => ({ ...f, workerId: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Agent Type</label>
                <select
                  className="input text-sm"
                  value={claimForm.agentType}
                  onChange={e => setClaimForm(f => ({ ...f, agentType: e.target.value }))}
                >
                  <option value="claude-code">claude-code</option>
                  <option value="codex">codex</option>
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gemini">gemini</option>
                  <option value="custom">custom</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Agent Version</label>
                <input
                  className="input text-sm"
                  value={claimForm.agentVersion}
                  onChange={e => setClaimForm(f => ({ ...f, agentVersion: e.target.value }))}
                />
              </div>
            </div>
            {claimError && <p className="text-red-400 text-sm">{claimError}</p>}
            <div className="flex gap-3">
              <button className="btn-primary" onClick={() => handleClaim(claimingJobId)}>
                Claim & Get skill.md
              </button>
              <button
                className="btn-primary bg-gray-700 hover:bg-gray-600"
                onClick={() => { setClaimingJobId(null); setClaimError(null); }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Status tabs */}
        <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit">
          {STATUS_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                activeTab === tab ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Jobs list */}
        {isLoading ? (
          <div className="text-center py-12 space-y-3">
            <div className="animate-spin text-3xl">⚙️</div>
            <p className="text-gray-400">Loading jobs...</p>
          </div>
        ) : error ? (
          <div className="card text-center py-8 space-y-3">
            <div className="text-3xl">❌</div>
            <p className="text-red-400 text-sm">{String(error)}</p>
            <button className="btn-primary" onClick={() => refetch()}>Retry</button>
          </div>
        ) : jobs.length === 0 ? (
          <div className="card text-center py-12 space-y-3">
            <div className="text-3xl">📭</div>
            <p className="text-gray-400">No <span className="text-white">{activeTab}</span> jobs right now.</p>
            {activeTab === 'queued' && (
              <p className="text-gray-500 text-sm">Post a funded idea to generate milestone jobs.</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map(job => (
              <JobCard
                key={job.jobId}
                job={job}
                onClaim={() => { setClaimingJobId(job.jobId); setClaimResult(null); setClaimError(null); }}
                onView={() => navigate(`/review/${job.jobId}`)}
                onViewIdea={() => navigate(`/ideas/${job.ideaId}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

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

function JobCard({
  job,
  onClaim,
  onView,
  onViewIdea,
}: {
  job: Job;
  onClaim: () => void;
  onView: () => void;
  onViewIdea: () => void;
}) {
  const isClaimable = job.status === 'queued';
  const isReviewable = ['submitted', 'accepted', 'rework'].includes(job.status);
  const isActive = ['claimed', 'running'].includes(job.status);

  return (
    <div className={`card flex flex-col md:flex-row md:items-center gap-4 ${
      isClaimable ? 'border-yellow-900/50 hover:border-yellow-700/50 transition-colors' : ''
    }`}>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white font-semibold capitalize">{job.milestoneType} Milestone</span>
          <span className={`badge badge-${job.status}`}>{job.status.toUpperCase()}</span>
          {isActive && <span className="badge bg-blue-900 text-blue-200 animate-pulse">LIVE</span>}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          <span>Job: <span className="font-mono text-gray-400">{job.jobId.slice(0, 12)}...</span></span>
          <button className="text-blue-400 hover:underline" onClick={onViewIdea}>View Idea →</button>
        </div>
        {job.activeClaimWorkerId && (
          <p className="text-xs text-gray-500">
            Claimed by: <span className="font-mono text-gray-400">{job.activeClaimWorkerId}</span>
          </p>
        )}
        {job.leaseExpiry && isActive && (
          <p className="text-xs text-yellow-500">
            Lease expires: {new Date(job.leaseExpiry).toLocaleTimeString()}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <p className="text-green-400 font-bold">${job.budgetUsd}</p>
          <p className="text-gray-500 text-xs">USDC</p>
        </div>
        {isClaimable && (
          <button className="btn-primary text-sm" onClick={onClaim}>
            Claim Job →
          </button>
        )}
        {isReviewable && (
          <button className="btn-primary bg-purple-700 hover:bg-purple-600 text-sm" onClick={onView}>
            Review →
          </button>
        )}
      </div>
    </div>
  );
}
