import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const filter = process.argv.includes("--filter")
  ? process.argv[process.argv.indexOf("--filter") + 1]
  : "iex-cannes:release";
const portSeed = Number(process.env.ACCEPTANCE_PORT_SEED ?? String(Date.now() % 1000));
const apiPort = Number(process.env.PORT ?? 8700 + (portSeed % 200));
const chainPort = Number(process.env.CHAIN_PORT ?? 9500 + (portSeed % 200));
const base = `http://127.0.0.1:${apiPort}`;

async function waitFor(url: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function start(name: string, command: string, args: string[], extraEnv: Record<string, string> = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      ...extraEnv
    }
  });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`${name} exited with code ${code}`);
    }
  });
  return child;
}

async function post(path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(JSON.stringify(parsed));
  }
  return parsed;
}

void (async () => {
  const chain = start("chain", "bun", ["run", "dev:chain"], {
    CHAIN_PORT: String(chainPort)
  });
  const api = start("api", "bun", ["run", "--filter", "intelligence-exchange-cannes-broker", "dev"], {
    PORT: String(apiPort),
    RPC_URL: `http://127.0.0.1:${chainPort}`,
    CHAIN_PORT: String(chainPort)
  });

  try {
    await waitFor(`${base}/health`);
    await post("/api/demo/reset");

    if (filter === "iex-cannes:verify-poster") {
      const state = await fetch(`${base}/api/demo-state`).then((res) => res.json());
      assert.equal(state.poster.verified, true);
      console.log("verify-poster passed");
      return;
    }

    const funded = await post("/api/ideas/fund", {
      title: "Cannes-ready agentic marketplace demo",
      prompt:
        "Turn this repo into a judgeable Cannes demo where a verified poster funds an idea, a human-backed worker agent claims a milestone, submits a scaffold with one paid dependency event, and gets paid after approval.",
      targetArtifact: "Prototype scaffold + review dossier",
      budgetUsd: 400,
      escrowUsd: 500
    });

    if (filter === "iex-cannes:fund-idea") {
      assert.ok(funded.payout.contractAddress);
      assert.equal(funded.payout.fundedAmountUsd, 500);
      console.log("fund-idea passed");
      return;
    }

    await post("/v1/cannes/workers/register");
    const jobBoard = await fetch(`${base}/v1/cannes/jobs`).then((res) => res.json());

    if (filter === "iex-cannes:list-jobs") {
      assert.equal(Array.isArray(jobBoard.jobs), true);
      assert.equal(jobBoard.jobs.some((item: any) => item.jobId === "idea-cannes-001-scaffold"), true);
      console.log("list-jobs passed");
      return;
    }

    await post("/v1/cannes/jobs/idea-cannes-001-scaffold/claim");

    if (filter === "iex-cannes:claim") {
      const state = await fetch(`${base}/api/demo-state`).then((res) => res.json());
      const scaffold = state.brief.milestones.find((item: any) => item.milestoneType === "scaffold");
      assert.equal(scaffold.status, "claimed");
      assert.equal(scaffold.reservedOnchain, true);
      console.log("claim passed");
      return;
    }

    if (filter === "iex-cannes:refund") {
      const refunded = await post("/v1/cannes/jobs/idea-cannes-001-scaffold/refund");
      assert.equal(refunded.payout.settlementStatus, "refunded");
      assert.equal(refunded.payout.refundedAmountUsd, 400);
      console.log("refund passed");
      return;
    }

    await post("/v1/cannes/jobs/idea-cannes-001-scaffold/submit", {
      workerId: "worker-cannes",
      artifactUri: "https://example.com/cannes-demo-screenshot",
      traceSummary:
        "Worker generated the repo scaffold, wired local World gating, recorded a paid dependency, and wrote a dossier snapshot.",
      paidDependency: "Arc nanopayment for package audit credits",
      outputSummary:
        "World-gated scaffold with milestone reservation, reviewer approval path, and local 0G-style dossier."
    });

    if (filter === "iex-cannes:submit") {
      const state = await fetch(`${base}/api/demo-state`).then((res) => res.json());
      const scaffold = state.brief.milestones.find((item: any) => item.milestoneType === "scaffold");
      assert.equal(scaffold.status, "submitted");
      console.log("submit passed");
      return;
    }

    const released = await post("/v1/cannes/jobs/idea-cannes-001-scaffold/approve");
    assert.equal(released.payout.settlementStatus, "released");
    assert.equal(released.payout.releasedAmountUsd, 400);
    console.log("release passed");
  } finally {
    chain.kill("SIGTERM");
    api.kill("SIGTERM");
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
