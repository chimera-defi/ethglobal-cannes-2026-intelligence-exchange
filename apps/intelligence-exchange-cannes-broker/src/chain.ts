import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  formatEther,
  http,
  keccak256,
  parseEther,
  stringToHex
} from "viem";
import { mnemonicToAccount } from "viem/accounts";

const rootDir = path.resolve(import.meta.dirname, "../../..");
const contractsDir = path.join(rootDir, "contracts");

const mnemonic =
  process.env.GANACHE_MNEMONIC ??
  "test test test test test test test test test test test junk";
const posterAccount = mnemonicToAccount(mnemonic, { addressIndex: 0 });
const workerAccount = mnemonicToAccount(mnemonic, { addressIndex: 1 });

export const seededAccounts = {
  poster: {
    address: posterAccount.address,
    account: posterAccount
  },
  worker: {
    address: workerAccount.address,
    account: workerAccount
  }
} as const;

type Artifact = {
  abi: readonly unknown[];
  bytecode: {
    object: string;
  };
};

function getChainConfig(): {
  chain: ReturnType<typeof defineChain>;
  chainId: number;
  chainMode: "local" | "fork" | "testnet";
  rpcUrl: string;
} {
  const chainMode =
    process.env.CHAIN_MODE === "fork" ? "fork" : process.env.CHAIN_MODE === "testnet" ? "testnet" : "local";
  const rpcUrl =
    process.env.RPC_URL ??
    (chainMode === "testnet" ? "https://rpc.testnet.arc.network" : "http://127.0.0.1:8545");
  const chainId = Number(process.env.CHAIN_ID ?? (chainMode === "testnet" ? "5042002" : "31337"));

  const chain = defineChain({
    id: chainId,
    name: `iex-cannes-${chainMode}`,
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } }
  });

  return { chain, chainId, chainMode, rpcUrl };
}

async function ensureArtifacts() {
  try {
    await readFile(
      path.join(contractsDir, "out", "CannesMilestoneEscrow.sol", "CannesMilestoneEscrow.json"),
      "utf8"
    );
    await readFile(
      path.join(contractsDir, "out", "CannesAgentIdentityRegistry.sol", "CannesAgentIdentityRegistry.json"),
      "utf8"
    );
  } catch {
    execFileSync("pnpm", ["contracts:build"], {
      cwd: rootDir,
      stdio: "inherit"
    });
  }
}

async function loadArtifact(name: string): Promise<Artifact> {
  await ensureArtifacts();
  return JSON.parse(await readFile(path.join(contractsDir, "out", `${name}.sol`, `${name}.json`), "utf8")) as Artifact;
}

function createClients() {
  const { chain, chainId, chainMode, rpcUrl } = getChainConfig();
  const posterWalletClient = createWalletClient({
    account: seededAccounts.poster.account,
    chain,
    transport: http(rpcUrl)
  });
  const workerWalletClient = createWalletClient({
    account: seededAccounts.worker.account,
    chain,
    transport: http(rpcUrl)
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl)
  });

  return {
    chain,
    chainId,
    chainMode,
    rpcUrl,
    publicClient,
    posterWalletClient,
    workerWalletClient
  };
}

export function milestoneKey(jobId: string) {
  return keccak256(stringToHex(jobId));
}

function bytecodeHex(bytecodeObject: string) {
  return (bytecodeObject.startsWith("0x") ? bytecodeObject : `0x${bytecodeObject}`) as `0x${string}`;
}

