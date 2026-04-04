import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { zValidator } from '@hono/zod-validator';
import {
  AuthChallengeRequestSchema,
  AuthVerifyRequestSchema,
} from 'intelligence-exchange-cannes-shared';
import { db } from '../db/client';
import { accounts, agentAuthorizations, worldVerifications } from '../db/schema';
import { createAuthChallenge, revokeSession, SESSION_COOKIE_NAME, verifyWebLogin } from '../services/authService';
import { getSessionAccountAddress } from '../services/accessService';
import { httpError } from '../services/errors';
import { eq } from 'drizzle-orm';

export const authRouter = new Hono();

authRouter.post('/challenge', zValidator('json', AuthChallengeRequestSchema), async (c) => {
  const req = c.req.valid('json');

  if (req.purpose !== 'web_login' && (!req.agentFingerprint || !req.jobId)) {
    throw httpError('worker challenges require agentFingerprint and jobId', 400, 'INVALID_CHALLENGE_REQUEST');
  }

  const challenge = await createAuthChallenge({
    accountAddress: req.accountAddress,
    purpose: req.purpose,
    metadata: {
      agentFingerprint: req.agentFingerprint,
      jobId: req.jobId,
    },
  });

  return c.json(challenge, 201);
});

authRouter.post('/verify', zValidator('json', AuthVerifyRequestSchema), async (c) => {
  const req = c.req.valid('json');
  const session = await verifyWebLogin(req);

  setCookie(c, SESSION_COOKIE_NAME, session.sessionId, {
    httpOnly: true,
    path: '/',
    sameSite: 'Lax',
    expires: new Date(session.expiresAt),
  });

  return c.json(session, 201);
});

authRouter.post('/logout', async (c) => {
  const sessionId = c.req.header('cookie')?.match(/iex_session=([^;]+)/)?.[1];
  if (sessionId) await revokeSession(sessionId);
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
  return c.json({ loggedOut: true });
});

authRouter.get('/me', async (c) => {
  const accountAddress = await getSessionAccountAddress(c);
  if (!accountAddress) {
    return c.json({ account: null, authorizations: [], worldVerifications: [] });
  }

  const [account] = await db.select().from(accounts).where(eq(accounts.accountAddress, accountAddress));
  const authorizations = await db.select().from(agentAuthorizations)
    .where(eq(agentAuthorizations.accountAddress, accountAddress));
  const verifications = await db.select().from(worldVerifications)
    .where(eq(worldVerifications.accountAddress, accountAddress));

  return c.json({
    account: account
      ? {
          accountAddress: account.accountAddress,
          activeSessionId: c.req.header('cookie')?.match(/iex_session=([^;]+)/)?.[1],
          worldRoles: verifications.map(v => v.role),
          createdAt: account.createdAt?.toISOString?.(),
          updatedAt: account.updatedAt?.toISOString?.(),
        }
      : null,
    authorizations,
    worldVerifications: verifications,
  });
});
