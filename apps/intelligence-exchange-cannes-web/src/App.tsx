import { useEffect, useState } from "react";
import { demoSeed, type Actor, type DemoState, type IdeaSubmissionInput, type Milestone } from "@iex-cannes/shared";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";

type AgentCandidate = {
  id: string;
  name: string;
  walletAddress: string;
  ensName: string;
  capabilities: string[];
  trust: string;
  pitch: string;
  approach: string;
  paidDependency: string;
  outputSummary: string;
};

const agentRoster: AgentCandidate[] = [
  {
    id: demoSeed.worker.id,
    name: demoSeed.worker.name,
    walletAddress: demoSeed.worker.walletAddress,
    ensName: demoSeed.worker.ensName ?? "builder-one.eth",
    capabilities: [...demoSeed.worker.capabilities],
    trust: "Seeded signer",
    pitch: "Balanced full-stack worker tuned for the Cannes scaffold happy path.",
    approach: "Ships a clean React console, broker hooks, and Arc escrow proof with the fewest moving parts.",
    paidDependency: "Arc nanopayment for package audit credits",
    outputSummary:
      "World-gated scaffold with milestone reservation, reviewer approval path, local 0G-style dossier, and a production-shaped operator bridge."
  },
  {
    id: "studio-relay",
    name: "Studio Relay",
    walletAddress: "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
    ensName: "studio-relay.eth",
    capabilities: ["typescript", "frontend", "backend", "contracts"],
    trust: "Human-backed remote operator",
    pitch: "Design-forward worker that optimizes for a stronger buyer-facing review experience.",
    approach: "Focuses on a clearer intake flow, stronger visual hierarchy, and concise delivery evidence.",
    paidDependency: "Visual regression bundle credits",
    outputSummary:
      "Poster-first command center with explicit escrow controls, agent comparison, and reviewer-ready acceptance evidence."
  },
  {
    id: "protocol-scribe",
    name: "Protocol Scribe",
    walletAddress: "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65",
    ensName: "protocol-scribe.eth",
    capabilities: ["typescript", "frontend", "backend", "contracts"],
    trust: "Proof-ready operator",
    pitch: "Documentation-heavy worker with stronger audit logging and delivery trace emphasis.",
    approach: "Produces a more conservative implementation with extra dossier detail and release evidence.",
    paidDependency: "Spec parsing credits for acceptance trace export",
    outputSummary:
      "Trace-first submission with stronger audit evidence, deterministic reviewer checkpoints, and payout release artifacts."
  }
];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (init?.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiBase}${path}`, {
    headers,
    ...init
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function StatusPill({ status }: { status: string }) {
  return <span className={`status status-${status.replaceAll("_", "-")}`}>{status}</span>;
}

function ActorCard({ actor, title }: { actor: Actor; title: string }) {
  return (
    <article className="surface-card actor-card">
      <div className="section-topline">
        <span>{title}</span>
        <StatusPill status={actor.verified ? "verified" : "unverified"} />
      </div>
      <h3>{actor.name}</h3>
      <p>{actor.role} operator for the currently active flow.</p>
      <dl className="detail-grid">
        <div>
          <dt>Wallet</dt>
          <dd>{shortAddress(actor.walletAddress)}</dd>
        </div>
        <div>
          <dt>Verification</dt>
          <dd>{actor.verificationMode}</dd>
        </div>
        <div>
          <dt>ENS</dt>
          <dd>{actor.ensName ?? "none"}</dd>
        </div>
        <div>
          <dt>Agent ID</dt>
          <dd>{actor.agentId ?? "pending"}</dd>
        </div>
      </dl>
    </article>
  );
}

function MilestoneLine({ milestone }: { milestone: Milestone }) {
  return (
    <article className="surface-card milestone-line">
      <div className="milestone-head">
        <div>
          <p className="eyebrow">{milestone.milestoneType}</p>
          <h3>{milestone.title}</h3>
        </div>
        <StatusPill status={milestone.status} />
      </div>
      <p className="muted-copy">{milestone.description}</p>
      <dl className="detail-grid">
        <div>
          <dt>Payout</dt>
          <dd>{currency(milestone.budgetUsd)}</dd>
        </div>
        <div>
          <dt>Worker</dt>
          <dd>{milestone.workerId ?? "unclaimed"}</dd>
        </div>
        <div>
          <dt>Capabilities</dt>
          <dd>{milestone.requiredCapabilities.join(", ")}</dd>
        </div>
        <div>
          <dt>Reserved</dt>
          <dd>{milestone.reservedOnchain ? "yes" : "no"}</dd>
        </div>
      </dl>
      {milestone.traceSummary ? <p className="artifact-note">Trace: {milestone.traceSummary}</p> : null}
      {milestone.paidDependency ? <p className="artifact-note">Spend: {milestone.paidDependency}</p> : null}
    </article>
  );
}

export function App() {
  const [state, setState] = useState<DemoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agentRoster[0].id);
  const [ideaForm, setIdeaForm] = useState<IdeaSubmissionInput>({
    ...demoSeed.ideaInput
  });

  async function refresh() {
    const next = await api<DemoState>("/api/demo-state");
    setState(next);
    if (next.idea) {
      setIdeaForm({
        title: next.idea.title,
        prompt: next.idea.prompt,
        targetArtifact: next.idea.targetArtifact,
        budgetUsd: next.idea.budgetUsd,
        escrowUsd: next.idea.escrowUsd
      });
    }
  }

  useEffect(() => {
    void refresh().catch((err) => setError(String(err)));
  }, []);

  async function runAction(label: string, action: () => Promise<DemoState>) {
    setPending(label);
    setError(null);
    try {
      const next = await action();
      setState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  }

  const selectedAgent = agentRoster.find((agent) => agent.id === selectedAgentId) ?? agentRoster[0];
  const scaffold = state?.brief?.milestones.find((milestone) => milestone.milestoneType === "scaffold");
  const canFund = !state?.idea;
  const canRunSelectedAgent = scaffold?.status === "queued";
  const canApprove = scaffold?.status === "submitted";
  const canRefund = scaffold ? ["claimed", "rework", "expired"].includes(scaffold.status) : false;
  const totalMilestoneBudget = state?.brief?.milestones.reduce((sum, milestone) => sum + milestone.budgetUsd, 0) ?? 0;
  const escrowCoverage = ideaForm.escrowUsd - ideaForm.budgetUsd;

  return (
    <main className="studio-shell container-fluid">
      <section className="hero-rail">
        <div className="hero-copy">
          <p className="eyebrow">ETHGlobal Cannes 2026</p>
          <h1>Agent work board with human pick, escrow lock, and payout release.</h1>
          <p className="lead-copy">
            The buyer submits a prompt, sets the worker payout and escrow amount, compares eligible
            agents, picks a favorite, and only then lets that agent claim the payout-bearing job.
          </p>
          <div className="ticket-strip">
            <span>1. Post task</span>
            <span>2. Compare agents</span>
            <span>3. Select favorite</span>
            <span>4. Approve or refund</span>
          </div>
        </div>
        <aside className="hero-stack">
          <article className="hero-stat">
            <span>Escrow rail</span>
            <strong>{state?.support.targetStack.escrow ?? "Arc Testnet"}</strong>
          </article>
          <article className="hero-stat">
            <span>Identity rail</span>
            <strong>{state?.support.targetStack.identity ?? "World ID"}</strong>
          </article>
          <article className="hero-stat">
            <span>Dossier rail</span>
            <strong>{state?.support.targetStack.dossier ?? "0G Galileo"}</strong>
          </article>
        </aside>
      </section>

      <section className="experience-grid">
        <div className="primary-stack">
          <article className="surface-card composer-panel">
            <div className="panel-headline">
              <div>
                <p className="eyebrow">Poster Console</p>
                <h2>Submit the task and lock the payout</h2>
              </div>
              <button
                className="secondary outline"
                onClick={() => runAction("Reset demo", () => api("/api/demo/reset", { method: "POST" }))}
              >
                Reset demo
              </button>
            </div>

            <div className="composer-grid">
              <label className="prompt-field">
                <span>Task title</span>
                <input
                  value={ideaForm.title}
                  disabled={!canFund}
                  onChange={(event) => setIdeaForm((current) => ({ ...current, title: event.target.value }))}
                />
              </label>

              <label className="prompt-field prompt-field-wide">
                <span>Prompt</span>
                <textarea
                  rows={7}
                  value={ideaForm.prompt}
                  disabled={!canFund}
                  onChange={(event) => setIdeaForm((current) => ({ ...current, prompt: event.target.value }))}
                />
              </label>

              <label className="prompt-field">
                <span>Deliverable</span>
                <input
                  value={ideaForm.targetArtifact}
                  disabled={!canFund}
                  onChange={(event) =>
                    setIdeaForm((current) => ({ ...current, targetArtifact: event.target.value }))
                  }
                />
              </label>

              <div className="money-stack">
                <label className="money-meter">
                  <span>Worker payout</span>
                  <strong>{currency(ideaForm.budgetUsd)}</strong>
                  <input
                    type="range"
                    min="150"
                    max="1500"
                    step="50"
                    value={ideaForm.budgetUsd}
                    disabled={!canFund}
                    onChange={(event) => {
                      const budgetUsd = Number(event.target.value);
                      setIdeaForm((current) => ({
                        ...current,
                        budgetUsd,
                        escrowUsd: Math.max(current.escrowUsd, budgetUsd)
                      }));
                    }}
                  />
                </label>

                <label className="money-meter">
                  <span>Escrow deposit</span>
                  <strong>{currency(ideaForm.escrowUsd)}</strong>
                  <input
                    type="range"
                    min={ideaForm.budgetUsd}
                    max="2000"
                    step="50"
                    value={ideaForm.escrowUsd}
                    disabled={!canFund}
                    onChange={(event) =>
                      setIdeaForm((current) => ({ ...current, escrowUsd: Number(event.target.value) }))
                    }
                  />
                </label>
              </div>
            </div>

            <div className="composer-footer">
              <div className="summary-chip">
                <span>Payout-bearing milestone</span>
                <strong>{currency(ideaForm.budgetUsd)}</strong>
              </div>
              <div className="summary-chip">
                <span>Escrow buffer</span>
                <strong>{currency(Math.max(escrowCoverage, 0))}</strong>
              </div>
              <div className="summary-chip">
                <span>Status</span>
                <strong>{state?.idea?.fundingStatus ?? "draft"}</strong>
              </div>
              <button
                disabled={!canFund || pending !== null}
                onClick={() =>
                  runAction("Fund idea", () =>
                    api("/api/ideas/fund", {
                      method: "POST",
                      body: JSON.stringify(ideaForm)
                    })
                  )
                }
              >
                {pending === "Fund idea" ? "Funding escrow..." : "Fund task"}
              </button>
            </div>
          </article>

          <article className="surface-card arena-panel">
            <div className="panel-headline">
              <div>
                <p className="eyebrow">Agent Arena</p>
                <h2>Compare eligible agents and pick the favorite</h2>
              </div>
              <StatusPill status={scaffold?.status ?? "queued"} />
            </div>
            <div className="agent-grid">
              {agentRoster.map((agent) => {
                const selected = agent.id === selectedAgent.id;
                return (
                  <button
                    key={agent.id}
                    type="button"
                    className={`agent-card${selected ? " agent-card-selected" : ""}`}
                    onClick={() => setSelectedAgentId(agent.id)}
                  >
                    <div className="section-topline">
                      <span>{agent.trust}</span>
                      {selected ? <strong>Selected</strong> : <strong>Pick</strong>}
                    </div>
                    <h3>{agent.name}</h3>
                    <p>{agent.pitch}</p>
                    <dl className="detail-grid">
                      <div>
                        <dt>ENS</dt>
                        <dd>{agent.ensName}</dd>
                      </div>
                      <div>
                        <dt>Wallet</dt>
                        <dd>{shortAddress(agent.walletAddress)}</dd>
                      </div>
                      <div>
                        <dt>Skills</dt>
                        <dd>{agent.capabilities.join(", ")}</dd>
                      </div>
                      <div>
                        <dt>Paid tool</dt>
                        <dd>{agent.paidDependency}</dd>
                      </div>
                    </dl>
                  </button>
                );
              })}
            </div>

            <div className="proposal-band">
              <div>
                <p className="eyebrow">Selected approach</p>
                <h3>{selectedAgent.name}</h3>
                <p className="muted-copy">{selectedAgent.approach}</p>
              </div>
              <button
                disabled={!canRunSelectedAgent || pending !== null || !state?.idea}
                onClick={() =>
                  runAction("Run selected agent", async () => {
                    await api("/v1/cannes/workers/register", {
                      method: "POST",
                      body: JSON.stringify({
                        id: selectedAgent.id,
                        name: selectedAgent.name,
                        walletAddress: selectedAgent.walletAddress,
                        ensName: selectedAgent.ensName,
                        agentUri: `https://agents.intelligence.exchange/${selectedAgent.id}`,
                        capabilities: selectedAgent.capabilities
                      })
                    });
                    await api(`/v1/cannes/jobs/${scaffold?.jobId ?? "idea-cannes-001-scaffold"}/claim`, {
                      method: "POST"
                    });
                    return api(`/v1/cannes/jobs/${scaffold?.jobId ?? "idea-cannes-001-scaffold"}/submit`, {
                      method: "POST",
                      body: JSON.stringify({
                        workerId: selectedAgent.id,
                        artifactUri: `https://example.com/${selectedAgent.id}/delivery`,
                        traceSummary: selectedAgent.approach,
                        paidDependency: selectedAgent.paidDependency,
                        outputSummary: selectedAgent.outputSummary
                      })
                    });
                  })
                }
              >
                {pending === "Run selected agent" ? "Running selected agent..." : "Run selected agent"}
              </button>
            </div>
          </article>

          <div className="compact-grid">
            <article className="surface-card spotlight-panel">
              <p className="eyebrow">Review & release</p>
              <h2>Approve the favorite or return funds</h2>
              <p className="muted-copy">
                The selected agent is the only worker that touches the payout-bearing milestone. The
                other candidates stay visible as alternatives, not fake onchain claims.
              </p>
              <ul className="feature-list">
                <li>Submission includes artifact URI, trace summary, and one paid dependency event.</li>
                <li>Release remains human-approved.</li>
                <li>Refund path stays open for failed or unsatisfactory work.</li>
              </ul>
              <div className="action-bar">
                <button
                  disabled={!canApprove || pending !== null}
                  onClick={() =>
                    runAction("Approve release", () =>
                      api(`/v1/cannes/jobs/${scaffold?.jobId ?? "idea-cannes-001-scaffold"}/approve`, {
                        method: "POST"
                      })
                    )
                  }
                >
                  {pending === "Approve release" ? "Releasing..." : "Approve and release"}
                </button>
                <button
                  className="secondary"
                  disabled={!canRefund || pending !== null}
                  onClick={() =>
                    runAction("Refund milestone", () =>
                      api(`/v1/cannes/jobs/${scaffold?.jobId ?? "idea-cannes-001-scaffold"}/refund`, {
                        method: "POST"
                      })
                    )
                  }
                >
                  {pending === "Refund milestone" ? "Refunding..." : "Refund"}
                </button>
              </div>
            </article>

            <article className="surface-card spotlight-panel">
              <p className="eyebrow">Escrow ledger</p>
              <h2>Budget, lock, release</h2>
              <dl className="detail-grid">
                <div>
                  <dt>Worker payout</dt>
                  <dd>{currency(state?.idea?.budgetUsd ?? ideaForm.budgetUsd)}</dd>
                </div>
                <div>
                  <dt>Escrow funded</dt>
                  <dd>{currency(state?.payout.fundedAmountUsd ?? 0)}</dd>
                </div>
                <div>
                  <dt>Released</dt>
                  <dd>{currency(state?.payout.releasedAmountUsd ?? 0)}</dd>
                </div>
                <div>
                  <dt>Refunded</dt>
                  <dd>{currency(state?.payout.refundedAmountUsd ?? 0)}</dd>
                </div>
                <div>
                  <dt>Reserved</dt>
                  <dd>{currency(state?.payout.reservedAmountUsd ?? 0)}</dd>
                </div>
                <div>
                  <dt>Live escrow balance</dt>
                  <dd>{currency(state?.payout.escrowBalanceUsd ?? 0)}</dd>
                </div>
                <div>
                  <dt>Milestone budget total</dt>
                  <dd>{currency(totalMilestoneBudget)}</dd>
                </div>
                <div>
                  <dt>Settlement</dt>
                  <dd>{state?.payout.settlementStatus ?? "uninitialized"}</dd>
                </div>
              </dl>
            </article>
          </div>

          <article className="surface-card">
            <div className="panel-headline">
              <div>
                <p className="eyebrow">Milestone State</p>
                <h2>Planner and payout milestones</h2>
              </div>
            </div>
            <div className="milestone-stack">
              {state?.brief?.milestones.map((milestone) => <MilestoneLine key={milestone.jobId} milestone={milestone} />)}
            </div>
          </article>
        </div>

        <aside className="side-stack">
          <article className="surface-card">
            <p className="eyebrow">Live actors</p>
            <h2>Current participants</h2>
            <div className="actor-stack">
              {state ? (
                <>
                  <ActorCard actor={state.poster} title="Poster" />
                  <ActorCard actor={state.worker} title="Worker" />
                  <ActorCard actor={state.reviewer} title="Reviewer" />
                </>
              ) : null}
            </div>
          </article>

          <article className="surface-card">
            <p className="eyebrow">Operator rail</p>
            <h2>MCP-compatible worker path</h2>
            <ul className="feature-list">
              <li>Any external agent can register capabilities through the worker MCP bridge.</li>
              <li>The broker only grants the payout-bearing claim to the selected active worker.</li>
              <li>World and 0G remain explicitly labeled as configured or stubbed.</li>
            </ul>
          </article>

          <article className="surface-card">
            <p className="eyebrow">Audit trail</p>
            <h2>Replayable activity log</h2>
            <ol className="timeline-list">
              {(state?.activityLog ?? []).slice().reverse().map((entry, index) => (
                <li key={`${entry}-${index}`}>{entry}</li>
              ))}
            </ol>
          </article>

          {error ? (
            <article className="surface-card error-panel">
              <p className="eyebrow">Error</p>
              <p>{error}</p>
            </article>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
