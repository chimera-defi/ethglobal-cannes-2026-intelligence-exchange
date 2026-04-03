import {
  artifactSubmissionInputSchema,
  demoSeed,
  makeInitialDemoState,
  milestoneSchema,
  scoreResultSchema,
  type DemoState,
  type IdeaSubmissionInput,
  type Milestone
} from "@iex-cannes/shared";
import { seededAccounts } from "./chain.js";

function createMilestone(
  jobId: string,
  milestoneType: Milestone["milestoneType"],
  title: string,
  description: string,
  budgetUsd: number,
  requiredCapabilities: string[],
  status: Milestone["status"]
): Milestone {
  return milestoneSchema.parse({
    jobId,
    milestoneType,
    title,
    description,
    budgetUsd,
    requiredCapabilities,
    status,
    leaseExpiry: null,
    workerId: null,
    score: null,
    artifactUri: null,
    traceSummary: null,
    paidDependency: null,
    reservedOnchain: false
  });
}

function buildMilestones(ideaId: string): Milestone[] {
  return [
    {
      ...createMilestone(
        `${ideaId}-brief`,
        "brief",
        "Planner synthesizes the build brief",
        "System converts the funded idea into a shallow but actionable brief and keeps exploitably detailed planning gated behind funding.",
        80,
        ["planning", "product"],
        "accepted"
      ),
      artifactUri: "dossier://brief",
      traceSummary: "Planner produced a concise brief and acceptance rubric.",
      score: 100
    },
    {
      ...createMilestone(
        `${ideaId}-tasks`,
        "tasks",
        "Task decomposition and acceptance pack",
        "System generates fixed milestone types and deterministic checks for the worker path.",
        80,
        ["planning", "decomposition"],
        "accepted"
      ),
      artifactUri: "dossier://tasks",
      traceSummary: "Task decomposition completed deterministically from the funded idea.",
      score: 96
    },
    createMilestone(
      `${ideaId}-scaffold`,
      "scaffold",
      "Worker builds the scaffold milestone",
      "Worker claims the milestone, emits a paid dependency event, and submits artifact plus trace for review.",
      160,
      ["typescript", "frontend", "backend", "contracts"],
      "queued"
    ),
    createMilestone(
      `${ideaId}-review`,
      "review",
      "Reviewer signs off on payout evidence",
      "Human review confirms the artifact quality, the dossier usefulness, and the payout evidence before settlement.",
      80,
      ["review", "qa"],
      "queued"
    )
  ];
}

export function createIdeaAndBrief(input: IdeaSubmissionInput, state: DemoState): DemoState {
  const createdAt = new Date().toISOString();
  const ideaId = "idea-cannes-001";
  const briefId = "brief-cannes-001";
  const milestones = buildMilestones(ideaId);

  state.idea = {
    ideaId,
    posterId: state.poster.id,
    title: input.title,
    prompt: input.prompt,
    targetArtifact: input.targetArtifact,
    budgetUsd: input.budgetUsd,
    fundingStatus: "funded",
    createdAt
  };
  state.brief = {
    briefId,
    ideaId,
    summary:
      "Controlled-supply idea-to-build pilot with a funded poster, a human-backed worker, deterministic milestone scoring, onchain reservation and release, and a dossier used during review.",
    milestones,
    acceptanceRubric: {
      requiredChecks: [
        "Poster and worker are verified before value-bearing actions.",
        "Scaffold claim creates a visible onchain reservation.",
        "Submission includes artifact URI, trace summary, and one bounded paid dependency event.",
        "Human approval is required before release."
      ],
      humanReviewFocus: [
        "Does the deliverable materially advance the idea instead of faking marketplace depth?",
        "Was the paid dependency event actually relevant to the result?",
        "Does the dossier contain enough evidence to replay the decision?"
      ]
    },
    dossierUri: null,
    dossierStatus: "pending"
  };
  state.activityLog.push(`Idea ${ideaId} funded by ${state.poster.name}.`);
  state.activityLog.push(`Planner generated ${briefId} with fixed milestone types.`);
  return state;
}

export function claimScaffoldMilestone(state: DemoState) {
  if (!state.worker.verified) {
    throw new Error("Worker is not verified.");
  }
  const milestone = state.brief?.milestones.find((item) => item.milestoneType === "scaffold");
  if (!milestone) {
    throw new Error("Scaffold milestone is unavailable.");
  }
  if (milestone.status !== "queued") {
    throw new Error("Scaffold milestone is not claimable.");
  }
  milestone.status = "claimed";
  milestone.workerId = state.worker.id;
  milestone.reservedOnchain = true;
  milestone.leaseExpiry = new Date(Date.now() + 20 * 60 * 1000).toISOString();
  state.activityLog.push(`${state.worker.name} claimed scaffold milestone ${milestone.jobId}.`);
  return milestone;
}

