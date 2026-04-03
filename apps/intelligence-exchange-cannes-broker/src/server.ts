import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { ideaSubmissionInputSchema, type DemoState } from "@iex-cannes/shared";
import {
  closeEscrow,
  deployAgentRegistry,
  deployAndFundEscrow,
  refundEscrow,
  registerAgentIdentity,
  releaseEscrow,
  reserveMilestoneEscrow,
  seededAccounts
} from "./chain.js";
import {
  approveMilestone,
  buildAgentRegistrationUri,
  claimMilestone,
  createIdeaAndBrief,
  listJobBoard,
  refundMilestone,
  registerWorkerProfile,
  resetDemoState,
  submitMilestone
} from "./demo.js";
import { getIntegrationStatus, verifyWorldActor } from "./integrations.js";
import { brokerRuntimePaths } from "./runtime-paths.js";

const app = Fastify({ logger: false });
await app.register(cors, { origin: true });
await app.register(sensible);

const { dataDir, dossierDir, statePath } = brokerRuntimePaths;
const chainMode =
  process.env.CHAIN_MODE === "fork"
    ? "fork"
    : process.env.CHAIN_MODE === "testnet"
      ? "testnet"
      : process.env.CHAIN_MODE === "mainnet"
        ? "mainnet"
        : "local";
const appBaseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:4173";

async function ensureState(): Promise<DemoState> {
  await mkdir(dataDir, { recursive: true });
  await mkdir(dossierDir, { recursive: true });
  try {
    const raw = await readFile(statePath, "utf8");
    return JSON.parse(raw);
  } catch {
    const next = resetDemoState(chainMode);
    await writeFile(statePath, JSON.stringify(next, null, 2));
    return next;
  }
}

async function persistState(state: DemoState) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

async function writeDossier(state: DemoState) {
  if (!state.idea || !state.brief) {
    return;
  }
  await mkdir(dossierDir, { recursive: true });
  const dossier = {
    idea: state.idea,
    brief: state.brief,
    poster: state.poster,
    worker: state.worker,
    reviewer: state.reviewer,
    payout: state.payout,
    activityLog: state.activityLog,
    support: state.support
  };
  const filePath = path.join(dossierDir, `${state.idea.ideaId}.json`);
  await writeFile(filePath, JSON.stringify(dossier, null, 2));
  state.brief.dossierUri = `file://${filePath}`;
  state.brief.dossierStatus = "stored";
}

function summarizeWorkspace(state: DemoState) {
  const scaffold = state.brief?.milestones.find((milestone) => milestone.milestoneType === "scaffold") ?? null;
  const status =
    state.payout.settlementStatus === "released"
      ? "completed"
      : state.payout.settlementStatus === "refunded"
        ? "cancelled"
        : scaffold?.status === "submitted"
          ? "awaiting_review"
          : scaffold?.status === "claimed" || scaffold?.status === "rework"
            ? "in_progress"
            : state.idea
              ? "open"
              : "draft";

  const currentJob = state.idea && scaffold
    ? {
        ideaId: state.idea.ideaId,
        jobId: scaffold.jobId,
        title: state.idea.title,
        targetArtifact: state.idea.targetArtifact,
        payoutUsd: state.idea.budgetUsd,
        escrowUsd: state.idea.escrowUsd,
        status,
        workerId: scaffold.workerId,
        dossierStatus: state.brief?.dossierStatus ?? "pending",
        settlementStatus: state.payout.settlementStatus
      }
    : null;

  return {
    summary: {
      activeJobs: currentJob && ["open", "in_progress"].includes(currentJob.status) ? 1 : 0,
      awaitingReview: currentJob?.status === "awaiting_review" ? 1 : 0,
      closedJobs:
        state.archivedJobs.length +
        (currentJob && ["completed", "cancelled"].includes(currentJob.status)
          ? state.archivedJobs.some((job) => job.idea.ideaId === currentJob.ideaId)
            ? 0
            : 1
          : 0),
      acceptanceRate: state.payout.releasedAmountUsd > 0 ? 100 : 0
    },
    buckets: {
      posted: currentJob && ["open", "in_progress"].includes(currentJob.status) ? [currentJob] : [],
      awaitingReview: currentJob?.status === "awaiting_review" ? [currentJob] : [],
      history: [
        ...state.archivedJobs.map((job) => ({
          ideaId: job.idea.ideaId,
          jobId: job.brief.milestones.find((milestone) => milestone.milestoneType === "scaffold")?.jobId ?? job.idea.ideaId,
          title: job.idea.title,
          targetArtifact: job.idea.targetArtifact,
          payoutUsd: job.idea.budgetUsd,
          escrowUsd: job.idea.escrowUsd,
          status: job.finalStatus,
          workerId: job.brief.milestones.find((milestone) => milestone.milestoneType === "scaffold")?.workerId ?? null,
          dossierStatus: job.brief.dossierStatus,
          settlementStatus: job.payout.settlementStatus
        })),
        ...(currentJob && ["completed", "cancelled"].includes(currentJob.status)
          ? state.archivedJobs.some((job) => job.idea.ideaId === currentJob.ideaId)
            ? []
            : [currentJob]
          : [])
      ]
    },
    currentJob
  };
}

