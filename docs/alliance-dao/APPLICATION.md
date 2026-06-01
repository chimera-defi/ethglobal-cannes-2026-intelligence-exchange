# Alliance DAO Application — Intelligence Exchange

**Builder:** Chimera (chimera_defi@protonmail.com)  
**Stage:** Hackathon build — ETHGlobal Cannes 2026  
**Last updated:** 2026-05-29  
**Live demo:** http://168.119.15.122  
**AIU Index (live):** http://168.119.15.122/v1/cannes/aiu/index

---

## 1. What we are

Nothing prices the output of AI work. Intelligence Exchange does.

GPU futures price hardware scarcity. API routers measure token throughput. Human freelance platforms price human labor. Nothing prices verified, accepted AI agent work output — and that gap is structural, not temporal. It exists because no market has a human acceptance gate. Without one, you cannot distinguish a capable agent from a prompt-spammer, and you cannot build a credible price index on top of unverified output.

Intelligence Exchange is the marketplace that creates that data. Every accepted task writes a signed attestation on-chain and saves a data point to the AIU (Accepted Intelligence Unit) index — the market-discovered price of one unit of verified intelligence work. The index is live today: **12.15 INTEL per accepted job**, 5 verified settlements, 71% acceptance rate (`GET /v1/cannes/aiu/index`). That index can eventually underpin perpetual futures, letting AI-heavy engineering teams hedge rising agent costs the same way an airline hedges jet fuel.

The marketplace runs first. The index emerges from the data. The derivatives follow once the index earns credibility.

---

## 2. The structural gap

| What exists | What it prices | What it misses |
|---|---|---|
| GPU markets (Vast.ai, TensorDock) | Hardware hours | Intelligence output quality |
| API routers (OpenRouter, Together AI) | Token throughput | Acceptance gating, reputation |
| Compute tokens (Pearl, Gensyn, Prime Intellect) | Hardware/FLOPs | Verified work records |
| ML metric protocols (Bittensor) | Subnet performance | Human-reviewed acceptance |
| Agent coordination (SingularityNET, Olas, Fetch.ai) | Service/coordination | Acceptance-gated settlement |
| Human freelance (Upwork, Fiverr) | Human labor | AI agents, on-chain settlement |
| **Nothing** | **Accepted intelligence output** | **(this is the gap)** |

The most accurate competitive statement: no on-chain intelligence reputation layer exists. Every protocol analyzed is either upstream (compute/hardware) or downstream (finished human services) of what we measure. Full competitor analysis: `docs/COMPETITOR_ANALYSIS_DEEP.md`.

---

## 3. How it works

Six-step loop, working end-to-end today:

```
task → claim → submit → accept → settle (81/9/10) → attest
```

1. Buyer funds an idea with `INTEL`. The broker decomposes it into milestones.
2. Worker agent claims a milestone (45-min lease) and executes it.
3. Worker submits artifact and execution trace.
4. Human reviewer accepts or rejects.
5. On acceptance: **81%** worker · **9%** staker yield · **10%** treasury.
6. A soulbound `WorkReceipt1155` NFT mints on-chain. A signed attestation `{agentFingerprint, score, reviewerAddress, signature}` is written to `AgentIdentityRegistry.sol`.

The human reviewer gate is the load-bearing mechanism. It is what makes every downstream record meaningful — and what no other protocol has.

**Three layers, sequenced by credibility:**

- **Layer 1 (now):** Marketplace generates the corpus of verified, human-reviewed agent outcomes.
- **Layer 2 (6 months):** `AgentIdentityRegistry.sol` becomes a permissionless, composable reputation primitive — queryable by lending, insurance, task routing, access control without depending on our marketplace.
- **Layer 3 (12+ months):** AIU index underpins perpetual futures. AI-heavy teams hedge agent cost exposure; worker pools go long on their own productivity.

---

## 4. Why now

Engineering teams running Claude Code, Devin, Codex at $40/hr equivalent are spending $200K+/year on agent tasks today — not experimenting, running production workloads.

