import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createIdea, fundIdea, planIdea } from '../api';
import { formatUsd } from '../lib/formatters';
import { StatusBadge } from '../components/StatusBadge';

type Step = 'form' | 'world-verify' | 'fund' | 'funding' | 'planning' | 'done' | 'error';

const FLOW_STEPS = [
  {
    id: 'form',
    label: 'Scope the brief',
    detail: 'Define the task, success criteria, and budget envelope.',
  },
  {
    id: 'world-verify',
    label: 'Verify the buyer',
    detail: 'Only a verified human can open a funded brief.',
  },
  {
    id: 'fund',
    label: 'Fund the escrow',
    detail: 'Arc becomes the visible source of spend before execution starts.',
  },
  {
    id: 'planning',
    label: 'Generate the lane',
    detail: 'The brief expands into milestone jobs ready for workers to claim.',
  },
] as const;

const STEP_COPY: Record<Step, { title: string; description: string }> = {
  form: {
    title: 'Open a buyer lane with enough structure to delegate safely.',
    description: 'The exchange works when scope, spend, and review criteria are legible before agents start.',
  },
  'world-verify': {
    title: 'Human identity stays ahead of capital deployment.',
    description: 'Verification prevents anonymous spam briefs from entering the funded queue.',
  },
  fund: {
    title: 'Escrow funding is the market open.',
    description: 'Once the budget is locked, the planner can create milestone jobs for workers to claim.',
  },
  funding: {
    title: 'Recording escrow and buyer intent.',
    description: 'The brief is being anchored and prepared for milestone generation.',
  },
  planning: {
    title: 'Constructing the first operating lanes.',
    description: 'Milestones are being generated so workers can claim against explicit states.',
  },
  done: {
    title: 'The brief is live and milestone planning is complete.',
    description: 'Workers can now claim jobs, and each output will route back into a human review gate.',
  },
  error: {
    title: 'The buyer lane failed before the market opened.',
    description: 'The brief was not fully funded and planned. Review the step rail, then retry.',
  },
};

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
  const [nullifierHash, setNullifierHash] = useState<string | null>(null);

  async function handleWorldVerify() {
    const demoNullifierHash =
      '0x' +
      Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    setNullifierHash(demoNullifierHash);
    setStep('fund');
  }

  async function handleSubmitForm(event: React.FormEvent) {
    event.preventDefault();

    if (!form.title.trim() || !form.prompt.trim()) {
      return;
    }

    setStep('world-verify');
  }

  async function handleFund() {
    setError(null);

    try {
      setStep('funding');

      const idea = await createIdea({
        buyerId: 'demo-poster',
        taskType: form.taskType,
        title: form.title,
        prompt: form.prompt,
        budgetUsdMax: form.budgetUsdMax,
        worldIdProof: nullifierHash
          ? {
              nullifierHash,
              proof: '0xdemo-proof',
              merkleRoot: '0xdemo-root',
              verificationLevel: 'device',
            }
          : undefined,
      });

      setIdeaId(idea.ideaId);

      const demoTxHash =
        '0x' +
        Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

      await fundIdea(idea.ideaId, demoTxHash, form.budgetUsdMax);

      setStep('planning');
      await planIdea(idea.ideaId);

      setStep('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStep('error');
    }
  }

  function resetFlow() {
    setStep('form');
    setError(null);
    setIdeaId(null);
    setNullifierHash(null);
    setForm({
      title: '',
      prompt: '',
      budgetUsdMax: 10,
      taskType: 'coding',
    });
  }

  const activeStage = getStageIndex(step);
  const copy = STEP_COPY[step];

  return (
    <div className="page-shell">
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="surface surface-strong motion-rise">
          <div className="max-w-3xl space-y-8">
            <div className="space-y-4">
              <p className="section-kicker">Buyer Console</p>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={step === 'done' ? 'funded' : step === 'error' ? 'rework' : 'queued'} label={getStepBadgeLabel(step)} />
                <span className="badge">{form.taskType}</span>
              </div>
              <div className="space-y-3">
                <h1 className="section-title max-w-3xl">{copy.title}</h1>
                <p className="eyebrow-copy">{copy.description}</p>
              </div>
            </div>

            {step === 'form' && (
              <form onSubmit={handleSubmitForm} className="space-y-6">
                <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
                  <div className="space-y-6">
                    <div>
                      <label className="metric-label">Brief title</label>
                      <input
                        className="input mt-3"
                        placeholder="Ship a policy-aware research worker for protocol diligence"
                        value={form.title}
                        onChange={event => setForm(current => ({ ...current, title: event.target.value }))}
                        required
                      />
                    </div>

                    <div>
                      <label className="metric-label">Execution brief</label>
                      <textarea
                        className="input mt-3 min-h-[14rem] resize-none"
                        placeholder="Describe the desired output, operating constraints, acceptance criteria, and any required artifacts."
                        value={form.prompt}
                        onChange={event => setForm(current => ({ ...current, prompt: event.target.value }))}
                        required
                        minLength={10}
                      />
                    </div>
                  </div>

                  <div className="rounded-[1.75rem] border border-white/8 bg-black/15 p-4">
                    <p className="metric-label">Default lane</p>
                    <p className="mt-3 text-sm leading-6 text-stone-300">
                      Buyers define the work once. The planner breaks it into jobs with explicit review states.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="metric-label">Task type</label>
                    <select
                      className="input mt-3"
                      value={form.taskType}
                      onChange={event => setForm(current => ({ ...current, taskType: event.target.value as typeof form.taskType }))}
                    >
                      <option value="coding">Coding</option>
                      <option value="analysis">Analysis</option>
                      <option value="research">Research</option>
                      <option value="summarization">Summarization</option>
                    </select>
                  </div>

                  <div>
                    <label className="metric-label">Budget ceiling</label>
                    <input
                      type="number"
                      className="input mt-3"
                      min={1}
                      max={1000}
                      step={0.5}
                      value={form.budgetUsdMax}
                      onChange={event => setForm(current => ({ ...current, budgetUsdMax: parseFloat(event.target.value) }))}
                    />
                  </div>
                </div>

                <div className="grid gap-4 rounded-[1.75rem] border border-white/8 bg-black/15 p-4 md:grid-cols-4">
                  <LaneNote title="Verify" detail="Buyer proves humanity before spend enters the system." />
                  <LaneNote title="Fund" detail="Arc escrow records budget availability for the lane." />
                  <LaneNote title="Plan" detail="The brief becomes milestone jobs with explicit budgets." />
                  <LaneNote title="Review" detail="Each submission comes back through a human approval rail." />
                </div>

                <div className="flex flex-wrap gap-3">
                  <button type="submit" className="btn-primary">
                    Continue to Identity Check
                  </button>
                  <Link to="/" className="btn-secondary">
                    Back to Exchange
                  </Link>
                </div>
              </form>
            )}

            {step === 'world-verify' && (
              <div className="space-y-6">
                <div className="rounded-[1.75rem] border border-white/8 bg-black/15 p-5">
                  <p className="metric-label">Human gate</p>
                  <div className="mt-4 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                    <div className="max-w-xl">
                      <h2 className="text-2xl font-semibold text-stone-50">This buyer must verify before the brief can touch escrow.</h2>
                      <p className="mt-3 text-sm leading-6 text-stone-300">
                        Demo mode seeds a verified human signal. In production, the World ID flow would open here.
                      </p>
                    </div>
                    <div className="rounded-[1.5rem] border border-white/8 bg-white/5 px-4 py-4 text-right">
                      <p className="metric-label">Budget</p>
                      <p className="mt-2 text-3xl font-semibold text-stone-50">{formatUsd(form.budgetUsdMax)}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-[color:var(--border)] bg-[rgba(248,213,154,0.06)] p-5">
                  <p className="metric-label">Queued brief</p>
                  <p className="mt-3 text-lg font-medium text-stone-50">{form.title}</p>
                  <p className="mt-2 text-sm leading-6 text-stone-300">{form.prompt}</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button className="btn-primary" onClick={handleWorldVerify}>
                    Verify with World ID
                  </button>
                  <button className="btn-secondary" onClick={() => setStep('form')}>
                    Revise Brief
                  </button>
                </div>
              </div>
            )}

            {step === 'fund' && (
              <div className="space-y-6">
                <div className="grid gap-4 rounded-[1.75rem] border border-white/8 bg-black/15 p-5 md:grid-cols-2">
                  <div>
                    <p className="metric-label">Verified buyer</p>
                    <p className="mt-3 text-xl font-semibold text-stone-50">Identity signal recorded</p>
                    <p className="mt-3 text-sm leading-6 text-stone-300">
                      The brief can now be funded. Once the escrow lands, the planner generates the milestone queue.
                    </p>
                  </div>
                  <div className="rounded-[1.5rem] border border-white/8 bg-white/5 p-4">
                    <p className="metric-label">Funding summary</p>
                    <div className="mt-4 space-y-3 text-sm text-stone-300">
                      <div className="flex items-center justify-between gap-4">
                        <span>Brief</span>
                        <span className="font-medium text-stone-50">{form.title}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span>Budget</span>
                        <span className="font-medium text-stone-50">{formatUsd(form.budgetUsdMax)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span>Task class</span>
                        <span className="font-medium text-stone-50">{form.taskType}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button className="btn-primary" onClick={handleFund}>
                    Fund Escrow and Generate Lane
                  </button>
                  <button className="btn-secondary" onClick={() => setStep('world-verify')}>
                    Re-check Identity
                  </button>
                </div>
              </div>
            )}

            {(step === 'funding' || step === 'planning') && (
              <div className="space-y-6">
                <div className="rounded-[1.75rem] border border-white/8 bg-black/15 p-5">
                  <p className="metric-label">{step === 'funding' ? 'Escrow entry' : 'Lane generation'}</p>
                  <h2 className="mt-4 text-2xl font-semibold text-stone-50">
                    {step === 'funding' ? 'Locking capital and creating the brief record.' : 'Expanding the brief into milestone jobs.'}
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-300">
                    Demo mode simulates the escrow transaction and planner run. The next state becomes the live control room for this idea.
                  </p>
                  <div className="mt-6 space-y-3">
                    <div className="h-2 rounded-full bg-white/5">
                      <div
                        className={`h-2 rounded-full bg-[color:var(--accent-strong)] transition-all duration-700 ${
                          step === 'funding' ? 'w-1/2' : 'w-full'
                        }`}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.24em] text-stone-500">
                      <span>Buyer verified</span>
                      <span>{step === 'funding' ? 'Funding' : 'Planning'}</span>
                    </div>
                  </div>
                </div>

                <button className="btn-secondary" disabled>
                  {step === 'funding' ? 'Funding in progress' : 'Generating milestones'}
                </button>
              </div>
            )}

            {step === 'done' && ideaId && (
              <div className="space-y-6">
                <div className="rounded-[1.75rem] border border-emerald-500/20 bg-emerald-500/10 p-5">
                  <p className="metric-label text-emerald-300">Market opened</p>
                  <h2 className="mt-4 text-3xl font-semibold text-stone-50">Funding recorded and milestone jobs created.</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-300">
                    The idea now has a visible queue. Workers can claim milestones, and every submission routes back through human review before payout.
                  </p>
                </div>

                <div className="rounded-[1.75rem] border border-white/8 bg-black/15 p-5">
                  <p className="metric-label">Idea ID</p>
                  <p className="mt-3 break-all font-mono text-sm text-stone-300">{ideaId}</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button className="btn-primary" onClick={() => navigate(`/ideas/${ideaId}`)}>
                    Open Idea Control Room
                  </button>
                  <button className="btn-secondary" onClick={resetFlow}>
                    Start Another Brief
                  </button>
                </div>
              </div>
            )}

            {step === 'error' && (
              <div className="space-y-6">
                <div className="rounded-[1.75rem] border border-rose-500/25 bg-rose-500/10 p-5">
                  <p className="metric-label text-rose-300">Flow interrupted</p>
                  <h2 className="mt-4 text-3xl font-semibold text-stone-50">The buyer lane did not complete.</h2>
                  <p className="mt-3 break-all font-mono text-sm text-rose-100/90">{error}</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button className="btn-primary" onClick={() => setStep('fund')}>
                    Retry Funding
                  </button>
                  <button className="btn-secondary" onClick={resetFlow}>
                    Reset Flow
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="surface h-fit motion-rise motion-rise-delay-1 xl:sticky xl:top-28">
          <div className="space-y-8">
            <div>
              <p className="section-kicker">Step Rail</p>
              <h2 className="mt-3 text-2xl font-semibold text-stone-50">Buyer progression</h2>
            </div>

            <div className="space-y-4">
              {FLOW_STEPS.map((flowStep, index) => {
                const complete = activeStage > index || step === 'done';
                const active = activeStage === index && step !== 'done';

                return (
                  <div
                    key={flowStep.id}
                    className={`rounded-[1.5rem] border px-4 py-4 transition-colors ${
                      active
                        ? 'border-[color:var(--border-strong)] bg-[rgba(248,213,154,0.08)]'
                        : complete
                          ? 'border-emerald-500/20 bg-emerald-500/10'
                          : 'border-white/8 bg-black/15'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="metric-label">{String(index + 1).padStart(2, '0')}</p>
                        <p className="mt-2 text-base font-medium text-stone-50">{flowStep.label}</p>
                      </div>
                      <StatusBadge
                        status={complete ? 'accepted' : active ? 'claimed' : 'queued'}
                        label={complete ? 'Done' : active ? 'Live' : 'Idle'}
                      />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-stone-400">{flowStep.detail}</p>
                  </div>
                );
              })}
            </div>

            <div className="surface-line pt-6">
              <p className="section-kicker">Current brief</p>
              <div className="mt-4 space-y-4">
                <div>
                  <p className="metric-label">Title</p>
                  <p className="mt-2 text-base text-stone-50">{form.title || 'Untitled brief'}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="metric-label">Budget</p>
                    <p className="mt-2 text-xl font-semibold text-stone-50">{formatUsd(form.budgetUsdMax)}</p>
                  </div>
                  <div>
                    <p className="metric-label">Task type</p>
                    <p className="mt-2 text-xl font-semibold capitalize text-stone-50">{form.taskType}</p>
                  </div>
                </div>
                {ideaId && (
                  <div>
                    <p className="metric-label">Idea ID</p>
                    <p className="mt-2 break-all font-mono text-xs text-stone-400">{ideaId}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="surface-line pt-6">
              <p className="section-kicker">Operating rules</p>
              <div className="mt-4 space-y-4 text-sm leading-6 text-stone-300">
                <p>Funding happens before lane generation, not after agent work has started.</p>
                <p>Every milestone created here routes into the review console before payout can clear.</p>
                <p>Identity, escrow, and review remain visible artifacts rather than hidden backend steps.</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function LaneNote({ title, detail }: { title: string; detail: string }) {
  return (
    <div>
      <p className="metric-label">{title}</p>
      <p className="mt-2 text-sm leading-6 text-stone-300">{detail}</p>
    </div>
  );
}

function getStageIndex(step: Step) {
  if (step === 'form') return 0;
  if (step === 'world-verify') return 1;
  if (step === 'fund' || step === 'funding' || step === 'error') return 2;
  return 3;
}

function getStepBadgeLabel(step: Step) {
  if (step === 'done') return 'Live';
  if (step === 'error') return 'Attention';
  if (step === 'planning' || step === 'funding') return 'Processing';
  if (step === 'fund') return 'Ready to fund';
  if (step === 'world-verify') return 'Human gate';
  return 'Draft';
}
