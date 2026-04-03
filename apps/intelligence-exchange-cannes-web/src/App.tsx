import { useEffect, useState } from "react";
import { demoSeed, type Actor, type DemoState, type Milestone } from "@iex-cannes/shared";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";

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

function StatusPill({ status }: { status: string }) {
  return <span className={`status status-${status.replaceAll("_", "-")}`}>{status}</span>;
}

function ActorCard({ actor, title }: { actor: Actor; title: string }) {
  return (
    <article className="milestone-card">
      <div className="milestone-card-top">
        <div>
          <p className="eyebrow">{title}</p>
          <h3>{actor.name}</h3>
        </div>
        <StatusPill status={actor.verified ? "verified" : "unverified"} />
      </div>
      <div className="meta-grid">
        <div>
          <span>Wallet</span>
          <strong>{actor.walletAddress}</strong>
        </div>
        <div>
          <span>Verification</span>
          <strong>{actor.verificationMode}</strong>
        </div>
        <div>
          <span>ENS</span>
          <strong>{actor.ensName ?? "none"}</strong>
        </div>
        <div>
          <span>Agent ID</span>
          <strong>{actor.agentId ?? "not registered"}</strong>
        </div>
      </div>
    </article>
  );
}

function MilestoneCard({ milestone }: { milestone: Milestone }) {
  return (
    <article className="milestone-card">
      <div className="milestone-card-top">
        <div>
          <p className="eyebrow">{milestone.milestoneType}</p>
          <h3>{milestone.title}</h3>
        </div>
        <StatusPill status={milestone.status} />
      </div>
      <p className="muted">{milestone.description}</p>
      <div className="meta-grid">
        <div>
          <span>Budget</span>
          <strong>{currency(milestone.budgetUsd)}</strong>
        </div>
        <div>
          <span>Capabilities</span>
          <strong>{milestone.requiredCapabilities.join(", ")}</strong>
        </div>
        <div>
          <span>Worker</span>
          <strong>{milestone.workerId ?? "Unclaimed"}</strong>
        </div>
        <div>
          <span>Reserved</span>
          <strong>{milestone.reservedOnchain ? "yes" : "no"}</strong>
        </div>
      </div>
      {milestone.traceSummary ? <p className="trace">{milestone.traceSummary}</p> : null}
      {milestone.paidDependency ? <p className="dependency">Paid dependency: {milestone.paidDependency}</p> : null}
    </article>
  );
}

