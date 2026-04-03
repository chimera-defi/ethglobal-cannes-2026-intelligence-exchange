import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useParams } from "react-router-dom";
import { demoSeed, type Actor, type DemoState, type IdeaSubmissionInput, type Milestone } from "@iex-cannes/shared";
import {
  agentRoster,
  api,
  type BuyerWorkspaceView,
  buyerKpis,
  bucketBuyerJobs,
  currency,
  defaultIdeaForm,
  deriveJobSummary,
  getScaffoldMilestone,
  type JobDetailView,
  publicJobBoard,
  shortAddress,
  type WorkerWorkspaceView,
  workerKpis,
  type WorkspaceSession
} from "./demo";

type DemoModel = {
  state: DemoState | null;
  pending: string | null;
  error: string | null;
  ideaForm: IdeaSubmissionInput;
  selectedAgentId: string;
  session: WorkspaceSession | null;
  setIdeaForm: Dispatch<SetStateAction<IdeaSubmissionInput>>;
  setSelectedAgentId: Dispatch<SetStateAction<string>>;
  setSession: Dispatch<SetStateAction<WorkspaceSession | null>>;
  refresh: () => Promise<void>;
  reset: () => Promise<void>;
  fundIdea: () => Promise<void>;
  runSelectedAgent: () => Promise<void>;
  approveRelease: () => Promise<void>;
  refundMilestone: () => Promise<void>;
  connectInjectedWallet: (role: "buyer" | "worker") => Promise<void>;
};

function StatusPill({ status }: { status: string }) {
  return <span className={`status status-${status.replaceAll("_", "-")}`}>{status.replaceAll("_", " ")}</span>;
}

function SectionHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) {
  return (
    <div className="section-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {detail ? <p className="muted-copy">{detail}</p> : null}
    </div>
  );
}

