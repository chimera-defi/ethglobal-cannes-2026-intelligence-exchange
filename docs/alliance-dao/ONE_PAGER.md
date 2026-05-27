# Intelligence Exchange — Investor One-Pager

**Builder:** Chimera (chimera_defi@protonmail.com) | ETHGlobal Cannes 2026

---

No market prices the output of AI work. We are building the one that does — and the on-chain reputation layer that makes it trustworthy.

---

## The intelligence derivatives angle

The end-state is a hedgeable market for AI labor cost. Engineering teams spending $200K+/year on AI agents have no way to hedge that exposure. GPU futures and compute tokens speculate on hardware scarcity. Nothing tracks the cost of verified, accepted intelligence work.

Intelligence Exchange produces that index as a side-effect of operating a milestone marketplace. Every accepted job generates a signed attestation: `{agentFingerprint, score, reviewerAddress, signature}`. Aggregated, these records become the AIU (Accepted Intelligence Unit) index — the market-discovered price of one unit of verified AI work output. A credible AIU index, with six or more months of history, can underpin perpetual futures contracts. An AI-heavy company could short AIU perpetuals to hedge against rising agent costs the same way an airline hedges jet fuel. A worker pool could go long to bet on their own productivity.

No compute futures market touches this. USDCI and GPU futures speculate on hardware scarcity. Intelligence Exchange measures and prices the output of intelligence work itself. The marketplace runs first, the index emerges from the data, and the derivatives follow once the index has earned credibility. Derivatives are Phase 4 — 12+ months away. Phase 1 is the dataset-generation mechanism that makes Phase 4 possible.

---

## What exists today

Working 6-step loop, verified 2026-05-27:

**task → claim → submit → accept → settle (81/9/10 split) → attest**

Demo: `corepack pnpm demo:tokenomics:actors`

- Buyer funds idea → INTEL minted from stable on-ramp, escrowed in ledger
- Worker claims milestone (45-min lease) → submits artifact with deterministic scoring
- Reviewer accepts → settlement fires: 81% worker, 9% staker yield pool, 10% treasury
- Signed attestation written: `{agentFingerprint, score, reviewerAddress, signature}`
- `GET /workers/:fingerprint/reputation` → returns acceptedCount + avgScore

No users, no revenue, no GMV. The loop works. The pilot does not exist yet.

---

## Token design

- **Settlement rail:** INTEL is the native unit for task budgets and payouts. Stablecoin is an on-ramp UX convenience, not a second rail. INTEL price is the revealed price of AI labor — actual clearing, not a synthetic oracle.
- **Supply control:** Epoch mint rights are capped by `min(k * sqrt(stakedIntel), walletCap, globalCapRemaining)` with a `utilizationMultiplier` that makes minting more expensive when marketplace activity is low — a deliberate brake against reflexive supply expansion.
- **Yield composability:** 9% of every accepted settlement accrues to stakers, 10% to treasury. Direct mint inflow routes 50% to protocol-owned liquidity, 45% to staker yield. Staker alignment is with marketplace health, not speculation on roadmap.
- **Not a governance token.** INTEL is a settlement rail. The value proposition is clearing.

---

## The gap we fill

| What exists | What it prices | What it misses |
|-------------|----------------|----------------|
| GPU markets | Hardware hours | Intelligence output quality |
| API routers | Token throughput | Acceptance gating, reputation |
| Compute tokens | Hardware scarcity | Verified work records |
| Human freelance platforms | Human labor | AI agents, on-chain settlement |
| **Nothing** | **Accepted intelligence output** | **(this is the gap)** |

---

## Team and ask

**Builder:** Chimera — DeFi contributor since 2020, solo build at ETHGlobal Cannes 2026. Actively seeking a co-founder with AI agent ecosystem BD experience. Co-founder equity reserved.

**Funding ask:** $50K–$150K  
**Use of funds:** $80K builder time (6 months) / $30K testnet deployment + INTEL liquidity / $20K pilot customer acquisition (3 teams × $6.7K INTEL credits) / $20K smart contract audit

**Phase 1 target (6 months):** 3 engineering teams routing real tasks, 500+ accepted jobs, INTEL live on Worldchain testnet, first external AgentIdentityRegistry query

**Contact:** chimera_defi@protonmail.com  
**Repo:** ethglobal-cannes-2026-intelligence-exchange (on request)
