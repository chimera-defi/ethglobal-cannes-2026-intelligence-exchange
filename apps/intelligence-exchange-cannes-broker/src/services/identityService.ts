import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { worldVerifications } from '../db/schema';
import type { WorldSubjectType, WorldVerifyRequest } from 'intelligence-exchange-cannes-shared';
import { verifyCloudProof, type IVerifyResponse } from '@worldcoin/idkit-core/backend';
import type { VerificationLevel } from '@worldcoin/idkit-core';

function worldVerificationRequired() {
  return process.env.WORLD_ENFORCE_VERIFIED === '1';
}

async function verifyCloudProofIfConfigured(request: WorldVerifyRequest) {
  const appId = process.env.WORLD_APP_ID;
  const actionId = process.env.WORLD_ACTION_ID;

  if (!appId || !actionId) {
    return { success: true, mode: 'demo-fallback' as const };
  }

  const response = await verifyCloudProof(
    {
      merkle_root: request.worldIdProof.merkleRoot,
      nullifier_hash: request.worldIdProof.nullifierHash,
      proof: request.worldIdProof.proof,
      verification_level: request.worldIdProof.verificationLevel as VerificationLevel,
    },
    appId as `app_${string}`,
    actionId,
  ) as IVerifyResponse;

  if (!response.success) {
    throw Object.assign(new Error(response.detail ?? response.code ?? 'World verification failed'), {
      status: 400,
      code: 'WORLD_VERIFY_FAILED',
    });
  }

  return { success: true, mode: 'cloud-verified' as const };
}

export async function verifyWorldIdentity(request: WorldVerifyRequest) {
  const { subjectType, subjectId, walletAddress, worldIdProof } = request;
  const nullifierHash = worldIdProof.nullifierHash;
  const verification = await verifyCloudProofIfConfigured(request);

  const [existing] = await db.select()
    .from(worldVerifications)
    .where(eq(worldVerifications.nullifierHash, nullifierHash));

  if (!existing) {
    await db.insert(worldVerifications).values({
      verificationId: randomUUID(),
      subjectType,
      subjectId,
      walletAddress: walletAddress ?? null,
      nullifierHash,
      verificationLevel: worldIdProof.verificationLevel ?? null,
      provider: 'world',
      createdAt: new Date(),
    });
  }

  return {
    subjectType,
    subjectId,
    walletAddress: walletAddress ?? null,
    nullifierHash,
    verificationLevel: worldIdProof.verificationLevel,
    verified: true,
    enforced: worldVerificationRequired(),
    mode: verification.mode,
  };
}

export async function getWorldVerificationStatus(subjectType: WorldSubjectType, subjectId: string) {
  const [verification] = await db.select()
    .from(worldVerifications)
    .where(and(
      eq(worldVerifications.subjectType, subjectType),
      eq(worldVerifications.subjectId, subjectId),
    ));

  return {
    subjectType,
    subjectId,
    verified: Boolean(verification),
    walletAddress: verification?.walletAddress ?? null,
    nullifierHash: verification?.nullifierHash ?? null,
    verificationLevel: verification?.verificationLevel ?? null,
    enforced: worldVerificationRequired(),
    mode: process.env.WORLD_APP_ID && process.env.WORLD_ACTION_ID ? 'cloud-verified' : 'demo-fallback',
  };
}

export async function assertWorldVerified(subjectType: WorldSubjectType, subjectId: string) {
  if (!worldVerificationRequired()) return;

  const status = await getWorldVerificationStatus(subjectType, subjectId);
  if (!status.verified) {
    throw Object.assign(new Error(`${subjectType} ${subjectId} must complete World verification first`), {
      status: 403,
      code: 'WORLD_VERIFICATION_REQUIRED',
    });
  }
}
