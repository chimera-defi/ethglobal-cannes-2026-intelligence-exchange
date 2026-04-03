import { demoSeed, type DemoState } from "@iex-cannes/shared";

const apiBase = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";
const scaffoldJobId = "idea-cannes-001-scaffold";

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
    workerId: demoSeed.worker.id,
    jobId: scaffoldJobId
  };
}

export async function fetchDemoState() {
  return request<DemoState>("/api/demo-state");
}

export async function registerWorker() {
  return request<{ workerId: string; verified: boolean; capabilities: string[] }>(
    "/v1/cannes/workers/register",
    { method: "POST" }
  );
}

export async function sendWorkerHeartbeat() {
  return request<{ ok: true; workerId: string }>("/v1/cannes/workers/heartbeat", {
    method: "POST"
  });
}

export async function claimScaffold(jobId = scaffoldJobId) {
  return request<DemoState>(`/api/milestones/${jobId}/claim`, { method: "POST" });
}

export async function submitScaffold(input?: {
  jobId?: string;
  workerId?: string;
  artifactUri?: string;
  traceSummary?: string;
  paidDependency?: string;
  outputSummary?: string;
}) {
  const defaults = getWorkerDefaults();
  return request<DemoState>(`/api/milestones/${input?.jobId ?? defaults.jobId}/submit`, {
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
  await claimScaffold();
  return submitScaffold();
}
