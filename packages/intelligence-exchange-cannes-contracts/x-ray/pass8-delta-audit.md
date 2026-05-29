# Pass 8 — Delta Security Audit (2026-05-29)

**Auditor:** claude-sonnet-4-6 + devin-delegate (parallel)
**Scope:** Smart contracts (last 5 commits) + broker E2E flow + tokenomics settlement
**Methodology:** Devin sub-agent adversarial pass with FP-filtering; CSO Phase 9–10 STRIDE

---

## Summary

No new CRITICAL or HIGH findings. Settlement split gap is **resolved** (stale memory). Two MEDIUM findings in broker layer. Pass7 baseline holds.

---

## Resolved (was open in memory)

**Settlement split gap** — Previously documented as 90/10 split. **RESOLVED.** `tokenomicsService.ts:245` uses `stakerYieldBps: 900` for correct 81/9/10 split. On-chain path via `depositStakerYield()` → `IntelStaking.depositYield()` is wired in `chainService.ts:470`. Confirmed by two independent Devin agents.

---

## CRITICAL

None.

---

## HIGH

None.

---

## MEDIUM

**P8-A1 — MEDIUM: Webhook signature bypass when `ARC_WEBHOOK_SECRET` unset**

**File:** `apps/intelligence-exchange-cannes-broker/src/routes/arc.ts:593`
**Confidence:** 9/10 — VERIFIED

The webhook handler at `/v1/cannes/arc/webhook/escrow-event` wraps signature validation in `if (ARC_WEBHOOK_SECRET)`. If the env var is empty/unset, any caller can POST arbitrary escrow events that update database state without authentication.

```typescript
const ARC_WEBHOOK_SECRET = process.env.ARC_WEBHOOK_SECRET ?? '';
if (ARC_WEBHOOK_SECRET) {  // ← entire verification skipped when unset
  // ...signature check...
}
```

**Impact:** Attacker posts fake `release` event → broker credits worker without real on-chain payment.

**Fix — fail closed:**
```typescript
const ARC_WEBHOOK_SECRET = process.env.ARC_WEBHOOK_SECRET;
if (!ARC_WEBHOOK_SECRET) {
  return c.json({ error: 'Webhook endpoint not configured' }, 503);
}
```

---

**P8-A2 — MEDIUM: X-Forwarded-For trusted directly — rate limit bypassable**

**File:** `apps/intelligence-exchange-cannes-broker/src/middleware/rateLimit.ts:29`
**Confidence:** 8/10 — VERIFIED

The global rate limiter trusts the first value of `X-Forwarded-For` without proxy validation. An attacker can forge this header and bypass the 60/min rate limit.

```typescript
const forwarded = c.req.header('x-forwarded-for');
if (forwarded) return forwarded.split(',')[0].trim(); // trusts any caller
```

**Fix:** Only read XFF from a trusted proxy IP, or enforce rate limiting at Caddy level (Caddyfile already has notes for this).

---

## LOW

**P8-A3 — LOW: CI `oven-sh/setup-bun` uses 7-char short SHA**

**File:** `.github/workflows/ci.yml`
**Confidence:** 8/10

```yaml
uses: oven-sh/setup-bun@4de645d  # should be full 40-char SHA
```

First-party actions are correctly pinned to 40-char SHAs. `setup-bun` uses a short SHA. Fix: `gh api repos/oven-sh/setup-bun/git/ref/tags/v2 | jq .object.sha` then update.

**P8-A4 — LOW (CARRYOVER): `IntelTimelockController.MINIMUM_DELAY = 15 minutes`**

Must be ≥24h before mainnet. Safe for hackathon.

---

## FALSE POSITIVES from Devin pass-8 (overturned after code review)

| Devin finding | Verdict | Reason |
|---|---|---|
| `IntelMintController:674` CRITICAL — unchecked ETH call | FALSE POSITIVE | Typed external call — Solidity propagates reverts; not a low-level `.call{}` |
| `pullTWAP()` HIGH — observation window | FALSE POSITIVE | UniV3 `observe()` reverts with `OLD` if pool lacks history; no silent stale return |
| `ReviewerQueue:302` MEDIUM — assembly mstore | FALSE POSITIVE | `availableCount` strictly bounded by loop iteration count ≤ array length |
| `updateTWAP()` MEDIUM — arbitrary values | BY DESIGN | Operator-only bootstrap path; `_checkTwapDeviation()` circuit breaker in all mint paths |

---

## E2E Flow Gaps (consistency risks, not security bugs)

1. **Fire-and-forget on-chain calls**: `TaskEscrow.release()`, `WorkReceipt.mint()`, `ReviewerStakeManager.recordReview()` in the accept path are fire-and-forget. RPC failure → off-chain ledger credits while on-chain state is not updated.

2. **Reject path skips `TaskEscrow.refund()`**: Buyer funds remain locked in escrow on rejection. Needs wiring or dispute path documentation for mainnet.

---

## Verdict

**Status: DONE_WITH_CONCERNS**

- 2 MEDIUM findings (webhook bypass, XFF rate limit) — fix P8-A1 before demo day
- 1 LOW carryover (timelock delay) — mainnet only
- 81/9/10 split: CONFIRMED CORRECT — memory updated
- No CRITICAL or HIGH findings
- Pass7 fixes all intact
