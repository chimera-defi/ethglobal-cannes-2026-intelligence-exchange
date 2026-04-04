import { Hono, type Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { buildGroupedJobBoard, buildSkillMdResponse, getFlatJobs, getJobDetail } from './jobs';
import { getAgentKitStatus, requireAgentKitAccess } from '../services/agentkitService';

export const agentkitRouter = new Hono();

async function authorize(c: Context, endpoint: string) {
  return requireAgentKitAccess({
    header: c.req.header('agentkit'),
    resourceUri: c.req.url,
    endpoint,
  });
}

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
