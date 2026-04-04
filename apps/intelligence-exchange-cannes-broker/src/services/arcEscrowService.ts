/**
 * Arc Escrow Service
 * 
 * Integration with AdvancedArcEscrow contract for Prize 1 submission:
 * - Conditional escrow with dispute + automatic release
 * - Programmable payroll/vesting in USDC
 * - Native Arc testnet/mainnet integration
 */

import { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData, type Address, type Hash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getArcConfig } from './sponsorConfig';
import { httpError } from './errors';

// AdvancedArcEscrow ABI (simplified for used functions)
const ADVANCED_ARC_ESCROW_ABI = parseAbi([
  // View functions
  'function getIdeaBalance(bytes32 ideaId) view returns (uint256 available, uint256 totalFunded, uint256 platformFeesReserved)',
  'function getMilestoneStatus(bytes32 milestoneId) view returns (uint8)',
  'function getMilestoneDetails(bytes32 milestoneId) view returns ((bytes32 ideaId, uint256 amount, uint8 status, address worker, address reviewer, uint256 submittedAt, uint256 reviewStartedAt, uint256 approvedAt, bytes32 submissionHash, bytes32 attestationHash, (uint256 duration, uint256 cliff, uint256 startTime, bool linear) vesting, uint256 releasedAmount))',
  'function getReleasableAmount(bytes32 milestoneId) view returns (uint256)',
  'function getVestingProgress(bytes32 milestoneId) view returns (uint256 totalAmount, uint256 releasedAmount, uint256 releasableNow, uint256 startTime, uint256 cliff, uint256 duration, bool isLinear)',
  'function getDisputeDetails(bytes32 milestoneId) view returns ((bytes32 milestoneId, address disputant, bytes32 reasonHash, uint256 raisedAt, uint256 resolutionDeadline, uint8 resolution, bool resolved, address resolver))',
  'function canAutoRelease(bytes32 milestoneId) view returns (bool)',
  'function canAutoResolve(bytes32 milestoneId) view returns (bool)',
  'function getPlatformFee(uint256 amount) pure returns (uint256)',
  'function disputes(bytes32 milestoneId) view returns (bytes32 milestoneId, address disputant, bytes32 reasonHash, uint256 raisedAt, uint256 resolutionDeadline, uint8 resolution, bool resolved, address resolver)',
  'function PLATFORM_FEE_BPS() view returns (uint256)',
  'function USDC() view returns (address)',
  'function reviewTimeout() view returns (uint256)',
  'function disputeWindow() view returns (uint256)',
  
  // Write functions
  'function fundIdea(bytes32 ideaId, uint256 amount)',
  'function reserveMilestone(bytes32 ideaId, bytes32 milestoneId, uint256 amount, uint256 vestingDuration, uint256 vestingCliff, bool linearVesting)',
  'function reserveMilestones(bytes32 ideaId, bytes32[] milestoneIds, uint256[] amounts, uint256[] vestingDurations, uint256[] vestingCliffs, bool[] linearVestings)',
  'function submitMilestone(bytes32 milestoneId, bytes32 submissionHash)',
  'function startReview(bytes32 milestoneId)',
  'function approveMilestone(bytes32 milestoneId, bytes32 attestationHash)',
  'function releaseMilestone(bytes32 milestoneId)',
  'function autoReleaseMilestone(bytes32 milestoneId)',
  'function raiseDispute(bytes32 milestoneId, bytes32 reasonHash)',
  'function resolveDispute(bytes32 milestoneId, uint8 resolution, uint256 workerPayoutBps)',
  'function autoResolveDispute(bytes32 milestoneId)',
  'function refundMilestone(bytes32 milestoneId)',
  'function withdrawAvailable(bytes32 ideaId, uint256 amount)',
  'function withdrawPlatformFees()',
  
  // Admin
  'function setPlatformWallet(address _platformWallet)',
  'function setDisputeResolver(address _disputeResolver)',
  'function setReviewTimeout(uint256 _reviewTimeout)',
  'function setDisputeWindow(uint256 _disputeWindow)',
  
  // Events
  'event IdeaFunded(bytes32 indexed ideaId, address indexed poster, uint256 amount, uint256 platformFeeReserved)',
  'event MilestoneReserved(bytes32 indexed ideaId, bytes32 indexed milestoneId, uint256 amount, uint256 vestingDuration, uint256 vestingCliff)',
  'event MilestoneSubmitted(bytes32 indexed milestoneId, address indexed worker, bytes32 submissionHash, uint256 submittedAt)',
  'event MilestoneUnderReview(bytes32 indexed milestoneId, address indexed reviewer, uint256 reviewDeadline)',
  'event MilestoneApproved(bytes32 indexed milestoneId, address indexed reviewer, bytes32 attestationHash, uint256 releaseAmount, uint256 platformFee)',
  'event MilestoneReleased(bytes32 indexed ideaId, bytes32 indexed milestoneId, address indexed worker, uint256 amount, uint256 vestedAmount, uint256 platformFee)',
  'event MilestoneAutoReleased(bytes32 indexed milestoneId, address indexed worker, uint256 amount, uint256 autoReleaseAt)',
  'event DisputeRaised(bytes32 indexed milestoneId, address indexed disputant, bytes32 reasonHash, uint256 raisedAt, uint256 resolutionDeadline)',
  'event DisputeResolved(bytes32 indexed milestoneId, address indexed resolver, uint8 resolution, uint256 workerPayout, uint256 posterRefund)',
  'event PlatformFeeWithdrawn(address indexed to, uint256 amount)',
]);