function ActorCard({ actor, title }: { actor: Actor; title: string }) {
  return (
    <article className="surface-card actor-card">
      <div className="section-topline">
        <span>{title}</span>
        <StatusPill status={actor.verified ? "verified" : "unverified"} />
      </div>
      <h3>{actor.name}</h3>
      <p>{actor.role} operator in the current local demo flow.</p>
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

function MilestoneCard({ milestone }: { milestone: Milestone }) {
  return (
    <article className="surface-card milestone-card">
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

function JobSummaryCard({
  job,
  action
}: {
  job: NonNullable<ReturnType<typeof deriveJobSummary>>;
  action?: React.ReactNode;
}) {
  return (
    <article className="surface-card workspace-card">
      <div className="milestone-head">
        <div>
          <p className="eyebrow">{job.ideaId}</p>
          <h3>{job.title}</h3>
        </div>
        <StatusPill status={job.status} />
      </div>
      <p className="muted-copy">{job.targetArtifact}</p>
      <dl className="detail-grid">
        <div>
          <dt>Payout</dt>
          <dd>{currency(job.payoutUsd)}</dd>
        </div>
        <div>
          <dt>Escrow</dt>
          <dd>{currency(job.escrowUsd)}</dd>
        </div>
        <div>
          <dt>Worker</dt>
          <dd>{job.workerId ?? "not yet selected"}</dd>
        </div>
        <div>
          <dt>Dossier</dt>
          <dd>{job.dossierStatus}</dd>
        </div>
      </dl>
      {action ? <div className="card-actions">{action}</div> : null}
    </article>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <article className="surface-card empty-card">
      <h3>{title}</h3>
      <p className="muted-copy">{detail}</p>
    </article>
  );
}

function useBuyerWorkspace(state: DemoState | null) {
  const [workspace, setWorkspace] = useState<BuyerWorkspaceView | null>(null);

  useEffect(() => {
    void api<BuyerWorkspaceView>("/v1/cannes/buyer/workspace")
      .then(setWorkspace)
      .catch(() => setWorkspace(null));
  }, [state]);

  return workspace;
}

function useWorkerWorkspace(state: DemoState | null) {
  const [workspace, setWorkspace] = useState<WorkerWorkspaceView | null>(null);

  useEffect(() => {
    void api<WorkerWorkspaceView>("/v1/cannes/worker/workspace")
      .then(setWorkspace)
      .catch(() => setWorkspace(null));
  }, [state]);

  return workspace;
}

function useJobDetail(state: DemoState | null, jobId: string | undefined) {
  const [detail, setDetail] = useState<JobDetailView | null>(null);

  useEffect(() => {
    if (!jobId) {
      setDetail(null);
      return;
    }
    void api<JobDetailView>(`/v1/cannes/jobs/${jobId}`)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [jobId, state]);

  return detail;
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function LandingPage({ model }: { model: DemoModel }) {
  return (
    <section className="page-grid">
      <article className="hero-panel">
        <div>
          <p className="eyebrow">Cannes variant</p>
          <h1>Buyer workspace, public job board, worker console, and review queue.</h1>
          <p className="lead-copy">
            This app should behave like an operating system for the marketplace, not a one-screen storyboard.
            Buyers post jobs, workers browse and claim from the board, and reviewers accept or reject in a dedicated queue.
          </p>
        </div>
        <div className="ticket-strip">
          <span>Wallet entry</span>
          <span>Post jobs</span>
          <span>Review submissions</span>
          <span>Track history</span>
        </div>
      </article>

      <div className="two-column">
        <article className="surface-card">
          <SectionHeading
            eyebrow="Sign in"
            title="Use a wallet or local demo identity"
            detail="Injected wallet support is available when a browser wallet exists. Demo identities keep the local flow usable without extra setup."
          />
          <div className="action-grid">
            <button onClick={() => void model.connectInjectedWallet("buyer")}>Connect buyer wallet</button>
            <button className="secondary" onClick={() => void model.connectInjectedWallet("worker")}>
              Connect worker wallet
            </button>
            <button
              className="secondary"
              onClick={() =>
                model.setSession({
                  role: "buyer",
                  address: demoSeed.poster.walletAddress,
                  label: demoSeed.poster.name,
                  source: "demo"
                })
              }
            >
              Continue as demo buyer
            </button>
            <button
              className="secondary"
              onClick={() =>
                model.setSession({
                  role: "worker",
                  address: demoSeed.worker.walletAddress,
                  label: demoSeed.worker.name,
                  source: "demo"
                })
              }
            >
              Continue as demo worker
            </button>
          </div>
        </article>

        <article className="surface-card">
          <SectionHeading eyebrow="Current state" title="What the local MVP already proves" />
          <ul className="feature-list">
            <li>Single payout-bearing scaffold milestone with onchain reserve, release, and refund.</li>
            <li>Public job-board style claim path for the active milestone.</li>
            <li>Dedicated buyer pages for posted jobs, review queue, and history in this refactor.</li>
          </ul>
        </article>
      </div>
    </section>
  );
}

function BuyerWorkspacePage({ model }: { model: DemoModel }) {
  const workspace = useBuyerWorkspace(model.state);
  const buckets = workspace?.buckets ?? bucketBuyerJobs(model.state);
  const kpis = buyerKpis(model.state);
  const canFund = !model.state?.idea || ["released", "refunded"].includes(model.state.payout.settlementStatus);

  return (
    <section className="page-grid">
      <div className="metric-grid">
        <MetricCard label="Active jobs" value={kpis.activeJobs} />
        <MetricCard label="Awaiting review" value={kpis.awaitingReview} />
        <MetricCard label="Closed jobs" value={kpis.closedJobs} />
        <MetricCard label="Acceptance rate" value={`${kpis.acceptanceRate}%`} />
      </div>

      <article className="surface-card composer-panel">
        <SectionHeading
          eyebrow="Buyer workspace"
          title="Post a new job"
          detail="Prompt, payout, and escrow live on their own route now so the buyer workspace behaves like a real operator surface."
        />
        <div className="composer-grid">
          <label className="prompt-field">
              <span>Task title</span>
              <input
                value={model.ideaForm.title}
                disabled={!canFund}
                onChange={(event) => model.setIdeaForm((current) => ({ ...current, title: event.target.value }))}
              />
            </label>

          <label className="prompt-field prompt-field-wide">
            <span>Prompt</span>
              <textarea
                rows={7}
                value={model.ideaForm.prompt}
                disabled={!canFund}
                onChange={(event) => model.setIdeaForm((current) => ({ ...current, prompt: event.target.value }))}
              />
            </label>

          <label className="prompt-field">
              <span>Deliverable</span>
              <input
                value={model.ideaForm.targetArtifact}
                disabled={!canFund}
                onChange={(event) =>
                  model.setIdeaForm((current) => ({ ...current, targetArtifact: event.target.value }))
                }
            />
          </label>

          <div className="money-stack">
            <label className="money-meter">
              <span>Worker payout</span>
              <strong>{currency(model.ideaForm.budgetUsd)}</strong>
              <input
                type="range"
                min="150"
                max="1500"
                step="50"
                value={model.ideaForm.budgetUsd}
                disabled={!canFund}
                onChange={(event) => {
                  const budgetUsd = Number(event.target.value);
                  model.setIdeaForm((current) => ({
                    ...current,
                    budgetUsd,
                    escrowUsd: Math.max(current.escrowUsd, budgetUsd)
                  }));
                }}
              />
            </label>

            <label className="money-meter">
              <span>Escrow deposit</span>
              <strong>{currency(model.ideaForm.escrowUsd)}</strong>
              <input
                type="range"
                min={model.ideaForm.budgetUsd}
                max="2000"
                step="50"
                value={model.ideaForm.escrowUsd}
                disabled={!canFund}
                onChange={(event) =>
                  model.setIdeaForm((current) => ({ ...current, escrowUsd: Number(event.target.value) }))
                }
              />
            </label>
          </div>
        </div>

        <div className="composer-footer">
          <div className="summary-chip">
            <span>Payout</span>
            <strong>{currency(model.ideaForm.budgetUsd)}</strong>
          </div>
          <div className="summary-chip">
            <span>Escrow</span>
            <strong>{currency(model.ideaForm.escrowUsd)}</strong>
          </div>
          <div className="summary-chip">
            <span>Buffer</span>
            <strong>{currency(model.ideaForm.escrowUsd - model.ideaForm.budgetUsd)}</strong>
          </div>
          <button disabled={!canFund || model.pending !== null} onClick={() => void model.fundIdea()}>
            {model.pending === "Fund idea" ? "Funding..." : "Post and fund job"}
          </button>
        </div>
      </article>

      <article className="surface-card">
        <SectionHeading eyebrow="Posted jobs" title="Open and in-progress jobs you posted" />
        <div className="stack-list">
          {buckets.posted.length > 0 ? (
            buckets.posted.map((job) => (
              <JobSummaryCard
                key={job.ideaId}
                job={job}
                action={<Link className="link-button" to={`/jobs/${job.jobId}`}>Open job detail</Link>}
              />
            ))
          ) : (
            <EmptyState
              title="No active jobs yet"
              detail="Fund a job to populate the buyer workspace and the public job board."
            />
          )}
        </div>
      </article>

      <article className="surface-card">
        <SectionHeading eyebrow="Controls" title="Spend and evidence" />
          <div className="detail-grid">
            <div>
              <dt>Escrow funded</dt>
              <dd>{currency(workspace?.payout.fundedAmountUsd ?? model.state?.payout.fundedAmountUsd ?? 0)}</dd>
            </div>
            <div>
              <dt>Reserved</dt>
              <dd>{currency(workspace?.payout.reservedAmountUsd ?? model.state?.payout.reservedAmountUsd ?? 0)}</dd>
            </div>
            <div>
              <dt>Released</dt>
              <dd>{currency(workspace?.payout.releasedAmountUsd ?? model.state?.payout.releasedAmountUsd ?? 0)}</dd>
            </div>
            <div>
              <dt>Alerts</dt>
            <dd>{kpis.alerts}</dd>
          </div>
        </div>
        <p className="muted-copy dossier-copy">
          Dossier: {workspace?.dossierUri ?? model.state?.brief?.dossierUri ?? "The dossier link appears after funding and is refreshed on each major transition."}
        </p>
      </article>
    </section>
  );
}

function BuyerReviewPage({ model }: { model: DemoModel }) {
  const workspace = useBuyerWorkspace(model.state);
  const buckets = workspace?.buckets ?? bucketBuyerJobs(model.state);
  const scaffold = getScaffoldMilestone(model.state);

  return (
    <section className="page-grid">
      <article className="surface-card">
        <SectionHeading
          eyebrow="Review queue"
          title="Outstanding submissions that need your decision"
          detail="This page is intentionally separate from job creation so the buyer can focus on approval, refund, and evidence."
        />
        <div className="stack-list">
          {buckets.awaitingReview.length > 0 && scaffold ? (
            buckets.awaitingReview.map((job) => (
              <JobSummaryCard
                key={job.ideaId}
                job={job}
                action={
                  <div className="card-actions">
                    <button disabled={model.pending !== null} onClick={() => void model.approveRelease()}>
                      {model.pending === "Approve release" ? "Releasing..." : "Approve and release"}
                    </button>
                    <button className="secondary" disabled={model.pending !== null} onClick={() => void model.refundMilestone()}>
                      {model.pending === "Refund milestone" ? "Refunding..." : "Refund"}
                    </button>
                  </div>
                }
              />
            ))
          ) : (
            <EmptyState
              title="Nothing is awaiting review"
              detail="When a worker submits the scaffold milestone, it will appear here for approval or refund."
            />
          )}
        </div>
      </article>

      <article className="surface-card">
        <SectionHeading eyebrow="Evidence" title="Artifact, trace, spend, and payout state" />
        {scaffold ? (
          <>
            <MilestoneCard milestone={scaffold} />
            <div className="detail-grid review-grid">
              <div>
                <dt>Escrow status</dt>
                <dd>{model.state?.payout.settlementStatus ?? "uninitialized"}</dd>
              </div>
              <div>
                <dt>Released amount</dt>
                <dd>{currency(model.state?.payout.releasedAmountUsd ?? 0)}</dd>
              </div>
              <div>
                <dt>Refunded amount</dt>
                <dd>{currency(model.state?.payout.refundedAmountUsd ?? 0)}</dd>
              </div>
              <div>
                <dt>Dossier status</dt>
                <dd>{model.state?.brief?.dossierStatus ?? "pending"}</dd>
              </div>
            </div>
          </>
        ) : (
          <EmptyState title="No submitted work yet" detail="Fund and run a worker to generate review evidence." />
        )}
      </article>
    </section>
  );
}

function BuyerHistoryPage({ model }: { model: DemoModel }) {
  const workspace = useBuyerWorkspace(model.state);
  const buckets = workspace?.buckets ?? bucketBuyerJobs(model.state);

  return (
    <section className="page-grid">
      <article className="surface-card">
        <SectionHeading
          eyebrow="History"
          title="Completed and cancelled jobs"
          detail="Closed work moves here after payout release or refund."
        />
        <div className="stack-list">
          {buckets.history.length > 0 ? (
            buckets.history.map((job) => <JobSummaryCard key={job.ideaId} job={job} />)
          ) : (
            <EmptyState
              title="No completed or cancelled jobs yet"
              detail="Release or refund the current job to populate buyer history."
            />
          )}
        </div>
      </article>
    </section>
  );
}

function JobBoardPage({ model }: { model: DemoModel }) {
  const jobs = publicJobBoard(model.state);

  return (
    <section className="page-grid">
      <article className="surface-card">
        <SectionHeading
          eyebrow="Public job board"
          title="Open work that agents can claim"
          detail="This is the worker-facing discovery surface. Only claimable jobs belong here."
        />
        <div className="stack-list">
          {jobs.length > 0 ? (
            jobs.map((job) => (
              <article key={job.jobId} className="surface-card board-card">
                <div className="milestone-head">
                  <div>
                    <p className="eyebrow">{job.jobId}</p>
                    <h3>{job.title}</h3>
                  </div>
                  <StatusPill status={job.status} />
                </div>
                <p className="muted-copy">{job.description}</p>
                <dl className="detail-grid">
                  <div>
                    <dt>Payout</dt>
                    <dd>{currency(job.budgetUsd)}</dd>
                  </div>
                  <div>
                    <dt>Capabilities</dt>
                    <dd>{job.requiredCapabilities.join(", ")}</dd>
                  </div>
                </dl>
                <div className="card-actions">
                  <Link className="link-button" to={`/jobs/${job.jobId}`}>Inspect job</Link>
                  <Link className="link-button" to="/worker">Open worker console</Link>
                </div>
              </article>
            ))
          ) : (
            <EmptyState
              title="No open jobs on the board"
              detail="Fund a new job first. Once the scaffold milestone is queued, it appears here for workers."
            />
          )}
        </div>
      </article>
    </section>
  );
}

function WorkerConsolePage({ model }: { model: DemoModel }) {
  const workspace = useWorkerWorkspace(model.state);
  const selectedAgent = agentRoster.find((agent) => agent.id === model.selectedAgentId) ?? agentRoster[0];
  const scaffold = getScaffoldMilestone(model.state);
  const kpis = workerKpis(model.state);

  return (
    <section className="page-grid">
      <div className="metric-grid">
        <MetricCard label="Eligible jobs" value={workspace?.summary.eligibleJobs ?? kpis.eligibleJobs} />
        <MetricCard label="Claimed jobs" value={workspace?.summary.claimedJobs ?? kpis.claimedJobs} />
        <MetricCard label="Completed" value={workspace?.summary.completedJobs ?? kpis.completedJobs} />
        <MetricCard
          label="Quality score"
          value={(workspace?.summary.qualityScore ? (workspace.summary.qualityScore / 100).toFixed(2) : kpis.qualityScore)}
        />
      </div>

      <article className="surface-card">
        <SectionHeading
          eyebrow="Worker console"
          title="Pick an operator profile and fulfil the active job"
          detail="This is distinct from the buyer workspace. The worker sees eligible work and claims it from the job board."
        />
        <div className="agent-grid">
          {agentRoster.map((agent) => {
            const selected = agent.id === selectedAgent.id;
            return (
              <button
                key={agent.id}
                type="button"
                className={`agent-card${selected ? " agent-card-selected" : ""}`}
                onClick={() => model.setSelectedAgentId(agent.id)}
              >
                <div className="section-topline">
                  <span>{agent.trust}</span>
                  <strong>{selected ? "selected" : "available"}</strong>
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
                </dl>
              </button>
            );
          })}
        </div>
        <div className="proposal-band">
          <div>
            <p className="eyebrow">Selected operator</p>
            <h3>{selectedAgent.name}</h3>
            <p className="muted-copy">{selectedAgent.approach}</p>
          </div>
          <button
            disabled={!model.state?.idea || scaffold?.status !== "queued" || model.pending !== null}
            onClick={() => void model.runSelectedAgent()}
          >
            {model.pending === "Run selected agent" ? "Running..." : "Claim and submit"}
          </button>
        </div>
      </article>

      <article className="surface-card">
        <SectionHeading eyebrow="Runtime" title="Guardrails and outcome summary" />
        <div className="detail-grid">
          <div>
            <dt>Mode</dt>
            <dd>manual</dd>
          </div>
          <div>
            <dt>Task classes</dt>
            <dd>frontend, backend, contracts</dd>
          </div>
          <div>
            <dt>Daily spend cap</dt>
            <dd>{currency(model.state?.idea?.escrowUsd ?? 0)}</dd>
          </div>
          <div>
            <dt>Earnings</dt>
            <dd>{currency(workspace?.summary.earningsUsd ?? kpis.earningsUsd)}</dd>
          </div>
          <div>
            <dt>Rejected jobs</dt>
            <dd>{workspace?.summary.refundedJobs ?? kpis.rejectedJobs}</dd>
          </div>
          <div>
            <dt>Kill switch</dt>
            <dd>off</dd>
          </div>
        </div>
      </article>
    </section>
  );
}

function JobDetailPage({ model }: { model: DemoModel }) {
  const { jobId } = useParams();
  const milestones = model.state?.brief?.milestones ?? [];
  const detail = useJobDetail(model.state, jobId);
  const milestone = detail?.milestone ?? milestones.find((item) => item.jobId === jobId) ?? null;

  if (!milestone) {
    return (
      <section className="page-grid">
        <EmptyState title="Job not found" detail="The requested milestone is not available in the current local demo state." />
      </section>
    );
  }

  return (
    <section className="page-grid">
      <article className="surface-card">
        <SectionHeading eyebrow="Job detail" title={milestone.title} detail={milestone.jobId} />
        <MilestoneCard milestone={milestone} />
      </article>
      <article className="surface-card">
        <SectionHeading eyebrow="Lifecycle" title="Milestone timeline" />
        <div className="stack-list">
          {milestones.map((item) => (
            <MilestoneCard key={item.jobId} milestone={item} />
          ))}
        </div>
      </article>
    </section>
  );
}

function AppRoutes({ model }: { model: DemoModel }) {
  return (
    <Routes>
      <Route path="/" element={<LandingPage model={model} />} />
      <Route path="/jobs" element={<JobBoardPage model={model} />} />
      <Route path="/buyer" element={<BuyerWorkspacePage model={model} />} />
      <Route path="/buyer/new" element={<Navigate to="/buyer" replace />} />
      <Route path="/buyer/review" element={<BuyerReviewPage model={model} />} />
      <Route path="/buyer/history" element={<BuyerHistoryPage model={model} />} />
      <Route path="/worker" element={<WorkerConsolePage model={model} />} />
      <Route path="/jobs/:jobId" element={<JobDetailPage model={model} />} />
    </Routes>
  );
}

export function App() {
  const [state, setState] = useState<DemoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [ideaForm, setIdeaForm] = useState<IdeaSubmissionInput>({ ...defaultIdeaForm });
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agentRoster[0].id);
  const [session, setSession] = useState<WorkspaceSession | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem("iex-cannes-session");
    if (raw) {
      try {
        setSession(JSON.parse(raw) as WorkspaceSession);
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (session) {
      window.localStorage.setItem("iex-cannes-session", JSON.stringify(session));
    } else {
      window.localStorage.removeItem("iex-cannes-session");
    }
  }, [session]);

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

  async function runAction(label: string, action: () => Promise<void>) {
    setPending(label);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  }

  async function connectInjectedWallet(role: "buyer" | "worker") {
    const ethereum = (window as Window & { ethereum?: { request: (request: { method: string }) => Promise<string[]> } })
      .ethereum;
    if (!ethereum) {
      throw new Error("No injected wallet detected. Use a demo identity or install a browser wallet.");
    }
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    const address = accounts[0];
    if (!address) {
      throw new Error("Wallet returned no accounts.");
    }
    setSession({
      role,
      address,
      label: role === "buyer" ? "Connected buyer" : "Connected worker",
      source: "injected"
    });
  }

  const model = useMemo<DemoModel>(
    () => ({
      state,
      pending,
      error,
      ideaForm,
      selectedAgentId,
      session,
      setIdeaForm,
      setSelectedAgentId,
      setSession,
      refresh,
      reset: () => runAction("Reset demo", async () => void (await api("/api/demo/reset", { method: "POST" }))),
      fundIdea: () =>
        runAction("Fund idea", async () => {
          await api("/api/ideas/fund", {
            method: "POST",
            body: JSON.stringify(ideaForm)
          });
        }),
      runSelectedAgent: () =>
        runAction("Run selected agent", async () => {
          const selectedAgent = agentRoster.find((agent) => agent.id === selectedAgentId) ?? agentRoster[0];
          const scaffold = getScaffoldMilestone(state);
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
          await api(`/v1/cannes/jobs/${scaffold?.jobId ?? "idea-cannes-001-scaffold"}/claim`, { method: "POST" });
          await api(`/v1/cannes/jobs/${scaffold?.jobId ?? "idea-cannes-001-scaffold"}/submit`, {
            method: "POST",
            body: JSON.stringify({
              workerId: selectedAgent.id,
              artifactUri: `https://example.com/${selectedAgent.id}/delivery`,
              traceSummary: selectedAgent.approach,
              paidDependency: selectedAgent.paidDependency,
              outputSummary: selectedAgent.outputSummary
            })
          });
        }),
      approveRelease: () =>
        runAction("Approve release", async () => {
          const scaffold = getScaffoldMilestone(state);
          await api(`/v1/cannes/jobs/${scaffold?.jobId ?? "idea-cannes-001-scaffold"}/approve`, { method: "POST" });
        }),
      refundMilestone: () =>
        runAction("Refund milestone", async () => {
          const scaffold = getScaffoldMilestone(state);
          await api(`/v1/cannes/jobs/${scaffold?.jobId ?? "idea-cannes-001-scaffold"}/refund`, { method: "POST" });
        }),
      connectInjectedWallet
    }),
    [error, ideaForm, pending, selectedAgentId, session, state]
  );

  const jobSummary = deriveJobSummary(state);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">ETHGlobal Cannes 2026</p>
          <h1>Intelligence Exchange</h1>
        </div>
        <div className="session-box">
          {session ? (
            <>
              <span>{session.role}</span>
              <strong>{session.label}</strong>
              <small>{shortAddress(session.address)}</small>
            </>
          ) : (
            <>
              <span>session</span>
              <strong>not connected</strong>
              <small>use wallet or demo identity</small>
            </>
          )}
        </div>
      </header>

      <nav className="route-nav">
        <NavLink to="/">Overview</NavLink>
        <NavLink to="/jobs">Job Board</NavLink>
        <NavLink to="/buyer">Buyer</NavLink>
        <NavLink to="/buyer/review">Review</NavLink>
        <NavLink to="/buyer/history">History</NavLink>
        <NavLink to="/worker">Worker</NavLink>
        {jobSummary ? <NavLink to={`/jobs/${jobSummary.jobId}`}>Job Detail</NavLink> : null}
      </nav>

      <section className="status-ribbon">
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
        <article className="hero-stat">
          <span>Reset local demo</span>
          <button className="secondary" onClick={() => void model.reset()}>
            Reset
          </button>
        </article>
      </section>

      <AppRoutes model={model} />

      <section className="footer-grid">
        <article className="surface-card">
          <SectionHeading eyebrow="Live actors" title="Poster, worker, reviewer" />
          <div className="three-up">
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
          <SectionHeading eyebrow="Audit trail" title="Replayable activity log" />
          <ol className="timeline-list">
            {(state?.activityLog ?? []).slice().reverse().map((entry, index) => (
              <li key={`${entry}-${index}`}>{entry}</li>
            ))}
          </ol>
        </article>

        {error ? (
          <article className="surface-card error-panel">
            <SectionHeading eyebrow="Error" title="Action failed" />
            <p>{error}</p>
          </article>
        ) : null}
      </section>
    </main>
  );
}
