import { Hono } from 'hono';
import { computeAIUIndex, getAIUHistory } from '../services/aiuService';

export const aiuRouter = new Hono();

/**
 * GET /v1/cannes/aiu/index
 *
 * Returns the current AIU (Accepted Intelligence Unit) index — the market-
 * discovered price of one unit of verified AI work output, computed from all
 * accepted job settlements in the broker ledger.
 *
 * Fields:
 *   aiuPriceIntel  — INTEL per accepted job (the index value)
 *   totalAcceptedJobs — all-time accepted job count
 *   totalIntelPaidOut — all-time INTEL paid to workers
 *   weeklyAcceptedJobs / weeklyIntelPaidOut — rolling 7-day window
 *   acceptanceRate — fraction of reviewed jobs accepted (0–1)
 */
aiuRouter.get('/index', async (c) => {
  const index = await computeAIUIndex();
  return c.json(index);
});

/**
 * GET /v1/cannes/aiu/history?days=30
 *
 * Returns time-series of AIU snapshots saved on each acceptance, up to `days`
 * days back (default 30). Use this to chart the price of intelligence over time.
 */
aiuRouter.get('/history', async (c) => {
  const daysParam = c.req.query('days');
  const days = daysParam ? Math.min(365, Math.max(1, Number.parseInt(daysParam, 10) || 30)) : 30;
  const history = await getAIUHistory(days);
  return c.json({ days, count: history.length, history });
});
