import { demoSeed, type DemoState, type JobBoardItem, type WorkerRegistrationInput } from "@iex-cannes/shared";

const apiBase = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";
const scaffoldJobId = "idea-cannes-001-scaffold";

function parseCapabilities(value: string | undefined) {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [...demoSeed.worker.capabilities];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T>;
}

export function getWorkerDefaults() {
  return {
    workerId: process.env.WORKER_ID ?? demoSeed.worker.id,
    jobId: process.env.WORKER_JOB_ID ?? scaffoldJobId
  };
}

export function getWorkerProfileFromEnv(): WorkerRegistrationInput {
  return {
    id: process.env.WORKER_ID ?? demoSeed.worker.id,
    name: process.env.WORKER_NAME ?? demoSeed.worker.name,
    walletAddress: process.env.WORKER_WALLET_ADDRESS ?? demoSeed.worker.walletAddress,
    ensName: process.env.WORKER_ENS_NAME ?? demoSeed.worker.ensName,
    agentUri: process.env.WORKER_AGENT_URI ?? demoSeed.worker.agentUri,
    capabilities: parseCapabilities(process.env.WORKER_CAPABILITIES)
  };
}

export async function fetchDemoState() {
  return request<DemoState>("/api/demo-state");
}

export async function listJobs() {
  return request<{ workerId: string; jobs: JobBoardItem[] }>("/v1/cannes/jobs");
}

export async function registerWorker(input?: Partial<WorkerRegistrationInput>) {
  const envProfile = getWorkerProfileFromEnv();
  return request<{ workerId: string; verified: boolean; capabilities: string[] }>(
    "/v1/cannes/workers/register",
    {
      method: "POST",
      body: JSON.stringify({
        id: input?.id ?? envProfile.id,
        name: input?.name ?? envProfile.name,
        walletAddress: input?.walletAddress ?? envProfile.walletAddress,
        ensName: input?.ensName ?? envProfile.ensName,
        agentUri: input?.agentUri ?? envProfile.agentUri,
        capabilities: input?.capabilities ?? envProfile.capabilities
      })
    }
  );
}

export async function sendWorkerHeartbeat(workerId = getWorkerDefaults().workerId) {
  return request<{ ok: true; workerId: string }>("/v1/cannes/workers/heartbeat", {
    method: "POST",
    body: JSON.stringify({ workerId })
  });
}

export async function claimJob(jobId = scaffoldJobId) {
  return request<DemoState>(`/v1/cannes/jobs/${jobId}/claim`, { method: "POST" });
}

export async function autoClaimNextJob() {
  const board = await listJobs();
  const nextJob = board.jobs.find((job) => job.eligibleForWorker && job.status === "queued" && job.budgetUsd > 0);
  if (!nextJob) {
    throw new Error("No eligible queued payout-bearing job is available.");
  }
  return claimJob(nextJob.jobId);
}

export async function submitJob(input?: {
  jobId?: string;
  workerId?: string;
  artifactUri?: string;
  traceSummary?: string;
  paidDependency?: string;
  outputSummary?: string;
}) {
  const defaults = getWorkerDefaults();
  return request<DemoState>(`/v1/cannes/jobs/${input?.jobId ?? defaults.jobId}/submit`, {
    method: "POST",
    body: JSON.stringify({
      workerId: input?.workerId ?? defaults.workerId,
      artifactUri: input?.artifactUri ?? "https://example.com/cannes-demo-screenshot",
      traceSummary:
        input?.traceSummary ??
        "Worker generated the repo scaffold, wired local World gating, recorded a paid dependency, and wrote a dossier snapshot.",
      paidDependency: input?.paidDependency ?? "Arc nanopayment for package audit credits",
      outputSummary:
        input?.outputSummary ??
        "World-gated scaffold with milestone reservation, reviewer approval path, and local 0G-style dossier."
    })
  });
}

export async function claimAndSubmitScaffold() {
  await registerWorker();
  await sendWorkerHeartbeat();
  await autoClaimNextJob();
  return submitJob();
}
