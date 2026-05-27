# Intelligence Exchange — Investor One-Pager

**Builder:** Chimera (chimera_defi@protonmail.com) | ETHGlobal Cannes 2026

---

## The gap

Every team running AI agents at scale today ($100K–$300K/year) faces the same invisible problem: there is no tamper-evident record of which work was accepted, which agent produced it, or what the effective cost-per-output was. GPU markets price hardware. API routers price tokens. Nobody prices *accepted intelligence output* — the thing that actually matters to a buyer.

When an AI agent ships bad work, there is no neutral dispute layer. When a buyer wants to choose between agents, there is no portable reputation. When a CFO wants to hedge rising AI labor costs, there is no market to trade against. These are not hypothetical gaps — they are structural absences in a category that is already spending at scale.

---

## The product

Intelligence Exchange is a milestone marketplace where buyers post scoped AI tasks with INTEL-denominated budgets, human-backed worker agents execute them, and human reviewers gate every payout. On acceptance, settlement routes automatically (81% worker / 9% staker yield / 10% treasury) and an on-chain attestation records the accepted work in `AgentIdentityRegistry.sol`. The marketplace is live at the code level: four Solidity contracts, a Hono broker API, a TypeScript worker CLI, and a React frontend are all working at hackathon stage.

The marketplace is how we bootstrap. On-chain reputation records are the durable infrastructure. Any protocol that needs to verify an agent's track record — lending, insurance, task routing — can query the registry without depending on our marketplace to stay alive.

---

## Token design

- **Settlement rail:** INTEL is the native unit for task budgets and payouts. Stablecoin is an on-ramp UX convenience, not a second rail.
- **Supply control:** Epoch mint rights are capped by `min(k * sqrt(stakedIntel), walletCap, globalCapRemaining)` with a `utilizationMultiplier` that makes minting more expensive when marketplace activity is low — a deliberate brake against reflexive supply expansion.
- **Yield composability:** 9% of every accepted settlement accrues to stakers, 10% to treasury. Direct mint inflow routes 50% to protocol-owned liquidity, 45% to staker yield. The token creates alignment between stakers and marketplace health, not speculation on roadmap.

---

## Traction (what exists today)

Built solo at ETHGlobal Cannes 2026:

- `AgentIdentityRegistry.sol` — agent identity + reputation attestation on Worldchain
- `AdvancedArcEscrow.sol` — milestone-gated budget escrow
- `IntelToken.sol` — ERC-20, 100M cap, burn, pause
- `IdeaEscrow.sol` — task budget container
- Broker API, Worker CLI, Web App — full job lifecycle working end to end
- Working demo: `corepack pnpm demo:tokenomics:actors`
- Mainnet-fork smoke test: `corepack pnpm --filter intelligence-exchange-cannes-contracts smoke:intel-liquidity:mainnet-fork`

No users, no revenue, no GMV. Design and code exist. Pilot does not.

---

## The intelligence derivatives angle

The marketplace produces a side-effect that no other platform captures: a normalized, verifiable stream of accepted work records. Each record carries a task weight, an acceptance multiplier, and a quality score. Aggregated, these become the AIU (Accepted Intelligence Unit) index — the market-discovered price of one unit of verified AI work output.

This is what makes Intelligence Exchange crypto-native rather than crypto-wrapped. A credible AIU index, with six or more months of history, can underpin perpetual futures contracts. An AI-heavy company could short AIU perpetuals to hedge against rising agent costs the same way an airline hedges jet fuel. A worker pool could go long to bet on their own productivity. The AIU index would be to AI labor cost what the S&P 500 is to equity exposure — a normalized benchmark that makes a diffuse, heterogeneous market legible and tradable.

No compute futures market touches this. USDCI and GPU futures speculate on hardware scarcity. Intelligence Exchange measures and prices the output of intelligence work itself. The marketplace runs first, the index emerges from the data, and the derivatives follow once the index has earned credibility.

---

## Ask + contact

**Funding ask:** $50K–$150K  
**Use:** Smart contract audit ($15K–$30K), infrastructure ($2K–$4K/month), INTEL/USDC liquidity seed ($20K–$50K), six months of full-time builder execution  
**Phase 1 target:** 1,000 accepted on-chain jobs, 100 workers with reputation scores, AIU index live

**Builder:** Chimera  
**Contact:** chimera_defi@protonmail.com  
**Repo:** ethglobal-cannes-2026-intelligence-exchange (on request)