// USDC ERC20 ABI
const USDC_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);

// Milestone status enum mapping
export const MilestoneStatus = {
  None: 0,
  Reserved: 1,
  Submitted: 2,
  UnderReview: 3,
  Disputed: 4,
  Approved: 5,
  Released: 6,
  AutoReleased: 7,
  Refunded: 8,
} as const;

export type MilestoneStatusKey = keyof typeof MilestoneStatus;

// Dispute resolution enum
export const DisputeResolution = {
  None: 0,
  WorkerWins: 1,
  PosterWins: 2,
  Split: 3,
} as const;

export type DisputeResolutionKey = keyof typeof DisputeResolution;

// Types
export interface VestingSchedule {
  duration: number;      // seconds
  cliff: number;         // seconds
  startTime: number;     // timestamp
  linear: boolean;
}

export interface MilestoneDetails {
  ideaId: `0x${string}`;
  amount: bigint;
  status: number;
  worker: Address;
  reviewer: Address;
  submittedAt: number;
  reviewStartedAt: number;
  approvedAt: number;
  submissionHash: `0x${string}`;
  attestationHash: `0x${string}`;
  vesting: VestingSchedule;
  releasedAmount: bigint;
}

export interface DisputeDetails {
  milestoneId: `0x${string}`;
  disputant: Address;
  reasonHash: `0x${string}`;
  raisedAt: number;
  resolutionDeadline: number;
  resolution: number;
  resolved: boolean;
  resolver: Address;
}

export interface IdeaBalance {
  available: bigint;
  totalFunded: bigint;
  platformFeesReserved: bigint;
}

export interface VestingProgress {
  totalAmount: bigint;
  releasedAmount: bigint;
  releasableNow: bigint;
  startTime: number;
  cliff: number;
  duration: number;
  isLinear: boolean;
}

// Chain configuration
export interface ArcChainConfig {
  rpcUrl: string;
  chainId: number;
  escrowContractAddress: Address | null;
  usdcAddress: Address;
}

