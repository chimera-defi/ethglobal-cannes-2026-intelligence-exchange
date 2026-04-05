import { createPublicClient, createWalletClient, http, keccak256, parseAbi, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getBrokerAttestorAccount, normalizeAccountAddress } from './identityService';
import { httpError } from './errors';
import { getWorldChainConfig } from './sponsorConfig';

const IDENTITY_GATE_ABI = parseAbi([
  'function isVerified(address account, bytes32 role) view returns (bool)',
  'function setVerified(address account, bytes32 role, bool verified)',
]);

function getWorldchainChain() {
  const config = getWorldChainConfig();
  return {
    id: config.chainId,
    name: 'World Chain',
    nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
    rpcUrls: {
      default: { http: [config.rpcUrl] },
      public: { http: [config.rpcUrl] },
    },
  };
}

function getPublicClient() {
  const config = getWorldChainConfig();
  return createPublicClient({
    chain: getWorldchainChain(),
    transport: http(config.rpcUrl),
  });
}

function getWalletClient() {
  const config = getWorldChainConfig();
  const account = getBrokerAttestorAccount();
  return createWalletClient({
    account,
    chain: getWorldchainChain(),
    transport: http(config.rpcUrl),
  });
}

export function toRoleHash(role: 'poster' | 'worker' | 'reviewer') {
  return keccak256(toBytes(role));
}

export async function getIdentityGateRoleStatus(accountAddress: string, role: 'poster' | 'worker' | 'reviewer') {
  const config = getWorldChainConfig();
  if (!config.identityGateAddress) {
    return {
      configured: false,
      contractAddress: null,
      verified: false,
    };
  }

  const client = getPublicClient();
  const verified = await client.readContract({
    address: config.identityGateAddress as `0x${string}`,
    abi: IDENTITY_GATE_ABI,
    functionName: 'isVerified',
    args: [normalizeAccountAddress(accountAddress) as `0x${string}`, toRoleHash(role)],
  });

  return {
    configured: true,
    contractAddress: config.identityGateAddress,
    verified,
  };
}

export async function syncIdentityGateRole(accountAddress: string, role: 'poster' | 'worker' | 'reviewer') {
  const config = getWorldChainConfig();
  if (!config.identityGateAddress) {
    throw httpError('IdentityGate address is not configured for Worldchain', 503, 'IDENTITY_GATE_NOT_CONFIGURED');
  }

  const normalized = normalizeAccountAddress(accountAddress);
  const walletClient = getWalletClient();
  const publicClient = getPublicClient();

  const txHash = await walletClient.writeContract({
    address: config.identityGateAddress as `0x${string}`,
    abi: IDENTITY_GATE_ABI,
    functionName: 'setVerified',
    args: [normalized as `0x${string}`, toRoleHash(role), true],
    account: getBrokerAttestorAccount(),
    chain: getWorldchainChain(),
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });

  return {
    txHash,
    blockNumber: Number(receipt.blockNumber),
    contractAddress: config.identityGateAddress,
    explorerUrl: `${config.explorerBaseUrl}/tx/${txHash}`,
  };
}
