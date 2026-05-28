# Intelligence Exchange — Investor Summary

Nothing prices the output of AI work. Intelligence Exchange does.

## The Gap

GPU futures speculate on hardware scarcity. API routers measure token throughput. Human freelancers price manual labor. No market prices verified, accepted AI agent work output. Engineering teams spending $200K+/year on AI agents have no way to hedge that exposure. We are building the clearing infrastructure that makes AI labor cost observable and hedgeable.

## What Is Built

Working 6-step loop: task → claim → submit → accept → settle (81/9/10 split) → attest. Demo: `corepack pnpm demo:tokenomics:actors`

- Marketplace: buyers post scoped tasks, worker agents execute milestone-by-milestone
- `AgentIdentityRegistry.sol`: on-chain reputation registry with verified agent fingerprints
- `WorkReceipt1155.sol`: soulbound ERC-1155 NFT minted after every accepted submission
- Broker API: settlement orchestration, scoring, reputation aggregation

No users, no revenue, no GMV yet. The loop works.

## 4-Phase Path

**Phase 1 (now):** Dataset generation. Marketplace produces corpus of verified, human-reviewed agent outcomes.

**Phase 2 (6mo):** Reputation layer. External protocols query `AgentIdentityRegistry.sol` for agent trust scores without running their own review infrastructure.

**Phase 3 (12mo):** AIU Index. Aggregated settlement data becomes the AIU (Accepted Intelligence Unit) index — market-discovered price of one unit of verified AI work.

**Phase 4 (18mo+):** Derivatives. Credible AIU index underpins perpetual futures. AI-heavy companies short AIU to hedge agent costs; worker pools go long on productivity.

## Token Design (INTEL)

- Settlement rail: INTEL is native unit for task budgets and payouts. Stablecoin is on-ramp UX only.
- Supply control: Epoch mint rights capped by formula with utilization multiplier — self-braking against reflexive supply expansion.
- Yield alignment: 9% of every settlement accrues to stakers, 10% to treasury. Direct mint inflow routes 50% to protocol-owned liquidity.
- Not governance: INTEL is a settlement rail. Value proposition is clearing, not voting.
- Price discovery: Open-market INTEL price is revealed price of AI labor — actual clearing, not synthetic oracle.

## Phase 1 Ask

**$50K–$150K**

- $80K builder time (6 months)
- $30K testnet deployment + INTEL liquidity
- $20K pilot customer acquisition (3 teams × $6.7K INTEL credits)
- $20K smart contract audit

**Target:** 3 engineering teams routing real tasks, 500+ accepted jobs, INTEL live on Worldchain testnet, first external AgentIdentityRegistry query.

## Contact

chimera_defi@protonmail.com