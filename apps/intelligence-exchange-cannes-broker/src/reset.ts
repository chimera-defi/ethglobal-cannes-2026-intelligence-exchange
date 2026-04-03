import { writeFile } from "node:fs/promises";
import path from "node:path";
import { resetDemoState } from "./demo.js";

const statePath = path.resolve(import.meta.dirname, "..", "data", "demo-state.json");
const chainMode =
  process.env.CHAIN_MODE === "fork" ? "fork" : process.env.CHAIN_MODE === "testnet" ? "testnet" : "local";

const state = resetDemoState(chainMode);
await writeFile(statePath, JSON.stringify(state, null, 2));
console.log(`Reset demo state at ${statePath}`);