function archiveCurrentJobIfClosed(state: DemoState) {
  if (!state.idea || !state.brief) {
    return;
  }
  if (!["released", "refunded"].includes(state.payout.settlementStatus)) {
    return;
  }
  if (state.archivedJobs.some((job) => job.idea.ideaId === state.idea?.ideaId)) {
    return;
  }

  state.archivedJobs.push({
    idea: structuredClone(state.idea),
    brief: structuredClone(state.brief),
    payout: structuredClone(state.payout),
    activityLog: [...state.activityLog],
    closedAt: new Date().toISOString(),
    finalStatus: state.payout.settlementStatus === "released" ? "completed" : "cancelled"
  });
}

function clearClosedCurrentJob(state: DemoState) {
  if (!["released", "refunded"].includes(state.payout.settlementStatus)) {
    return;
  }
  state.idea = null;
  state.brief = null;
  state.payout = {
    contractAddress: null,
    identityRegistryAddress: null,
    chainId: state.payout.chainId,
    escrowBalanceUsd: 0,
    fundedAmountUsd: 0,
    reservedAmountUsd: 0,
    releasedAmountUsd: 0,
    refundedAmountUsd: 0,
    settlementStatus: "uninitialized",
    releaseTxHashes: [],
    refundTxHashes: [],
    reserveTxHashes: []
  };
}

app.get("/health", async () => ({ ok: true }));
app.get("/api/demo-state", async () => ensureState());
app.get("/v1/cannes/integrations/status", async () => getIntegrationStatus());
app.get("/v1/cannes/jobs", async () => {
  const state = await ensureState();
  return {
    workerId: state.worker.id,
    jobs: listJobBoard(state)
  };
});

app.get("/v1/cannes/jobs/:jobId", async (request) => {
  const state = await ensureState();
  const jobId = String((request.params as Record<string, unknown>).jobId);
  const milestone = state.brief?.milestones.find((item) => item.jobId === jobId) ?? null;
  if (!milestone) {
    throw app.httpErrors.notFound("Job not found.");
  }
  return {
    idea: state.idea,
    milestone,
    brief: state.brief,
    payout: state.payout,
    poster: state.poster,
    worker: state.worker,
    reviewer: state.reviewer
  };
});

app.get("/v1/cannes/buyer/workspace", async () => {
  const state = await ensureState();
  return {
    ...summarizeWorkspace(state),
    payout: state.payout,
    dossierUri: state.brief?.dossierUri ?? null
  };
});

app.get("/v1/cannes/worker/workspace", async () => {
  const state = await ensureState();
  const scaffold = state.brief?.milestones.find((milestone) => milestone.milestoneType === "scaffold") ?? null;
  return {
    worker: state.worker,
    summary: {
      eligibleJobs: listJobBoard(state).filter((job) => job.eligibleForWorker && job.status === "queued").length,
      claimedJobs: scaffold?.status === "claimed" ? 1 : 0,
      completedJobs: state.payout.settlementStatus === "released" ? 1 : 0,
      refundedJobs: state.payout.settlementStatus === "refunded" ? 1 : 0,
      earningsUsd: state.payout.releasedAmountUsd,
      qualityScore: scaffold?.score ?? 0
    },
    jobs: listJobBoard(state)
  };
});

