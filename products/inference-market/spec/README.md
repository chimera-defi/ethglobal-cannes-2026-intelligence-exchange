# Inference Market — Product Spec

## Overview
A marketplace for model inference pricing and routing. Buyers submit prompts; the market routes to the cheapest/fastest/highest-quality model provider. Settlement in INTEL.

## Key Differences from Intelligence Exchange
- **Unit of work**: inference request (token count, latency, quality score).
- **Routing**: automatic (not manual claim). The broker routes to the best provider.
- **Scoring**: LLM-as-judge on output quality + latency SLA.
- **Settlement**: per-request micro-payments.

## Settlement Primitive
Uses `protocol-core/contracts/settlement/MilestoneEscrow.sol` with batching:
- Multiple requests batched into a single milestone for gas efficiency.
- `vestingDuration = 0`, `disputeWindow = 24 hours`.

## Identity
Same `RoleRegistry` — inference providers are "workers".

## Tokenomics
- 80% provider payout
- 10% staker yield
- 10% protocol treasury (higher treasury for LLM-judge costs)

## Open Questions
- LLM-as-judge decentralization (who pays for quality scoring?)
- Routing oracle design (centralized broker vs. on-chain AMM-style routing)