type IdeaBalanceResult = readonly [bigint, bigint, bigint];
type MilestoneDetailsResult = {
  ideaId: `0x${string}`;
  amount: bigint;
  status: number;
  worker: Address;
  reviewer: Address;
  submittedAt: bigint;
  reviewStartedAt: bigint;
  approvedAt: bigint;
  submissionHash: `0x${string}`;
  attestationHash: `0x${string}`;
  vesting: {
    duration: bigint;
    cliff: bigint;
    startTime: bigint;
    linear: boolean;
  };
  releasedAmount: bigint;
};
type VestingProgressResult = readonly [bigint, bigint, bigint, bigint, bigint, bigint, boolean];
type DisputeDetailsResult = readonly [`0x${string}`, Address, `0x${string}`, bigint, bigint, number, boolean, Address];

// Client cache
let publicClient: ReturnType<typeof createPublicClient> | null = null;
let walletClient: ReturnType<typeof createWalletClient> | null = null;

/**
 * Get the Arc chain configuration
 */
export function getArcEscrowConfig(): ArcChainConfig {
  const config = getArcConfig();
  return {
    rpcUrl: config.rpcUrl,
    chainId: config.chainId,
    escrowContractAddress: config.escrowContractAddress as Address | null,
    usdcAddress: config.usdcAddress as Address,
  };
}

/**
 * Create a public client for reading from Arc
 */
export function getArcPublicClient() {
  if (publicClient) return publicClient;
  
  const config = getArcConfig();
  
  publicClient = createPublicClient({
    transport: http(config.rpcUrl, {
      timeout: 30000,
      retryCount: 3,
    }),
  });
  
  return publicClient;
}

/**
 * Create a wallet client for writing to Arc
 */
export function getArcWalletClient() {
  if (walletClient) return walletClient;
  
  const privateKey = process.env.ARC_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw httpError('ARC_PRIVATE_KEY or PRIVATE_KEY not configured', 500, 'ARC_CONFIG_MISSING');
  }
  
  const config = getArcConfig();
  const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey as `0x${string}` : `0x${privateKey}`);
  
  walletClient = createWalletClient({
    account,
    transport: http(config.rpcUrl, {
      timeout: 30000,
      retryCount: 3,
    }),
  });
  
  return walletClient;
}

/**
 * Get the broker attestation account for Arc
 */
export function getArcAttestorAccount() {
  const privateKey = process.env.ARC_ATTESTOR_PRIVATE_KEY || process.env.ARC_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw httpError('ARC_ATTESTOR_PRIVATE_KEY not configured', 500, 'ARC_CONFIG_MISSING');
  }
  
  return privateKeyToAccount(privateKey.startsWith('0x') ? privateKey as `0x${string}` : `0x${privateKey}`);
}

/**
 * Reset clients (useful for testing)
 */
export function resetArcClients() {
  publicClient = null;
  walletClient = null;
}

// ═════════════════════════════════════════════════════════════════════════════
// Contract Read Functions
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Get USDC balance for an address
 */
export async function getUSDCBalance(address: Address): Promise<bigint> {
  const client = getArcPublicClient();
  const config = getArcConfig();
  
  return client.readContract({
    address: config.usdcAddress as Address,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [address],
  });
}

/**
 * Get idea balance from escrow
 */
export async function getEscrowIdeaBalance(ideaId: `0x${string}`): Promise<IdeaBalance> {
  const client = getArcPublicClient();
  const config = getArcConfig();
  
  if (!config.escrowContractAddress) {
    throw httpError('Arc escrow contract not configured', 500, 'ARC_ESCROW_NOT_CONFIGURED');
  }
  
  const [available, totalFunded, platformFeesReserved] = await client.readContract({
    address: config.escrowContractAddress as Address,
    abi: ADVANCED_ARC_ESCROW_ABI,
    functionName: 'getIdeaBalance',
    args: [ideaId],
  }) as IdeaBalanceResult;
  
  return { available, totalFunded, platformFeesReserved };
}

/**
 * Get milestone status
 */
export async function getMilestoneStatus(milestoneId: `0x${string}`): Promise<number> {
  const client = getArcPublicClient();
  const config = getArcConfig();
  
  if (!config.escrowContractAddress) {
    throw httpError('Arc escrow contract not configured', 500, 'ARC_ESCROW_NOT_CONFIGURED');
  }
  
  return await client.readContract({
    address: config.escrowContractAddress as Address,
    abi: ADVANCED_ARC_ESCROW_ABI,
    functionName: 'getMilestoneStatus',
    args: [milestoneId],
  }) as number;
}

