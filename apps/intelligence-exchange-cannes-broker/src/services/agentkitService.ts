import {
  AGENTKIT,
  type AgentBookVerifier,
  createAgentBookVerifier,
  parseAgentkitHeader,
  validateAgentkitMessage,
  verifyAgentkitSignature,
} from '@worldcoin/agentkit';
import { and, eq } from 'drizzle-orm';
import { db, sql } from '../db/client';
import { agentAuthorizations, agentIdentities, agentkitNonces } from '../db/schema';
import { httpError } from './errors';
import { normalizeAccountAddress } from './identityService';
import { getAgentKitConfig, getWorldChainConfig } from './sponsorConfig';
import { getIdentityGateRoleStatus } from './worldchainService';

type AgentKitAccessResult = {
  address: string;
  humanId: string;
  chainId: string;
};

let verifierOverride: AgentBookVerifier | null = null;
let cachedVerifier: AgentBookVerifier | null = null;

function getVerifier() {
  if (verifierOverride) return verifierOverride;
  if (cachedVerifier) return cachedVerifier;

  const config = getAgentKitConfig();
  cachedVerifier = createAgentBookVerifier({
    contractAddress: config.agentBookContractAddress as `0x${string}`,
    rpcUrl: config.rpcUrl,
  });
  return cachedVerifier;
}

export function setAgentBookVerifierForTests(verifier: AgentBookVerifier | null) {
  verifierOverride = verifier;
  cachedVerifier = null;
}

export async function lookupAgentBookHuman(address: string, chainId?: string) {
  const config = getAgentKitConfig();
  return getVerifier().lookupHuman(normalizeAccountAddress(address), chainId ?? config.chainId);
}

async function tryIncrementUsage(endpoint: string, humanId: string, limit: number) {
  const rows = await sql<[{ uses: number }?]>`
    INSERT INTO agentkit_usage_counters (endpoint, human_id, uses, updated_at)
    VALUES (${endpoint}, ${humanId}, 1, NOW())
    ON CONFLICT (endpoint, human_id)
    DO UPDATE SET
      uses = agentkit_usage_counters.uses + 1,
      updated_at = NOW()
    WHERE agentkit_usage_counters.uses < ${limit}
    RETURNING uses
  `;

  return rows.length > 0;
}

async function hasUsedNonce(nonce: string) {
  const [existing] = await db.select().from(agentkitNonces).where(eq(agentkitNonces.nonce, nonce));
  return Boolean(existing);
}

async function recordNonce(nonce: string) {
  await db.insert(agentkitNonces).values({ nonce }).onConflictDoNothing();
}

export async function requireAgentKitAccess(input: {
  header: string | undefined;
  resourceUri: string;
  endpoint: string;
}) {
  const config = getAgentKitConfig();
  if (!config.enabled) {
    throw httpError('Agent Kit access is disabled on this broker', 503, 'AGENTKIT_DISABLED');
  }
  if (!input.header) {
    throw httpError(`Missing ${AGENTKIT} header`, 401, 'AGENTKIT_HEADER_REQUIRED');
  }

  const payload = parseAgentkitHeader(input.header);
  const validation = await validateAgentkitMessage(payload, input.resourceUri, {
    checkNonce: async (nonce) => !(await hasUsedNonce(nonce)),
  });
  if (!validation.valid) {
    throw httpError(validation.error ?? 'Invalid Agent Kit payload', 401, 'AGENTKIT_INVALID');
  }

  const verification = await verifyAgentkitSignature(payload, config.rpcUrl);
  if (!verification.valid || !verification.address) {
    throw httpError(verification.error ?? 'Invalid Agent Kit signature', 401, 'AGENTKIT_INVALID_SIGNATURE');
  }

  await recordNonce(payload.nonce);

  const humanId = await lookupAgentBookHuman(verification.address, payload.chainId);
  if (!humanId) {
    throw httpError('Agent wallet is not registered in AgentBook', 403, 'AGENTKIT_NOT_REGISTERED');
  }

  if (config.accessMode === 'free-trial') {
    const granted = await tryIncrementUsage(input.endpoint, humanId, config.freeTrialUses);
    if (!granted) {
      throw httpError(
        `Agent Kit free trial exhausted for ${input.endpoint}. Re-register or rotate into paid access later.`,
        429,
        'AGENTKIT_TRIAL_EXHAUSTED',
      );
    }
  }

  return {
    address: normalizeAccountAddress(verification.address),
    humanId,
    chainId: payload.chainId,
  } satisfies AgentKitAccessResult;
}

export async function getAgentKitStatus(address: string, fingerprint?: string) {
  const normalizedAddress = normalizeAccountAddress(address);
  const config = getAgentKitConfig();
  const worldchain = getWorldChainConfig();
  const humanId = await lookupAgentBookHuman(normalizedAddress, config.chainId);

  const authorization = fingerprint
    ? (await db.select().from(agentAuthorizations).where(and(
        eq(agentAuthorizations.accountAddress, normalizedAddress),
        eq(agentAuthorizations.fingerprint, fingerprint),
      )))[0] ?? null
    : (await db.select().from(agentAuthorizations).where(eq(agentAuthorizations.accountAddress, normalizedAddress)))[0] ?? null;

  const identity = authorization
    ? (await db.select().from(agentIdentities).where(eq(agentIdentities.fingerprint, authorization.fingerprint)))[0] ?? null
    : null;
  const role = (authorization?.role === 'poster' || authorization?.role === 'reviewer')
    ? authorization.role
    : 'worker';
  const identityGate = await getIdentityGateRoleStatus(normalizedAddress, role);

  return {
    address: normalizedAddress,
    chainId: config.chainId,
    headerName: AGENTKIT,
    accessMode: config.accessMode,
    freeTrialUses: config.freeTrialUses,
    statement: config.statement,
    agentBookContractAddress: config.agentBookContractAddress,
    registered: Boolean(humanId),
    humanId,
    role,
    worldchain: {
      chainId: Number(config.chainId.split(':')[1] ?? worldchain.chainId),
      identityGateAddress: worldchain.identityGateAddress,
      agentRegistryAddress: worldchain.agentRegistryAddress,
      explorerBaseUrl: worldchain.explorerBaseUrl,
    },
    identityGate,
    authorization,
    identity,
    registrationCommand: `npx @worldcoin/agentkit-cli register ${normalizedAddress}`,
    helperSkillCommand: 'npx skills add worldcoin/agentkit agentkit-x402',
  };
}
