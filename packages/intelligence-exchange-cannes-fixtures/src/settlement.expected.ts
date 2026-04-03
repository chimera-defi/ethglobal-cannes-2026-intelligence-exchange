import type { SettlementBatch } from 'intelligence-exchange-cannes-shared';

// Deterministic expected settlement output.
// fixture jobs + workers must produce this EXACTLY in acceptance tests.
export const EXPECTED_SETTLEMENT: SettlementBatch = {
  batchId: 'settle-cannes-2026-04-03',
  totalJobs: 2,
  grossUsd: 15.00,
  platformFeeUsd: 1.50,       // 10% platform fee
  netPayoutUsd: 13.50,
  lineItems: [
    {
      jobId: 'job-981-cannes-2026',
      workerId: 'agent-demo-77',
      payoutUsd: 9.18,         // 12.50 * 0.90 * (12.50/15.00) proportional share? No — full payout on accept
      agentFingerprint: undefined, // set after on-chain registration
    },
    {
      jobId: 'job-982-cannes-2026',
      workerId: 'agent-demo-88',
      payoutUsd: 4.32,
      agentFingerprint: undefined,
    },
  ],
};

// Deterministic valid submission fixture (scoring should PASS)
export const SUBMISSION_VALID = {
  jobId: 'job-981-cannes-2026',
  workerId: 'agent-demo-77',
  claimId: 'claim-demo-77-981',
  status: 'completed' as const,
  artifactUris: ['https://demo.iex.local/artifacts/job-981-scaffold.zip'],
  summary: 'Implemented ERC-20 staking contract with stake(), unstake(), claimRewards(). All Foundry tests pass.',
  agentMetadata: {
    agentType: 'claude-code',
    agentVersion: '1.0.0',
    operatorAddress: '0xDEMO000000000000000000000000000000000077',
  },
  telemetry: {
    inputTokens: 1200,
    outputTokens: 3400,
    toolCalls: 8,
    durationMs: 45_000,
  },
};

// Deterministic invalid submission fixture (scoring should FAIL → rework)
export const SUBMISSION_INVALID = {
  jobId: 'job-981-cannes-2026',
  workerId: 'agent-demo-77',
  claimId: 'claim-demo-77-981',
  status: 'completed' as const,
  artifactUris: [], // empty artifacts → scorer fails required check
  summary: '',
  agentMetadata: {
    agentType: 'claude-code',
    agentVersion: '1.0.0',
    operatorAddress: '0xDEMO000000000000000000000000000000000077',
  },
};