export function App() {
  const [state, setState] = useState<DemoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function refresh() {
    const next = await api<DemoState>("/api/demo-state");
    setState(next);
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

  const scaffold = state?.brief?.milestones.find((milestone) => milestone.milestoneType === "scaffold");
  const canFund = !state?.idea;
  const canClaim = scaffold?.status === "queued";
  const canSubmit = scaffold?.status === "claimed";
  const canApprove = scaffold?.status === "submitted";
  const canRefund = scaffold ? ["claimed", "rework", "expired"].includes(scaffold.status) : false;

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">ETHGlobal Cannes 2026</p>
          <h1>Intelligence Exchange</h1>
          <p className="lede">
            A poster funds an idea. A human-backed worker claims one milestone. The worker submits
            artifact plus trace. A reviewer approves or refunds. Escrow and identity are visible.
          </p>
        </div>
        <div className="hero-panel">
          <div>
            <span>Escrow target</span>
            <strong>{state?.support.targetStack.escrow ?? "Arc Testnet"}</strong>
          </div>
          <div>
            <span>Identity target</span>
            <strong>{state?.support.targetStack.identity ?? "World ID"}</strong>
          </div>
          <div>
            <span>Dossier target</span>
            <strong>{state?.support.targetStack.dossier ?? "0G Galileo"}</strong>
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="stack">
          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Product Flow</p>
                <h2>Poster, worker, reviewer</h2>
              </div>
              <button className="ghost-button" onClick={() => runAction("Reset demo", () => api("/api/demo/reset", { method: "POST" }))}>
                Reset
              </button>
            </div>
            <div className="milestone-grid">
              {state ? (
                <>
                  <ActorCard actor={state.poster} title="Poster" />
                  <ActorCard actor={state.worker} title="Worker" />
                  <ActorCard actor={state.reviewer} title="Reviewer" />
                </>
              ) : null}
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Poster Step</p>
                <h2>Fund the job and mint identities</h2>
              </div>
              <StatusPill status={state?.idea?.fundingStatus ?? "draft"} />
            </div>
            <div className="idea-card">
              <h3>{demoSeed.ideaInput.title}</h3>
              <p>{demoSeed.ideaInput.prompt}</p>
              <div className="meta-grid">
                <div>
                  <span>Artifact</span>
                  <strong>{demoSeed.ideaInput.targetArtifact}</strong>
                </div>
                <div>
                  <span>Budget</span>
                  <strong>{currency(demoSeed.ideaInput.budgetUsd)}</strong>
                </div>
              </div>
            </div>
            <div className="action-row">
              <button
                disabled={!canFund || pending !== null}
                onClick={() =>
                  runAction("Fund idea", () =>
                    api("/api/ideas/fund", {
                      method: "POST",
                      body: JSON.stringify(demoSeed.ideaInput)
                    })
                  )
                }
              >
                {pending === "Fund idea" ? "Funding..." : "1. Fund idea"}
              </button>
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Worker Step</p>
                <h2>Claim and submit the scaffold milestone</h2>
              </div>
              <StatusPill status={scaffold?.status ?? "queued"} />
            </div>
            <div className="action-row">
              <button
                disabled={!canClaim || pending !== null}
                onClick={() =>
                  runAction("Claim milestone", () =>
                    api(`/api/milestones/${scaffold?.jobId ?? "scaffold"}/claim`, { method: "POST" })
                  )
                }
              >
                {pending === "Claim milestone" ? "Claiming..." : "2. Claim milestone"}
              </button>
              <button
                disabled={!canSubmit || pending !== null}
                onClick={() =>
                  runAction("Submit milestone", () =>
                    api(`/api/milestones/${scaffold?.jobId ?? "scaffold"}/submit`, {
                      method: "POST",
                      body: JSON.stringify({
                        workerId: state?.worker.id ?? demoSeed.worker.id,
                        artifactUri: "https://example.com/cannes-demo-screenshot",
                        traceSummary:
                          "Worker generated the repo scaffold, wired local World gating, recorded a paid dependency, and wrote a dossier snapshot.",
                        paidDependency: "Arc nanopayment for package audit credits",
                        outputSummary:
                          "World-gated scaffold with milestone reservation, reviewer approval path, and local 0G-style dossier."
                      })
                    })
                  )
                }
              >
                {pending === "Submit milestone" ? "Submitting..." : "3. Submit scaffold"}
              </button>
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Reviewer Step</p>
                <h2>Approve release or refund</h2>
              </div>
              <StatusPill status={state?.payout.settlementStatus ?? "uninitialized"} />
            </div>
            <div className="action-row">
              <button
                disabled={!canApprove || pending !== null}
                onClick={() =>
                  runAction("Approve milestone", () =>
                    api(`/api/milestones/${scaffold?.jobId ?? "scaffold"}/approve`, { method: "POST" })
                  )
                }
              >
                {pending === "Approve milestone" ? "Releasing..." : "4. Approve + release"}
              </button>
              <button
                className="ghost-button"
                disabled={!canRefund || pending !== null}
                onClick={() =>
                  runAction("Refund milestone", () =>
                    api(`/api/milestones/${scaffold?.jobId ?? "scaffold"}/refund`, { method: "POST" })
                  )
                }
              >
                {pending === "Refund milestone" ? "Refunding..." : "Refund"}
              </button>
            </div>
            {error ? <p className="error-banner">{error}</p> : null}
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Milestones</p>
                <h2>Build brief and queue</h2>
              </div>
            </div>
            <div className="milestone-grid">
              {state?.brief?.milestones.map((milestone) => <MilestoneCard key={milestone.jobId} milestone={milestone} />) ??
                <p className="muted">Fund the idea to generate the build brief and milestone graph.</p>}
            </div>
          </article>
        </div>

        <div className="stack">
          <article className="panel summary-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Escrow</p>
                <h2>Milestone-aware settlement</h2>
              </div>
              <StatusPill status={state?.payout.settlementStatus ?? "uninitialized"} />
            </div>
            <div className="summary-grid">
              <div>
                <span>Escrow</span>
                <strong>{state?.payout.contractAddress ?? "Not deployed"}</strong>
              </div>
              <div>
                <span>Registry</span>
                <strong>{state?.payout.identityRegistryAddress ?? "Not deployed"}</strong>
              </div>
              <div>
                <span>Funded</span>
                <strong>{currency(state?.payout.fundedAmountUsd ?? 0)}</strong>
              </div>
              <div>
                <span>Reserved</span>
                <strong>{currency(state?.payout.reservedAmountUsd ?? 0)}</strong>
              </div>
              <div>
                <span>Released</span>
                <strong>{currency(state?.payout.releasedAmountUsd ?? 0)}</strong>
              </div>
              <div>
                <span>Refunded</span>
                <strong>{currency(state?.payout.refundedAmountUsd ?? 0)}</strong>
              </div>
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Dossier</p>
                <h2>Review evidence</h2>
              </div>
              <StatusPill status={state?.brief?.dossierStatus ?? "pending"} />
            </div>
            <p className="muted">
              {state?.brief?.dossierUri ?? "Local dossier will be written after funding and each major transition."}
            </p>
            <div className="rubric">
              <h3>Acceptance rubric</h3>
              <ul>
                {state?.brief?.acceptanceRubric.requiredChecks.map((check) => <li key={check}>{check}</li>) ??
                  [<li key="placeholder">Fund the idea to generate the acceptance rubric.</li>]}
              </ul>
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Runtime</p>
                <h2>Worker package</h2>
              </div>
            </div>
            <p className="muted">
              The repo now includes a Bun worker runtime and MCP bridge so external agents can
              discover work, claim jobs, and submit results through the broker without clicking the UI.
            </p>
            <div className="rubric">
              <h3>Commands</h3>
              <ul>
                <li>`bun run --filter intelligence-exchange-cannes-worker claim-and-submit`</li>
                <li>`bun run --filter intelligence-exchange-cannes-worker mcp`</li>
              </ul>
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Activity</p>
                <h2>Audit trail</h2>
              </div>
            </div>
            <ol className="activity-list">
              {state?.activityLog.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>) ?? null}
            </ol>
          </article>
        </div>
      </section>
    </main>
  );
}
