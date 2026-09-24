import { describe, expect, test } from 'bun:test';
import {
  JobStateSchema,
  MilestoneTypeSchema,
  TaskTypeSchema,
  QualityProfileSchema,
  TrustTierSchema,
  AccountRoleSchema,
  AgentRoleSchema,
  AuthorizationStatusSchema,
  ChallengePurposeSchema,
  ChainEventTypeSchema,
  ChainSyncStatusSchema,
  FundingStatusSchema,
  ScoreStatusSchema,
  CaseStateSchema,
  PermissionScopeSchema,
  WorldIdProofSchema,
  ErrorEnvelopeSchema,
  AgentIdentitySchema,
  SettlementBatchSchema,
} from '../src/schemas';

describe('JobStateSchema', () => {
  test.each(['created', 'queued', 'claimed', 'running', 'submitted', 'accepted',
             'rejected', 'expired', 'disputed', 'settled', 'rework'])(
    'accepts valid state %s', (state) => {
      expect(JobStateSchema.parse(state)).toBe(state);
    }
  );

  test('rejects invalid state', () => {
    expect(() => JobStateSchema.parse('unknown')).toThrow();
  });
});

describe('MilestoneTypeSchema', () => {
  test.each(['brief', 'tasks', 'scaffold', 'review'])('accepts %s', (v) => {
    expect(MilestoneTypeSchema.parse(v)).toBe(v);
  });
  test('rejects invalid', () => {
    expect(() => MilestoneTypeSchema.parse('deploy')).toThrow();
  });
});

describe('TaskTypeSchema', () => {
  test.each(['analysis', 'coding', 'research', 'summarization'])('accepts %s', (v) => {
    expect(TaskTypeSchema.parse(v)).toBe(v);
  });
  test('rejects invalid', () => {
    expect(() => TaskTypeSchema.parse('testing')).toThrow();
  });
});

describe('QualityProfileSchema', () => {
  test.each(['fast', 'balanced', 'strict'])('accepts %s', (v) => {
    expect(QualityProfileSchema.parse(v)).toBe(v);
  });
  test('rejects invalid', () => {
    expect(() => QualityProfileSchema.parse('premium')).toThrow();
  });
});

describe('TrustTierSchema', () => {
  test.each(['T0', 'T1', 'T2', 'T3'])('accepts %s', (v) => {
    expect(TrustTierSchema.parse(v)).toBe(v);
  });
  test('rejects T4', () => {
    expect(() => TrustTierSchema.parse('T4')).toThrow();
  });
});

describe('AccountRoleSchema', () => {
  test.each(['poster', 'worker', 'reviewer'])('accepts %s', (v) => {
    expect(AccountRoleSchema.parse(v)).toBe(v);
  });
  test('rejects admin', () => {
    expect(() => AccountRoleSchema.parse('admin')).toThrow();
  });
});

describe('AgentRoleSchema', () => {
  test('accepts poster and worker', () => {
    expect(AgentRoleSchema.parse('poster')).toBe('poster');
    expect(AgentRoleSchema.parse('worker')).toBe('worker');
  });
  test('rejects reviewer (not an agent role)', () => {
    expect(() => AgentRoleSchema.parse('reviewer')).toThrow();
  });
});

describe('AuthorizationStatusSchema', () => {
  test.each(['pending_registration', 'active', 'revoked'])('accepts %s', (v) => {
    expect(AuthorizationStatusSchema.parse(v)).toBe(v);
  });
  test('rejects suspended', () => {
    expect(() => AuthorizationStatusSchema.parse('suspended')).toThrow();
  });
});

describe('ChallengePurposeSchema', () => {
  test.each(['web_login', 'worker_claim', 'worker_submit', 'worker_unclaim'])('accepts %s', (v) => {
    expect(ChallengePurposeSchema.parse(v)).toBe(v);
  });
  test('rejects unknown purpose', () => {
    expect(() => ChallengePurposeSchema.parse('admin_login')).toThrow();
  });
});

describe('ChainSyncStatusSchema', () => {
  test.each(['pending', 'confirmed', 'failed'])('accepts %s', (v) => {
    expect(ChainSyncStatusSchema.parse(v)).toBe(v);
  });
  test('rejects processing', () => {
    expect(() => ChainSyncStatusSchema.parse('processing')).toThrow();
  });
});

describe('FundingStatusSchema', () => {
  test.each(['unfunded', 'funded', 'partially_funded', 'exhausted'])('accepts %s', (v) => {
    expect(FundingStatusSchema.parse(v)).toBe(v);
  });
  test('rejects overfunded', () => {
    expect(() => FundingStatusSchema.parse('overfunded')).toThrow();
  });
});

