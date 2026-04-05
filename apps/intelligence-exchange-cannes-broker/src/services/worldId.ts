import { createHmac, timingSafeEqual } from 'crypto';
import { signRequest } from '@worldcoin/idkit/signing';
import { getWorldConfig } from './sponsorConfig';

type VerificationRole = 'poster' | 'worker' | 'reviewer';

type WorldProofResponse = {
  identifier?: string;
  proof?: string;
  merkle_root?: string;
  nullifier?: string;
};

type WorldIdKitResult = {
  protocol_version?: string;
  action?: string;
  environment?: string;
  responses?: WorldProofResponse[];
};

export type WorldVerificationClaims = {
  action: string;
  nullifierHash: string;
  verificationLevel: string;
  role: VerificationRole;
  verifiedAt: string;
  expiresAt: string;
};

function getVerificationSecret() {
  const config = getWorldConfig();
  const secret = process.env.WORLD_VERIFICATION_SECRET ?? config.signingKey;
  if (!secret) {
    throw Object.assign(new Error('WORLD verification secret is not configured'), { status: 503 });
  }
  return secret;
}

function encodePayload(payload: WorldVerificationClaims) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function signPayload(encodedPayload: string) {
  return createHmac('sha256', getVerificationSecret()).update(encodedPayload).digest('base64url');
}

export function createWorldVerificationToken(payload: Omit<WorldVerificationClaims, 'verifiedAt' | 'expiresAt'>) {
  const claims: WorldVerificationClaims = {
    ...payload,
    verifiedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
  const encodedPayload = encodePayload(claims);
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function readWorldVerificationToken(token: string) {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    throw Object.assign(new Error('Malformed World verification token'), { status: 400 });
  }

  const expected = signPayload(encodedPayload);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    throw Object.assign(new Error('Invalid World verification token signature'), { status: 403 });
  }

  const claims = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as WorldVerificationClaims;
  if (Date.now() > new Date(claims.expiresAt).getTime()) {
    throw Object.assign(new Error('Expired World verification token'), { status: 403 });
  }

  return claims;
}

export function createRpSignature(action?: string) {
  const config = getWorldConfig();
  if (!config.signingKey || !config.action) {
    throw Object.assign(new Error('World ID RP signing key is not configured on the backend'), { status: 503 });
  }

  const { sig, nonce, createdAt, expiresAt } = signRequest(action ?? config.action, config.signingKey);
  return { sig, nonce, created_at: createdAt, expires_at: expiresAt };
}

export async function verifyWorldProof(idkitResponse: unknown, role: VerificationRole) {
  const config = getWorldConfig();
  if (!config.rpId || !config.action) {
    throw Object.assign(new Error('World ID rpId/action is not configured on the backend'), { status: 503 });
  }

  const response = await fetch(`https://developer.world.org/api/v4/verify/${config.rpId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(idkitResponse),
  });

  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw Object.assign(new Error(`World verification failed: ${JSON.stringify(payload)}`), {
      status: response.status,
      details: payload,
    });
  }

  const result = idkitResponse as WorldIdKitResult;
  const proof = result.responses?.[0];
  if (!proof?.nullifier || !proof.proof || !proof.merkle_root) {
    throw Object.assign(new Error('World verification completed without a usable proof payload'), { status: 422 });
  }

  const verificationToken = createWorldVerificationToken({
    action: result.action ?? config.action,
    nullifierHash: proof.nullifier,
    verificationLevel: proof.identifier ?? 'orb',
    role,
  });

  return {
    verificationToken,
    proof: {
      nullifierHash: proof.nullifier,
      proof: proof.proof,
      merkleRoot: proof.merkle_root,
      verificationLevel: proof.identifier ?? 'orb',
    },
    worldResult: payload,
  };
}
