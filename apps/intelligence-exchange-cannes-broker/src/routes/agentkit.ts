import { isAddress } from 'viem';
import { Hono, type Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { spawn } from 'child_process';
import { buildGroupedJobBoard, buildSkillMdResponse, getFlatJobs, getJobDetail } from './jobs';
import { getAgentKitStatus, lookupAgentBookHuman, requireAgentKitAccess } from '../services/agentkitService';
import { getSessionAccountAddress } from '../services/accessService';

export const agentkitRouter = new Hono();

async function authorize(c: Context, endpoint: string) {
  return requireAgentKitAccess({
    header: c.req.header('agentkit'),
    resourceUri: c.req.url,
    endpoint,
  });
}

// POST /agentkit/register-agentbook
// Runs the World AgentKit CLI registration for the authenticated wallet.
// This is a convenience wrapper so users don't need the CLI installed locally.
agentkitRouter.post('/register-agentbook', zValidator('json', z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
})), async (c) => {
  const accountAddress = await getSessionAccountAddress(c);
  if (!accountAddress) {
    return c.json({ error: { code: 'AUTH_REQUIRED', message: 'Authenticated session required' } }, 401);
  }

  const { address } = c.req.valid('json');
  if (!isAddress(address, { strict: true })) {
    return c.json({ error: { code: 'INVALID_ADDRESS', message: 'Address is not a valid checksummed Ethereum address' } }, 400);
  }

  if (accountAddress.toLowerCase() !== address.toLowerCase()) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Address does not match session' } }, 403);
  }

  // Check if already registered
  const humanId = await lookupAgentBookHuman(address);
  if (humanId) {
    return c.json({ alreadyRegistered: true, humanId, message: 'Address is already registered in AgentBook' });
  }

  // Run the CLI registration asynchronously to avoid blocking the event loop
  const bunBin = process.env.BUN_INSTALL
    ? `${process.env.BUN_INSTALL}/bin/bun`
    : '/root/.bun/bin/bun';
  const child = spawn(bunBin, ['x', '@worldcoin/agentkit-cli', 'register', address], {
    timeout: 60_000,
    env: { ...process.env, PATH: `/root/.bun/bin:${process.env.PATH ?? ''}` },
  });

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (data) => { stdout += String(data); });
  child.stderr?.on('data', (data) => { stderr += String(data); });

  const exitCode = await new Promise<number | null>((resolve) => {
    child.on('close', (code) => resolve(code));
    child.on('error', () => resolve(null));
  });

  const output = (stdout + stderr).trim();
  if (exitCode !== 0) {
    return c.json({ error: { code: 'CLI_ERROR', message: output || 'AgentKit CLI exited with error', exitCode } }, 500);
  }

  // Re-check registration after CLI run
  const newHumanId = await lookupAgentBookHuman(address);
  return c.json({ alreadyRegistered: false, humanId: newHumanId, output, success: Boolean(newHumanId) });
});

agentkitRouter.get('/status', zValidator('query', z.object({
  address: z.string(),
  fingerprint: z.string().optional(),
})), async (c) => {
  const { address, fingerprint } = c.req.valid('query');
  return c.json(await getAgentKitStatus(address, fingerprint));
});

agentkitRouter.get('/jobs', zValidator('query', z.object({
  status: z.string().optional(),
  view: z.enum(['flat', 'grouped']).optional(),
})), async (c) => {
  try {
    await authorize(c, 'agentkit:list');
    const { status, view } = c.req.valid('query');
    const statusFilter = status ?? 'queued';
    if (view === 'flat') {
      return c.json(await getFlatJobs(statusFilter));
    }
    return c.json(await buildGroupedJobBoard(statusFilter));
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const code = (err as { code?: string }).code ?? 'AGENTKIT_ACCESS_FAILED';
    return c.json({ error: { code, message: String(err) } }, status as 401 | 403 | 429 | 500 | 503);
  }
});

agentkitRouter.get('/jobs/:jobId', async (c) => {
  try {
    await authorize(c, 'agentkit:detail');
    const detail = await getJobDetail(c.req.param('jobId'));
    if (!detail) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Job not found' } }, 404);
    }
    return c.json(detail);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const code = (err as { code?: string }).code ?? 'AGENTKIT_ACCESS_FAILED';
    return c.json({ error: { code, message: String(err) } }, status as 401 | 403 | 429 | 500 | 503);
  }
});

agentkitRouter.get('/jobs/:jobId/skill.md', async (c) => {
  try {
    await authorize(c, 'agentkit:skill');
    const result = await buildSkillMdResponse(c.req.param('jobId'));
    if ('error' in result) {
      return c.json({ error: result.error }, result.status);
    }
    return result.response;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const code = (err as { code?: string }).code ?? 'AGENTKIT_ACCESS_FAILED';
    return c.json({ error: { code, message: String(err) } }, status as 401 | 403 | 429 | 500 | 503);
  }
});
