# Alliance DAO Fund Application — Intelligence Exchange

**Builder:** Chimera (chimera_defi@protonmail.com)  
**Stage:** Hackathon build — ETHGlobal Cannes 2026  
**Branch:** alliance-dao-positioning  
**Date:** 2026-05-27

---

## 1. One-sentence summary

Intelligence Exchange is on-chain reputation infrastructure for AI agent work: a milestone marketplace where human reviewers gate every payout, producing a verified record of accepted work that accumulates into the first market-discovered price of intelligence itself.

---

## 2. Problem

Engineering teams running AI agents at production scale spend roughly $250K per year per three-worker configuration on AI services. That spend is invisible in aggregate — there is no auditable record of which work was accepted, which agent completed it, or what the effective cost-per-output was. When something goes wrong (bad output shipped, agent misbehaved, contractor disputes a rejection), there is no neutral settlement layer and no on-chain history to inspect.

The deeper structural gap: every existing market prices *compute* (GPU-hours, FLOPs, API tokens). None price *intelligence output* — verifiable, accepted, benchmarked task completion. You cannot currently hedge your exposure to rising AI labor costs, because no market tracks that cost in a way that is tamper-evident and composable.

---

## 3. Solution

Intelligence Exchange is a three-sided marketplace: buyers post scoped tasks with INTEL-denominated budgets, human-backed worker agents execute milestones, and human reviewers accept or reject each submission. On acceptance, settlement routes automatically — 81% to the worker, 9% to stakers, 10% to protocol treasury.

Every accepted task mints an attestation record. Those records accumulate into the AIU (Accepted Intelligence Unit) index — a normalized, on-chain measure of verified AI work output. The AIU index is the price of intelligence, discovered by the market rather than asserted by an oracle.

The marketplace is the bootstrapping mechanism. The reputation layer is the durable infrastructure. Any protocol that needs to verify "did an AI agent produce accepted work?" can query it.

**What is built today:**
- `AgentIdentityRegistry.sol` — agent identity and reputation attestation on Worldchain
- `AdvancedArcEscrow.sol` — task budget escrow with milestone-gated release
- `IntelToken.sol` — ERC-20 with 100M cap, burn, and pause
- `IdeaEscrow.sol` — idea-level budget container
- Broker API (Hono + Bun) — job lifecycle, scoring, settlement orchestration
- Worker CLI (TypeScript) — authenticated claim/submit loop for agents
- Web App (React + Vite) — buyer and reviewer UX
- Working demo commands: `corepack pnpm demo:tokenomics:actors` and `corepack pnpm --filter intelligence-exchange-cannes-contracts smoke:intel-liquidity:mainnet-fork`

---

## 4. Why now

Three conditions converged in 2025–2026:

1. **AI agent teams are real buyers.** Engineering teams are not experimenting with agents — they are running them in production at $100K–$300K/year spend. The buyer exists. The spend exists.

2. **On-chain identity infrastructure matured.** World ID provides Sybil-resistant human verification. AgentBook provides agent registration. This means reviewer gates are enforceable without requiring a trusted third party.

3. **The reputation gap became acute.** As agent-generated output proliferates, buyers have no way to distinguish a capable worker from a prompt-spammer. On-chain attestations of accepted work are now the obvious solution — the question is who builds the standard.

---

## 5. Why crypto / why on-chain

Three specific reasons, not generic decentralization narrative:

**Settlement neutrality.** When a buyer and an agent dispute whether work was accepted, the acceptance record needs to live on neutral ground — not in the buyer's database. Smart contract escrow (`AdvancedArcEscrow.sol`) enforces the release condition without either party controlling the ledger.

**Composable reputation.** An off-chain reputation score is captive to its platform. An on-chain attestation in `AgentIdentityRegistry.sol` is queryable by any protocol — lending, insurance, task routing, anything that needs to trust an agent's track record without taking the marketplace's word for it.

**Price discovery that can be hedged.** The AIU index, once it has sufficient history, can underpin perpetual contracts that let AI-heavy teams hedge their intelligence cost exposure. That financial primitive only works if the underlying index is tamper-evident. It has to be on-chain.

---

## 6. Token design and why it's necessary

INTEL is not a governance token bolted on after the fact. It is the settlement rail and the economic signal simultaneously.

**Why a token is necessary:**

- Escrow and settlement must be denominated in something. INTEL is that unit. Stablecoin is an optional on-ramp, not a second settlement rail.
- The staking yield pool (9% of every accepted settlement) needs a token to route. Without INTEL, there is no composable yield instrument for reviewers and stakers.
- Mint rights gated by stake size create a feedback loop between platform demand and token supply expansion — alignment that is impossible with a pure stable payment rail.

**Design specifics (from `spec/tokenomics/INTEL_LAUNCH_ARCHITECTURE.md`):**

- Supply cap: 100M INTEL
- Settlement split on accepted task: 81% worker / 9% staker yield / 10% treasury
- Direct mint inflow: 50% POL / 45% staker yield / 5% treasury
- Epoch mint rights formula: `min(k * sqrt(stakedIntel(wallet)), walletCap, globalCapRemaining)`
- Mint price: `max(TWAP * (1 + premium), floorPrice) * utilizationMultiplier`

The `utilizationMultiplier` is the anti-reflexivity control. If the marketplace is underutilized, minting becomes more expensive relative to demand — supply cannot expand into thin air. This is not a common feature of hackathon tokenomics; it is a deliberate brake on the reflexive-mint failure mode that has destroyed similar protocols.

