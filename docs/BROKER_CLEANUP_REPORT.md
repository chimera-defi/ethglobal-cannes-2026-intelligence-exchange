# Broker Cleanup Report

**Date:** 2026-05-27
**Scope:** `apps/intelligence-exchange-cannes-broker/src/`
**Agents:** Kimi (pass 1) → claude-sonnet-4-6 (pass 2)

---

## Summary

Two-pass cleanup on 5 key broker files. No logic was refactored — only dead code removed, missing error handling added, input validation gaps fixed, and type safety improved.

---

## Findings & Fixes

### `src/routes/arc.ts`

| Issue | Fix |
|---|---|
| `ResolveDisputeSchema` defined but no route used it | Removed (pass 1 / Kimi) |
| `/tx/start-review` accepted unvalidated raw JSON body | Added `StartReviewSchema` + `zValidator`; switched to `c.req.valid('json')` (pass 1) |
| `JSON.parse(rawBody)` in webhook was uncaught on invalid input | Wrapped in `try/catch`; returns HTTP 400 (pass 1) |
| Webhook DB operations had no error handling | Wrapped event-processing `switch` in `try/catch`; returns HTTP 500 with details (pass 1) |
| `MilestoneStatus` imported but never referenced | Removed unused import (pass 2) |
| `getIntegrationStatus` imported and called in `/config` route but return value discarded | Removed import and dead call (pass 2) |
| Webhook payload destructured as `unknown` spread; fields passed to DB calls without type narrowing | Extracted `eventType`, `txHash`, `milestoneId`, `ideaId`, `workerAddress`, `amountUsd` with explicit `String()` coercion before any DB use (pass 2) |

### `src/queue/milestoneQueue.ts`

| Issue | Fix |
|---|---|
| `inArray` imported but unused | Removed (pass 1) |
| Unhandled promise rejection in `setInterval` callback | Wrapped entire async body in `try/catch`; logs to `console.error` on failure (pass 1) |

### `src/services/tokenomicsService.ts`

| Issue | Fix |
|---|---|
| `and` imported from drizzle-orm but unused | Removed (pass 1) |

**Tokenomics split verification (81/9/10):**
- `protocolFeeBps` defaults to `1000` (treasury, configurable via `TOKEN_PROTOCOL_FEE_BPS`)
- `stakerYieldBps` hard-coded to `900` in the `splitSettlementIntel` call
- Worker payout is computed as **residual** (`gross - protocolFee - stakerYield`) — avoids float accumulation
- Split is correct: 8100 / 900 / 1000 bps = 81% / 9% / 10%

### `src/index.ts`

| Issue | Fix |
|---|---|
| Startup log used hardcoded literal `10` for interval seconds | Replaced with `STALLED_JOB_INTERVAL_MS / 1000` (imported from shared package) so it tracks the actual constant (pass 2) |

### `src/db/schema.ts`

No issues found. All imports used; no dead code.

### `src/db/migrate.ts`

No issues found. Migration is idempotent, `.catch(() => undefined)` used correctly on optional ALTER statements, append-only discipline documented.

---

## Files Modified

- `apps/intelligence-exchange-cannes-broker/src/routes/arc.ts`
- `apps/intelligence-exchange-cannes-broker/src/queue/milestoneQueue.ts`
- `apps/intelligence-exchange-cannes-broker/src/services/tokenomicsService.ts`
- `apps/intelligence-exchange-cannes-broker/src/index.ts`
- `docs/BROKER_CLEANUP_REPORT.md` (this file)

---

## Future Work

1. `stakerYieldBps: 900` in `tokenomicsService.ts` is hard-coded — consider exposing via `TOKEN_STAKER_YIELD_BPS` env var alongside `TOKEN_PROTOCOL_FEE_BPS`.
2. `staker_yield_pool` account identifier is a hard-coded string — consider making it a named constant or env var.
3. Webhook handler lacks a Zod schema for the full event payload — Zod validation would replace the manual `String()` coercions.
4. The `autoRelease=true` path in `/tx/release-milestone` bypasses caller authorization without verifying the on-chain auto-release condition. Consider adding a guard or removing the bypass.
