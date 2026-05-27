# Broker Cleanup Report

**Date:** 2026-05-27  
**Scope:** `apps/intelligence-exchange-cannes-broker/src/`  
**Agent:** Kimi

---

## Summary

Lightweight cleanup pass on 5 key broker files. No logic refactored — only removed dead code, added missing error handling, fixed input validation gaps, and cleaned unused imports.

---

## Findings & Fixes

### 1. `src/routes/arc.ts`

| Issue | Location | Fix |
|---|---|---|
| Unused schema definition | Lines ~71–76 | Removed `ResolveDisputeSchema` (defined but never referenced by any route) |
| Missing body validation | `/tx/start-review` route | Added `StartReviewSchema` with `zValidator('json', StartReviewSchema)`; changed `c.req.json()` → `c.req.valid('json')` |
| Uncaught `JSON.parse` | Webhook handler | Wrapped `JSON.parse(rawBody)` in `try/catch`; returns 400 for invalid JSON |
| Unhandled DB errors in webhook | Webhook `switch` block | Wrapped entire event-processing `switch` in `try/catch`; returns 500 with error details if any DB operation fails |

### 2. `src/queue/milestoneQueue.ts`

| Issue | Location | Fix |
|---|---|---|
| Unused import | Top of file | Removed `inArray` from drizzle-orm import |
| Unhandled promise rejection | `setInterval` callback | Wrapped entire async interval body in `try/catch`; logs to `console.error` on failure so a single DB glitch does not crash the process |

**Noted (not fixed):** `console.log` inside the requeue loop is inconsistent with the structured `logJobEvent` call right above it. Left as-is to avoid introducing a logger dependency.

### 3. `src/services/tokenomicsService.ts`

| Issue | Location | Fix |
|---|---|---|
| Unused import | Top of file | Removed `and` from drizzle-orm import |

**Tokenomics split verification:**
- `protocolFeeBps` defaults to `1000` (TREASURY)
- `stakerYieldBps` is hard-coded to `900` (STAKER)
- `splitSettlementIntel` is called with these values; worker payout is the residual
- **81/9/10 split is correct** (8100 / 900 / 1000 bps)

**Noted (not fixed):** `staker_yield_pool` account identifier is hard-coded. Consider making it an env var if multiple pool accounts are expected in production.

### 4. `src/db/schema.ts`

No issues found. All imports are used; no dead code; no console logging.

### 5. `src/db/migrate.ts`

No issues found. Migration is idempotent, uses `.catch(() => undefined)` safely on optional ALTER statements, and append-only discipline is documented.

---

## Files Modified

- `apps/intelligence-exchange-cannes-broker/src/routes/arc.ts`
- `apps/intelligence-exchange-cannes-broker/src/queue/milestoneQueue.ts`
- `apps/intelligence-exchange-cannes-broker/src/services/tokenomicsService.ts`
- `docs/BROKER_CLEANUP_REPORT.md` (this file)

---

## Next Steps

1. Run broker test suite / TypeScript build to confirm no regressions.
2. Consider replacing the remaining `console.log` in `milestoneQueue.ts` with the structured logger used elsewhere.
3. Evaluate whether `staker_yield_pool` should become `process.env.STAKER_YIELD_POOL_ACCOUNT`.
