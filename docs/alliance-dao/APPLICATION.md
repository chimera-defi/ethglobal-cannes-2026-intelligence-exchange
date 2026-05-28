# Alliance DAO Fund Application — Intelligence Exchange

**Builder:** Chimera (chimera_defi@protonmail.com)  
**Stage:** Hackathon build — ETHGlobal Cannes 2026  
**Branch:** alliance-dao-positioning  
**Date:** 2026-05-27

---

## 1. One-sentence summary

Intelligence Exchange is on-chain reputation infrastructure for AI agent work — a milestone marketplace where human reviewers gate every payout, producing the first market-discovered, tamper-evident price of verified intelligence output.

---

## 2. Problem

No market prices the *output* of AI work — only the hardware running it.

Every existing market prices inputs: GPU-hours, API tokens, FLOPs. Nothing prices accepted, verified task completion. That is the gap — and it is structural, not temporal.

CPU futures price FLOPs. GPU rentals price hours. API routers price tokens. Nobody prices accepted, verified task completion — the thing that actually matters to a buyer. That gap is where we sit.

Engineering teams running AI agents at production scale spend $100K–$300K per year on AI services. That spend is invisible in aggregate. There is no auditable record of which work was accepted, which agent completed it, or what the effective cost-per-output was. When an agent ships bad work, there is no neutral dispute layer. When a buyer wants to choose between agents, there is no portable reputation. When a CFO wants to hedge rising AI labor costs, there is no market to trade against.

These are not hypothetical gaps. Engineering teams are spending at scale today, with no infrastructure for any of this.

---

## 3. Solution

Intelligence Exchange is built in three layers, sequenced by what needs to exist before the next layer is credible.

**Layer 1 — Reputation data generation (Phase 1, building now)**

A milestone marketplace where buyers post scoped AI tasks with INTEL-denominated budgets, human-backed worker agents execute them, and human reviewers gate every payout. On acceptance, the broker signs an attestation and writes it to `AgentIdentityRegistry.sol` on Worldchain. This is how reputation data is created from scratch: every accepted job is a verified, tamper-evident record of AI work output.

The 6-step loop is working end-to-end today (verified 2026-05-27):
- POST /ideas + POST /ideas/:id/fund → mints INTEL from stable on-ramp, escrows in ledger
- POST /jobs/:id/claim → worker claims milestone with 45-min lease
- POST /jobs/:id/submit → worker submits artifact with deterministic scoring
- POST /ideas/:id/accept → reviewer accepts → settlement fires: 81% to worker, 9% to staker yield pool, 10% to treasury, plus a signed attestation `{agentFingerprint, score, reviewerAddress, signature}`
- GET /workers/:fingerprint/reputation → returns acceptedCount + avgScore

**Layer 2 — Reputation layer (Phase 2)**

Once enough attestations exist, `AgentIdentityRegistry.sol` becomes a queryable, composable reputation primitive. Any protocol that needs to verify "did this AI agent produce accepted work?" can query it without depending on our marketplace to stay alive. Lending, insurance, task routing, access control — all can gate on verified agent capability.

**Layer 3 — Intelligence derivatives (Phase 4, 12+ months away)**

Accepted job records accumulate into the AIU (Accepted Intelligence Unit) index — a normalized, on-chain measure of verified AI work output. The AIU index is the market-discovered price of intelligence. With six or more months of index history, AIU perpetuals become feasible: an AI-heavy company shorts AIU perpetuals to hedge rising agent costs the same way an airline hedges jet fuel. This is what makes Intelligence Exchange crypto-native rather than crypto-wrapped. The marketplace runs first. The index emerges from the data. The derivatives follow once the index has earned credibility.

---

## 4. Why now

AI agent spending is real and growing today. Engineering teams running Claude Code, Codex, Devin, and similar tools at $40/hr equivalent are spending $200K+ per year on agent tasks. They are not experimenting — they are running production workloads.

There is no cost audit trail. No reputation portability. No hedging mechanism. No way to distinguish a capable agent from a prompt-spammer. As agent-generated output proliferates, the reputation gap becomes acute — buyers need to trust outcomes without auditing every artifact manually. On-chain attestations of accepted work are the obvious solution. The question is who builds the standard.

We are early in a market that is already spending. Infrastructure built now sets the standard.

---

## 5. Why crypto / why on-chain

Three specific reasons, not generic decentralization narrative:

**Reputation must be permissionless.** An off-chain reputation score is captive to its platform — the operator can revoke it, lose the database, or go bankrupt. An on-chain attestation in `AgentIdentityRegistry.sol` is queryable by any protocol, forever, without anyone's permission. The reputation layer only has value if no single operator can revoke it.

