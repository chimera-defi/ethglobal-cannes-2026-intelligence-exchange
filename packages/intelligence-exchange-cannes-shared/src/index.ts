import { z } from "zod";

export const milestoneTypes = ["brief", "tasks", "scaffold", "review"] as const;
export type MilestoneType = (typeof milestoneTypes)[number];

export const actorRoleSchema = z.enum(["poster", "worker", "reviewer"]);
export const verificationModeSchema = z.enum(["world-stub", "world-id", "preverified"]);
export const dossierStatusSchema = z.enum(["pending", "stored"]);
export const fundingStatusSchema = z.enum(["draft", "funded", "released", "refunded"]);
export const milestoneStatusSchema = z.enum([
  "queued",
  "claimed",
  "submitted",
  "accepted",
  "rework",
  "released",
  "refunded",
  "expired"
]);

export const actorSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: actorRoleSchema,
  verified: z.boolean(),
  verificationMode: verificationModeSchema,
  walletAddress: z.string(),
  ensName: z.string().nullable(),
  agentId: z.number().nullable(),
  agentUri: z.string().nullable()
});

export const ideaSubmissionInputSchema = z.object({
  title: z.string().min(5),
  prompt: z.string().min(20),
  targetArtifact: z.string().min(3),
  budgetUsd: z.number().positive()
});

export const ideaSubmissionSchema = ideaSubmissionInputSchema.extend({
  ideaId: z.string(),
  posterId: z.string(),
  fundingStatus: fundingStatusSchema,
  createdAt: z.string()
});

export const acceptanceRubricSchema = z.object({
  requiredChecks: z.array(z.string()).min(1),
  humanReviewFocus: z.array(z.string()).min(1)
});

export const milestoneSchema = z.object({
  jobId: z.string(),
  milestoneType: z.enum(milestoneTypes),
  title: z.string(),
  description: z.string(),
  budgetUsd: z.number().nonnegative(),
  requiredCapabilities: z.array(z.string()).min(1),
  status: milestoneStatusSchema,
  leaseExpiry: z.string().nullable(),
  workerId: z.string().nullable(),
  score: z.number().nullable(),
  artifactUri: z.string().nullable(),
  traceSummary: z.string().nullable(),
  paidDependency: z.string().nullable(),
  reservedOnchain: z.boolean()
});

export const buildBriefSchema = z.object({
  briefId: z.string(),
  ideaId: z.string(),
  summary: z.string(),
  milestones: z.array(milestoneSchema).length(4),
  acceptanceRubric: acceptanceRubricSchema,
  dossierUri: z.string().nullable(),
  dossierStatus: dossierStatusSchema
});

export const artifactSubmissionInputSchema = z.object({
  workerId: z.string(),
  artifactUri: z.string().min(4),
  traceSummary: z.string().min(10),
  paidDependency: z.string().min(4),
  outputSummary: z.string().min(20)
});

export const scoreResultSchema = z.object({
  accepted: z.boolean(),
  score: z.number().min(0).max(100),
  rationale: z.array(z.string()).min(1)
});

export const payoutStateSchema = z.object({
  contractAddress: z.string().nullable(),
  identityRegistryAddress: z.string().nullable(),
  chainId: z.number(),
  escrowBalanceUsd: z.number(),
  fundedAmountUsd: z.number(),
  reservedAmountUsd: z.number(),
  releasedAmountUsd: z.number(),
  refundedAmountUsd: z.number(),
  settlementStatus: z.enum(["uninitialized", "ready", "reserved", "pending_release", "released", "refunded"]),
  releaseTxHashes: z.array(z.string()),
  refundTxHashes: z.array(z.string()),
  reserveTxHashes: z.array(z.string())
});

export const demoStateSchema = z.object({
  poster: actorSchema,
  worker: actorSchema,
  reviewer: actorSchema,
  idea: ideaSubmissionSchema.nullable(),
  brief: buildBriefSchema.nullable(),
  payout: payoutStateSchema,
  activityLog: z.array(z.string()),
  support: z.object({
    chainMode: z.enum(["local", "fork", "testnet"]),
    worldMode: verificationModeSchema,
    dossierMode: z.enum(["local-0g-mirror", "queued"]),
    targetStack: z.object({
      escrow: z.string(),
      identity: z.string(),
      dossier: z.string()
    })
  })
});

export type Actor = z.infer<typeof actorSchema>;
export type BuildBrief = z.infer<typeof buildBriefSchema>;
export type DemoState = z.infer<typeof demoStateSchema>;
export type IdeaSubmission = z.infer<typeof ideaSubmissionSchema>;
export type IdeaSubmissionInput = z.infer<typeof ideaSubmissionInputSchema>;
export type Milestone = z.infer<typeof milestoneSchema>;
export type ScoreResult = z.infer<typeof scoreResultSchema>;

export const demoSeed = {
  poster: {
    id: "poster-cannes",
    name: "Ava Poster",
    role: "poster",
    verified: true,
    verificationMode: "world-stub",
    walletAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    ensName: "poster-cannes.eth",
    agentId: null,
    agentUri: null
  },
  worker: {
    id: "worker-cannes",
    name: "Builder Agent One",
    role: "worker",
    verified: true,
    verificationMode: "world-stub",
    walletAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    ensName: "builder-one.eth",
    agentId: null,
    agentUri: null
  },
  reviewer: {
    id: "reviewer-cannes",
    name: "Human Reviewer",
    role: "reviewer",
    verified: true,
    verificationMode: "preverified",
    walletAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    ensName: "reviewer-cannes.eth",
    agentId: null,
    agentUri: null
  },
  ideaInput: {
    title: "Cannes-ready agentic marketplace demo",
    prompt:
      "Turn this repo into a judgeable Cannes demo where a verified poster funds an idea, a human-backed worker agent claims a milestone, submits a scaffold with one paid dependency event, and gets paid after approval.",
    targetArtifact: "Prototype scaffold + review dossier",
    budgetUsd: 400
  } satisfies IdeaSubmissionInput,
  activityLog: [
    "Repo bootstrapped in deterministic local mode.",
    "World verification is stubbed but enforced at the actor level.",
    "0G dossier writes mirror to local storage for the MVP."
  ]
} as const;

export function makeInitialDemoState(chainMode: "local" | "fork" | "testnet" = "local"): DemoState {
  return demoStateSchema.parse({
    poster: demoSeed.poster,
    worker: demoSeed.worker,
    reviewer: demoSeed.reviewer,
    idea: null,
    brief: null,
    payout: {
      contractAddress: null,
      identityRegistryAddress: null,
      chainId: 31337,
      escrowBalanceUsd: 0,
      fundedAmountUsd: 0,
      reservedAmountUsd: 0,
      releasedAmountUsd: 0,
      refundedAmountUsd: 0,
      settlementStatus: "uninitialized",
      releaseTxHashes: [],
      refundTxHashes: [],
      reserveTxHashes: []
    },
    activityLog: [...demoSeed.activityLog],
    support: {
      chainMode,
      worldMode: "world-stub",
      dossierMode: "local-0g-mirror",
      targetStack: {
        escrow: "Arc Testnet",
        identity: "World ID + ERC-8004-inspired registry",
        dossier: "0G Galileo Testnet"
      }
    }
  });
}
