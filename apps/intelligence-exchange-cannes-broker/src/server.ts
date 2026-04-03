import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { ideaSubmissionInputSchema, type DemoState } from "@iex-cannes/shared";
import {
  deployAgentRegistry,
  deployAndFundEscrow,
  refundEscrow,
  registerAgentIdentity,
  releaseEscrow,
  reserveMilestoneEscrow
} from "./chain.js";
import {
  approveScaffold,
  buildAgentRegistrationUri,
  claimScaffoldMilestone,
  createIdeaAndBrief,
  refundScaffold,
  resetDemoState,
  submitScaffoldMilestone
} from "./demo.js";

const app = Fastify({ logger: false });
await app.register(cors, { origin: true });
await app.register(sensible);

const dataDir = path.resolve(import.meta.dirname, "..", "data");
const dossierDir = path.resolve(import.meta.dirname, "..", "dossiers");
const statePath = path.join(dataDir, "demo-state.json");
const chainMode =
  process.env.CHAIN_MODE === "fork" ? "fork" : process.env.CHAIN_MODE === "testnet" ? "testnet" : "local";
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
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

async function writeDossier(state: DemoState) {
  if (!state.idea || !state.brief) {
    return;
  }
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

app.get("/health", async () => ({ ok: true }));
app.get("/api/demo-state", async () => ensureState());

app.post("/api/demo/reset", async () => {
  const next = resetDemoState(chainMode);
  await persistState(next);
  return next;
});

app.post("/v1/cannes/workers/register", async () => {
  const state = await ensureState();
  state.activityLog.push(`${state.worker.name} sent worker runtime registration heartbeat.`);
  await persistState(state);
  return {
    workerId: state.worker.id,
    verified: state.worker.verified,
    capabilities: state.brief?.milestones.find((item) => item.milestoneType === "scaffold")?.requiredCapabilities ?? []
  };
});

app.post("/v1/cannes/workers/heartbeat", async () => {
  const state = await ensureState();
  state.activityLog.push(`${state.worker.name} heartbeat accepted by broker.`);
  await persistState(state);
  return { ok: true, workerId: state.worker.id };
});

app.post("/api/ideas/fund", async (request) => {
  const state = await ensureState();
  if (state.idea) {
    throw app.httpErrors.conflict("Idea is already funded in the current demo state.");
  }

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
  const workerRegistration = await registerAgentIdentity(
    registry.address as `0x${string}`,
    "worker",
    buildAgentRegistrationUri(next.worker, appBaseUrl, "worker")
  );
  next.poster.agentId = posterRegistration.agentId;
  next.poster.agentUri = buildAgentRegistrationUri(next.poster, appBaseUrl, "poster");
  next.worker.agentId = workerRegistration.agentId;
  next.worker.agentUri = buildAgentRegistrationUri(next.worker, appBaseUrl, "worker");
  next.activityLog.push(`Poster registered in ERC-8004-inspired registry as agent ${posterRegistration.agentId}.`);
  next.activityLog.push(`Worker registered in ERC-8004-inspired registry as agent ${workerRegistration.agentId}.`);

  const onchain = await deployAndFundEscrow(input.budgetUsd);
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

app.post("/api/milestones/:jobId/claim", async (request) => {
  const state = await ensureState();
  const milestone = claimScaffoldMilestone(state);
  if (!state.payout.contractAddress) {
    throw app.httpErrors.failedDependency("Escrow contract is not initialized.");
  }
  const reserve = await reserveMilestoneEscrow(state.payout.contractAddress as `0x${string}`, milestone.jobId, milestone.budgetUsd);
  state.payout.reservedAmountUsd += milestone.budgetUsd;
  state.payout.settlementStatus = "reserved";
  state.payout.reserveTxHashes.push(reserve.reserveTxHash);
  state.activityLog.push(`Reservation tx confirmed: ${reserve.reserveTxHash}.`);
  await writeDossier(state);
  await persistState(state);
  return state;
});

app.post("/api/milestones/:jobId/submit", async (request) => {
  const state = await ensureState();
  submitScaffoldMilestone(state, request.body ?? {});
  await writeDossier(state);
  await persistState(state);
  return state;
});

app.post("/api/milestones/:jobId/approve", async () => {
  const state = await ensureState();
  const approved = approveScaffold(state);
  if (!state.payout.contractAddress) {
    throw app.httpErrors.failedDependency("Escrow contract is not initialized.");
  }
  const release = await releaseEscrow(state.payout.contractAddress as `0x${string}`, approved.jobId);
  approved.status = "released";
  state.payout.escrowBalanceUsd = release.remainingEscrowUsd;
  state.payout.releasedAmountUsd += approved.budgetUsd;
  state.payout.settlementStatus = "released";
  state.payout.releaseTxHashes.push(release.releaseTxHash);
  state.activityLog.push(`Release tx confirmed: ${release.releaseTxHash}.`);
  await writeDossier(state);
  await persistState(state);
  return state;
});

app.post("/api/milestones/:jobId/refund", async () => {
  const state = await ensureState();
  const refunded = refundScaffold(state);
  if (!state.payout.contractAddress) {
    throw app.httpErrors.failedDependency("Escrow contract is not initialized.");
  }
  const refund = await refundEscrow(state.payout.contractAddress as `0x${string}`, refunded.jobId);
  state.payout.escrowBalanceUsd = refund.remainingEscrowUsd;
  state.payout.refundedAmountUsd += refunded.budgetUsd;
  state.payout.settlementStatus = "refunded";
  state.payout.refundTxHashes.push(refund.refundTxHash);
  state.activityLog.push(`Refund tx confirmed: ${refund.refundTxHash}.`);
  await writeDossier(state);
  await persistState(state);
  return state;
});

const port = Number(process.env.PORT ?? "8787");
await app.listen({ host: "0.0.0.0", port });
