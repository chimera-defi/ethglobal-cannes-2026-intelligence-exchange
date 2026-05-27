# Code Review Report — `alliance-dao-positioning`

**Reviewer:** claude-sonnet-4-6  
**Date:** 2026-05-27  
**Branch:** alliance-dao-positioning → main  
**Scope:** packages/ apps/ docs/

---

## Pass 1 — Correctness

### 1.1 `intel*` naming — tokenomics functions ✅

All tokenomics exports in `packages/intelligence-exchange-cannes-tokenomics/src/engine.ts` use `intel*` naming:
- `getCurvePriceUsdPerIntel`, `quoteMintIntel`, `splitSettlementIntel` — all correct.
- `types.ts` fields (`PoolState`, `MintQuote`, `SettlementSplit`, `FeePolicy`) all use `intel` naming.
- `tokenomicsService.ts` imports and uses the new names throughout.
- `schema.ts` DB columns updated: `intel_balance`, `intel_reserved`, `delta_intel`, `avg_mint_price_usd_per_intel`, `intel_minted`, `intel_reserved`, `intel_spent`, `intel_protocol_fee` — no residual `ixp_*` field names remain in active code.

One legitimate survivor: `tokenomicsService.ts` lines 36/40 retain `TOKEN_BASE_PRICE_USD_PER_IXP` / `TOKEN_TARGET_SUPPLY_IXP` as **fallback** env var keys for backwards compatibility. This is intentional and correct.

### 1.2 `IdeaEscrow.sol` BPS arithmetic ✅

```
WORKER_BPS   = 8100
STAKER_BPS   =  900
TREASURY_BPS = 1000
             ──────
             10000  ✓
```

`releaseMilestone()` computes three separate amounts (workerAmount, stakerAmount, treasuryAmount) and transfers each. No remainder is lost. Sum is exact.

### 1.3 `engine.ts` `splitSettlementIntel()` math ✅

```typescript
protocolFeeIntel  = gross * (protocolFeeBps / 10_000)   // 10%
stakerYieldIntel  = gross * (stakerYieldBps / 10_000)   // 9%
workerPayoutIntel = gross - protocolFeeIntel - stakerYieldIntel  // 81%
```

Formula is correct. Worker payout is derived as the residual, avoiding floating-point accumulation error. FeePolicy overflow guard (`protocolFeeBps + stakerYieldBps > 10_000`) prevents an impossible config from silently under-paying the worker.

**Note:** `FeePolicy.stakerYieldBps` is typed as `number` (required) in `types.ts`, but `engine.ts` defensively does `policy.stakerYieldBps ?? 900`. This is belt-and-suspenders redundancy, not a bug.

### 1.4 `migrate.ts` CREATE TABLE — column names ✅

All three tokenomics tables in the CREATE TABLE blocks use `intel_*` column names:
- `token_accounts`: `intel_balance`, `intel_reserved`
- `token_ledger_entries`: `delta_intel`
- `idea_token_reserves`: `avg_mint_price_usd_per_intel`, `intel_minted`, `intel_reserved`, `intel_spent`, `intel_protocol_fee`

No `ixp_*` column names remain in any CREATE TABLE statement.

### 1.5 `arc.ts` HMAC timing-safe comparison ⚠️ WARNING

`timingSafeEqual(Buffer.from(signature), Buffer.from(expected))` is used correctly for constant-time comparison — this prevents timing-oracle attacks.

**However:** `timingSafeEqual` throws a `RangeError` if the two buffers have different byte lengths. An incoming `X-Arc-Signature` header with a length other than 71 bytes (`sha256=` + 64 hex chars) will throw an unhandled exception rather than returning a 401. The handler has no try/catch around this call.

Fix: wrap in `try/catch` or pre-check lengths before calling `timingSafeEqual`.

### 1.6 `milestoneQueue.ts` auto-unclaim ✅

The new logic:
1. Queries `claims` where `status = 'active'` AND `expires_at < now`.
2. Sets `claims.status = 'expired'` on the expired claim record.
3. Sets `jobs.status = 'queued'` with `activeClaimId = null`, `activeClaimWorkerId = null`, `leaseExpiry = null`.
4. Re-adds to BullMQ.
5. Logs a `job_events` row via `logJobEvent`.

