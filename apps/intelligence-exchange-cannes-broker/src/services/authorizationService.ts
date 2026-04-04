import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import type { AgentAuthorizationCreateRequest, AgentAuthorizationSyncRequest } from 'intelligence-exchange-cannes-shared';
import { db } from '../db/client';
import { agentAuthorizations, agentIdentities } from '../db/schema';
import { recordChainSync } from './chainService';
import { httpError } from './errors';
import { computeAgentFingerprint, hashPermissionScope, normalizeAccountAddress } from './identityService';
import { lookupAgentBookHuman } from './agentkitService';

export async function listAgentAuthorizations(accountAddress: string) {
  const normalized = normalizeAccountAddress(accountAddress);
  return db.select().from(agentAuthorizations)
    .where(eq(agentAuthorizations.accountAddress, normalized));
}

export async function createOrUpdateAgentAuthorization(accountAddress: string, input: AgentAuthorizationCreateRequest) {
  const normalized = normalizeAccountAddress(accountAddress);
  const agentVersion = input.agentVersion ?? '1.0.0';
  const fingerprint = computeAgentFingerprint(input.agentType, agentVersion, normalized);

  const [existing] = await db.select().from(agentAuthorizations).where(and(
    eq(agentAuthorizations.accountAddress, normalized),
    eq(agentAuthorizations.fingerprint, fingerprint),
    eq(agentAuthorizations.role, input.role),
  ));

  const now = new Date();
  if (existing) {
    await db.update(agentAuthorizations).set({
      permissionScope: input.permissionScope,
      updatedAt: now,
      status: existing.onChainTokenId ? 'active' : 'pending_registration',
      agentType: input.agentType,
      agentVersion,
    }).where(eq(agentAuthorizations.authorizationId, existing.authorizationId));

    return {
      ...existing,
      permissionScope: input.permissionScope,
      updatedAt: now.toISOString(),
      status: existing.onChainTokenId ? 'active' : 'pending_registration',
      agentType: input.agentType,
      agentVersion,
    };
  }

  const authorizationId = randomUUID();
  await db.insert(agentAuthorizations).values({
    authorizationId,
    accountAddress: normalized,
    fingerprint,
    agentType: input.agentType,
    agentVersion,
    role: input.role,
    permissionScope: input.permissionScope,
    status: 'pending_registration',
    createdAt: now,
    updatedAt: now,
  });

  return {
    authorizationId,
    accountAddress: normalized,
    fingerprint,
    agentType: input.agentType,
    agentVersion,
    role: input.role,
    permissionScope: input.permissionScope,
    status: 'pending_registration' as const,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export async function syncAgentRegistration(accountAddress: string, authorizationId: string, input: AgentAuthorizationSyncRequest) {
  const normalized = normalizeAccountAddress(accountAddress);
  const [authorization] = await db.select().from(agentAuthorizations).where(and(
    eq(agentAuthorizations.authorizationId, authorizationId),
    eq(agentAuthorizations.accountAddress, normalized),
  ));

  if (!authorization) throw httpError('Agent authorization not found', 404, 'AGENT_AUTHORIZATION_NOT_FOUND');

  const payloadFingerprint = typeof input.payload?.fingerprint === 'string' ? input.payload.fingerprint : null;
  if (payloadFingerprint && payloadFingerprint !== authorization.fingerprint) {
    throw httpError('Registration fingerprint does not match authorization fingerprint', 409, 'FINGERPRINT_MISMATCH');
  }

  await recordChainSync({
    ...input,
    eventType: 'agent_registered',
    subjectId: authorizationId,
    payload: {
      ...input.payload,
      authorizationId,
      fingerprint: authorization.fingerprint,
      accountAddress: normalized,
    },
  });

  const activatedAt = new Date();
  const agentbookHumanId = await lookupAgentBookHuman(normalized).catch(() => null);
  await db.update(agentAuthorizations).set({
    status: 'active',
    onChainTokenId: input.onChainTokenId,
    registrationTxHash: input.txHash,
    agentbookHumanId,
    agentbookRegisteredAt: agentbookHumanId ? activatedAt : null,
    updatedAt: activatedAt,
    activatedAt,
  }).where(eq(agentAuthorizations.authorizationId, authorizationId));

  const permissionsHash = hashPermissionScope(Array.isArray(authorization.permissionScope)
    ? authorization.permissionScope as string[]
    : []);

  const [existingIdentity] = await db.select().from(agentIdentities).where(eq(agentIdentities.fingerprint, authorization.fingerprint));
  if (existingIdentity) {
    await db.update(agentIdentities).set({
      accountAddress: normalized,
      agentType: authorization.agentType,
      agentVersion: authorization.agentVersion,
      role: authorization.role,
      permissionsHash,
      operatorAddress: normalized,
      onChainTokenId: input.onChainTokenId,
      registrationTxHash: input.txHash,
      agentbookHumanId,
      agentbookRegisteredAt: agentbookHumanId ? activatedAt : null,
      registeredAt: activatedAt,
    }).where(eq(agentIdentities.fingerprint, authorization.fingerprint));
  } else {
    await db.insert(agentIdentities).values({
      fingerprint: authorization.fingerprint,
      accountAddress: normalized,
      agentType: authorization.agentType,
      agentVersion: authorization.agentVersion,
      role: authorization.role,
      permissionsHash,
      operatorAddress: normalized,
      onChainTokenId: input.onChainTokenId,
      registrationTxHash: input.txHash,
      agentbookHumanId,
      agentbookRegisteredAt: agentbookHumanId ? activatedAt : null,
      acceptedCount: 0,
      avgScore: '0',
      registeredAt: activatedAt,
      createdAt: activatedAt,
    });
  }

  const [updated] = await db.select().from(agentAuthorizations).where(eq(agentAuthorizations.authorizationId, authorizationId));
  return updated!;
}