export function scoreSubmission(outputSummary: string) {
  const normalized = outputSummary.toLowerCase();
  const rationale = [
    "Submission includes the required artifact URI, trace summary, and paid dependency record."
  ];

  let score = 82;
  if (normalized.includes("world")) {
    score += 4;
    rationale.push("Submission addresses human verification behavior.");
  }
  if (normalized.includes("escrow") || normalized.includes("arc")) {
    score += 6;
    rationale.push("Submission addresses milestone reservation and payout behavior.");
  }
  if (normalized.includes("dossier") || normalized.includes("0g")) {
    score += 4;
    rationale.push("Submission addresses dossier persistence.");
  }

  return scoreResultSchema.parse({
    accepted: score >= 85,
    score,
    rationale
  });
}

export function submitScaffoldMilestone(
  state: DemoState,
  payload: Parameters<typeof artifactSubmissionInputSchema.parse>[0]
) {
  const parsed = artifactSubmissionInputSchema.parse(payload);
  const milestone = state.brief?.milestones.find((item) => item.milestoneType === "scaffold");
  if (!milestone || milestone.status !== "claimed") {
    throw new Error("No claimed scaffold milestone exists.");
  }
  if (milestone.workerId !== parsed.workerId) {
    throw new Error("Only the lease holder can submit this milestone.");
  }
  if (milestone.leaseExpiry && Date.parse(milestone.leaseExpiry) < Date.now()) {
    milestone.status = "expired";
    throw new Error("Milestone lease has expired.");
  }

  const result = scoreSubmission(parsed.outputSummary);
  milestone.status = result.accepted ? "submitted" : "rework";
  milestone.artifactUri = parsed.artifactUri;
  milestone.traceSummary = parsed.traceSummary;
  milestone.paidDependency = parsed.paidDependency;
  milestone.score = result.score;
  state.activityLog.push(`Worker submitted scaffold output with score ${result.score}.`);

  if (result.accepted) {
    state.activityLog.push("Scoring accepted the scaffold submission pending human approval.");
  } else {
    state.activityLog.push("Scoring routed the scaffold submission to rework.");
  }

  return { milestone, result };
}

export function approveScaffold(state: DemoState) {
  const milestone = state.brief?.milestones.find((item) => item.milestoneType === "scaffold");
  const reviewMilestone = state.brief?.milestones.find((item) => item.milestoneType === "review");
  if (!milestone || milestone.status !== "submitted") {
    throw new Error("Scaffold milestone is not pending approval.");
  }
  milestone.status = "accepted";
  if (reviewMilestone && reviewMilestone.status === "queued") {
    reviewMilestone.status = "accepted";
    reviewMilestone.score = 93;
    reviewMilestone.traceSummary = "Human reviewer approved the scaffold, dossier, and release evidence.";
    reviewMilestone.artifactUri = "dossier://review";
  }
  state.activityLog.push(`${state.reviewer.name} approved scaffold milestone ${milestone.jobId}.`);
  return milestone;
}

export function refundScaffold(state: DemoState) {
  const milestone = state.brief?.milestones.find((item) => item.milestoneType === "scaffold");
  if (!milestone || !["claimed", "rework", "expired"].includes(milestone.status)) {
    throw new Error("Scaffold milestone cannot be refunded from its current state.");
  }
  milestone.status = "refunded";
  state.activityLog.push(`${state.poster.name} refunded scaffold milestone ${milestone.jobId}.`);
  return milestone;
}

export function resetDemoState(chainMode: "local" | "fork" | "testnet" = "local") {
  const state = makeInitialDemoState(chainMode);
  state.poster.walletAddress = seededAccounts.poster.address;
  state.worker.walletAddress = seededAccounts.worker.address;
  state.activityLog.push(`Poster chain account: ${seededAccounts.poster.address}.`);
  state.activityLog.push(`Worker chain account: ${seededAccounts.worker.address}.`);
  return state;
}

export function buildAgentRegistrationUri(
  actor: Pick<DemoState["poster"], "name" | "walletAddress" | "ensName">,
  appUrl: string,
  role: "poster" | "worker"
) {
  const registration = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: actor.name,
    description:
      role === "worker"
        ? "Human-backed worker agent for the Cannes Intelligence Exchange pilot."
        : "Verified poster profile for the Cannes Intelligence Exchange pilot.",
    image: `${appUrl}/agent-${role}.png`,
    services: [
      {
        name: "web",
        endpoint: appUrl
      },
      {
        name: "ENS",
        endpoint: actor.ensName
      }
    ],
    x402Support: false,
    active: true,
    registrations: [],
    supportedTrust: ["reputation", "human-verification"]
  };
  return `data:application/json;base64,${Buffer.from(JSON.stringify(registration)).toString("base64")}`;
}
