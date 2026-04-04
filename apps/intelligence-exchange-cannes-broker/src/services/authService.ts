import { randomBytes, randomUUID } from 'crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { ChallengePurpose } from 'intelligence-exchange-cannes-shared';
import { db } from '../db/client';
import { accounts, authChallenges, webSessions } from '../db/schema';
import { httpError } from './errors';
import { normalizeAccountAddress, verifyMessageSignature } from './identityService';

export const SESSION_COOKIE_NAME = 'iex_session';
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type ChallengeMetadata = {
  agentFingerprint?: string;
  jobId?: string;
};

function buildChallengeMessage(
  accountAddress: string,
  purpose: ChallengePurpose,
  nonce: string,
  expiresAt: Date,
  metadata?: ChallengeMetadata,
) {
  const lines = [
    'Intelligence Exchange Authentication',
    `Purpose: ${purpose}`,
    `Account: ${accountAddress}`,
    `Nonce: ${nonce}`,
    `Expires At: ${expiresAt.toISOString()}`,
  ];

  if (metadata?.jobId) lines.push(`Job ID: ${metadata.jobId}`);
  if (metadata?.agentFingerprint) lines.push(`Agent Fingerprint: ${metadata.agentFingerprint}`);

  return lines.join('\n');
}

export async function ensureAccount(accountAddress: string) {
  const normalized = normalizeAccountAddress(accountAddress);
  const [existing] = await db.select().from(accounts).where(eq(accounts.accountAddress, normalized));

  if (!existing) {
    await db.insert(accounts).values({
      accountAddress: normalized,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return normalized;
}

export async function createAuthChallenge(input: {
  accountAddress: string;
  purpose: ChallengePurpose;
  metadata?: ChallengeMetadata;
}) {
  const accountAddress = await ensureAccount(input.accountAddress);
  const challengeId = randomUUID();
  const nonce = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const message = buildChallengeMessage(accountAddress, input.purpose, nonce, expiresAt, input.metadata);

  await db.insert(authChallenges).values({
    challengeId,
    accountAddress,
    purpose: input.purpose,
    nonce,
    message,
    metadata: input.metadata ?? {},
    expiresAt,
    createdAt: new Date(),
  });

  return {
    challengeId,
    accountAddress,
    purpose: input.purpose,
    nonce,
    message,
    expiresAt: expiresAt.toISOString(),
  };
}

async function getActiveChallenge(challengeId: string) {
  const [challenge] = await db.select().from(authChallenges).where(eq(authChallenges.challengeId, challengeId));
  if (!challenge) throw httpError('Challenge not found', 404, 'CHALLENGE_NOT_FOUND');
  if (challenge.usedAt) throw httpError('Challenge already used', 409, 'CHALLENGE_USED');
  if (challenge.expiresAt < new Date()) throw httpError('Challenge expired', 409, 'CHALLENGE_EXPIRED');
  return challenge;
}

export async function consumeChallenge(input: {
  challengeId: string;
  accountAddress: string;
  signature: string;
  purpose: ChallengePurpose;
  metadata?: ChallengeMetadata;
}) {
  const challenge = await getActiveChallenge(input.challengeId);
  const normalized = normalizeAccountAddress(input.accountAddress);

  if (challenge.purpose !== input.purpose) {
    throw httpError(`Challenge purpose mismatch: expected ${input.purpose}`, 409, 'CHALLENGE_PURPOSE_MISMATCH');
  }

  if (challenge.accountAddress !== normalized) {
    throw httpError('Challenge account mismatch', 409, 'CHALLENGE_ACCOUNT_MISMATCH');
  }

  const challengeMetadata = (challenge.metadata ?? {}) as ChallengeMetadata;
  if (input.metadata?.jobId && challengeMetadata.jobId !== input.metadata.jobId) {
    throw httpError('Challenge job mismatch', 409, 'CHALLENGE_JOB_MISMATCH');
  }
  if (input.metadata?.agentFingerprint && challengeMetadata.agentFingerprint !== input.metadata.agentFingerprint) {
    throw httpError('Challenge agent mismatch', 409, 'CHALLENGE_AGENT_MISMATCH');
  }

  const valid = await verifyMessageSignature(challenge.message, input.signature, normalized);
  if (!valid) throw httpError('Invalid signature', 401, 'INVALID_SIGNATURE');

  await db.update(authChallenges)
    .set({ usedAt: new Date() })
    .where(eq(authChallenges.challengeId, challenge.challengeId));

  return challenge;
}

export async function verifyWebLogin(input: {
  challengeId: string;
  accountAddress: string;
  signature: string;
}) {
  const challenge = await consumeChallenge({
    challengeId: input.challengeId,
    accountAddress: input.accountAddress,
    signature: input.signature,
    purpose: 'web_login',
  });

  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(webSessions).values({
    sessionId,
    accountAddress: challenge.accountAddress,
    expiresAt,
    createdAt: new Date(),
  });

  return {
    sessionId,
    accountAddress: challenge.accountAddress,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function getActiveSession(sessionId?: string | null) {
  if (!sessionId) return null;

  const [session] = await db.select().from(webSessions).where(and(
    eq(webSessions.sessionId, sessionId),
    isNull(webSessions.revokedAt),
    gt(webSessions.expiresAt, new Date()),
  ));

  return session ?? null;
}

export async function revokeSession(sessionId: string) {
  await db.update(webSessions)
    .set({ revokedAt: new Date() })
    .where(eq(webSessions.sessionId, sessionId));
}
