import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { IDKitWidget, VerificationLevel, type ISuccessResult } from '@worldcoin/idkit';
import { createIdea, fundIdea, getIntegrationsStatus, planIdea, verifyWorldProof } from '../api';

type Step = 'form' | 'world-verify' | 'fund' | 'funding' | 'planning' | 'done' | 'error';

const STEP_LABELS: Record<Step, string> = {
  'form': 'Details',
  'world-verify': 'Identity',
  'fund': 'Fund',
  'funding': 'Processing',
  'planning': 'Planning',
  'done': 'Done',
  'error': 'Error',
};

type WorldVerificationState = {
  verificationToken?: string;
  proof?: {
    nullifierHash: string;
    proof: string;
    merkleRoot: string;
    verificationLevel: string;
  };
};

export function IdeaSubmission() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);
  const [ideaId, setIdeaId] = useState<string | null>(null);
  const [worldVerification, setWorldVerification] = useState<WorldVerificationState>({});

  const [form, setForm] = useState({
    title: '',
    prompt: '',
    budgetUsdMax: 10,
    taskType: 'coding' as const,
    posterAccountAddress: 'demo-poster',
  });

  const { data: integrations, isLoading: integrationsLoading } = useQuery({
    queryKey: ['integrations-status'],
    queryFn: () => getIntegrationsStatus(),
    staleTime: 30_000,
  });

  const worldMode = integrations?.world.mode ?? 'demo';
  const worldLive = Boolean(
    integrations?.world.mode === 'live'
      && integrations.world.appId
      && integrations.world.action,
  );

  async function handleVerifyProof(result: ISuccessResult) {
    const verification = await verifyWorldProof(result, 'poster');
    setWorldVerification({
      verificationToken: verification.verificationToken,
      proof: verification.proof,
    });
    setStep('fund');
  }

  async function handleWorldVerifyDemo() {
    const demoNullifierHash = '0x' + Array.from(
      { length: 64 },
      () => Math.floor(Math.random() * 16).toString(16),
    ).join('');

    setWorldVerification({
      proof: {
        nullifierHash: demoNullifierHash,
        proof: '0xdemo-proof',
        merkleRoot: '0xdemo-root',
        verificationLevel: 'device',
      },
    });
    setStep('fund');
  }

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.prompt.trim()) return;
    setError(null);
    setStep('world-verify');
  }

  async function handleFund() {
    setError(null);
    try {
      setStep('funding');

      const idea = await createIdea({
        buyerId: form.posterAccountAddress,
        posterAccountAddress: form.posterAccountAddress,
        taskType: form.taskType,
        title: form.title,
        prompt: form.prompt,
        budgetUsdMax: form.budgetUsdMax,
        worldVerificationToken: worldVerification.verificationToken,
        worldIdProof: worldVerification.proof,
      });

      setIdeaId(idea.ideaId);

      const demoTxHash = '0x' + Array.from(
        { length: 64 },
        () => Math.floor(Math.random() * 16).toString(16),
      ).join('');
      await fundIdea(idea.ideaId, demoTxHash, form.budgetUsdMax);

      setStep('planning');
      await planIdea(idea.ideaId);

      setStep('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStep('error');
    }
  }

  if (step === 'done' && ideaId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-lg w-full text-center space-y-6">
          <div className="text-5xl">✅</div>
          <h1 className="text-2xl font-bold text-green-400">Idea Funded & Planned!</h1>
          <p className="text-gray-400">
            Your idea has been funded and split into milestone jobs.
            Human-backed agents can now claim the work through the broker.
          </p>
          <div className="bg-gray-800 rounded-lg p-3 text-left text-xs font-mono text-gray-300 break-all">
            Idea ID: {ideaId}
          </div>
          <div className="flex gap-3 justify-center">
            <button
              className="btn-primary"
              onClick={() => navigate(`/ideas/${ideaId}`)}
            >
              View Idea Dashboard →
            </button>
            <button
              className="btn-primary bg-gray-700 hover:bg-gray-600"
              onClick={() => {
                setStep('form');
                setIdeaId(null);
                setWorldVerification({});
              }}
            >
              Submit Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-lg w-full text-center space-y-4">
          <div className="text-5xl">❌</div>
          <h1 className="text-xl font-bold text-red-400">Something went wrong</h1>
          <p className="text-gray-400 text-sm font-mono">{error}</p>
          <button className="btn-primary" onClick={() => setStep('fund')}>Try Again</button>
        </div>
      </div>
    );
  }

  const STEPS: Step[] = ['form', 'world-verify', 'fund', 'funding', 'planning'];
  const currentStepIndex = STEPS.indexOf(step);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card max-w-2xl w-full space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Intelligence Exchange</h1>
          <p className="text-gray-400 mt-1">Post a funded idea. Idle agent capacity can pick up the milestones.</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap text-sm">
          <span className={`badge ${worldMode === 'live' ? 'bg-green-900 text-green-200' : 'bg-yellow-900 text-yellow-200'}`}>
            World: {worldMode.toUpperCase()}
          </span>
          {integrations?.arc && (
            <span className="badge bg-blue-900 text-blue-200">
              Arc Testnet: {integrations.arc.chainId}
            </span>
          )}
          {integrations?.zeroG && (
            <span className={`badge ${integrations.zeroG.mode === 'live' ? 'bg-green-900 text-green-200' : 'bg-gray-800 text-gray-300'}`}>
              0G: {integrations.zeroG.mode.toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex items-start gap-1">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className="flex flex-col items-center gap-1 flex-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  step === s ? 'bg-blue-600 text-white'
                    : currentStepIndex > i ? 'bg-green-700 text-white'
                    : 'bg-gray-800 text-gray-500'
                }`}>{currentStepIndex > i ? '✓' : i + 1}</div>
                <span className="text-xs text-gray-500 text-center leading-tight">{STEP_LABELS[s]}</span>
              </div>
              {i < STEPS.length - 1 && <div className="w-full h-px bg-gray-700 mt-3.5 mx-1" />}
            </div>
          ))}
        </div>

        {step === 'form' && (
          <form onSubmit={handleSubmitForm} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Idea Title</label>
              <input
                className="input"
                placeholder="e.g. Build a DeFi yield optimizer for Uniswap v4"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Describe what you want built</label>
              <textarea
                className="input min-h-32 resize-none"
                placeholder="Be specific. Include tech stack, acceptance criteria, and what a good output looks like..."
                value={form.prompt}
                onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
                required
                minLength={10}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Task Type</label>
                <select
                  className="input"
                  value={form.taskType}
                  onChange={e => setForm(f => ({ ...f, taskType: e.target.value as typeof form.taskType }))}
                >
                  <option value="coding">Coding</option>
                  <option value="analysis">Analysis</option>
                  <option value="research">Research</option>
                  <option value="summarization">Summarization</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Budget (USD)</label>
                <input
                  type="number"
                  className="input"
                  min={1}
                  max={1000}
                  step={0.5}
                  value={form.budgetUsdMax}
                  onChange={e => setForm(f => ({ ...f, budgetUsdMax: parseFloat(e.target.value) }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Poster ID / Wallet</label>
                <input
                  className="input"
                  value={form.posterAccountAddress}
                  onChange={e => setForm(f => ({ ...f, posterAccountAddress: e.target.value }))}
                  placeholder="0x... or demo-poster"
                />
              </div>
            </div>
            <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 text-sm text-gray-400">
              <p className="font-medium text-gray-300 mb-2">How it works:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Verify the poster as human with World ID</li>
                <li>Record Arc funding for the job budget</li>
                <li>Split the request into agent-claimable milestones</li>
                <li>Review outputs before any payout or attestation is finalized</li>
              </ol>
              <p className="text-xs text-gray-500">
                Current implementation uses live World verification when configured and demo Arc funding sync unless a real Arc escrow integration is wired.
              </p>
            </div>
            <button type="submit" className="btn-primary w-full text-base py-3">
              Continue to Identity Verification →
            </button>
          </form>
        )}

        {step === 'world-verify' && (
          <div className="space-y-6 text-center">
            <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-6 space-y-4">
              <div className="text-4xl">🌍</div>
              <h2 className="text-xl font-bold">Verify with World ID</h2>
              <p className="text-gray-400 text-sm">
                Verified-human gating is the current World fit for this product. In live mode the proof is verified by the broker backend before idea creation.
              </p>
              <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-4 text-left">
                <p className="text-blue-300 text-sm font-medium">Idea to fund:</p>
                <p className="text-white font-semibold mt-1">{form.title}</p>
                <p className="text-gray-400 text-xs mt-1">Budget: ${form.budgetUsdMax} USDC</p>
              </div>
              {worldLive ? (
                <IDKitWidget
                  app_id={integrations!.world.appId!}
                  action={integrations!.world.action!}
                  onSuccess={() => undefined}
                  handleVerify={handleVerifyProof}
                  verification_level={VerificationLevel.Orb}
                >
                  {({ open }: { open: () => void }) => (
                    <button
                      className="btn-primary w-full"
                      onClick={open}
                      disabled={integrationsLoading}
                    >
                      Verify with World ID
                    </button>
                  )}
                </IDKitWidget>
              ) : (
                <button className="btn-primary w-full" onClick={handleWorldVerifyDemo}>
                  Verify with World ID (Demo Mode)
                </button>
              )}
              <p className="text-gray-600 text-xs">
                {worldLive
                  ? 'Live mode: World proof is sent to the broker for server-side verification.'
                  : 'Demo mode: using a locally generated nullifier until World credentials are configured.'}
              </p>
            </div>
          </div>
        )}

        {step === 'fund' && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <span>✓</span>
              <span>
                Identity verified via World ID
                {worldMode === 'live' ? ' (live)' : ' (demo)'}
              </span>
            </div>
            <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-6 space-y-4">
              <h2 className="text-xl font-bold">Fund Your Idea with Arc</h2>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Idea</span>
                  <span className="text-white font-medium">{form.title}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Total Budget</span>
                  <span className="text-white font-bold">${form.budgetUsdMax} USDC</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Arc Chain ID</span>
                  <span className="text-white font-mono">{integrations?.arc.chainId ?? '5042002'}</span>
                </div>
              </div>
              <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-4 text-left text-sm text-yellow-100">
                Arc funding is still recorded via broker sync in this build. To qualify for the actual Arc micropayment prize, agent spend events need to settle as real gas-free micropayments rather than only milestone budget releases.
              </div>
              <button className="btn-primary w-full text-base py-3" onClick={handleFund}>
                Record Arc Funding & Generate Brief →
              </button>
            </div>
          </div>
        )}

        {(step === 'funding' || step === 'planning') && (
          <div className="text-center space-y-4 py-8">
            <div className="spinner" />
            <h2 className="text-xl font-semibold mt-4">
              {step === 'funding' ? 'Syncing funding...' : 'Generating BuildBrief...'}
            </h2>
            <p className="text-gray-400 text-sm">
              {step === 'funding'
                ? 'Recording the funding event and preparing the idea for planning.'
                : 'Creating the build brief and queueing milestone jobs.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
