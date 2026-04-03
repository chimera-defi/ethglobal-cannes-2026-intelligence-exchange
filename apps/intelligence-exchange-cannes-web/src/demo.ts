import { demoSeed, type DemoState, type IdeaSubmissionInput, type Milestone } from "@iex-cannes/shared";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";

export type AgentCandidate = {
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

export type SessionRole = "buyer" | "worker";

export type WorkspaceSession = {
  role: SessionRole;
  address: string;
  label: string;
  source: "demo" | "injected";
};

export type JobWorkspaceStatus = "open" | "in_progress" | "awaiting_review" | "completed" | "cancelled";

export type JobSummary = {
  ideaId: string;
  title: string;
  targetArtifact: string;
  payoutUsd: number;
  escrowUsd: number;
  status: JobWorkspaceStatus;
  settlementStatus: DemoState["payout"]["settlementStatus"];
  dossierStatus: NonNullable<DemoState["brief"]>["dossierStatus"];
  jobId: string;
  workerId: string | null;
};

export const agentRoster: AgentCandidate[] = [
  {
    id: demoSeed.worker.id,
    name: demoSeed.worker.name,
    walletAddress: demoSeed.worker.walletAddress,
    ensName: demoSeed.worker.ensName ?? "builder-one.eth",
    capabilities: [...demoSeed.worker.capabilities],
    trust: "Seeded signer",
    pitch: "Balanced full-stack worker tuned for the Cannes scaffold happy path.",
    approach: "Ships a cleaner product shell, broker hooks, and escrow evidence with the fewest moving parts.",
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
    pitch: "Design-forward worker that optimizes for buyer review clarity.",
    approach: "Focuses on stronger information hierarchy, page routing, and cleaner decision points.",
    paidDependency: "Visual regression bundle credits",
    outputSummary:
      "Poster-first workspace with explicit review queues, job history, and more legible acceptance evidence."
  },
  {
    id: "protocol-scribe",
    name: "Protocol Scribe",
    walletAddress: "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65",
    ensName: "protocol-scribe.eth",
    capabilities: ["typescript", "frontend", "backend", "contracts"],
    trust: "Proof-ready operator",
    pitch: "Documentation-heavy worker with stronger trace and dossier emphasis.",
    approach: "Produces a more conservative implementation with tighter audit logging and release evidence.",
    paidDependency: "Spec parsing credits for acceptance trace export",
    outputSummary:
      "Trace-first submission with stronger audit evidence, deterministic reviewer checkpoints, and payout release artifacts."
  }
];

export const defaultIdeaForm: IdeaSubmissionInput = {
  ...demoSeed.ideaInput
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
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

export function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

export function shortAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function getScaffoldMilestone(state: DemoState | null) {
  return state?.brief?.milestones.find((milestone) => milestone.milestoneType === "scaffold") ?? null;
}

export function deriveJobSummary(state: DemoState | null): JobSummary | null {
  if (!state?.idea || !state.brief) {
    return null;
  }

  const scaffold = getScaffoldMilestone(state);
  if (!scaffold) {
    return null;
  }

  let status: JobWorkspaceStatus = "open";
  if (state.payout.settlementStatus === "released") {
    status = "completed";
  } else if (state.payout.settlementStatus === "refunded") {
    status = "cancelled";
  } else if (scaffold.status === "submitted") {
    status = "awaiting_review";
  } else if (["claimed", "rework", "accepted"].includes(scaffold.status)) {
    status = "in_progress";
  }

  return {
    ideaId: state.idea.ideaId,
    title: state.idea.title,
    targetArtifact: state.idea.targetArtifact,
    payoutUsd: state.idea.budgetUsd,
    escrowUsd: state.idea.escrowUsd,
    status,
    settlementStatus: state.payout.settlementStatus,
    dossierStatus: state.brief.dossierStatus,
    jobId: scaffold.jobId,
    workerId: scaffold.workerId
  };
}

export function bucketBuyerJobs(state: DemoState | null) {
  const summary = deriveJobSummary(state);
  const buckets = {
    posted: [] as JobSummary[],
    awaitingReview: [] as JobSummary[],
    history: [] as JobSummary[]
  };

  if (!summary) {
    return buckets;
  }

  if (summary.status === "awaiting_review") {
    buckets.awaitingReview.push(summary);
  } else if (["completed", "cancelled"].includes(summary.status)) {
    buckets.history.push(summary);
  } else {
    buckets.posted.push(summary);
  }

  return buckets;
}

export function publicJobBoard(state: DemoState | null): Milestone[] {
  return (
    state?.brief?.milestones.filter((milestone) => milestone.milestoneType === "scaffold" && milestone.status === "queued") ??
    []
  );
}

export function buyerKpis(state: DemoState | null) {
  const buckets = bucketBuyerJobs(state);
  const scaffold = getScaffoldMilestone(state);
  const released = state?.payout.releasedAmountUsd ?? 0;
  const refunded = state?.payout.refundedAmountUsd ?? 0;
  const closed = released + refunded > 0 ? 1 : 0;

  return {
    activeJobs: buckets.posted.length,
    awaitingReview: buckets.awaitingReview.length,
    closedJobs: buckets.history.length,
    acceptanceRate: closed > 0 && refunded === 0 ? 100 : released > 0 ? Math.round((released / (released + refunded)) * 100) : 0,
    alerts: scaffold?.status === "rework" ? 1 : 0
  };
}

export function workerKpis(state: DemoState | null) {
  const scaffold = getScaffoldMilestone(state);
  const score = scaffold?.score ?? 0;

  return {
    eligibleJobs: publicJobBoard(state).length,
    claimedJobs: scaffold?.status === "claimed" ? 1 : 0,
    completedJobs: state?.payout.settlementStatus === "released" ? 1 : 0,
    rejectedJobs: state?.payout.settlementStatus === "refunded" ? 1 : 0,
    qualityScore: score > 0 ? (score / 100).toFixed(2) : "0.00",
    earningsUsd: state?.payout.releasedAmountUsd ?? 0
  };
}
