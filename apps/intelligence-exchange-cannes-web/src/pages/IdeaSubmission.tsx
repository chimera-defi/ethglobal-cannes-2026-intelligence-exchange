import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createIdea, fundIdea, planIdea } from '../api';

type Step = 'form' | 'world-verify' | 'fund' | 'funding' | 'planning' | 'done' | 'error';

export function IdeaSubmission() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);
  const [ideaId, setIdeaId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    prompt: '',
    budgetUsdMax: 10,
    taskType: 'coding' as const,
  });

  // Demo: simulate World ID verification (in production, use @worldcoin/idkit-core)
  const [worldVerified, setWorldVerified] = useState(false);
  const [nullifierHash, setNullifierHash] = useState<string | null>(null);

  async function handleWorldVerify() {
    // Demo: use a pre-seeded nullifier hash (represents "verified human")
    const demoNullifierHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    setNullifierHash(demoNullifierHash);
    setWorldVerified(true);
    setStep('fund');
  }

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.prompt.trim()) return;
    setStep('world-verify');
  }

  async function handleFund() {
    setError(null);
    try {
      setStep('funding');

      // 1. Create idea in broker
      const idea = await createIdea({
        buyerId: 'demo-poster',
        taskType: form.taskType,
        title: form.title,
        prompt: form.prompt,
        budgetUsdMax: form.budgetUsdMax,
        worldIdProof: nullifierHash ? {
          nullifierHash,
          proof: '0xdemo-proof',
          merkleRoot: '0xdemo-root',
          verificationLevel: 'device',
        } : undefined,
      });

      setIdeaId(idea.ideaId);

      // 2. Simulate Arc escrow funding (in production: use wagmi to call fundIdea())
      // For demo: record a simulated tx hash
      const demoTxHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      await fundIdea(idea.ideaId, demoTxHash, form.budgetUsdMax);

      // 3. Generate brief (milestones + jobs)
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
              onClick={() => { setStep('form'); setIdeaId(null); setWorldVerified(false); }}
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card max-w-2xl w-full space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Intelligence Exchange</h1>
          <p className="text-gray-400 mt-1">Post a funded idea. Idle agent capacity can pick up the milestones.</p>
        </div>

        {/* Progress steps */}
        <div className="flex items-center gap-2 text-sm">
          {(['form', 'world-verify', 'fund', 'funding', 'planning'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step === s ? 'bg-blue-600 text-white' :
                ['fund', 'funding', 'planning', 'done'].includes(step) && i < 3 ? 'bg-green-700 text-white' :
                'bg-gray-800 text-gray-500'
              }`}>{i + 1}</div>
              {i < 4 && <div className="w-8 h-px bg-gray-700" />}
            </div>
          ))}
          <span className="text-gray-500 ml-2 text-xs">
            {step === 'form' ? 'Fill in details' :
             step === 'world-verify' ? 'Verify identity' :
             step === 'fund' ? 'Fund with Arc' :
             step === 'funding' ? 'Processing...' :
             step === 'planning' ? 'Generating brief...' : ''}
          </span>
        </div>

        {/* Step: Form */}
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
            <div className="grid grid-cols-2 gap-4">
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
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4 text-sm text-gray-400">
              <p className="font-medium text-gray-300 mb-1">How it works:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Verify your identity with World ID (once)</li>
                <li>Fund your idea with Arc USDC escrow</li>
                <li>Human-backed agents claim milestones and execute them</li>
                <li>You review and approve before payout is released</li>
              </ol>
            </div>
            <button type="submit" className="btn-primary w-full text-base py-3">
              Continue to Identity Verification →
            </button>
          </form>
        )}

        {/* Step: World ID Verify */}
        {step === 'world-verify' && (
          <div className="space-y-6 text-center">
            <div className="bg-gray-800/50 rounded-xl p-6 space-y-4">
              <div className="text-4xl">🌍</div>
              <h2 className="text-xl font-bold">Verify with World ID</h2>
              <p className="text-gray-400 text-sm">
                Only verified humans can post funded ideas. This prevents spam and ensures
                accountable buyers in the marketplace.
              </p>
              <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-4 text-left">
                <p className="text-blue-300 text-sm font-medium">Idea to fund:</p>
                <p className="text-white font-semibold mt-1">{form.title}</p>
                <p className="text-gray-400 text-xs mt-1">Budget: ${form.budgetUsdMax} USDC</p>
              </div>
              {/* In production: IDKit component. For demo: button simulates verification. */}
              <button className="btn-primary w-full" onClick={handleWorldVerify}>
                Verify with World ID (Demo Mode)
              </button>
              <p className="text-gray-600 text-xs">
                Demo: using pre-verified operator account. In production, World ID modal appears here.
              </p>
            </div>
          </div>
        )}

        {/* Step: Fund */}
        {step === 'fund' && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <span>✓</span>
              <span>Identity verified via World ID</span>
            </div>
            <div className="bg-gray-800/50 rounded-xl p-6 space-y-4">
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
                  <span className="text-gray-400">Platform Fee (10%)</span>
                  <span className="text-gray-400">${(form.budgetUsdMax * 0.1).toFixed(2)} USDC</span>
                </div>
                <div className="border-t border-gray-700 pt-2 flex justify-between text-sm">
                  <span className="text-gray-400">Worker Payout Pool</span>
                  <span className="text-green-400 font-bold">${(form.budgetUsdMax * 0.9).toFixed(2)} USDC</span>
                </div>
              </div>
              <p className="text-gray-500 text-xs">
                Funds are held in Arc USDC escrow. Released only after you approve each milestone.
                No autonomous payouts — you stay in control.
              </p>
              {/* In production: wagmi ConnectButton + call IdeaEscrow.fundIdea() */}
              <button className="btn-primary w-full text-base py-3" onClick={handleFund}>
                Fund ${form.budgetUsdMax} USDC via Arc Escrow (Demo)
              </button>
            </div>
          </div>
        )}

        {/* Step: Funding in progress */}
        {step === 'funding' && (
          <div className="text-center space-y-4 py-8">
            <div className="animate-spin text-4xl">⚙️</div>
            <h2 className="text-xl font-semibold">Funding in progress...</h2>
            <p className="text-gray-400 text-sm">Submitting to Arc escrow. This usually takes 10–30 seconds on testnet.</p>
          </div>
        )}

        {/* Step: Planning */}
        {step === 'planning' && (
          <div className="text-center space-y-4 py-8">
            <div className="animate-pulse text-4xl">🤔</div>
            <h2 className="text-xl font-semibold">Generating BuildBrief...</h2>
            <p className="text-gray-400 text-sm">Breaking your idea into milestones: brief → tasks → scaffold → review</p>
          </div>
        )}
      </div>
    </div>
  );
}
