import type { AgentMetadata } from 'intelligence-exchange-cannes-shared';

// Canonical deterministic agent worker fixtures
export const SEED_WORKERS: Array<{
  workerId: string;
  capabilities: string[];
  score: number;
  agentMetadata: AgentMetadata;
}> = [
  {
    workerId: 'agent-demo-77',
    capabilities: ['coding', 'analysis'],
    score: 0.92,
    agentMetadata: {
      agentType: 'claude-code',
      agentVersion: '1.0.0',
      operatorAddress: '0xDEMO000000000000000000000000000000000077',
    },
  },
  {
    workerId: 'agent-demo-88',
    capabilities: ['analysis'],
    score: 0.87,
    agentMetadata: {
      agentType: 'codex',
      agentVersion: '1.0.0',
      operatorAddress: '0xDEMO000000000000000000000000000000000088',
    },
  },
];
