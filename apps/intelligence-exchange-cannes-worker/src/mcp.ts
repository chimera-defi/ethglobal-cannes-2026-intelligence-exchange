import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  claimScaffold,
  fetchDemoState,
  getWorkerDefaults,
  registerWorker,
  sendWorkerHeartbeat,
  submitScaffold
} from "./client.js";

const server = new McpServer({
  name: "intelligence-exchange-cannes-worker",
  version: "0.1.0"
});

server.tool("get_demo_state", "Fetch the current Cannes demo state from the broker.", async () => {
  const state = await fetchDemoState();
  const scaffold = state.brief?.milestones.find((milestone) => milestone.milestoneType === "scaffold") ?? null;
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            ideaId: state.idea?.ideaId ?? null,
            scaffoldStatus: scaffold?.status ?? null,
            scaffoldBudgetUsd: scaffold?.budgetUsd ?? null,
            releasedAmountUsd: state.payout.releasedAmountUsd,
            settlementStatus: state.payout.settlementStatus
          },
          null,
          2
        )
      }
    ]
  };
});

server.tool("register_worker", "Register the current worker runtime with the broker.", async () => {
  const result = await registerWorker();
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
  };
});

server.tool("worker_heartbeat", "Send a worker heartbeat to stay visible to the broker.", async () => {
  const result = await sendWorkerHeartbeat();
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
  };
});

server.tool(
  "claim_scaffold",
  "Claim the payout-bearing scaffold milestone for the current worker.",
  {
    jobId: z.string().default(getWorkerDefaults().jobId)
  },
  async ({ jobId }) => {
    const state = await claimScaffold(jobId);
    const scaffold = state.brief?.milestones.find((milestone) => milestone.jobId === jobId) ?? null;
    return {
      content: [{ type: "text", text: JSON.stringify(scaffold, null, 2) }]
    };
  }
);

server.tool(
  "submit_scaffold",
  "Submit scaffold output, trace, and a paid dependency event for review.",
  {
    jobId: z.string().default(getWorkerDefaults().jobId),
    workerId: z.string().default(getWorkerDefaults().workerId),
    artifactUri: z.string().min(4),
    traceSummary: z.string().min(10),
    paidDependency: z.string().min(4),
    outputSummary: z.string().min(20)
  },
  async (input) => {
    const state = await submitScaffold(input);
    const scaffold = state.brief?.milestones.find((milestone) => milestone.jobId === input.jobId) ?? null;
    return {
      content: [{ type: "text", text: JSON.stringify(scaffold, null, 2) }]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
