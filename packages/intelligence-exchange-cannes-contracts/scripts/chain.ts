import { spawn } from "node:child_process";

const args = [
  "--wallet.deterministic",
  "--chain.chainId",
  process.env.CHAIN_ID ?? "31337",
  "--server.port",
  process.env.CHAIN_PORT ?? "8545",
  "--miner.blockTime",
  "1"
];

if (process.env.CHAIN_MODE === "fork" && process.env.FORK_RPC_URL) {
  args.push("--fork.url", process.env.FORK_RPC_URL);
}

const child = spawn("ganache", args, {
  stdio: "inherit",
  shell: true
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