They have no cost audit trail. No reputation portability. No hedging mechanism. No way to distinguish a capable agent from a prompt-spammer without auditing every artifact manually. As agent output proliferates, the reputation gap becomes acute. On-chain attestations of accepted work are the obvious infrastructure solution. The question is who builds the standard first.

We are early in a market that is already spending. Infrastructure built now sets the standard.

---

## 5. Why crypto / why on-chain

Three specific reasons, not generic decentralization narrative:

**Reputation must be permissionless.** An off-chain reputation score is captive to its platform — the operator can revoke it, lose the database, or go bankrupt. An on-chain attestation in `AgentIdentityRegistry.sol` is queryable by any protocol, forever, without anyone's permission. The reputation layer only has value if no single operator can revoke it.

**Settlement neutrality.** When a buyer and an agent dispute whether work was accepted, the acceptance record needs to live on neutral ground — not in the buyer's database. Smart contract escrow enforces the release condition without either party controlling the ledger. Workers cannot be shorted. Buyers cannot be defrauded. The record is the record.

**The derivatives layer requires a composable on-chain price oracle.** The AIU index underpins perpetual contracts. That only works if the underlying index is tamper-evident and on-chain. You cannot build hedgeable intelligence cost exposure on a centralized API that can be revised or taken offline.

---

## 6. Token design

INTEL is not a governance token. It is the settlement rail.

Every accepted task is priced and cleared in INTEL. INTEL's open-market price is the revealed price of AI labor — actual clearing, not a synthetic oracle. This is the structural difference between INTEL and a points system: credits are synthetic, their price set by policy. INTEL price is set by what buyers pay and workers accept.

**Settlement split:** 81% worker · 9% staker yield · 10% treasury  
**Mint inflow routing:** 50% POL · 45% staker yield · 5% treasury  
**Mint price:** `max(TWAP × (1 + premium), floorPrice) × utilizationMultiplier`  
**Epoch mint cap per wallet:** `min(k × sqrt(stakedIntel), walletCap, globalCapRemaining)`

The `utilizationMultiplier` is the anti-reflexivity control — the single most non-standard element of this design. When marketplace activity is low, minting becomes more expensive relative to demand: supply cannot expand into thin air. This is a deliberate brake on the reflexive-mint failure mode that has destroyed similar protocols.

The epoch mint cap formula (`sqrt(stakedIntel)`) is the second anti-concentration control: marginal mint rights decrease with stake size, preventing whale dominance of mint capacity.

POL-first from day one (50% of all mint inflow) means the protocol builds its own liquidity rather than depending on mercenary LPs.

**Supply cap:** 100M INTEL. INTEL is not governance; staking earns yield from the settlement flow (9% of every accepted task). Staker alignment is with marketplace health, not roadmap speculation.

---

## 6a. The derivatives angle (AIU perpetuals)

The AIU (Accepted Intelligence Unit) index is a market-discovered price of verified intelligence work, built from actual human-gated settlements. It is not a synthetic oracle or a token price — it is the average INTEL per accepted job over rolling settlement windows, computed from tamper-evident on-chain records.

A credible index with 6+ months of settlement history can underpin perpetual futures. Two parties with natural hedging positions exist today:

- **Engineering teams** running Claude Code, Devin, or Codex at $40/hr equivalent and spending $200K+/year on agent tasks. They have no mechanism to hedge rising agent costs. Short AIU perpetuals = jet fuel hedge for AI labor.
- **Worker pools and agent operators** whose revenue scales with productivity. Long AIU perpetuals = a bet on their own productivity — positive carry when their output quality improves.

No compute futures market touches this. GPU futures and USDCI speculate on hardware scarcity. INTEL/AIU measures and prices the thing buyers actually care about: accepted intelligence output.

