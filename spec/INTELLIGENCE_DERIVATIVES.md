# Intelligence Derivatives Specification

> Scope note (2026-04-19): this is a forward-looking market roadmap, not a launch acceptance checklist.
> Current launch behavior is defined by `docs/CANONICAL_PRODUCT_OVERVIEW.md` and `spec/tokenomics/INTEL_LAUNCH_ARCHITECTURE.md`.

## Overview

This document defines the path from an INTEL-settled intelligence marketplace to a complete derivatives ecosystem for intelligence as a tradable asset class.

> Launch reset note: the current token rail is `INTEL`. Legacy `IX/IXP` terminology has been removed from this roadmap.

**Core Thesis**: Intelligence is not compute. While compute can be commoditized (GPUs, FLOPs), intelligence depends on model quality, training data, and emergent capabilities. This marketplace discovers the true price of intelligence by measuring accepted, benchmarked work output.

## The Intelligence vs Compute Distinction

| Dimension | Compute | Intelligence |
|-----------|---------|--------------|
| **Unit** | FLOPs, GPU-hours | Task completion, quality score |
| **Commoditization** | Hardware is fungible | Models are differentiated |
| **Pricing** | Linear with capacity | Non-linear with capability |
| **Improvement** | Moore's Law (gradual) | Capability jumps (emergent) |
| **Subsidies** | Minimal | Heavy (OpenAI, Anthropic, Google) |
| **Settlement** | Physical delivery (GPU time) | Outcome-based (accepted work) |

### Why Existing Compute Markets Don't Solve Intelligence

1. **GPU Rental Markets**: Rent NVIDIA A100s by the hour. Prices hardware, not intelligence produced.
2. **USDCI**: Tokenizes yield from GPU mortgages. Financializes hardware ownership, not intelligence output.
3. **GPU Futures**: Cash-settled bets on GPU spot prices. Speculates on hardware scarcity, not intelligence quality.

**The gap**: No market prices the *output* of intelligence work—verifiable, accepted, benchmarked task completion.

## Phased Rollout: Revised Timeline

### Phase 1: Volume and Discovery (Months 0-6)
**Status**: In Progress (Cannes 2026 build)

**Components**:
- INTEL-settled milestone marketplace (stablecoins as optional on-ramp only)
- Human reviewer acceptance gates
- Basic reputation scoring
- Worker CLI and web app

**Milestones**:
- [x] Core escrow contracts (AdvancedArcEscrow)
- [x] Broker API with claim/submit/review flow
- [x] Agent Kit integration for human-backed verification
- [ ] 1,000+ accepted jobs for price discovery baseline
- [ ] 100+ active workers with reputation scores

**Success Metrics**:
- Median task completion time stabilizes
- Price variance within task categories < 30%
- Acceptance rate > 70%

---

### Phase 2: Normalization (Months 3-9)
**Overlap with Phase 1**

**Components**:
- `WorkReceipt1155` contract: Immutable record of accepted work
- `AIU` (Accepted Intelligence Unit) index methodology
- Normalization engine: task weight × acceptance multiplier × quality score

**AIU Calculation**:
```
AIU = task_weight × acceptance_multiplier × quality_multiplier

Where:
- task_weight: rubric-based (brief=1, tasks=2, scaffold=3, review=4)
- acceptance_multiplier: 1 for accepted, 0 for rejected
- quality_multiplier: 0.75-1.25 based on reviewer score
```

**Milestones**:
- [ ] WorkReceipt1155 contract deployed
- [ ] AIU calculator live in broker
- [ ] Public AIU index API
- [ ] 10,000+ receipts minted

**Success Metrics**:
- AIU correlates with actual worker earnings (r > 0.8)
- Cross-category AIU comparison meaningful
- Index publishes daily without gaps

---

### Phase 3: INTEL Market Rail (Months 6-12)
**Components**:
- `INTEL` utility token launch
- `INTEL` settlement + rewards ledger
- Worker stake-and-slash mechanics
- Buyer access tiers

**INTEL Token Role**:
| Function | Mechanism |
|----------|-----------|
| **Worker Stake** | Lock INTEL to claim high-value tasks; slash on fraud |
| **Buyer Discounts** | Lock INTEL for fee reductions |
| **Rewards** | Epoch-based INTEL distribution to top performers |
| **Coordination** | Governance for parameter changes |

**INTEL Flow**:
```
Creator (task funded) ──┐
                        ├──→ INTEL accrual / routing ──→ staking + treasury + LP flows
Finisher (work accepted) ──┘
```

**Milestones**:
- [ ] INTEL token contract (capped supply: 100M)
- [ ] WorkerStakeManager contract
- [ ] RewardDistributor with epoch logic
- [ ] Points-to-token conversion mechanism

**Success Metrics**:
- 50%+ of high-value tasks require stake
- Top 10% workers earn meaningful INTEL rewards
- Token volatility doesn't impact worker participation

---

### Phase 4: Derivatives Core (Months 9-15)
**Moved earlier—derivatives can launch once AIU index is credible**

**Components**:
- **AIU Spot Index**: Real-time index price feed
- **AIU Perpetuals**: Funding-rate-based perpetual futures on AIU index
- **Task Class Futures**: Forward contracts on specific task categories

**Why This Works Earlier**:
1. Index-based derivatives don't require deep receipt inventory
2. Perpetuals need liquid index + price discovery, not physical backing
3. Cash settlement avoids delivery complexity

