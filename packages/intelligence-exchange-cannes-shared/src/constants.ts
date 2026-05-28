// Platform fee rate (10%)
export const PLATFORM_FEE_RATE = 0.10;

// Default lease duration in milliseconds (45 minutes)
export const DEFAULT_LEASE_DURATION_MS = 45 * 60 * 1000;

// BullMQ stalled job check interval (10 seconds for demo responsiveness)
export const STALLED_JOB_INTERVAL_MS = 10_000;

// Minimum job floor price per task type (USD)
export const FLOOR_PRICE_USD: Record<string, number> = {
  coding: 5.00,
  analysis: 3.00,
  research: 3.00,
  summarization: 1.00,
};

// 0G dossier max artifact size (10 MB)
export const DOSSIER_MAX_SIZE_BYTES = 10 * 1024 * 1024;

// Milestone order for generated briefs
export const MILESTONE_ORDER = ['brief', 'tasks', 'scaffold', 'review'] as const;

// Demo seed IDs (deterministic)
export const DEMO_IDEA_ID = 'idea-demo-cannes-2026';
export const DEMO_BUYER_ID = 'buyer-demo-100';
export const DEMO_WORKER_ID = 'agent-demo-77';
export const DEMO_BRIEF_ID = 'brief-demo-cannes-2026';

// Supported chain IDs
export const CHAIN_IDS = {
  ETHEREUM_MAINNET: 1,
  BASE_MAINNET: 8453,
  SEPOLIA: 11155111,
  BASE_SEPOLIA: 84532,
} as const;

export const LOCAL_CHAIN_ID = 31337; // Anvil

// Optional: Arc chain constants (future integration)
// export const ARC_CHAIN_ID = 60808; // Arc mainnet (chain ID 60808)