export async function deployAgentRegistry() {
  const { chain, chainId, chainMode, rpcUrl, publicClient, posterWalletClient } = createClients();
  const artifact = await loadArtifact("CannesAgentIdentityRegistry");
  const deployHash = await posterWalletClient.deployContract({
    abi: artifact.abi as any,
    bytecode: bytecodeHex(artifact.bytecode.object),
    args: [],
    chain
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  if (!receipt.contractAddress) {
    throw new Error("Agent registry deployment did not return an address.");
  }

  return {
    address: receipt.contractAddress,
    chainId,
    chainMode,
    rpcUrl,
    txHash: receipt.transactionHash
  };
}

export async function registerAgentIdentity(
  registryAddress: `0x${string}`,
  role: "poster" | "worker",
  agentUri: string
) {
  const { chain, publicClient, posterWalletClient, workerWalletClient } = createClients();
  const artifact = await loadArtifact("CannesAgentIdentityRegistry");
  const walletClient = role === "poster" ? posterWalletClient : workerWalletClient;
  const account = role === "poster" ? seededAccounts.poster.account : seededAccounts.worker.account;
  const hash = await walletClient.sendTransaction({
    to: registryAddress,
    data: encodeFunctionData({
      abi: artifact.abi as any,
      functionName: "register",
      args: [agentUri]
    }),
    account,
    chain
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const registeredLog = receipt.logs.find((log: { topics: readonly `0x${string}`[] }) => log.topics.length > 1);
  const agentId = registeredLog?.topics[1] ? Number(BigInt(registeredLog.topics[1])) : null;
  return {
    agentId,
    txHash: receipt.transactionHash
  };
}

export async function deployAndFundEscrow(budgetUsd: number) {
  const { chain, chainId, chainMode, rpcUrl, publicClient, posterWalletClient } = createClients();
  const artifact = await loadArtifact("CannesMilestoneEscrow");

  const deployHash = await posterWalletClient.deployContract({
    abi: artifact.abi as any,
    bytecode: bytecodeHex(artifact.bytecode.object),
    args: [seededAccounts.poster.address, BigInt(budgetUsd)],
    chain
  });
  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  const contractAddress = deployReceipt.contractAddress;

  if (!contractAddress) {
    throw new Error("Escrow deployment did not return an address.");
  }

  const fundHash = await posterWalletClient.sendTransaction({
    to: contractAddress,
    data: encodeFunctionData({
      abi: artifact.abi as any,
      functionName: "fund"
    }),
    account: seededAccounts.poster.account,
    chain,
    value: parseEther("0.25")
  });
  const fundReceipt = await publicClient.waitForTransactionReceipt({ hash: fundHash });
  const balance = await publicClient.getBalance({ address: contractAddress });

  return {
    chainId,
    chainMode,
    contractAddress,
    deployTxHash: deployReceipt.transactionHash,
    escrowBalanceUsd: Number(formatEther(balance)) * 1600,
    fundTxHash: fundReceipt.transactionHash,
    fundedAmountUsd: budgetUsd,
    rpcUrl
  };
}

export async function reserveMilestoneEscrow(
  contractAddress: `0x${string}`,
  jobId: string,
  budgetUsd: number
) {
  const { chain, publicClient, posterWalletClient } = createClients();
  const artifact = await loadArtifact("CannesMilestoneEscrow");
  const hash = await posterWalletClient.sendTransaction({
    to: contractAddress,
    data: encodeFunctionData({
      abi: artifact.abi as any,
      functionName: "reserveMilestone",
      args: [milestoneKey(jobId), seededAccounts.worker.address, BigInt(budgetUsd)]
    }),
    account: seededAccounts.poster.account,
    chain
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { reserveTxHash: receipt.transactionHash };
}

export async function releaseEscrow(contractAddress: `0x${string}`, jobId: string) {
  const { chain, publicClient, posterWalletClient } = createClients();
  const artifact = await loadArtifact("CannesMilestoneEscrow");

  const hash = await posterWalletClient.sendTransaction({
    to: contractAddress,
    data: encodeFunctionData({
      abi: artifact.abi as any,
      functionName: "releaseMilestone",
      args: [milestoneKey(jobId)]
    }),
    account: seededAccounts.poster.account,
    chain
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const balance = await publicClient.getBalance({ address: contractAddress });

  return {
    releaseTxHash: receipt.transactionHash,
    remainingEscrowUsd: Number(formatEther(balance)) * 1600
  };
}

export async function refundEscrow(contractAddress: `0x${string}`, jobId: string) {
  const { chain, publicClient, posterWalletClient } = createClients();
  const artifact = await loadArtifact("CannesMilestoneEscrow");

  const hash = await posterWalletClient.sendTransaction({
    to: contractAddress,
    data: encodeFunctionData({
      abi: artifact.abi as any,
      functionName: "refundMilestone",
      args: [milestoneKey(jobId)]
    }),
    account: seededAccounts.poster.account,
    chain
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const balance = await publicClient.getBalance({ address: contractAddress });

  return {
    refundTxHash: receipt.transactionHash,
    remainingEscrowUsd: Number(formatEther(balance)) * 1600
  };
}
