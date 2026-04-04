import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { encodePacked, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sql } from '../../db/client';

type BrokerModule = typeof import('../../index');
type SessionClient = { cookie?: string };
type WalletAccount = ReturnType<typeof privateKeyToAccount>;

let broker: BrokerModule;

const POSTER = privateKeyToAccount('0x59c6995e998f97a5a0044976f5d6f5f45e26d4e9f8f6b0c27a8c34f6f14e4a71');
const WORKER = privateKeyToAccount('0x8b3a350cf5c34c9194ca3ab0d454ef1d511f3f840f2f2ad0f43fc9b4f7f9f1d2');
const REVIEWER = privateKeyToAccount('0x3c44cdddb6a900fa2b585dd299e03d12fa4293bcdf54f3cf0a1d7f44eabf0ab4');

const posterClient: SessionClient = {};
const workerClient: SessionClient = {};
const reviewerClient: SessionClient = {};

function txHash(seed: string) {
  return `0x${seed.padEnd(64, seed[0] ?? 'a').slice(0, 64)}`;
}

function computeAgentFingerprint(agentType: string, agentVersion: string, accountAddress: string) {
  return keccak256(encodePacked(
    ['string', 'string', 'address'],
    [agentType, agentVersion, accountAddress.toLowerCase() as `0x${string}`],
  ));
}