/**
 * Get milestone status as string
 */
export async function getMilestoneStatusName(milestoneId: `0x${string}`): Promise<MilestoneStatusKey> {
  const status = await getMilestoneStatus(milestoneId);
  const entry = Object.entries(MilestoneStatus).find(([_, val]) => val === status);
  return (entry?.[0] ?? 'None') as MilestoneStatusKey;
}

/**
 * Get full milestone details
 */
export async function getMilestoneDetails(milestoneId: `0x${string}`): Promise<MilestoneDetails> {
  const client = getArcPublicClient();
  const config = getArcConfig();
  
  if (!config.escrowContractAddress) {
    throw httpError('Arc escrow contract not configured', 500, 'ARC_ESCROW_NOT_CONFIGURED');
  }
  
  const result = await client.readContract({
    address: config.escrowContractAddress as Address,
    abi: ADVANCED_ARC_ESCROW_ABI,
    functionName: 'getMilestoneDetails',
    args: [milestoneId],
  }) as unknown as MilestoneDetailsResult;
  
  return {
    ideaId: result.ideaId,
    amount: result.amount,
    status: result.status,
    worker: result.worker,
    reviewer: result.reviewer,
    submittedAt: Number(result.submittedAt),
    reviewStartedAt: Number(result.reviewStartedAt),
    approvedAt: Number(result.approvedAt),
    submissionHash: result.submissionHash,
    attestationHash: result.attestationHash,
    vesting: {
      duration: Number(result.vesting.duration),
      cliff: Number(result.vesting.cliff),
      startTime: Number(result.vesting.startTime),
      linear: result.vesting.linear,
    },
    releasedAmount: result.releasedAmount,
  };
}

/**
 * Get releasable amount for milestone
 */
export async function getReleasableAmount(milestoneId: `0x${string}`): Promise<bigint> {
  const client = getArcPublicClient();
  const config = getArcConfig();
  
  if (!config.escrowContractAddress) {
    return BigInt(0);
  }
  
  try {
    return await client.readContract({
      address: config.escrowContractAddress as Address,
      abi: ADVANCED_ARC_ESCROW_ABI,
      functionName: 'getReleasableAmount',
      args: [milestoneId],
    }) as bigint;
  } catch {
    return BigInt(0);
  }
}

/**
 * Get vesting progress
 */
export async function getVestingProgress(milestoneId: `0x${string}`): Promise<VestingProgress> {
  const client = getArcPublicClient();
  const config = getArcConfig();
  
  if (!config.escrowContractAddress) {
    throw httpError('Arc escrow contract not configured', 500, 'ARC_ESCROW_NOT_CONFIGURED');
  }
  
  const result = await client.readContract({
    address: config.escrowContractAddress as Address,
    abi: ADVANCED_ARC_ESCROW_ABI,
    functionName: 'getVestingProgress',
    args: [milestoneId],
  }) as VestingProgressResult;
  
  return {
    totalAmount: result[0],
    releasedAmount: result[1],
    releasableNow: result[2],
    startTime: Number(result[3]),
    cliff: Number(result[4]),
    duration: Number(result[5]),
    isLinear: result[6],
  };
}

/**
 * Get dispute details
 */
export async function getDisputeDetails(milestoneId: `0x${string}`): Promise<DisputeDetails | null> {
  const client = getArcPublicClient();
  const config = getArcConfig();
  
  if (!config.escrowContractAddress) {
    return null;
  }
  
  try {
    const result = await client.readContract({
      address: config.escrowContractAddress as Address,
      abi: ADVANCED_ARC_ESCROW_ABI,
      functionName: 'disputes',
      args: [milestoneId],
    }) as DisputeDetailsResult;

    const [disputeMilestoneId, disputant, reasonHash, raisedAt, resolutionDeadline, resolution, resolved, resolver] = result;
    
    // Check if dispute exists
    if (raisedAt === BigInt(0)) {
      return null;
    }
    
    return {
      milestoneId: disputeMilestoneId,
      disputant,
      reasonHash,
      raisedAt: Number(raisedAt),
      resolutionDeadline: Number(resolutionDeadline),
      resolution,
      resolved,
      resolver,
    };
  } catch {
    return null;
  }
}