All required state transitions are present and correct.

**Minor:** `inArray` is imported from `drizzle-orm` at line 42 but is not used anywhere in the new code (the old code used it; the new code does not). Dead import — no runtime impact but should be cleaned up.

---

## Pass 2 — Edge Cases

### 2.1 `splitSettlementIntel(gross=0)` ✅

`clampPositive(0, 0)` returns `0` (the fallback) because `0 > 0` is false. All fees compute to `0 * rate = 0`. `workerPayoutIntel = 0 - 0 - 0 = 0`. Returns a valid zero split. Safe.

### 2.2 `getCurvePriceUsdPerIntel()` when `currentSupplyIntel > targetSupplyIntel` ✅

When supply exceeds target (`utilization > 1.0`), the curve formula `exp(adjustmentPower * utilization^3)` returns a legitimately higher price (e.g., utilization=1.2 → ~31.7x base price with `adjustmentPower=2`). This is the intended anti-reflexivity behavior — minting becomes more expensive as utilization exceeds target. No guard needed; no overflow risk at realistic values.

### 2.3 `arc.ts` webhook fallthrough when `ARC_WEBHOOK_SECRET` is unset ✅

```typescript
const ARC_WEBHOOK_SECRET = process.env.ARC_WEBHOOK_SECRET ?? '';
if (ARC_WEBHOOK_SECRET) { /* verify */ }
const event = JSON.parse(rawBody);
```

When `ARC_WEBHOOK_SECRET` is empty string, the HMAC block is skipped entirely and the webhook is accepted unauthenticated. This is the intended dev behavior (documented in `.env.example`). Production operators must set the secret explicitly — there is no accidental "skip by default" in prod if the secret is set.

### 2.4 `migrate.ts` DO block idempotency ✅

Each column rename is guarded by `IF EXISTS (SELECT 1 FROM information_schema.columns WHERE ...)`. Running on a fresh DB (columns already named `intel_*`) simply skips all renames. Running on an old DB renames in place. Idempotent.

### 2.5 Missing tokenomics env vars in `.env.example` ⚠️ WARNING

`tokenomicsService.ts` reads these env vars that are **not documented in `.env.example`**:

| Env var | Default | In `.env.example`? |
|---------|---------|-------------------|
| `TOKEN_BASE_PRICE_USD_PER_INTEL` | `1` | No |
| `TOKEN_TARGET_SUPPLY_INTEL` | `100_000` | No |
| `TOKENOMICS_ENABLED` | `true` | No |
| `TOKEN_SYMBOL` | `INTEL` | No |
| `TOKEN_TREASURY_ACCOUNT` | `treasury:protocol` | No |
| `TOKEN_PROTOCOL_FEE_BPS` | `1000` | No |
| `TOKEN_ADJUSTMENT_POWER` | `2` | No |
| `TOKEN_LIQUIDITY_DEPTH_USD` | `50_000` | No |
| `TOKEN_SLIPPAGE_BPS` | `50` | No |

All have safe defaults, so there is no runtime failure. But a new deployer has no discoverability of these knobs from `.env.example`.

**Additional issue:** `.env` (the actual checked-in dev file) still uses the old key names `TOKEN_BASE_PRICE_USD_PER_IXP=1` and `TOKEN_TARGET_SUPPLY_IXP=100000` instead of the renamed `TOKEN_BASE_PRICE_USD_PER_INTEL` / `TOKEN_TARGET_SUPPLY_INTEL`. The backwards-compat fallback in `tokenomicsService.ts` silently accepts the old keys, so this works — but `.env` should be updated to the canonical names to avoid confusion when the fallback is eventually removed.

---

## Pass 3 — Claims Audit

### 3.1 `APPLICATION.md` stale IdeaEscrow claim ⚠️ BLOCKER

**File:** `docs/alliance-dao/APPLICATION.md`, line 178

