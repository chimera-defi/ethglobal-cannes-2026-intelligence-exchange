import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { privateKeyToAccount } from "viem/accounts";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther
} from "viem";

const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const chainId = Number(process.env.CHAIN_ID ?? "31337");
const privateKey =
  (process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined) ??
  "0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce036f26f6e7f5c8f6d54aa";
const poster =
  (process.env.POSTER_ADDRESS as `0x${string}` | undefined) ??
  "0x90f79bf6eb2c4f870365e785982e1f101e93b906";
const worker =
  (process.env.WORKER_ADDRESS as `0x${string}` | undefined) ??
  "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65";
const totalBudgetUsd = BigInt(process.env.TOTAL_BUDGET_USD ?? "400");

const artifactPath = path.resolve(import.meta.dirname, "..", "artifacts", "CannesMilestoneEscrow.json");
const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as {
  abi: unknown[];
  bytecode: string;
};

const chain = defineChain({
  id: chainId,
  name: "cannes-demo",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } }
});

const account = privateKeyToAccount(privateKey);
const walletClient = createWalletClient({
  account,
  chain,
  transport: http(rpcUrl)
});
const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl)
});

const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: `0x${artifact.bytecode}` as `0x${string}`,
  args: [poster, worker, totalBudgetUsd]
});

const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log(
  JSON.stringify(
    {
      contractAddress: receipt.contractAddress,
      deployTxHash: receipt.transactionHash,
      rpcUrl
    },
    null,
    2
  )
);

if (process.env.AUTO_FUND === "1" && receipt.contractAddress) {
  const fundHash = await walletClient.writeContract({
    address: receipt.contractAddress,
    abi: artifact.abi,
    functionName: "fund",
    value: parseEther("0.25")
  });
  const fundReceipt = await publicClient.waitForTransactionReceipt({ hash: fundHash });
  console.log(
    JSON.stringify(
      {
        fundedTxHash: fundReceipt.transactionHash,
        contractAddress: receipt.contractAddress
      },
      null,
      2
    )
  );
}