/**
 * Check if milestone can be auto-released
 */
export async function canAutoRelease(milestoneId: `0x${string}`): Promise<boolean> {
  const client = getArcPublicClient();
  const config = getArcConfig();
  
  if (!config.escrowContractAddress) {
    return false;
  }
  
  try {
    return await client.readContract({
      address: config.escrowContractAddress as Address,
      abi: ADVANCED_ARC_ESCROW_ABI,
      functionName: 'canAutoRelease',
      args: [milestoneId],
    }) as boolean;
  } catch {
    return false;
  }
}

/**
 * Check if dispute can be auto-resolved
 */
export async function canAutoResolve(milestoneId: `0x${string}`): Promise<boolean> {
  const client = getArcPublicClient();
  const config = getArcConfig();
  
  if (!config.escrowContractAddress) {
    return false;
  }
  
  try {
    return await client.readContract({
      address: config.escrowContractAddress as Address,
      abi: ADVANCED_ARC_ESCROW_ABI,
      functionName: 'canAutoResolve',
      args: [milestoneId],
    }) as boolean;
  } catch {
    return false;
  }
}

/**
 * Calculate platform fee for an amount
 */
export async function calculatePlatformFee(amount: bigint): Promise<bigint> {
  const client = getArcPublicClient();
  const config = getArcConfig();
  
  if (!config.escrowContractAddress) {
    // Default 10%
    return (amount * BigInt(1000)) / BigInt(10000);
  }
  
  return await client.readContract({
    address: config.escrowContractAddress as Address,
    abi: ADVANCED_ARC_ESCROW_ABI,
    functionName: 'getPlatformFee',
    args: [amount],
  }) as bigint;
}

/**
 * Get escrow contract configuration
 */
