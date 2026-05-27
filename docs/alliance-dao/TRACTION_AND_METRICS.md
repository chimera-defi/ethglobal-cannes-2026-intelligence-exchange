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

**Contract layer status:** `IdeaEscrow.sol` implements the 81/9/10 split (commit `2685173`) with `stakerYieldReceiver` and `treasuryReceiver` constructor params — fixed during hackathon build. `AdvancedArcEscrow.sol` routes 90% worker / 10% treasury — missing the 9% staker yield extraction. The `AdvancedArcEscrow.sol` gap is tracked and is in the funded roadmap. The off-chain broker ledger implements the full 81/9/10 split and has been verified end-to-end.

### Application layer

| Component | Stack | Status |
|-----------|-------|--------|
| Broker API | Hono + Bun + Postgres + Redis | Working — full job lifecycle (post/claim/submit/review/settle) |
| Worker CLI | TypeScript | Working — authenticated claim/submit loop via AgentKit |
| Web App | React + Vite + RainbowKit | Working — buyer and reviewer UX |

### End-to-end loop (verified 2026-05-27)

The full 6-step flow works:

1. POST /ideas + POST /ideas/:id/fund → mints INTEL from stable on-ramp, escrows in ledger
2. POST /jobs/:id/claim → worker claims milestone with 45-min lease
3. POST /jobs/:id/submit → worker submits artifact + deterministic scoring
4. POST /ideas/:id/accept → reviewer accepts → settlement fires in broker ledger: 81% worker (3.037 INTEL on a $3.75 milestone), 9% staker yield pool (0.337 INTEL), 10% treasury (0.375 INTEL)
5. Attestation signed: `{agentFingerprint, score, reviewerAddress, signature}`
6. GET /workers/:fingerprint/reputation → returns acceptedCount + avgScore

### Verifiable demo commands

```bash
# Full actor flow simulation (buyer → agent → reviewer → settlement)
# Shows real 81/9/10 split numbers
corepack pnpm demo:tokenomics:actors

# Mainnet-fork INTEL liquidity smoke test
corepack pnpm --filter intelligence-exchange-cannes-contracts smoke:intel-liquidity:mainnet-fork

# Full validation suite
corepack pnpm validate:all
```

### What a reviewer would see at demo

1. Fund idea with USDC on-ramp → INTEL minted at curve price, escrowed in ledger
2. Worker CLI claim + submit → reviewer accepts → 81/9/10 split fires in ledger with exact token amounts
3. `GET /workers/:fingerprint/reputation` → returns verified task count and average score
4. `GET /tokenomics/status` → returns INTEL pool state and current spot price

### What is not built

- No mainnet or testnet deployment with real transactions
- No live users or active workers
- No GMV, no revenue
- `WorkReceipt1155` contract (Phase 2) — not yet written
- AIU index calculator — not yet live
- INTEL token deployment to a public network — not yet done
- `AdvancedArcEscrow.sol` 81/9/10 contract split — `IdeaEscrow.sol` is fixed (commit `2685173`); `AdvancedArcEscrow.sol` still routes 90/10 (missing staker yield)

---

## 2. Pilot Design (what we'd run with grant funding)

Grant funding enables a structured pilot to generate the first real dataset:

**Week 1–2: Identify pilot teams**
- Outbound to 3 engineering teams spending $10K+/month on AI agent tasks
- Target profile: teams using Claude Code, Codex, Devin, or similar at production scale
- Offer: $6.7K in pre-seeded INTEL credits (covered by grant) to route a slice of their existing agent workload through the platform

**Week 3–4: Onboard and configure**
- Deploy INTEL on Worldchain testnet with real settlement
- Integrate buyer accounts and reviewer setup for each team
- Worker CLI installation (target: under 15 minutes from zero)
- Route first 5–10 real tasks per team to validate the flow end-to-end with actual users

**Week 5–12: Route real tasks**
- Target: 50+ tasks per week across all three teams
- Human reviewer gate active — not automated acceptance
- Real INTEL settlement per acceptance
- Weekly metrics: acceptance rate, median completion time, task volume by category

**Week 13+: Publish first AIU index reading**
- Aggregate accepted job records into normalized AIU units: `task_weight × acceptance_multiplier × quality_multiplier`
- Publish first weekly AIU index reading (not daily — insufficient data volume at this stage)
- This is the first market-discovered price of intelligence output that is tamper-evident and composable

---

## 3. Phase 1 success definition (0–6 months)

Phase 1 succeeds when the task market is live with real accepted jobs and real on-chain reputation accruing. Success is not measured by token price or TVL.

### Hard targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| Pilot teams active | 3 | Cold-start proof; real buyers, real spend |
| Accepted jobs | 500+ | Foundation for statistically meaningful AIU index; achievable at ~3 jobs/team/week |
| INTEL live on testnet | Yes | On-chain proof of the settlement rail — not just simulation |
| External AgentIdentityRegistry query | 1+ | Composability proof: reputation layer works without the marketplace |
| Smart contract audit | Complete | Required before handling real value |

Note: the original Phase 1 target was 1,000 accepted jobs. 500 is the revised honest target for 6 months from 3 teams. 1,000 remains the target for the full Phase 1 period if additional teams join.

### Soft targets (directional)

- Acceptance rate > 70% (workers are calibrated, not spamming submissions)
- Median task completion time stable (flow is predictable, not chaotic)
- Worker CLI installable in under 15 minutes
- Buyer monthly spend per account visible and stable

---

## 4. Phase 2 success definition (3–9 months, overlapping)

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

## 5. Forward projections (6-month horizon)

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

## 6. Series A equivalent metrics for a protocol at this stage

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

## 7. Risk-adjusted view

| Risk | Honest assessment |
|------|------------------|
| Cold-start supply | High. 100 workers from zero is hard. Pilot design addresses this by seeding with INTEL credits and direct outreach. |
| Cold-start demand | High. Buyers need to trust the reviewer gate before routing real spend. Needs design/trust work. |
| Contract split gap | Partially resolved. `IdeaEscrow.sol` now implements 81/9/10 (commit `2685173`). `AdvancedArcEscrow.sol` still routes 90/10 — missing staker yield. Off-chain ledger is fully correct and verified. `AdvancedArcEscrow.sol` fix is in funded roadmap. |
| Output quality variance | Medium. Human reviewer gate is the control. Quality degrades if reviewer pool is too small or incentive is wrong. |
| Token reflexivity | Mitigated by design (`utilizationMultiplier` makes minting expensive when activity is low). Not eliminated. |
| Audit cost | High one-time cost. Non-negotiable before real value on-chain. Included in grant ask. |
| Solo builder concentration | High. Single point of failure. Addressed by active co-founder search funded by grant. |

The risk register is honest. The thesis is that the design choices — human review gate, `utilizationMultiplier`, settlement-first tokenomics — address the most common failure modes of similar protocols. But these are design choices, not execution facts. Phase 1 converts them to facts or disproves them.
