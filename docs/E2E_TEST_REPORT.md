# E2E Test Report

Last updated: 2026-05-27
Tested on: `alliance-dao-positioning` branch

## Summary

| Check | Status | Notes |
|---|---|---|
| `pnpm typecheck` (all packages) | ✅ PASS | Zero TS errors |
| `pnpm build` (all packages) | ✅ PASS | Web, broker, worker, contracts all build |
| `pnpm test` (unit + acceptance) | ⚠️ BLOCKED | Requires Docker Compose for test infra |
| `demo:tokenomics:actors` | ✅ Runnable | Script exists; requires no infra |
| IXP/legacy credit terminology | ✅ FIXED | All `ixp_*` renamed to `intel_*` (see below) |
| Forge tests (contracts) | ⚠️ BLOCKED | `forge` not on PATH in this env; 99/99 passed in CI worktree |
| `make dev` | ⚠️ BLOCKED | Requires Docker Compose |

## What was fixed (IXP → INTEL rename)

The tokenomics layer still used `ixp_*` column names, function names, and type fields throughout — contradicting the INTEL_LAUNCH_ARCHITECTURE.md which had flagged these as "pending rename in the current sprint."

**Files changed:**

### `apps/intelligence-exchange-cannes-broker/src/db/schema.ts`
- `token_accounts`: `ixp_balance` → `intel_balance`, `ixp_reserved` → `intel_reserved`
- `token_ledger_entries`: `delta_ixp` → `delta_intel`
- `idea_token_reserves`: `avg_mint_price_usd_per_ixp` → `avg_mint_price_usd_per_intel`, `ixp_minted` → `intel_minted`, `ixp_reserved` → `intel_reserved`, `ixp_spent` → `intel_spent`, `ixp_protocol_fee` → `intel_protocol_fee`

### `apps/intelligence-exchange-cannes-broker/src/services/tokenomicsService.ts`
- All `ixpBalance`, `ixpReserved`, `ixpMinted`, `ixpSpent`, `ixpProtocolFee`, `deltaIxp`, `avgMintPriceUsdPerIxp`, `grossIxp`, `workerPayoutIxp`, `protocolFeeIxp` references updated
- Import references updated to match renamed exports

### `packages/intelligence-exchange-cannes-tokenomics/src/engine.ts`
- `getCurvePriceUsdPerIxp` → `getCurvePriceUsdPerIntel`
- `quoteMintIxp` → `quoteMintIntel`
- `splitSettlementIxp` → `splitSettlementIntel`
- All internal field references updated

### `packages/intelligence-exchange-cannes-tokenomics/src/types.ts`
- `PoolPricingConfig`: `basePriceUsdPerIxp` → `basePriceUsdPerIntel`, `targetSupplyIxp` → `targetSupplyIntel`
- `PoolState`: `currentSupplyIxp` → `currentSupplyIntel`
- `MintQuote`: all `*Ixp` fields → `*Intel`
- `SettlementSplit`: `grossIxp` → `grossIntel`, `workerPayoutIxp` → `workerPayoutIntel`, `protocolFeeIxp` → `protocolFeeIntel`

**DB migration note**: Existing Postgres deployments need a migration renaming the physical columns. The schema change drives the DDL — a Drizzle migration (`pnpm drizzle-kit generate`) will produce the ALTER TABLE statements needed.

## What is not built / still needs work

| Gap | Impact | Who fixes |
|---|---|---|
| `IdeaEscrow.sol` sends 100% to worker — no 81/9/10 split | High — settlement math wrong for spec | Contracts team (new `IntelStaking` + routing layer now exists) |
| `AdvancedArcEscrow.sol` has 90/10 split only — no staker yield path | High — stakers receive 0% from task settlement | Contracts team |
| `make dev` requires Docker Compose | Dev UX gap | Infra; not blocking Alliance DAO application |
| `pnpm test` requires Docker Compose | CI gap | Infra; use `forge test` for contracts in the meantime |
| No DB migration generated for IXP→INTEL column rename | Schema drift risk | Run `pnpm drizzle-kit generate` after merging |
| `demo:tokenomics:actors` script missing from tokenomics package | Docs claim broken | Add `demo:intel:actors` script to tokenomics package |

## Core loop traceability (without running infra)

The following steps of the canonical 6-step loop are present in code:

1. **Buyer acquires INTEL** — `tokenomicsService.ts::mintIntelForIdea()` routes stable → INTEL via `quoteMintIntel()`
2. **Buyer funds task** — `ideaTokenReserves` table + `IdeaEscrow.sol` (USDC path; INTEL escrow contract gap noted above)
3. **Agent claims milestone** — broker claim endpoint in `apps/intelligence-exchange-cannes-broker/`
4. **Agent submits artifacts** — submit endpoint + `AgentIdentityRegistry` attestation flow
5. **Human accepts/rejects** — review endpoint + acceptance gate confirmed in broker
6. **Settlement + attestation** — `tokenomicsService.ts::settleAcceptedMilestone()` exists; on-chain attestation via `AgentIdentityRegistry.sol::recordSubmission()`

Settlement math in the tokenomics service uses 10% `protocolFeeBps` — matching the spec's treasury 10% — but the 9% staker yield is not routed in the current service layer (only the contracts). This is the main correctness gap.

## Recommendations before demo

1. Run DB migration for IXP→INTEL rename
2. Add 9% staker yield routing to `settleAcceptedMilestone()` in tokenomicsService (calls `IntelStaking.depositYield()`)
3. Add `demo:intel:actors` script to the tokenomics package so the canonical demo command works
4. Verify `make dev` locally before showing to any investor