The sequencing is deliberate: marketplace generates data (Phase 1) → index earns credibility from settlement history (Phase 2) → derivatives underpin the index (Phase 3, 12+ months). The grant funds Phase 1. The derivatives path is why Phase 1 data quality matters — garbage-in is un-hedgeable.

---

## 7. What is built today

**Live demo:** http://168.119.15.122 — the full stack is running in production.

### Smart contracts (15 passes of internal security audit, 688 tests, 0 failures)

| Contract | Function |
|---|---|
| `AgentIdentityRegistry.sol` | Agent identity + reputation attestation (ERC-8004 style) |
| `WorkReceipt1155.sol` | Soulbound ERC-1155 NFT minted on every accepted submission |
| `IntelToken.sol` | ERC-20, 100M cap, burn, pause, Ownable2Step |
| `IntelMintController.sol` | TWAP-gated mint with utilization multiplier and anti-reflexivity brake |
| `IntelStaking.sol` | Stake/unstake with ETH yield accumulator; reentrancy-guarded |
| `IntelTimelockController.sol` | OpenZeppelin timelock for admin actions (15 min testnet / 48h mainnet) |
| `WorkerStakeManager.sol` | Worker bond staking with slashing on fraud |
| `ReviewerStakeManager.sol` | Reviewer bond + fee share; slash on overturned disputes |
| `DisputeResolution.sol` | Staker jury disputes; slash reviewer bond on overturn |
| `BuybackBurn.sol` | Treasury buyback/burn with TWAP circuit breaker and recovery path |
| `EpochRewardDistributor.sol` | Per-epoch performance bonuses; per-wallet cap prevents gaming |
| `TaskEscrow.sol` | Per-task escrow with milestone release and dispute window |
| `IntelPOLManager.sol` | Protocol-owned liquidity manager; routes mint inflow 50% to POL |
| `LiquidityMining.sol` | LP incentive gauge for POL bootstrap |
| `ReviewerQueue.sol` | Weighted reviewer assignment queue |
| `ReviewerCredential.sol` | Credential gate for reviewer eligibility |
| `CategoryRegistry.sol` | On-chain task category weighting (10,000 bps total) |
| `IdentityGate.sol` | World ID proof-of-human verification gate |
| `IntelVesting.sol` | Linear + cliff vesting for team/contributor allocations |
| `AdvancedArcEscrow.sol` | Arc testnet escrow: conditional release, dispute, vesting, USDC |
| `IdeaEscrow.sol` | Legacy idea-level escrow (deployed on Arc testnet, not on settlement path) |

### Application layer

| Component | Stack | Status |
|---|---|---|
| Broker API | Hono + Bun + Postgres + Redis | Full job lifecycle: post → claim → submit → review → settle |
| Worker CLI | TypeScript | Authenticated claim/submit loop |
| Web App | Next.js + RainbowKit | Buyer/reviewer UX with GitHub repo picker |
| Redis rate limiter | Sliding window, in-memory fallback | Production-deployed |
| GitHub OAuth | Repo picker → PR delivery | Live |
| Health monitoring | health-watch.sh + emergency-stop.sh | Production-deployed |
| **AIU index** | `GET /v1/cannes/aiu/index` + `/history` | **Live — 12.15 INTEL/job, 5 settlements, 71% acceptance rate** |
| Agent reputation auto-sync | Inline upsert on each acceptance | Live — no manual webhook required |
| Rejection INTEL refund | Returns reserved INTEL to buyer on rework | Live |

### Security posture

15 internal security audit passes (methodology: x-ray adversarial + CSO STRIDE). No CRITICAL or HIGH findings remain open. Each pass targeted specific attack surfaces: reentrancy, CEI ordering, TWAP manipulation, slash race conditions, LP reward drainage, and cross-contract economic interactions. The pass-15 reports are in `packages/intelligence-exchange-cannes-contracts/x-ray/`. A professional audit (Trail of Bits or OpenZeppelin) is required before handling real user funds — included in the grant ask.

---

## 8. Traction and phase targets

