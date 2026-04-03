import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { worldVerifications } from '../db/schema';
import type { WorldSubjectType, WorldVerifyRequest } from 'intelligence-exchange-cannes-shared';

function worldVerificationRequired() {
  return process.env.WORLD_ENFORCE_VERIFIED === '1';
}

export async function verifyWorldIdentity(request: WorldVerifyRequest) {
  const { subjectType, subjectId, walletAddress, worldIdProof } = request;
  const nullifierHash = worldIdProof.nullifierHash;

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
