import { mkdir, writeFile } from "node:fs/promises";
import { resetDemoState } from "./demo.js";
import { brokerRuntimePaths } from "./runtime-paths.js";

const chainMode =
  process.env.CHAIN_MODE === "fork" ? "fork" : process.env.CHAIN_MODE === "testnet" ? "testnet" : "local";

const state = resetDemoState(chainMode);
await mkdir(brokerRuntimePaths.dataDir, { recursive: true });
await writeFile(brokerRuntimePaths.statePath, JSON.stringify(state, null, 2));
console.log(`Reset demo state at ${brokerRuntimePaths.statePath}`);