async function api<T = unknown>(
  client: SessionClient | undefined,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T; headers: Headers }> {
  const headers = new Headers();
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (client?.cookie) headers.set('Cookie', client.cookie);

  const res = await broker.app.fetch(new Request(`http://broker.local${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }));

  const setCookie = res.headers.get('set-cookie');
  if (client && setCookie) {
    client.cookie = setCookie.split(';')[0];
  }

  const data = await res.json() as T;
  return { status: res.status, data, headers: res.headers };
}

async function signIn(client: SessionClient, account: WalletAccount) {
  const challengeRes = await api<{
    challengeId: string;
    message: string;
  }>(undefined, 'POST', '/v1/cannes/auth/challenge', {
    accountAddress: account.address,
    purpose: 'web_login',
  });

  expect(challengeRes.status).toBe(201);

  const signature = await account.signMessage({ message: challengeRes.data.message });
  const verifyRes = await api<{
    sessionId: string;
    accountAddress: string;
  }>(client, 'POST', '/v1/cannes/auth/verify', {
    challengeId: challengeRes.data.challengeId,
    accountAddress: account.address,
    signature,
  });

  expect(verifyRes.status).toBe(201);
  expect(verifyRes.data.accountAddress).toBe(account.address.toLowerCase());
}

async function verifyWorld(client: SessionClient, role: 'poster' | 'worker' | 'reviewer', seed: string) {
  const res = await api<{
    verification: { role: string; nullifierHash: string };
  }>(client, 'POST', '/v1/cannes/world/verify', {
    role,
    proof: {
      nullifierHash: `nullifier-${role}-${seed}`,
      proof: `proof-${role}-${seed}`,
      merkleRoot: `root-${role}-${seed}`,
      verificationLevel: 'orb',
    },
  });

  expect(res.status).toBe(201);
  expect(res.data.verification.role).toBe(role);
}

async function createWorkerSignedAction(
  account: WalletAccount,
  purpose: 'worker_claim' | 'worker_submit',
  agentFingerprint: string,
  jobId: string,
) {
  const challengeRes = await api<{
    challengeId: string;
    message: string;
  }>(undefined, 'POST', '/v1/cannes/auth/challenge', {
    accountAddress: account.address,
    purpose,
    agentFingerprint,
    jobId,
  });

  expect(challengeRes.status).toBe(201);

  const signature = await account.signMessage({ message: challengeRes.data.message });
  return {
    accountAddress: account.address,
    agentFingerprint,
    challengeId: challengeRes.data.challengeId,
    signature,
  };
}

async function truncateAllTables() {
  await sql.unsafe(`
    TRUNCATE TABLE
      accepted_attestations,
      chain_events,
      chain_syncs,
      escrow_releases,
      agent_identities,
      agent_spend_events,
      submissions,
      claims,
      job_events,
      jobs,
      milestones,
      briefs,
      ideas,
      agent_authorizations,
      world_verifications,
      web_sessions,
      auth_challenges,
      accounts
    RESTART IDENTITY CASCADE
  `);
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DISABLE_LEASE_REQUEUE = '1';
  broker = await import('../../index');
  await broker.bootstrap();
  await truncateAllTables();
});

afterAll(async () => {
  await truncateAllTables();
  await sql.end({ timeout: 1 });
});

describe('spec-compliance acceptance', () => {
  test('enforces wallet login, World verification, agent authorization, chain sync, and human review', async () => {
    const anonymousCreate = await api<{ error?: { code: string } }>(undefined, 'POST', '/v1/cannes/ideas', {
      taskType: 'coding',
      title: 'Spec compliant build',
      prompt: 'Implement the milestone-based product flow with wallet and World verification.',
      budgetUsdMax: 15,
    });
    expect(anonymousCreate.status).toBe(401);
    expect(anonymousCreate.data.error?.code).toBe('AUTH_REQUIRED');

    await signIn(posterClient, POSTER);

    const unverifiedPosterCreate = await api<{ error?: { code: string } }>(posterClient, 'POST', '/v1/cannes/ideas', {
      taskType: 'coding',
      title: 'Spec compliant build',
      prompt: 'Implement the milestone-based product flow with wallet and World verification.',
      budgetUsdMax: 15,
    });
    expect(unverifiedPosterCreate.status).toBe(403);
    expect(unverifiedPosterCreate.data.error?.code).toBe('WORLD_VERIFICATION_REQUIRED');

    await verifyWorld(posterClient, 'poster', 'poster-1');

    const meRes = await api<{
      account: { accountAddress: string; worldRoles: string[] } | null;
      authorizations: unknown[];
      worldVerifications: Array<{ role: string }>;
    }>(posterClient, 'GET', '/v1/cannes/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.data.account?.accountAddress).toBe(POSTER.address.toLowerCase());
    expect(meRes.data.account?.worldRoles).toContain('poster');

    const createIdeaRes = await api<{ ideaId: string; fundingStatus: string; worldIdVerified: boolean }>(
      posterClient,
      'POST',
      '/v1/cannes/ideas',
      {
        taskType: 'coding',
        title: 'Spec compliant build',
        prompt: 'Implement the milestone-based product flow with wallet and World verification.',
        budgetUsdMax: 15,
      },
    );
    expect(createIdeaRes.status).toBe(201);
    expect(createIdeaRes.data.worldIdVerified).toBe(true);

    const ideaId = createIdeaRes.data.ideaId;

    const unfundedPlanRes = await api<{ error?: { code: string } }>(posterClient, 'POST', `/v1/cannes/ideas/${ideaId}/plan`);
    expect(unfundedPlanRes.status).toBe(409);
    expect(unfundedPlanRes.data.error?.code).toBe('IDEA_NOT_FUNDED');

    const fundRes = await api<{ fundingStatus: string }>(posterClient, 'POST', `/v1/cannes/ideas/${ideaId}/fund`, {
      txHash: txHash('1'),
      amountUsd: 15,
    });
    expect(fundRes.status).toBe(200);
    expect(fundRes.data.fundingStatus).toBe('funded');

    const planRes = await api<{ briefId: string; status: string }>(posterClient, 'POST', `/v1/cannes/ideas/${ideaId}/plan`);
    expect(planRes.status).toBe(200);

    const ideaStateAfterPlan = await api<{
      idea: { fundingStatus: string };
      jobs: Array<{ jobId: string; milestoneId: string; status: string; budgetUsd: string }>;
    }>(posterClient, 'GET', `/v1/cannes/ideas/${ideaId}`);
    expect(ideaStateAfterPlan.status).toBe(200);
    expect(ideaStateAfterPlan.data.idea.fundingStatus).toBe('funded');
    expect(ideaStateAfterPlan.data.jobs).toHaveLength(4);

    await signIn(workerClient, WORKER);

    const workerFingerprint = computeAgentFingerprint('claude-code', '1.0.0', WORKER.address);
    const firstJob = ideaStateAfterPlan.data.jobs[0];

    const unauthorizedClaimAction = await createWorkerSignedAction(WORKER, 'worker_claim', workerFingerprint, firstJob.jobId);
    const unverifiedWorkerClaim = await api<{ error?: { code: string } }>(undefined, 'POST', `/v1/cannes/jobs/${firstJob.jobId}/claim`, {
      signedAction: unauthorizedClaimAction,
    });
    expect(unverifiedWorkerClaim.status).toBe(403);
    expect(unverifiedWorkerClaim.data.error?.code).toBe('WORLD_VERIFICATION_REQUIRED');

    await verifyWorld(workerClient, 'worker', 'worker-1');

    const createAuthorizationRes = await api<{
      authorization: {
        authorizationId: string;
        fingerprint: string;
        status: string;
      };
    }>(workerClient, 'POST', '/v1/cannes/agents/authorizations', {
      agentType: 'claude-code',
      agentVersion: '1.0.0',
      role: 'worker',
      permissionScope: ['claim_jobs', 'submit_results'],
    });
    expect(createAuthorizationRes.status).toBe(201);
    expect(createAuthorizationRes.data.authorization.fingerprint).toBe(workerFingerprint);
    expect(createAuthorizationRes.data.authorization.status).toBe('pending_registration');

    const registerBeforeSync = await api<{ error?: { code: string } }>(workerClient, 'POST', '/v1/cannes/workers/register', {
      workerId: 'worker-wallet-operator',
      capabilities: ['coding', 'review'],
      agentMetadata: {
        agentType: 'claude-code',
        agentVersion: '1.0.0',
        operatorAddress: WORKER.address,
        fingerprint: workerFingerprint,
      },
    });
    expect(registerBeforeSync.status).toBe(403);
    expect(registerBeforeSync.data.error?.code).toBe('AGENT_AUTHORIZATION_REQUIRED');

    const claimBeforeReservationAction = await createWorkerSignedAction(WORKER, 'worker_claim', workerFingerprint, firstJob.jobId);
    const claimBeforeReservation = await api<{ error?: { code: string } }>(undefined, 'POST', `/v1/cannes/jobs/${firstJob.jobId}/claim`, {
      signedAction: claimBeforeReservationAction,
    });
    expect(claimBeforeReservation.status).toBe(403);
    expect(claimBeforeReservation.data.error?.code).toBe('AGENT_AUTHORIZATION_REQUIRED');

    const syncAuthorizationRes = await api<{
      authorization: {
        authorizationId: string;
        status: string;
        onChainTokenId: number;
        registrationTxHash: string;
      };
    }>(
      workerClient,
      'POST',
      `/v1/cannes/agents/authorizations/${createAuthorizationRes.data.authorization.authorizationId}/sync-registration`,
      {
        txHash: txHash('2'),
        contractAddress: '0x0000000000000000000000000000000000008004',
        blockNumber: 12,
        payload: { fingerprint: workerFingerprint },
        status: 'confirmed',
        onChainTokenId: 8004,
      },
    );
    expect(syncAuthorizationRes.status).toBe(200);
    expect(syncAuthorizationRes.data.authorization.status).toBe('active');
    expect(syncAuthorizationRes.data.authorization.onChainTokenId).toBe(8004);

    const workerRegisterRes = await api<{
      registered: boolean;
      fingerprint: string;
      accountAddress: string;
    }>(workerClient, 'POST', '/v1/cannes/workers/register', {
      workerId: 'worker-wallet-operator',
      capabilities: ['coding', 'review'],
      agentMetadata: {
        agentType: 'claude-code',
        agentVersion: '1.0.0',
        operatorAddress: WORKER.address,
        fingerprint: workerFingerprint,
      },
    });
    expect(workerRegisterRes.status).toBe(201);
    expect(workerRegisterRes.data.registered).toBe(true);
    expect(workerRegisterRes.data.fingerprint).toBe(workerFingerprint);

    const claimBeforeQueueAction = await createWorkerSignedAction(WORKER, 'worker_claim', workerFingerprint, firstJob.jobId);
    const claimBeforeQueue = await api<{ error?: { code: string } }>(undefined, 'POST', `/v1/cannes/jobs/${firstJob.jobId}/claim`, {
      signedAction: claimBeforeQueueAction,
    });
    expect(claimBeforeQueue.status).toBe(409);
    expect(claimBeforeQueue.data.error?.code).toBe('JOB_NOT_CLAIMABLE');

    const queueRes = await api<{ sync: { eventType: string } }>(posterClient, 'POST', '/v1/cannes/chain/sync', {
      eventType: 'milestone_reserved',
      txHash: txHash('3'),
      subjectId: ideaId,
      payload: { jobIds: ideaStateAfterPlan.data.jobs.map((job) => job.jobId) },
      status: 'confirmed',
    });
    expect(queueRes.status).toBe(200);
    expect(queueRes.data.sync.eventType).toBe('milestone_reserved');

    const queuedIdeaState = await api<{
      jobs: Array<{ jobId: string; milestoneId: string; status: string; budgetUsd: string }>;
    }>(posterClient, 'GET', `/v1/cannes/ideas/${ideaId}`);
    expect(queuedIdeaState.data.jobs.every((job) => job.status === 'queued')).toBe(true);

    const claimAction = await createWorkerSignedAction(WORKER, 'worker_claim', workerFingerprint, firstJob.jobId);
    const claimRes = await api<{
      claimId: string;
      expiresAt: string;
      skillMdUrl: string;
    }>(undefined, 'POST', `/v1/cannes/jobs/${firstJob.jobId}/claim`, {
      signedAction: claimAction,
    });
    expect(claimRes.status).toBe(200);
    expect(claimRes.data.claimId).toBeTruthy();

    const submitAction = await createWorkerSignedAction(WORKER, 'worker_submit', workerFingerprint, firstJob.jobId);
    const submitRes = await api<{
      submissionId: string;
      scoreBreakdown: { scoreStatus: string; totalScore: number };
    }>(undefined, 'POST', `/v1/cannes/jobs/${firstJob.jobId}/submit`, {
      signedAction: submitAction,
      claimId: claimRes.data.claimId,
      status: 'completed',
      artifactUris: ['https://example.com/agent-output.zip'],
      summary: 'Delivered the milestone with concrete artifacts, implementation notes, and a reviewable output that satisfies the acceptance criteria.',
      traceUri: 'https://example.com/trace.json',
    });
    expect(submitRes.status).toBe(200);
    expect(submitRes.data.scoreBreakdown.scoreStatus).toBe('passed');

    await signIn(reviewerClient, REVIEWER);

    const unverifiedReviewerAccept = await api<{ error?: { code: string } }>(reviewerClient, 'POST', `/v1/cannes/ideas/${ideaId}/accept`, {
      jobId: firstJob.jobId,
    });
    expect(unverifiedReviewerAccept.status).toBe(403);
    expect(unverifiedReviewerAccept.data.error?.code).toBe('WORLD_VERIFICATION_REQUIRED');

    await verifyWorld(reviewerClient, 'reviewer', 'reviewer-1');

    const reputationBeforeAttestation = await api<{
      acceptedCount: number;
      avgScore: string;
      onChainTokenId: number;
    }>(workerClient, 'GET', `/v1/cannes/workers/${workerFingerprint}/reputation`);
    expect(reputationBeforeAttestation.status).toBe(200);
    expect(reputationBeforeAttestation.data.acceptedCount).toBe(0);
    expect(reputationBeforeAttestation.data.onChainTokenId).toBe(8004);

    const acceptRes = await api<{
      accepted: boolean;
      attestation: {
        jobId: string;
        jobIdHash: string;
        agentFingerprint: string;
        score: number;
        reviewerAddress: string;
        payoutReleased: boolean;
        signature: string;
        chainId: number;
        registryAddress: string;
      };
    }>(reviewerClient, 'POST', `/v1/cannes/ideas/${ideaId}/accept`, {
      jobId: firstJob.jobId,
    });
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.data.accepted).toBe(true);
    expect(acceptRes.data.attestation.agentFingerprint).toBe(workerFingerprint);
    expect(acceptRes.data.attestation.payoutReleased).toBe(false);
    expect(acceptRes.data.attestation.signature).toMatch(/^0x[a-f0-9]+$/);

    const jobAfterAccept = await api<{ job: { status: string } }>(posterClient, 'GET', `/v1/cannes/jobs/${firstJob.jobId}`);
    expect(jobAfterAccept.status).toBe(200);
    expect(jobAfterAccept.data.job.status).toBe('accepted');

    const releaseRes = await api<{ sync: { eventType: string } }>(posterClient, 'POST', '/v1/cannes/chain/sync', {
      eventType: 'milestone_released',
      txHash: txHash('4'),
      subjectId: ideaId,
      payload: {
        jobId: firstJob.jobId,
        milestoneId: firstJob.milestoneId,
        payee: WORKER.address,
        amountUsd: Number(firstJob.budgetUsd),
      },
      status: 'confirmed',
    });
    expect(releaseRes.status).toBe(200);

    const jobAfterRelease = await api<{ job: { status: string } }>(posterClient, 'GET', `/v1/cannes/jobs/${firstJob.jobId}`);
    expect(jobAfterRelease.status).toBe(200);
    expect(jobAfterRelease.data.job.status).toBe('settled');

    const attestationSyncRes = await api<{ sync: { eventType: string } }>(reviewerClient, 'POST', '/v1/cannes/chain/sync', {
      eventType: 'accepted_submission_attested',
      txHash: txHash('5'),
      subjectId: firstJob.jobId,
      payload: acceptRes.data.attestation,
      status: 'confirmed',
    });
    expect(attestationSyncRes.status).toBe(200);
    expect(attestationSyncRes.data.sync.eventType).toBe('accepted_submission_attested');

    const reputationAfterAttestation = await api<{
      acceptedCount: number;
      avgScore: string;
      onChainTokenId: number;
    }>(workerClient, 'GET', `/v1/cannes/workers/${workerFingerprint}/reputation`);
    expect(reputationAfterAttestation.status).toBe(200);
    expect(reputationAfterAttestation.data.acceptedCount).toBe(1);
    expect(Number(reputationAfterAttestation.data.avgScore)).toBeGreaterThan(0);
    expect(reputationAfterAttestation.data.onChainTokenId).toBe(8004);
  });
});