**Current text:**
> `IdeaEscrow.sol` still implements the old split in the contract layer (off-chain ledger is correct; contract is being fixed).

**Reality:** `IdeaEscrow.sol` was fixed in commit `2685173` (on this branch). It now correctly implements `WORKER_BPS=8100 / STAKER_BPS=900 / TREASURY_BPS=1000`. The fix predates the APPLICATION.md rewrite (commit `5a21133`), but the stale claim survived the rewrite. `TRACTION_AND_METRICS.md` (updated in commit `957c159`) correctly states the contract is fixed. `APPLICATION.md` was not updated in the same pass.

This is a factual inaccuracy in a fund application document being sent to Alliance DAO. It must be corrected before submission.

**Fix:** Change line 178 to reflect current state, e.g.:
> `IdeaEscrow.sol` now implements the correct 81/9/10 split (fixed in commit `2685173`). `AdvancedArcEscrow.sol` still routes 90/10 (missing staker yield) — tracked in funded roadmap.

### 3.2 `WorkReceipt1155` deployment status ✅

`WorkReceipt1155.sol` exists in the contracts package and compiles (build artifacts present), but neither `APPLICATION.md` nor `ONE_PAGER.md` claims it is deployed. `TRACTION_AND_METRICS.md` line 70 explicitly states "`WorkReceipt1155` contract (Phase 2) — not yet written" — this is slightly inaccurate (the contract IS written, it's just not deployed), but it errs on the side of underselling rather than overclaiming. Not a blocker.

### 3.3 Timeline realism ✅

APPLICATION.md and ONE_PAGER.md targets are:
- 3 engineering teams, 500+ accepted jobs, INTEL on Worldchain testnet, 1 external registry query — all over 6 months.
- Explicitly framed as planning assumptions, not forecasts.
- Phase 4 (derivatives) called out as "12+ months away."

No unrealistic timeline claims found.

### 3.4 No fabricated traction claims ✅

Both APPLICATION.md and ONE_PAGER.md explicitly state "No users, no revenue, no GMV." GMV projections are labeled planning assumptions from `spec/FINANCIAL_MODEL.md`. No mainnet deployment is claimed.

---

## Action Items

1. **[BLOCKER]** Fix stale claim in `docs/alliance-dao/APPLICATION.md` line 178: change "IdeaEscrow.sol still implements the old split...contract is being fixed" to reflect that the fix landed in commit `2685173`. `AdvancedArcEscrow.sol` (90/10, missing staker yield) is the remaining gap and should be named instead.

2. **[WARNING]** Fix `timingSafeEqual` unsafe length mismatch in `apps/intelligence-exchange-cannes-broker/src/routes/arc.ts` line 600: wrap in `try/catch` or add a length pre-check before calling `timingSafeEqual` to return 401 instead of throwing on malformed signatures.

3. **[WARNING]** Add tokenomics env vars (`TOKENOMICS_ENABLED`, `TOKEN_SYMBOL`, `TOKEN_PROTOCOL_FEE_BPS`, `TOKEN_BASE_PRICE_USD_PER_INTEL`, `TOKEN_TARGET_SUPPLY_INTEL`, `TOKEN_ADJUSTMENT_POWER`, `TOKEN_LIQUIDITY_DEPTH_USD`, `TOKEN_SLIPPAGE_BPS`, `TOKEN_TREASURY_ACCOUNT`) to `.env.example` for deployer discoverability.

4. **[WARNING]** Update `.env` dev file: rename `TOKEN_BASE_PRICE_USD_PER_IXP` → `TOKEN_BASE_PRICE_USD_PER_INTEL` and `TOKEN_TARGET_SUPPLY_IXP` → `TOKEN_TARGET_SUPPLY_INTEL` to match the canonical env var names and avoid relying on the backwards-compat fallback indefinitely.

5. **[MINOR]** Remove unused `inArray` import in `apps/intelligence-exchange-cannes-broker/src/queue/milestoneQueue.ts` line 42.

6. **[MINOR]** `TRACTION_AND_METRICS.md` line 70 says `WorkReceipt1155` is "not yet written" but the contract file exists. Update to "not yet deployed."