**AIU Perpetual Contract Spec**:
| Parameter | Value |
|-----------|-------|
| Underlying | AIU Index (24h TWAP) |
| Quote Asset | USDC |
| Leverage | Up to 10x |
| Funding | 8-hour intervals, based on spot-premium |
| Settlement | Cash (USDC) |

**Long Position**: Bet that intelligence costs will rise (AIU index increases)
**Short Position**: Hedge exposure to intelligence costs

**Example Use Cases**:
- **AI Company**: Short AIU perpetual to hedge against rising agent costs
- **Worker Pool**: Long AIU perpetual to bet on their productivity increasing
- **Speculator**: Trade intelligence macro trends like energy futures

**Milestones**:
- [ ] AIU Index oracle (Chainlink or similar)
- [ ] Perpetual exchange contract
- [ ] Insurance fund for socialized losses
- [ ] $1M+ open interest

---

### Phase 5: Structured Products (Months 12-24)
**Components**:
- **Receipt-Backed Vaults**: Cohort-specific exposure
- **Intelligence Bonds**: Fixed-income from fee streams
- **Cohort Futures**: Revenue-share from worker pools
- **Forward AIU Delivery**: Physical settlement (advanced)

#### Receipt-Backed Vaults (iIX-*) 
ERC-20 shares backed by specific cohorts:
```
iIX-top10    → Top 10% worker receipts
iIX-codegen  → Code generation task receipts  
iIX-audit    → Security audit task receipts
```

Value accrual:
- Fee share from cohort tasks
- Appreciation if cohort AIU productivity rises
- Redeemable for underlying receipt pool

#### Intelligence Bonds
Fixed-duration instruments backed by protocol fee streams:
- 6-month bond: 5% APY, backed by 10% of protocol fees
- 12-month bond: 8% APY, backed by 15% of protocol fees
- Principal + yield in USDC at maturity

#### Forward AIU Delivery (Advanced)
Physical settlement for sophisticated participants:
- Seller posts INTEL collateral
- Commits to deliver X AIU within Y months
- Buyer pays premium upfront
- Settlement: Seller must generate AIU or forfeit collateral

**Milestones**:
- [ ] VaultFactory contract
- [ ] First cohort vault ($100K+ AUM)
- [ ] Intelligence bond issuance
- [ ] Forward delivery pilot program

---

## Core Assets Reference

| Asset | Type | Purpose |
|-------|------|---------|
| `USDC` | Stablecoin | Settlement, collateral, fees |
| `INTEL` | Utility Token | Settlement, stake, rewards, coordination |
| `WorkReceipt1155` | NFT | Proof of accepted work |
| `AIU` | Index Unit | Normalized intelligence output |
| `iIX-*` | Vault Shares | Cohort-based exposure |

## Risk Management

### Derivative-Specific Risks

| Risk | Mitigation |
|------|------------|
| **Index Manipulation** | AIU uses median, not mean; outlier rejection |
| **Oracle Failure** | Multiple data sources; TWAP smoothing |
| **Liquidation Cascades** | Position limits; graduated leverage |
| **Insurance Depletion** | Socialized losses cap; protocol backstop |

### Settlement Safety

- **Cash Settlement**: Default for index products (Phase 4)
- **Physical Settlement**: Only for advanced forwards (Phase 5)
- **Receipt Redemption**: Vault shares redeemable for underlying receipts

## Integration with Token Architecture

This specification reconciles with `TOKEN_ARCHITECTURE.md` from PR 11:

| PR 11 Phase | This Spec | Reconciliation |
|-------------|-----------|----------------|
| Phase 1: Stable escrow | Phase 1 | Identical |
| Phase 2: INTEL staking | Phase 3 | Tokenization |
| Phase 3: Receipts | Phase 2 | Moved earlier (prerequisite) |
| Phase 4: Vaults | Phase 5 | Structured products |
| Phase 5: Forward AIU | Phase 5 | Physical delivery (advanced) |

**Key Difference**: This spec introduces index-based derivatives (Phase 4) before receipt-backed vaults (Phase 5). Index perpetuals can launch with less inventory depth and provide earlier liquidity for the ecosystem.

## Success Metrics by Phase

| Phase | Primary Metric | Target |
|-------|---------------|--------|
| 1 | Monthly accepted jobs | 1,000+ |
| 2 | AIU index stability | < 5% daily volatility |
| 3 | INTEL staked value | $1M+ TVL |
| 4 | Perpetual open interest | $5M+ |
| 5 | Vault AUM | $10M+ |

## Non-Goals

- **No Provider Credit Redemption**: INTEL is not convertible to OpenAI/Anthropic credits
- **No Naked Shorting**: Derivatives require collateral
- **No Pre-Mature Derivatives**: Index must have 6+ months history before perpetuals

## Open Questions

1. Should AIU index include task class breakdowns (code, design, research)?
2. What leverage caps prevent manipulation while enabling hedging?
3. How should protocol fee splits evolve as derivatives grow?
4. Should receipt-backed vaults be permissioned (accredited) initially?

## References

- `spec/TOKEN_ARCHITECTURE.md` - Core token design
- `spec/TOKENOMICS.md` - Supply, emission, and allocation
- `spec/TOKEN_HANDOFF_PACKAGE.md` - Implementation roadmap
- `README.md` - The Future: Intelligence as a Tradable Asset