Treasury toggles between POL adds and buyback/burn based on utilization and liquidity depth. The policy is keyed to accepted-task volume, not speculation.

---

## 7. Team / Builder

**Chimera** (chimera_defi@protonmail.com)

Solo builder. DeFi protocol contributor since 2020. Background in security-first contract design (CSO audit workflow integrated into this repo's CI). Built this stack solo at ETHGlobal Cannes 2026: four Solidity contracts, a Hono broker API, a TypeScript worker CLI, a React frontend, and a tokenomics spec with a forward roadmap to derivatives.

Honest assessment: this is hackathon-stage infrastructure. No team, no institutional backing, no users. What exists is unusual depth of design for the stage — the derivatives spec was not required for the hackathon submission but was written because it is the correct long-term architecture.

Open to co-founder conversations if Alliance DAO identifies someone with go-to-market or BD experience in the AI agent / DeFi intersection.

---

## 8. Traction and milestones

**Built and verifiable today:**

- Four Solidity contracts with passing test suites (local/fork, not mainnet)
- Broker API with full job lifecycle: post → claim → submit → review → settle
- Worker CLI with authenticated AgentKit integration
- Mainnet-fork smoke test for INTEL liquidity: `corepack pnpm --filter intelligence-exchange-cannes-contracts smoke:intel-liquidity:mainnet-fork`
- Actor flow simulation covering the full tokenomics loop: `corepack pnpm demo:tokenomics:actors`
- Documentation suite: CANONICAL_PRODUCT_OVERVIEW, INTELLIGENCE_DERIVATIVES spec, INTEL_LAUNCH_ARCHITECTURE, full system architecture

**Phase 1 targets (0–6 months with funding):**

- 1,000 accepted jobs (price discovery baseline)
- 100 active workers with on-chain reputation scores
- Median task completion time stable
- Price variance within task categories < 30%
- Acceptance rate > 70%

**Phase 2 targets (3–9 months, overlapping):**

- `WorkReceipt1155` contract written and deployed — immutable NFT record of accepted work
- AIU calculator live in broker
- Public AIU index API publishing daily
- 10,000+ receipts minted
- AIU correlation with worker earnings r > 0.8

No users, no revenue, no GMV yet. The financial model (in `spec/FINANCIAL_MODEL.md`) projects $225K GMV/month at 150 buyers, $5K/month spend, 30% routed through the platform, with 56% gross margin at 8% take rate — but these are planning assumptions to be replaced with observed pilot data.

---

## 9. Competitive landscape

| Competitor | What they price | What they miss |
|------------|-----------------|----------------|
| GPU marketplaces (Vast.ai, TensorDock) | Hardware (GPU-hours) | Intelligence output quality, acceptance gating |
| Compute token protocols (USDCI, GPU futures) | Hardware yield / hardware scarcity | Not tracking work accepted, not reputation |
| OpenRouter / Together AI | Model API access | No marketplace, no reputation, no settlement |
| Daydreams (Taskmarket + Router) | Agent task routing | No on-chain settlement, no reputation attestation, no derivatives path |
| Upwork / Fiverr | Human freelance labor | Not designed for AI agents, no on-chain settlement |

The gap: nobody is pricing *accepted intelligence output* as a market-discovered unit and accumulating it as an on-chain reputation primitive. Every existing market is either upstream (compute) or downstream (finished human services) of the thing we're measuring.

---

## 10. What the grant would fund

Phase 1 bootstrapping: get the task market live with real transactions and real reputation accruing.

**Specific uses:**

1. **Infra and hosting** — Broker API on Fly.io/Railway, managed Postgres and Redis, Vercel for frontend. Estimated $2K–$4K/month.
2. **Smart contract audit** — `AdvancedArcEscrow.sol`, `AgentIdentityRegistry.sol`, `IntelToken.sol` need a professional audit before handling real value. One-time cost, estimated $15K–$30K for a reputable firm.
3. **Liquidity seeding** — Initial POL for INTEL/USDC pair. The tokenomics model requires depth to prevent thin-liquidity manipulation. Estimated $20K–$50K.
4. **Buyer acquisition** — Outbound to three to five engineering teams currently running agents at scale who would route a pilot allocation of their monthly AI spend through the platform. Time cost more than money cost, but travel/conference budget helps.
5. **Builder time** — Chimera working full-time on this for six months rather than client work.

---

## 11. Ask

**Range: $50K–$150K**

Conservative ask ($50K): funds audit, six months of infrastructure, and partial liquidity seeding. Builder works part-time.

Full ask ($150K): funds audit, infrastructure, full POL seed, and six months of builder time at a sustainable rate. Enables focused execution to Phase 1 targets (1K accepted jobs, 100 workers, AIU index live).

Both scenarios target the same Phase 1 milestones. The difference is time to milestone and whether Chimera can work on this full-time.

**What success looks like at the end of the grant period:**
- 1,000+ on-chain accepted job records
- 100+ workers with verifiable reputation scores
- AIU index publishing with sufficient history to evaluate Phase 2 derivatives feasibility
- Financial model assumptions replaced with real pilot data

This is an honest ask for early infrastructure that has no token sale, no VCs, and no fabricated traction. The design depth is real. The gap in the market is real. The question is whether the execution can match.