export async function getEscrowConfig() {
  const client = getArcPublicClient();
  const config = getArcConfig();
  
  if (!config.escrowContractAddress) {
    return null;
  }
  
  const [platformFeeBps, usdc, reviewTimeoutSeconds, disputeWindowSeconds] = await Promise.all([
    client.readContract({
      address: config.escrowContractAddress as Address,
      abi: ADVANCED_ARC_ESCROW_ABI,
      functionName: 'PLATFORM_FEE_BPS',
    }),
    client.readContract({
      address: config.escrowContractAddress as Address,
      abi: ADVANCED_ARC_ESCROW_ABI,
      functionName: 'USDC',
    }),
    client.readContract({
      address: config.escrowContractAddress as Address,
      abi: ADVANCED_ARC_ESCROW_ABI,
      functionName: 'reviewTimeout',
    }),
    client.readContract({
      address: config.escrowContractAddress as Address,
      abi: ADVANCED_ARC_ESCROW_ABI,
      functionName: 'disputeWindow',
    }),
  ]) as [bigint, Address, bigint, bigint];
  
  return {
    platformFeeBps,
    usdc,
    reviewTimeout: Number(reviewTimeoutSeconds),
    disputeWindow: Number(disputeWindowSeconds),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Transaction Builders (for frontend/pre-signed txs)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Build USDC approval transaction
 */
export function buildUSDCApprovalTx(
  spender: Address,
  amount: bigint
): { to: Address; data: `0x${string}`; value: bigint } {
  const config = getArcConfig();
  
  return {
    to: config.usdcAddress as Address,
    data: encodeFunctionData({
      abi: USDC_ABI,
      functionName: 'approve',
      args: [spender, amount],
    }),
    value: BigInt(0),
  };
}

/**
 * Build fund idea transaction
 */
export function buildFundIdeaTx(
  ideaId: `0x${string}`,
  amount: bigint
): { to: Address; data: `0x${string}`; value: bigint } {
  const config = getArcConfig();
  
  if (!config.escrowContractAddress) {
    throw httpError('Arc escrow contract not configured', 500, 'ARC_ESCROW_NOT_CONFIGURED');
  }
  
  return {
    to: config.escrowContractAddress as Address,
    data: encodeFunctionData({
      abi: ADVANCED_ARC_ESCROW_ABI,
      functionName: 'fundIdea',
      args: [ideaId, amount],
    }),
    value: BigInt(0),
  };
}

/**
 * Build reserve milestone transaction
 */
export function buildReserveMilestoneTx(
  ideaId: `0x${string}`,
  milestoneId: `0x${string}`,
  amount: bigint,
  vestingDuration: number,
  vestingCliff: number,
  linearVesting: boolean
): { to: Address; data: `0x${string}`; value: bigint } {
  const config = getArcConfig();
  
  if (!config.escrowContractAddress) {
    throw httpError('Arc escrow contract not configured', 500, 'ARC_ESCROW_NOT_CONFIGURED');
  }
  
  return {
    to: config.escrowContractAddress as Address,
    data: encodeFunctionData({
      abi: ADVANCED_ARC_ESCROW_ABI,
      functionName: 'reserveMilestone',
      args: [ideaId, milestoneId, amount, BigInt(vestingDuration), BigInt(vestingCliff), linearVesting],
    }),
    value: BigInt(0),
  };
}

/**
 * Build submit milestone transaction
 */
export function buildSubmitMilestoneTx(
  milestoneId: `0x${string}`,
  submissionHash: `0x${string}`
): { to: Address; data: `0x${string}`; value: bigint } {
  const config = getArcConfig();
  
  if (!config.escrowContractAddress) {
    throw httpError('Arc escrow contract not configured', 500, 'ARC_ESCROW_NOT_CONFIGURED');
  }
  
  return {
    to: config.escrowContractAddress as Address,
    data: encodeFunctionData({
      abi: ADVANCED_ARC_ESCROW_ABI,
      functionName: 'submitMilestone',
      args: [milestoneId, submissionHash],
    }),
    value: BigInt(0),
  };
}

/**
 * Build start review transaction
 */
export function buildStartReviewTx(
  milestoneId: `0x${string}`
): { to: Address; data: `0x${string}`; value: bigint } {
  const config = getArcConfig();
  
  if (!config.escrowContractAddress) {
    throw httpError('Arc escrow contract not configured', 500, 'ARC_ESCROW_NOT_CONFIGURED');
  }
  
  return {
    to: config.escrowContractAddress as Address,
    data: encodeFunctionData({
      abi: ADVANCED_ARC_ESCROW_ABI,
      functionName: 'startReview',
      args: [milestoneId],
    }),
    value: BigInt(0),
  };
}

/**
 * Build approve milestone transaction
 */
export function buildApproveMilestoneTx(
  milestoneId: `0x${string}`,
  attestationHash: `0x${string}`
): { to: Address; data: `0x${string}`; value: bigint } {
  const config = getArcConfig();
  
  if (!config.escrowContractAddress) {
    throw httpError('Arc escrow contract not configured', 500, 'ARC_ESCROW_NOT_CONFIGURED');
  }
  
  return {
    to: config.escrowContractAddress as Address,
    data: encodeFunctionData({
      abi: ADVANCED_ARC_ESCROW_ABI,
      functionName: 'approveMilestone',
      args: [milestoneId, attestationHash],
    }),
    value: BigInt(0),
  };
}

/**
 * Build release milestone transaction
 */
export function buildReleaseMilestoneTx(
  milestoneId: `0x${string}`
): { to: Address; data: `0x${string}`; value: bigint } {
  const config = getArcConfig();
  
  if (!config.escrowContractAddress) {
    throw httpError('Arc escrow contract not configured', 500, 'ARC_ESCROW_NOT_CONFIGURED');
  }
  
  return {
    to: config.escrowContractAddress as Address,
    data: encodeFunctionData({
      abi: ADVANCED_ARC_ESCROW_ABI,
      functionName: 'releaseMilestone',
      args: [milestoneId],
    }),
    value: BigInt(0),
  };
}

/**
 * Build raise dispute transaction
 */
export function buildRaiseDisputeTx(
  milestoneId: `0x${string}`,
  reasonHash: `0x${string}`
): { to: Address; data: `0x${string}`; value: bigint } {
  const config = getArcConfig();
  
  if (!config.escrowContractAddress) {
    throw httpError('Arc escrow contract not configured', 500, 'ARC_ESCROW_NOT_CONFIGURED');
  }
  
  return {
    to: config.escrowContractAddress as Address,
    data: encodeFunctionData({
      abi: ADVANCED_ARC_ESCROW_ABI,
      functionName: 'raiseDispute',
      args: [milestoneId, reasonHash],
    }),
    value: BigInt(0),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Contract Write Functions (requires broker private key)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Submit a transaction to Arc
 */
export async function submitArcTransaction(
  txData: { to: Address; data: `0x${string}`; value: bigint }
): Promise<Hash> {
  const wallet = getArcWalletClient();
  const account = wallet.account;
  if (!account) {
    throw httpError('Arc wallet account not configured', 500, 'ARC_CONFIG_MISSING');
  }
  
  const hash = await wallet.sendTransaction({
    account,
    chain: null, // Arc is not in viem's chain list yet
    ...txData,
  });
  
  return hash;
}

// ═════════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Format USDC amount (6 decimals) to human readable
 */
export function formatUSDC(amount: bigint): string {
  const divisor = BigInt(10 ** 6);
  const integer = amount / divisor;
  const fraction = amount % divisor;
  return `${integer}.${fraction.toString().padStart(6, '0')}`;
}

/**
 * Parse USDC amount from human readable
 */
export function parseUSDC(amount: string): bigint {
  const [integer, fraction = ''] = amount.split('.');
  const paddedFraction = fraction.padEnd(6, '0').slice(0, 6);
  return BigInt(integer) * BigInt(10 ** 6) + BigInt(paddedFraction);
}

/**
 * Get Arc explorer URL for transaction
 */
export function getArcExplorerUrl(txHash: string): string {
  const config = getArcConfig();
  const baseUrl = config.chainId === 5042002 
    ? 'https://testnet.arcscan.app' 
    : 'https://arcscan.app';
  return `${baseUrl}/tx/${txHash}`;
}

/**
 * Get Arc explorer URL for address
 */
export function getArcAddressExplorerUrl(address: string): string {
  const config = getArcConfig();
  const baseUrl = config.chainId === 5042002 
    ? 'https://testnet.arcscan.app' 
    : 'https://arcscan.app';
  return `${baseUrl}/address/${address}`;
}

/**
 * Check if Arc integration is fully configured
 */
export function isArcFullyConfigured(): boolean {
  const config = getArcConfig();
  return Boolean(
    config.escrowContractAddress &&
    config.rpcUrl &&
    (process.env.ARC_PRIVATE_KEY || process.env.PRIVATE_KEY)
  );
}

/**
 * Get Arc integration status summary
 */
export function getArcIntegrationStatus() {
  const config = getArcConfig();
  
  return {
    configured: isArcFullyConfigured(),
    rpcUrl: config.rpcUrl,
    chainId: config.chainId,
    isTestnet: config.chainId === 5042002,
    escrowContractAddress: config.escrowContractAddress,
    usdcAddress: config.usdcAddress,
    hasPrivateKey: Boolean(process.env.ARC_PRIVATE_KEY || process.env.PRIVATE_KEY),
    explorerUrl: config.chainId === 5042002 
      ? 'https://testnet.arcscan.app' 
      : 'https://arcscan.app',
    faucetUrl: 'https://faucet.circle.com',
  };
}
