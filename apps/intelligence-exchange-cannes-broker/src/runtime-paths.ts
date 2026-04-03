import path from "node:path";

const runtimeRoot = path.resolve(import.meta.dirname, "..", ".runtime");

export const brokerRuntimePaths = {
  root: runtimeRoot,
  dataDir: path.join(runtimeRoot, "data"),
  dossierDir: path.join(runtimeRoot, "dossiers"),
  statePath: path.join(runtimeRoot, "data", "demo-state.json")
} as const;