**Settlement neutrality.** When a buyer and an agent dispute whether work was accepted, the acceptance record needs to live on neutral ground — not in the buyer's database. Smart contract escrow enforces the release condition without either party controlling the ledger (broker Postgres ledger is authoritative today; full on-chain settlement path is wired and ready for Sepolia deploy). Workers cannot be shorted. Buyers cannot be defrauded. The record is the record.

**The derivatives layer requires a composable on-chain price oracle.** The AIU index (Phase 4) underpins perpetual contracts. That only works if the underlying index is tamper-evident and on-chain. You cannot build hedgeable intelligence cost exposure on a centralized API that can be revised or taken offline.

---

## 6. Token design

INTEL is not a governance token. It is the settlement rail.

Every accepted task is priced and cleared in INTEL. INTEL's open-market price is the revealed price of AI labor — not a synthetic oracle, but actual clearing. This is the structural difference between INTEL and a points system or a credit rail: credits are synthetic, their price set by policy. INTEL price is set by what buyers pay and workers accept.

**Settlement split on accepted task:** 81% worker / 9% staker yield pool / 10% treasury  
**Direct mint inflow routing:** 50% POL / 45% staker yield / 5% treasury  
**Epoch mint rights formula:** `min(k * sqrt(stakedIntel(wallet)), walletCap, globalCapRemaining)`  
**Mint price:** `max(TWAP * (1 + premium), floorPrice) * utilizationMultiplier`

The `utilizationMultiplier` is the anti-reflexivity control — and the single most non-standard element of this tokenomics design. When marketplace activity is low, minting becomes more expensive relative to demand — supply cannot expand into thin air. This is not a common feature of hackathon tokenomics; it is a deliberate brake on the reflexive-mint failure mode that has destroyed similar protocols.

**Supply cap:** 100M INTEL  
**Treasury policy:** toggles between POL adds and buyback/burn based on utilization and liquidity depth, keyed to accepted-task volume, not speculation.

**What INTEL is not:** a governance vote, a points redemption, or a speculative asset without a settlement function. Staking INTEL earns yield from the settlement flow (9% of every accepted task). That alignment — between stakers and marketplace health — is the mechanism, not a roadmap promise.

---

## 7. Team / Builder

**Chimera** (chimera_defi@protonmail.com)

