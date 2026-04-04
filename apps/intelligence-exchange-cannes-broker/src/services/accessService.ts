import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { and, eq } from 'drizzle-orm';
import type { AccountRole, AgentRole } from 'intelligence-exchange-cannes-shared';
import { db } from '../db/client';
import { agentAuthorizations, worldVerifications } from '../db/schema';
import { httpError } from './errors';
import { getActiveSession, SESSION_COOKIE_NAME } from './authService';
import { normalizeAccountAddress } from './identityService';

export async function getSessionAccountAddress(c: Context) {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);
  const session = await getActiveSession(sessionId);
  return session?.accountAddress ?? null;
}

export async function requireSessionAccountAddress(c: Context) {
  const accountAddress = await getSessionAccountAddress(c);
  if (!accountAddress) throw httpError('Authenticated session required', 401, 'AUTH_REQUIRED');
  return accountAddress;
}

export async function requireWorldRole(accountAddress: string, role: AccountRole) {
  const normalized = normalizeAccountAddress(accountAddress);
  const [verification] = await db.select().from(worldVerifications).where(and(
    eq(worldVerifications.accountAddress, normalized),
    eq(worldVerifications.role, role),
  ));

  if (!verification) {
    throw httpError(`World verification required for role: ${role}`, 403, 'WORLD_VERIFICATION_REQUIRED');
  }

  return verification;
}

export async function requireSessionWorldRole(c: Context, role: AccountRole) {
  const accountAddress = await requireSessionAccountAddress(c);
  const verification = await requireWorldRole(accountAddress, role);
  return { accountAddress, verification };
}

export async function requireAgentAuthorization(input: {
  accountAddress: string;
  fingerprint: string;
  role: AgentRole;
  requiredPermissions: string[];
}) {
  const normalized = normalizeAccountAddress(input.accountAddress);
  const [authorization] = await db.select().from(agentAuthorizations).where(and(
    eq(agentAuthorizations.accountAddress, normalized),
    eq(agentAuthorizations.fingerprint, input.fingerprint),
    eq(agentAuthorizations.role, input.role),
    eq(agentAuthorizations.status, 'active'),
  ));

  if (!authorization) {
    throw httpError('Active agent authorization required', 403, 'AGENT_AUTHORIZATION_REQUIRED');
  }

  const permissionScope = Array.isArray(authorization.permissionScope)
    ? authorization.permissionScope as string[]
    : [];

  for (const permission of input.requiredPermissions) {
    if (!permissionScope.includes(permission)) {
      throw httpError(`Missing agent permission: ${permission}`, 403, 'AGENT_PERMISSION_MISSING');
    }
  }

  return authorization;
}
