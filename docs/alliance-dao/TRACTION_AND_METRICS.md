# Traction and Metrics — Intelligence Exchange

**Stage:** Hackathon build (ETHGlobal Cannes 2026)  
**Date:** 2026-05-27  
**Honest framing:** Solo builder, no users, no revenue. The section below is a factual inventory of what exists and what success looks like at each phase.

---

## 1. What is built and verifiable today

### Smart contracts (packages/intelligence-exchange-cannes-contracts)

| Contract | File | Function |
|----------|------|----------|
| `AgentIdentityRegistry` | `src/AgentIdentityRegistry.sol` | Agent identity registration + reputation attestation (ERC-8004 style) |
| `IdentityGate` | `src/IdentityGate.sol` | Role-based access control (poster / worker / reviewer) |
| `AdvancedArcEscrow` | `src/AdvancedArcEscrow.sol` | Milestone-gated USDC escrow with vesting and auto-release |
| `IntelToken` | (IntelToken.sol) | ERC-20, 100M supply cap, burn, pause |
| `IdeaEscrow` | (IdeaEscrow.sol) | Task budget container for INTEL-denominated ideas |

All contracts have passing test suites. Mainnet-fork liquidity smoke test runs against the INTEL/USDC pair.

### Application layer

| Component | Stack | Status |
|-----------|-------|--------|
| Broker API | Hono + Bun + Postgres + Redis | Working — full job lifecycle (post/claim/submit/review/settle) |
| Worker CLI | TypeScript | Working — authenticated claim/submit loop via AgentKit |
| Web App | React + Vite + RainbowKit | Working — buyer and reviewer UX |

### Verifiable demo commands

```bash
# Full actor flow simulation (buyer → agent → reviewer → settlement)
corepack pnpm demo:tokenomics:actors

# Mainnet-fork INTEL liquidity smoke test
corepack pnpm --filter intelligence-exchange-cannes-contracts smoke:intel-liquidity:mainnet-fork

# Full validation suite
corepack pnpm validate:all
```

### Documentation and spec artifacts

- `docs/CANONICAL_PRODUCT_OVERVIEW.md` — canonical product reference
- `spec/tokenomics/INTEL_LAUNCH_ARCHITECTURE.md` — tokenomics mechanics with formula-level detail
- `spec/INTELLIGENCE_DERIVATIVES.md` — AIU index and derivatives roadmap
- `spec/FINANCIAL_MODEL.md` — bottom-up unit economics model
- `docs/architecture/system-overview.md` — full system architecture with component and sequence diagrams

### What is not built

- No mainnet or testnet deployment with real transactions
- No live users or active workers
- No GMV, no revenue
- `WorkReceipt1155` contract (Phase 2) — not yet written
- AIU index calculator — not yet live
- INTEL token deployment to a public network — not yet done

---

## 2. Phase 1 success definition (0–6 months)

Phase 1 succeeds when the task market is live with real accepted jobs and real on-chain reputation accruing. Success is not measured by token price or TVL.

### Hard targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| Accepted jobs | 1,000+ | Baseline for price discovery; from spec/INTELLIGENCE_DERIVATIVES.md |
| Active workers with reputation | 100+ | Enough supply for meaningful routing decisions |
| Median task completion time | Stable (no trend) | Signals the flow is predictable, not chaotic |
| Price variance within task categories | < 30% | From INTELLIGENCE_DERIVATIVES.md Phase 1 success metrics |
| Acceptance rate | > 70% | Workers are calibrated; not spamming submissions |
| Smart contract audit | Complete | Required before handling real value |

### Soft targets (directional)

- Three to five engineering teams using the platform for real overflow AI work
- Buyer monthly spend per account visible and stable (target: $3K–$7K/month per active buyer)
- Worker CLI installable in under 15 minutes

---

## 3. Phase 2 success definition (3–9 months)

Phase 2 begins once Phase 1 acceptance volume is credible. The goal is the AIU index.

### Hard targets

| Metric | Target |
|--------|--------|
| WorkReceipt1155 receipts minted | 10,000+ |
| AIU index publishing | Daily, without gaps |
| AIU correlation with worker earnings | r > 0.8 |
| AIU daily volatility | < 5% |
| Public AIU index API | Live and queryable |

Phase 2 completion is the prerequisite for evaluating whether derivatives (Phase 4) are feasible. The index must have enough history and stability before a perpetual product is credible.

---

## 4. Forward projections (6-month horizon)

These are planning assumptions from `spec/FINANCIAL_MODEL.md`, not forecasts. They will be replaced with observed pilot data.

### Conservative scenario

- 80 active buyers, $3,000/month spend, 20% routed through platform
- GMV: $48,000/month
- Revenue (6% take rate): $2,880/month
- Gross margin: ~18% (tight — high risk/ops burden)
- Accepted jobs per month: ~500–800 (below Phase 1 target)

### Base scenario

- 150 active buyers, $5,000/month spend, 30% routed through platform
- GMV: $225,000/month
- Revenue (8% take rate): $18,000/month
- Variable cost: $7,875/month
- Gross profit: $10,125/month (~56% margin)
- Accepted jobs per month: ~1,000–1,500 (Phase 1 target range)

### Aggressive scenario

- 300 active buyers, $7,500/month spend, 35% routed through platform
- GMV: $787,500/month
- Revenue (9% take rate): $70,875/month
- Gross margin: ~67%
- Accepted jobs per month: 3,000+

The base scenario is the one that justifies continued build. The conservative scenario is survivable but does not reach Phase 2. The aggressive scenario requires buyer acquisition to outperform expectations.

---

## 5. Series A equivalent metrics for a protocol at this stage

The "Series A equivalent" for a protocol marketplace is not ARR — it is depth and defensibility of the liquidity flywheel. Comparable milestones:

| Traditional Series A metric | Protocol equivalent | Intelligence Exchange target |
|-----------------------------|--------------------|-----------------------------|
| $1M ARR | $1M INTEL TVL staked | Phase 2–3 milestone |
| 100 paying customers | 100 workers with on-chain reputation | Phase 1 milestone |
| Net revenue retention > 100% | Worker retention rate > 80% after first 10 jobs | Phase 1 signal |
| 3x year-over-year growth | Monthly accepted jobs growing month-over-month | Phase 1 signal |
| Defensible moat | Reputation records queryable by external protocols | Phase 2 deliverable |

The current position is pre-seed by any measure. The argument for funding at this stage is not traction — it is design depth, addressable market clarity, and a roadmap to a genuinely differentiated primitive (AIU index) that has no existing analog.

---

## 6. Risk-adjusted view

| Risk | Honest assessment |
|------|------------------|
| Cold-start supply | High. 100 workers from zero is hard. Will require direct outreach to existing agent operators. |
| Cold-start demand | High. Buyers need to trust the reviewer gate before routing real spend. Needs design/trust work. |
| Output quality variance | Medium. Human reviewer gate is the control. Quality degrades if reviewer pool is too small or incentive is wrong. |
| Token reflexivity | Mitigated by design (`utilizationMultiplier` makes minting expensive when activity is low). Not eliminated. |
| Audit cost | High one-time cost ($15K–$30K). Non-negotiable before real value on-chain. |
| Solo builder concentration | High. Single point of failure. Addressed only by co-founder or team expansion. |

The risk register is honest. The thesis is that the design choices — human review gate, `utilizationMultiplier`, settlement-first tokenomics — address the most common failure modes of similar protocols. But these are design choices, not execution facts. Phase 1 converts them to facts or disproves them.