app.post("/v1/cannes/verify/:role", async (request) => {
  const state = await ensureState();
  const role = String((request.params as Record<string, unknown>).role);
  const actor =
    role === "poster" ? state.poster : role === "worker" ? state.worker : role === "reviewer" ? state.reviewer : null;
  if (!actor) {
    throw app.httpErrors.badRequest("Unknown verification role.");
  }
  const result = await verifyWorldActor(actor.role, actor, request.body ?? {});
  if (result.success) {
    actor.verified = true;
    if (actor.role !== "reviewer") {
      actor.verificationMode = result.mode === "configured" ? "world-id" : "world-stub";
    }
  }
  state.activityLog.push(`${actor.name} verification result: ${result.detail}`);
  await persistState(state);
  return {
    role: actor.role,
    verified: actor.verified,
    verificationMode: actor.verificationMode,
    ...result
  };
});

app.post("/api/demo/reset", async () => {
  const next = resetDemoState(chainMode);
  await persistState(next);
  return next;
});

app.post("/v1/cannes/workers/register", async (request) => {
  const state = await ensureState();
  registerWorkerProfile(state, request.body ?? undefined);
  if (state.payout.identityRegistryAddress && !state.worker.agentId) {
    if (state.worker.walletAddress.toLowerCase() === seededAccounts.worker.address.toLowerCase()) {
      const workerRegistration = await registerAgentIdentity(
        state.payout.identityRegistryAddress as `0x${string}`,
        "worker",
        buildAgentRegistrationUri(state.worker, appBaseUrl, "worker")
      );
      state.worker.agentId = workerRegistration.agentId;
      state.activityLog.push(
        `Worker registered in ERC-8004-inspired registry as agent ${workerRegistration.agentId}.`
      );
    } else {
      state.activityLog.push(
        `Worker ${state.worker.name} is active offchain; onchain registry registration requires a matching worker private key.`
      );
    }
  }
  await persistState(state);
  return {
    workerId: state.worker.id,
    verified: state.worker.verified,
    capabilities: state.worker.capabilities
  };
});

app.post("/v1/cannes/workers/heartbeat", async (request) => {
  const state = await ensureState();
  const requestedWorkerId =
    typeof request.body === "object" && request.body && "workerId" in request.body
      ? String((request.body as Record<string, unknown>).workerId)
      : state.worker.id;
  if (requestedWorkerId !== state.worker.id) {
    throw app.httpErrors.conflict("Worker heartbeat does not match the active registered worker.");
  }
  state.activityLog.push(`${state.worker.name} heartbeat accepted by broker.`);
  await persistState(state);
  return { ok: true, workerId: state.worker.id };
});

app.post("/api/ideas/fund", async (request) => {
  const state = await ensureState();
  if (state.idea && !["released", "refunded"].includes(state.payout.settlementStatus)) {
    throw app.httpErrors.conflict("Idea is already funded in the current demo state.");
  }
  archiveCurrentJobIfClosed(state);
  clearClosedCurrentJob(state);

  const input = ideaSubmissionInputSchema.parse(request.body ?? {});
  const next = createIdeaAndBrief(input, state);
  const registry = await deployAgentRegistry();
  next.payout.identityRegistryAddress = registry.address;
  next.activityLog.push(`Agent registry deployed at ${registry.address}.`);

  const posterRegistration = await registerAgentIdentity(
    registry.address as `0x${string}`,
    "poster",
    buildAgentRegistrationUri(next.poster, appBaseUrl, "poster")
  );
  next.poster.agentId = posterRegistration.agentId;
  next.poster.agentUri = buildAgentRegistrationUri(next.poster, appBaseUrl, "poster");
  next.activityLog.push(`Poster registered in ERC-8004-inspired registry as agent ${posterRegistration.agentId}.`);
  next.activityLog.push("Worker agent registry entry will be created when the active worker profile is registered.");

  const onchain = await deployAndFundEscrow(input.escrowUsd, input.escrowUsd);
  next.payout = {
    ...next.payout,
    contractAddress: onchain.contractAddress,
    chainId: onchain.chainId,
    escrowBalanceUsd: onchain.escrowBalanceUsd,
    fundedAmountUsd: onchain.fundedAmountUsd,
    reservedAmountUsd: 0,
    releasedAmountUsd: 0,
    refundedAmountUsd: 0,
    settlementStatus: "ready"
  };
  next.support.chainMode = onchain.chainMode;
  next.activityLog.push(`Escrow deployed at ${onchain.contractAddress}.`);
  next.activityLog.push(`Funding tx confirmed: ${onchain.fundTxHash}.`);
  await writeDossier(next);
  await persistState(next);
  return next;
});