No external users, no revenue. The loop works and the AIU index is live with real settlement data.

**Verifiable today:**
```bash
# Live endpoints
curl http://168.119.15.122/v1/cannes/aiu/index      # AIU: 12.15 INTEL/job, 5 jobs, 71% acceptance
curl http://168.119.15.122/v1/cannes/jobs            # 25 queued jobs in DB

# Local demo
corepack pnpm demo:tokenomics:actors     # full 81/9/10 split actor simulation
corepack pnpm validate:all               # typecheck + build + 688 tests
```

**Phase 1 targets (6 months with funding):**

| Target | Rationale |
|---|---|
| 3 engineering teams routing real agent tasks | Teams spending ≥$5K/mo on Claude Code, Devin, or Codex. ETHGlobal alumni + Superfluid/Alchemy ecosystem outreach. |
| 500+ accepted jobs | Foundation for statistically meaningful AIU index (5 already in DB from internal testing) |
| INTEL live on Worldchain testnet, real settlement | On-chain proof, not simulation |
| First external AgentIdentityRegistry query | Composability proof: reputation layer works without the marketplace |

500 accepted jobs from 3 teams over 6 months is ~3 jobs/team/week — achievable with INTEL credits to bootstrap. These are honest targets, not hockey-stick projections.

---

## 9. What the grant would fund

**Ask range: $50K–$150K**

| Use | Amount | Rationale |
|---|---|---|
| Builder time (6 months, solo) | $80K | Protocol development, contracts, API, coordination |
| Testnet deployment + INTEL liquidity seeding | $30K | INTEL/USDC POL seed on Worldchain testnet |
| Pilot customer acquisition | $20K | 3 teams × $6.7K in INTEL credits to bootstrap real accepted-job records |
| Professional smart contract audit | $20K | Trail of Bits or OpenZeppelin; required before real value on-chain |

**$50K conservative:** Audit + infrastructure + partial liquidity. Builder part-time. Same Phase 1 milestones, slower.  
**$150K full ask:** All four buckets. Builder full-time. Direct path to Phase 1 pilot with real data replacing projections.

---

## 10. Team

**Chimera** (chimera_defi@protonmail.com) — Solo builder. DeFi contributor since 2020. Background in security-first contract design (CSO audit workflow integrated into CI). Built this stack solo at ETHGlobal Cannes 2026: 21 Solidity contracts across settlement, reputation, token economics, and governance layers; a Hono/Bun broker API; TypeScript worker CLI; Next.js frontend; and a forward roadmap to derivatives.

Honest assessment: no team, no institutional backing, no users. What exists is unusual design depth for the stage — the derivatives spec was not required for the hackathon but was written because it is the correct long-term architecture.

**Actively seeking a co-founder** with AI agent ecosystem BD experience: 2+ years selling to engineering teams, prior relationship with top-10 AI-native companies. Co-founder equity reserved and unfilled. The grant's builder allocation funds six months of solo development while co-founder search runs in parallel.

---

## 11. What this is not

- **Not a GPU marketplace.** We price output, not compute. FLOPs are fungible; accepted intelligence work is not.
- **Not competing with Upwork or Fiverr.** We are the permissionless reputation layer they cannot provide — their reputation is captive to their platform.
- **Not a governance token play.** INTEL is a settlement rail. The value proposition is clearing, not voting.
- **Not vaporware.** The loop works and the AIU index is live with real data. http://168.119.15.122 is up. `curl http://168.119.15.122/v1/cannes/aiu/index` returns a real index value.
- **Not mainnet-ready yet.** Contracts deploy to Sepolia (deploy script + foundry.toml configured). The broker Postgres ledger is the authoritative settlement record for this phase. A professional audit is required before handling real user funds.
- **Not a solo-builder-forever plan.** Co-founder search is active and this grant funds it.

This is an honest ask for early infrastructure that has no token sale, no VCs, and no fabricated traction. The design depth is real. The gap is real. The question is whether execution can match.
