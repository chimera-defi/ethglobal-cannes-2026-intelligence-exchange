## TOKENOMICS (Current Build)

### Scope

This document defines the tokenomics currently implemented in the broker.

- Funding unit: stable-denominated USD amount at idea funding time
- Execution accounting unit: internal `IXP` credits
- Settlement trigger: human reviewer acceptance
- Public token launch: **out of scope** for current build

### Why This Shape

The current product loop needs low user friction and deterministic payout behavior.
So the protocol uses stable funding for user-facing pricing and `IXP` for internal execution accounting.

This mirrors a "stable in, metered utility unit out" pattern that can later evolve into a transferable token only after sufficient volume and compliance gating.

### Pricing Engine

Implemented in `packages/intelligence-exchange-cannes-tokenomics`.

Spot price:

```text
curvePrice = basePriceUsdPerIxp * exp(adjustmentPower * (currentSupplyIxp / targetSupplyIxp)^3)
```

Mint quote:

```text
effectivePrice = curvePrice * (1 + (stableAmountUsd / liquidityDepthUsd) * (slippageBps / 10_000))
mintedIxp = stableAmountUsd / effectivePrice
```

### Settlement Engine

On accepted jobs:

1. Read idea reserve and average mint price
2. Convert job budget USD to required gross IXP
3. Split gross IXP:
   - worker payout: `gross * (1 - protocolFeeBps/10_000)`
   - protocol fee: `gross * (protocolFeeBps/10_000)`
4. Write ledger entries for poster debit, worker payout, treasury fee

### Invariants

1. Duplicate `idea_funded` sync events must not double-mint.
2. Settlement must be full-budget or fail (`IXP_RESERVE_INSUFFICIENT`), never partial-silent.
3. `payoutReleased` attestation flag reflects whether settlement executed.
4. All token movements are append-only in `token_ledger_entries`.

### Runtime Configuration

```bash
TOKENOMICS_ENABLED=true
TOKEN_SYMBOL=IXP
TOKEN_PROTOCOL_FEE_BPS=1000
TOKEN_BASE_PRICE_USD_PER_IXP=1
TOKEN_TARGET_SUPPLY_IXP=100000
TOKEN_ADJUSTMENT_POWER=2
TOKEN_LIQUIDITY_DEPTH_USD=50000
TOKEN_SLIPPAGE_BPS=50
TOKEN_TREASURY_ACCOUNT=treasury:protocol
```

### API Surface

- `GET /v1/cannes/tokenomics/status`
- `POST /v1/cannes/tokenomics/quote/mint`
- `GET /v1/cannes/tokenomics/accounts/:accountAddress`
- `GET /v1/cannes/tokenomics/ideas/:ideaId`

### Non-Goals (Current Build)

- No AMM contract deployment for IXP yet
- No open transfer/trading path for IXP
- No automatic market making or external LP dependency
- No forced World verification when `WORLD_ID_STRICT=0`

### Evolution Path

Phase-gated extension can introduce transferable utility semantics (staking/governance/rewards) after:

1. sufficient accepted-job history,
2. stable settlement reliability,
3. explicit legal/compliance review.

### Comparative Patterns To Evaluate

For next-phase token design, evaluate two patterns explicitly:

1. Utility-token + stable settlement split
   - user-facing pricing stays stable
   - utility token captures protocol coordination value
2. Stable mint + pool-tracked credit pricing
   - mint credits from stable inflow
   - adjust mint price via liquidity-depth and supply curve

Current implementation follows pattern 2 inside the broker, without externalized trading.