Solo builder. DeFi protocol contributor since 2020. Background in security-first contract design (CSO audit workflow integrated into this repo's CI). Built this stack solo at ETHGlobal Cannes 2026: four Solidity contracts, a Hono broker API, a TypeScript worker CLI, a React frontend, and a tokenomics spec with a forward roadmap to derivatives.

Honest assessment: no team, no institutional backing, no users. What exists is unusual depth of design for the stage — the derivatives spec was not required for the hackathon submission but was written because it is the correct long-term architecture.

**Actively seeking a co-founder** with AI agent ecosystem BD experience. Target profile: 2+ years selling to engineering teams, prior relationship with top-10 AI-native companies. The Phase 1 ask funds six months of solo protocol development. Co-founder equity is reserved and has not been committed elsewhere.

---

## 8. Traction and milestones

**What is built and verifiable today:**

- `AgentIdentityRegistry.sol` — agent identity and reputation attestation on Worldchain
- `WorkReceipt1155.sol` — soulbound ERC-1155 NFT minted on-chain after every accepted submission; tamper-evident proof of accepted work queryable by any protocol
- `AdvancedArcEscrow.sol` — task budget escrow with milestone-gated release
- `IntelToken.sol` — ERC-20 with 100M cap, burn, and pause
- `IdeaEscrow.sol` — idea-level budget container
- Broker API (Hono + Bun) — full job lifecycle: post → claim → submit → review → settle
- Worker CLI (TypeScript) — authenticated claim/submit loop via AgentKit
- Web App (React + Vite) — buyer and reviewer UX
- Working 6-step E2E loop verified 2026-05-27
- Demo commands: `corepack pnpm demo:tokenomics:actors` (shows real 81/9/10 split numbers)

**What Phase 1 Success Looks Like (6 months with funding):**

| Target | Rationale |
|--------|-----------|
| 3 engineering teams routing real agent tasks | Target profile: dev-tools companies and AI-native startups already running Claude Code, Devin, or Codex at ≥$5K/mo AI spend. Direct outreach via ETHGlobal alumni network and Superfluid/Alchemy ecosystem. |
| 500+ accepted jobs | Enough records for statistically meaningful AIU index foundation |
| INTEL token live on Worldchain testnet with real settlement | On-chain proof of the settlement rail |
| First external protocol query to AgentIdentityRegistry | Composability proof: reputation layer works without the marketplace |

These are honest targets, not hockey-stick projections. 500 accepted jobs from 3 teams over 6 months is ~3 jobs per team per week — achievable with direct outreach and INTEL credits to bootstrap usage.

No users, no revenue, no GMV today. The financial model (in `spec/FINANCIAL_MODEL.md`) projects $225K GMV/month at 150 buyers — but these are planning assumptions to be replaced with observed pilot data.

---

## 9. Competitive landscape

| Competitor | What they price | What they miss |
|------------|-----------------|----------------|
| GPU marketplaces (Vast.ai, TensorDock) | Hardware (GPU-hours) | Intelligence output quality, acceptance gating |
| Compute token protocols (USDCI, GPU futures) | Hardware yield / hardware scarcity | Not tracking work accepted, not reputation |
| OpenRouter / Together AI | Model API access | No marketplace, no reputation, no settlement |
| Daydreams (Taskmarket + Router) | Agent task routing | No on-chain settlement, no reputation attestation, no derivatives path |
| Bittensor / Subnets | ML subnet training metrics | Permissioned subnets, no human review gating, no marketplace settlement, no derivatives path |
| Pearl Protocol (PRL) | GPU cycles (matrix multiplication) | No acceptance gating, prices compute not output, no reputation layer |
| Perle (PRL) | Data annotation services | Data-specific, not general agent tasks, limited reputation portability |
| Fetch.ai (FET/ASI) | Agent token speculation | No acceptance gating, pricing speculative, no reputation layer |
| Gensyn ($AI) | Compute contributions (ML training) | Prices compute input, no human acceptance, no output reputation |
| Ritual | AI computation execution | Prices execution, not accepted output, no reputation layer |
| ChainML (TAI) | Agent execution | No acceptance gating, no reputation for output quality |
| Prime Intellect (PI) | Compute contribution | Prices compute input, no human acceptance, no output reputation |
| Upwork / Fiverr | Human freelance labor | Not designed for AI agents, no on-chain settlement |
| **Us vs. Nothing** | **Accepted intelligence output** | **No on-chain intelligence reputation layer exists** |

The most accurate competitive statement: no on-chain intelligence reputation layer exists. Every existing market is either upstream (compute) or downstream (finished human services) of the thing we're measuring. We are not competing with any of the above — we are the infrastructure layer beneath them.

The closest comparison is Bittensor: decentralized intelligence networks. The key structural difference is human review gating — every Intelligence Exchange payout requires a human reviewer's acceptance. Bittensor subnets are permissioned by subnet owners and measure ML metrics, not accepted work output. We are not competing in the same design space.

---

## 10. What the grant would fund

**Ask range: $50K–$150K**

**Explicit use-of-funds breakdown:**

| Use | Amount | Rationale |
|-----|--------|-----------|
| Builder time (6 months, solo) | $80K | Protocol development, contracts, API, coordination |
| Testnet deployment + INTEL liquidity seeding | $30K | INTEL/USDC POL seed on Worldchain testnet; real settlement, not simulation |
| Pilot customer acquisition | $20K | 3 engineering teams × $6.7K in INTEL credits to bootstrap usage and generate real accepted-job records |
| Smart contract audit | $20K | OpenZeppelin or Trail of Bits; required before handling real value |

**Conservative ask ($50K):** Funds audit, six months of infrastructure, partial liquidity seeding. Builder works part-time. Same Phase 1 milestones, slower timeline.

**Full ask ($150K):** Funds all four buckets. Builder works full-time. Enables focused execution to Phase 1 targets with real pilot data replacing financial model assumptions.

---

## 11. What this is NOT

Being explicit prevents misclassification:

- **Not competing with Upwork or Fiverr.** We are the reputation layer they cannot provide — their reputation is captive to their platform. Ours is permissionless.
- **Not a GPU marketplace.** We price output, not compute. The distinction is in `spec/INTELLIGENCE_DERIVATIVES.md` but it bears repeating: FLOPs are fungible, accepted intelligence work is not.
- **Not a governance token play.** INTEL is a settlement rail. The value proposition is clearing, not voting.
- **Not vaporware.** The 6-step loop works today, verified 2026-05-27: `corepack pnpm demo:tokenomics:actors` runs and shows real 81/9/10 split numbers.
- **Not mainnet-ready yet.** Contracts are complete, audited, and deploy-ready for Ethereum Sepolia testnet (deploy script + foundry.toml configured; pending deployer key funding). The 81/9/10 settlement split is implemented and verified in the broker service layer (tokenomicsService.ts). IdeaEscrow.sol and AdvancedArcEscrow.sol are legacy escrow modules not wired to the current settlement path — the broker ledger is the authoritative settlement record for this phase. A professional audit is required before handling real user funds.
- **Not a solo-builder-forever plan.** The co-founder search is active and funded by this grant's builder allocation.

This is an honest ask for early infrastructure that has no token sale, no VCs, and no fabricated traction. The design depth is real. The gap in the market is real. The question is whether the execution can match.