describe('ScoreStatusSchema', () => {
  test.each(['pending', 'passed', 'failed', 'rework'])('accepts %s', (v) => {
    expect(ScoreStatusSchema.parse(v)).toBe(v);
  });
  test('rejects skipped', () => {
    expect(() => ScoreStatusSchema.parse('skipped')).toThrow();
  });
});

describe('CaseStateSchema', () => {
  test.each(['open', 'triaged', 'investigating', 'resolved', 'closed'])('accepts %s', (v) => {
    expect(CaseStateSchema.parse(v)).toBe(v);
  });
  test('rejects pending', () => {
    expect(() => CaseStateSchema.parse('pending')).toThrow();
  });
});

describe('PermissionScopeSchema', () => {
  test('accepts non-empty array of non-empty strings', () => {
    expect(PermissionScopeSchema.parse(['read', 'write'])).toEqual(['read', 'write']);
  });
  test('rejects empty array', () => {
    expect(() => PermissionScopeSchema.parse([])).toThrow();
  });
  test('rejects array with empty string', () => {
    expect(() => PermissionScopeSchema.parse([''])).toThrow();
  });
});

describe('WorldIdProofSchema', () => {
  const valid = {
    nullifierHash: '0xabc',
    proof: '0xdef',
    merkleRoot: '0x123',
    verificationLevel: 'orb',
  };

  test('accepts a valid proof object', () => {
    expect(WorldIdProofSchema.parse(valid)).toEqual(valid);
  });

  test('rejects missing nullifierHash', () => {
    const { nullifierHash: _, ...rest } = valid;
    expect(() => WorldIdProofSchema.parse(rest)).toThrow();
  });

  test('rejects missing merkleRoot', () => {
    const { merkleRoot: _, ...rest } = valid;
    expect(() => WorldIdProofSchema.parse(rest)).toThrow();
  });
});

describe('ErrorEnvelopeSchema', () => {
  test('accepts valid error envelope', () => {
    const input = { error: { code: 'NOT_FOUND', message: 'Resource missing' } };
    expect(ErrorEnvelopeSchema.parse(input)).toMatchObject(input);
  });

  test('accepts error with optional details and requestId', () => {
    const input = {
      error: {
        code: 'BAD_REQUEST',
        message: 'Invalid input',
        details: { field: 'address' },
        requestId: 'req-001',
      },
    };
    expect(ErrorEnvelopeSchema.parse(input)).toMatchObject(input);
  });

  test('rejects envelope missing error.code', () => {
    expect(() => ErrorEnvelopeSchema.parse({ error: { message: 'oops' } })).toThrow();
  });
});

describe('AgentIdentitySchema', () => {
  test('accepts minimal valid identity', () => {
    const input = { fingerprint: '0xabc', agentType: 'worker-v1' };
    const result = AgentIdentitySchema.parse(input);
    expect(result.fingerprint).toBe('0xabc');
    expect(result.acceptedCount).toBe(0);
    expect(result.avgScore).toBe(0);
  });

  test('rejects avgScore above 100', () => {
    expect(() =>
      AgentIdentitySchema.parse({ fingerprint: 'f', agentType: 'a', avgScore: 101 })
    ).toThrow();
  });

  test('rejects negative avgScore', () => {
    expect(() =>
      AgentIdentitySchema.parse({ fingerprint: 'f', agentType: 'a', avgScore: -1 })
    ).toThrow();
  });
});

describe('ChainEventTypeSchema', () => {
  test.each([
    'idea_funded', 'milestone_reserved', 'milestone_released',
    'agent_registered', 'accepted_submission_attested',
  ])('accepts %s', (v) => {
    expect(ChainEventTypeSchema.parse(v)).toBe(v);
  });
  test('rejects unknown event', () => {
    expect(() => ChainEventTypeSchema.parse('token_transferred')).toThrow();
  });
});

describe('SettlementBatchSchema', () => {
  test('accepts a valid batch', () => {
    const batch = {
      batchId: 'batch-1',
      totalJobs: 2,
      grossUsd: 10.0,
      platformFeeUsd: 1.0,
      netPayoutUsd: 9.0,
      lineItems: [
        { jobId: 'j1', workerId: 'w1', payoutUsd: 4.5 },
        { jobId: 'j2', workerId: 'w2', payoutUsd: 4.5, agentFingerprint: '0xabc' },
      ],
    };
    expect(SettlementBatchSchema.parse(batch)).toMatchObject(batch);
  });

  test('rejects non-integer totalJobs', () => {
    const batch = {
      batchId: 'b', totalJobs: 1.5, grossUsd: 5, platformFeeUsd: 0.5,
      netPayoutUsd: 4.5, lineItems: [],
    };
    expect(() => SettlementBatchSchema.parse(batch)).toThrow();
  });
});
