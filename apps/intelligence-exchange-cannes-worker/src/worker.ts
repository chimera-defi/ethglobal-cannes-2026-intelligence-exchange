import { demoSeed } from "@iex-cannes/shared";

const apiBase = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";

async function post(path: string, body?: unknown) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

await post("/v1/cannes/workers/register");
await post("/v1/cannes/workers/heartbeat");
await post("/api/milestones/idea-cannes-001-scaffold/claim");
await post("/api/milestones/idea-cannes-001-scaffold/submit", {
  workerId: demoSeed.worker.id,
  artifactUri: "https://example.com/cannes-demo-screenshot",
  traceSummary:
    "Worker generated the repo scaffold, wired local World gating, recorded a paid dependency, and wrote a dossier snapshot.",
  paidDependency: "Arc nanopayment for package audit credits",
  outputSummary:
    "World-gated scaffold with milestone reservation, reviewer approval path, and local 0G-style dossier."
});

console.log("Worker runtime claimed and submitted the scaffold milestone.");
