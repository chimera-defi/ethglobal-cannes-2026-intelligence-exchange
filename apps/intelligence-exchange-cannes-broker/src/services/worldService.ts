import { and, eq } from 'drizzle-orm';
import type { AccountRole, WorldIdProof } from 'intelligence-exchange-cannes-shared';
import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { worldVerifications } from '../db/schema';
import { httpError } from './errors';
import { normalizeAccountAddress } from './identityService';

async function verifyWorldProofWithProvider(proof: WorldIdProof) {
  const verifyUrlTemplate = process.env.WORLD_VERIFY_URL;
  const worldAppId = process.env.WORLD_APP_ID;
  const worldAction = process.env.WORLD_ACTION;

  if (!verifyUrlTemplate || !worldAppId || !worldAction) {
    return true;
  }

  const verifyUrl = verifyUrlTemplate.replace('{app_id}', worldAppId);
  const res = await fetch(verifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nullifier_hash: proof.nullifierHash,
      merkle_root: proof.merkleRoot,
      proof: proof.proof,
      verification_level: proof.verificationLevel,
      action: worldAction,
    }),
  });

  if (!res.ok) {
    throw httpError(`World verification failed with HTTP ${res.status}`, 403, 'WORLD_VERIFICATION_FAILED');
  }

  return true;
}

export async function verifyWorldRoleProof(input: {
  accountAddress: string;
  role: AccountRole;
  proof: WorldIdProof;
}) {
  const accountAddress = normalizeAccountAddress(input.accountAddress);
  if (!input.proof.nullifierHash || !input.proof.proof || !input.proof.merkleRoot) {
    throw httpError('Incomplete World proof', 400, 'INVALID_WORLD_PROOF');
  }

  const [existingByNullifier] = await db.select().from(worldVerifications)
    .where(eq(worldVerifications.nullifierHash, input.proof.nullifierHash));
  if (existingByNullifier && existingByNullifier.accountAddress !== accountAddress) {
    throw httpError('World nullifier already used by a different account', 409, 'WORLD_NULLIFIER_CONFLICT');
  }

  await verifyWorldProofWithProvider(input.proof);

  const [existing] = await db.select().from(worldVerifications).where(and(
    eq(worldVerifications.accountAddress, accountAddress),
    eq(worldVerifications.role, input.role),
  ));

  if (existing) {
    await db.update(worldVerifications)
      .set({
        nullifierHash: input.proof.nullifierHash,
        verificationLevel: input.proof.verificationLevel,
        verifiedAt: new Date(),
      })
      .where(eq(worldVerifications.verificationId, existing.verificationId));

    return {
      ...existing,
      nullifierHash: input.proof.nullifierHash,
      verificationLevel: input.proof.verificationLevel,
      verifiedAt: new Date().toISOString(),
    };
  }

  const verificationId = randomUUID();
  const verifiedAt = new Date();
  await db.insert(worldVerifications).values({
    verificationId,
    accountAddress,
    role: input.role,
    nullifierHash: input.proof.nullifierHash,
    verificationLevel: input.proof.verificationLevel,
    verifiedAt,
    createdAt: verifiedAt,
  });

  return {
    verificationId,
    accountAddress,
    role: input.role,
    nullifierHash: input.proof.nullifierHash,
    verificationLevel: input.proof.verificationLevel,
    verifiedAt: verifiedAt.toISOString(),
  };
}

export async function getWorldStatus(accountAddress: string) {
  const normalized = normalizeAccountAddress(accountAddress);
  const verifications = await db.select().from(worldVerifications)
    .where(eq(worldVerifications.accountAddress, normalized));

  return {
    accountAddress: normalized,
    verifications,
  };
}