async function claimJob(request: FastifyRequest<{ Params: { jobId: string } }>) {
  const state = await ensureState();
  const { jobId } = request.params;
  const milestone = claimMilestone(state, jobId);
  if (!state.payout.contractAddress) {
    throw app.httpErrors.failedDependency("Escrow contract is not initialized.");
  }
  const reserve = await reserveMilestoneEscrow(
    state.payout.contractAddress as `0x${string}`,
    milestone.jobId,
    milestone.budgetUsd,
    state.worker.walletAddress as `0x${string}`
  );
  state.payout.reservedAmountUsd += milestone.budgetUsd;
  state.payout.settlementStatus = "reserved";
  state.payout.reserveTxHashes.push(reserve.reserveTxHash);
  state.activityLog.push(`Reservation tx confirmed: ${reserve.reserveTxHash}.`);
  await writeDossier(state);
  await persistState(state);
  return state;
}

app.post("/v1/cannes/jobs/:jobId/claim", claimJob);
app.post("/api/milestones/:jobId/claim", claimJob);

async function submitJob(request: FastifyRequest<{ Params: { jobId: string } }>) {
  const state = await ensureState();
  submitMilestone(state, request.params.jobId, request.body ?? {});
  await writeDossier(state);
  await persistState(state);
  return state;
}

app.post("/v1/cannes/jobs/:jobId/submit", submitJob);
app.post("/api/milestones/:jobId/submit", submitJob);

async function approveJob(request: FastifyRequest<{ Params: { jobId: string } }>) {
  const state = await ensureState();
  const approved = approveMilestone(state, request.params.jobId);
  if (!state.payout.contractAddress) {
    throw app.httpErrors.failedDependency("Escrow contract is not initialized.");
  }
  const release = await releaseEscrow(state.payout.contractAddress as `0x${string}`, approved.jobId);
  let remainingEscrowUsd = release.remainingEscrowUsd;
  if (remainingEscrowUsd > 0) {
    const close = await closeEscrow(state.payout.contractAddress as `0x${string}`);
    remainingEscrowUsd = close.remainingEscrowUsd;
    state.activityLog.push(`Escrow closeout tx confirmed: ${close.closeTxHash}.`);
  }
  approved.status = "released";
  state.payout.escrowBalanceUsd = remainingEscrowUsd;
  state.payout.releasedAmountUsd += approved.budgetUsd;
  state.payout.settlementStatus = "released";
  state.payout.releaseTxHashes.push(release.releaseTxHash);
  state.activityLog.push(`Release tx confirmed: ${release.releaseTxHash}.`);
  archiveCurrentJobIfClosed(state);
  await writeDossier(state);
  await persistState(state);
  return state;
}

app.post("/v1/cannes/jobs/:jobId/approve", approveJob);
app.post("/api/milestones/:jobId/approve", approveJob);

async function refundJob(request: FastifyRequest<{ Params: { jobId: string } }>) {
  const state = await ensureState();
  const refunded = refundMilestone(state, request.params.jobId);
  if (!state.payout.contractAddress) {
    throw app.httpErrors.failedDependency("Escrow contract is not initialized.");
  }
  const refund = await refundEscrow(state.payout.contractAddress as `0x${string}`, refunded.jobId);
  let remainingEscrowUsd = refund.remainingEscrowUsd;
  if (remainingEscrowUsd > 0) {
    const close = await closeEscrow(state.payout.contractAddress as `0x${string}`);
    remainingEscrowUsd = close.remainingEscrowUsd;
    state.activityLog.push(`Escrow closeout tx confirmed: ${close.closeTxHash}.`);
  }
  state.payout.escrowBalanceUsd = remainingEscrowUsd;
  state.payout.refundedAmountUsd += refunded.budgetUsd;
  state.payout.settlementStatus = "refunded";
  state.payout.refundTxHashes.push(refund.refundTxHash);
  state.activityLog.push(`Refund tx confirmed: ${refund.refundTxHash}.`);
  archiveCurrentJobIfClosed(state);
  await writeDossier(state);
  await persistState(state);
  return state;
}

app.post("/v1/cannes/jobs/:jobId/refund", refundJob);
app.post("/api/milestones/:jobId/refund", refundJob);

const port = Number(process.env.PORT ?? "8787");
await app.listen({ host: "0.0.0.0", port });
