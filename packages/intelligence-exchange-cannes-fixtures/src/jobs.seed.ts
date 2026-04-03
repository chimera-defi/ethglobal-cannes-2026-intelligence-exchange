import type { JobCreateRequest } from 'intelligence-exchange-cannes-shared';

// Canonical deterministic job fixtures. IDs and timestamps are fixed.
export const SEED_JOBS: Array<JobCreateRequest & { _jobId: string; _createdAt: string }> = [
  {
    _jobId: 'job-981-cannes-2026',
    _createdAt: '2026-04-03T10:00:00.000Z',
    buyerId: 'buyer-demo-100',
    taskType: 'coding',
    title: 'Build a Solidity staking contract',
    prompt:
      'Write a Solidity contract that allows users to stake ERC-20 tokens and earn rewards at a fixed APY. Include: stake(), unstake(), claimRewards(). Use OpenZeppelin. Include NatSpec docs and a Foundry test suite.',
    budgetUsdMax: 12.50,
    slaMins: 45,
    qualityProfile: 'balanced',
  },
  {
    _jobId: 'job-982-cannes-2026',
    _createdAt: '2026-04-03T10:05:00.000Z',
    buyerId: 'buyer-demo-100',
    taskType: 'analysis',
    title: 'Security analysis of ERC-4337 bundler',
    prompt:
      'Perform a security analysis of a minimal ERC-4337 UserOperation bundler implementation. Identify reentrancy risks, gas griefing vectors, and front-running exposure. Provide a structured findings report with severity ratings.',
    budgetUsdMax: 7.50,
    slaMins: 30,
    qualityProfile: 'strict',
  },
];
