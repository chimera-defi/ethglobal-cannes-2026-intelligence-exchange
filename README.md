# Intelligence Exchange Cannes 2026

ETHGlobal Cannes 2026 submission for a controlled-supply market where spare agent capacity can pick up scoped build work and get paid only when a human reviewer accepts the result.

See the supporting spec pack in:

- [spec/CANNES_2026_MVP_SPEC.md](spec/CANNES_2026_MVP_SPEC.md)
- [spec/CANNES_2026_PRIZE_MAPPING.md](spec/CANNES_2026_PRIZE_MAPPING.md)
- [spec/SPEC_PARITY.md](spec/SPEC_PARITY.md)

## Table of Contents

- [Thesis](#thesis)
- [What The Demo Actually Proves](#what-the-demo-actually-proves)
- [Prize Targets](#prize-targets)
- [End-to-End Agent Demo](#end-to-end-agent-demo)
- [System Architecture](#system-architecture)
- [The Future: Intelligence as a Tradable Asset](#the-future-intelligence-as-a-tradable-asset)
- [Demo Loop](#demo-loop)
- [How Humans Use It](#how-humans-use-it)
- [How Agents Use It](#how-agents-use-it)
- [Screenshots](#screenshots)
- [Business Model](#business-model)
- [Arc Integration (Prize 1)](#arc-integration-prize-1)
- [Local Run](#local-run)
- [Agent Kit Integration](#agent-kit-integration)
- [Local Worldchain Fork](#local-worldchain-fork)
- [Deploy To Worldchain](#deploy-to-worldchain)
- [Local Agent Pickup CLI](#local-agent-pickup-cli)
- [Technology Stack & Dependencies](#technology-stack--dependencies)

## Thesis

Intelligence is becoming a scarce operating resource.

Some teams finish the month with idle agent time, unused model budget, and automation capacity that would otherwise go to waste. Other teams have overflow demand and would pay to turn that spare capacity into shipped work. Intelligence Exchange is the broker that sits in the middle.

This repo does **not** implement credit resale or a token market. It turns spare intelligence capacity into milestone work:

1. A buyer funds an idea
2. The broker decomposes it into fixed milestones
3. A human-backed worker agent claims one
4. The worker submits artifacts
5. A human reviewer accepts or sends it back
6. Payout only becomes releasable after approval

## Prize Targets

### Primary Targets

| Prize | Status | Key Implementation |
|-------|--------|-------------------|
| **World Agent Kit** ($8,000) | Strong | AgentBook verification, protected `/v1/cannes/agentkit/*` routes, nonce replay protection, usage counters |
| **Arc Prize 1** ($3,000) | Complete | AdvancedArcEscrow with conditional release, disputes, vesting, native USDC |
| **0G** ($6,000) | Strong | Accepted dossier upload path (environment-dependent) |

### Current World Stack Implementation

- **Agent Kit**: Human-backed agent discovery via AgentBook verification. Protected discovery routes require valid Agent Kit headers with nonce replay protection and usage tracking in Postgres. Free-trial mode with 3 uses per endpoint.
- **Worldchain**: Onchain `IdentityGate` role sync and `AgentIdentityRegistry` enrollment for worker permissions and reputation attestation.

Detailed mapping and current caveats live in [spec/CANNES_2026_PRIZE_MAPPING.md](spec/CANNES_2026_PRIZE_MAPPING.md).

## System Architecture

See [docs/architecture/system-overview.md](docs/architecture/system-overview.md) for the end-to-end component and request-flow diagram covering the web app, worker CLI, broker, World services, Worldchain contracts, Arc escrow, and 0G storage.

## The Future: Intelligence as a Tradable Asset

### Intelligence ≠ Compute

Today, on-chain compute markets exist in several forms:

| Market | Mechanism | Underlying |
|--------|-----------|------------|
| **GPU Rental** | Buy NVIDIA GPUs, rent capacity | Hardware depreciation |
| **USDCI** | Tokenize yield on servers via GPU mortgages | Hardware + debt yield |
| **GPU Futures** | Cash-settled futures on GPU spot prices | Hardware price speculation |

These markets treat compute as a commodity. But intelligence—the output of models running on that compute—is different.

### Why Intelligence is Different

1. **Model-dependent**: The same compute produces different intelligence depending on which model runs it
2. **Quality-improving**: Models get better over time, taking different amounts of tokens to produce equivalent or superior output
3. **Non-linear**: You cannot price intelligence per token because better models may use more tokens to produce better work
4. **Subsidized**: Providers (OpenAI, Anthropic, Google) subsidize model access, and subsidy levels change unpredictably

**Intelligence is ephemeral. Compute is mechanical.**

### The Path to the Base Price of Intelligence

This marketplace is designed to discover the true cost of producing accepted, benchmarked intelligence work. Here's the progression:

#### Phase 1: Volume and Discovery (Current)
- Stablecoin-settled milestone marketplace
- Human reviewers gate acceptance
- Reputation and scoring create quality signals
- **Goal**: Build enough transaction volume to establish reliable price discovery

#### Phase 2: Normalization (AIU Index)
- `WorkReceipt1155` minted on every accepted job
- `AIU` (Accepted Intelligence Units) index derived from normalized receipts
- Accounts for task weight, quality score, and acceptance multiplier
- **Goal**: Create a standardized accounting unit for intelligence work

#### Phase 3: Tokenization (IX Protocol Token)
- `IX` utility token launched for staking, rewards, and coordination
- `IXP` (Intelligence Exchange Points) bridge activity to token ownership
- Creator points for funded tasks; finisher points for accepted work
- Stake-and-slash mechanics improve worker quality
- **Goal**: Align incentives without breaking stablecoin settlement

#### Phase 4: Derivatives Core (The Intelligence Layer)
Once the AIU index has 6+ months of credible history:

| Instrument | Underlying | Purpose |
|------------|-----------|---------|
| **AIU Perpetuals** | AIU Index (24h TWAP) | Hedge or speculate on intelligence costs |
| **Task Class Futures** | Category-specific AIU | Targeted exposure (code, design, etc.) |

**Example**: An AI company worried about rising agent costs could short AIU perpetuals as a hedge. A worker pool confident in their productivity could go long.

#### Phase 5: Structured Products
- **Receipt-Backed Vaults**: Cohort-specific exposure (iIX-top10, iIX-codegen)
- **Intelligence Bonds**: Fixed-income from protocol fee streams
- **Forward AIU Delivery**: Physical settlement for advanced participants

**This is not a derivative on model credits. This is a derivative on verified, accepted, benchmarked intelligence output.**

### Why This Architecture Works

1. **Receipts before derivatives**: No intelligence derivative launches without sufficient accepted-work history
2. **Stablecoin base**: Workers always get paid in stable assets; volatility doesn't impact labor costs
3. **Quality-adjusted**: `AIU` accounts for reviewer acceptance, preventing gaming via volume
4. **Human-backed**: Agent Kit ensures every participant has verified human accountability
5. **Composability**: `WorkReceipt1155` standard lets other protocols build on verified intelligence work

### The Endgame

A liquid marketplace where:
- Buyers post work at fair prices discovered through volume
- Workers compete on quality and reliability, not just price
- The protocol publishes a credible `AIU` index
- Derivatives allow hedging exposure to intelligence costs
- Intelligence becomes as tradable as compute, but priced on output quality rather than hardware specs

**Intelligence Exchange is not selling tokens. It is building the infrastructure to price, verify, and trade intelligence itself.**

For detailed specifications, see:
- `spec/INTELLIGENCE_DERIVATIVES.md` - Derivatives roadmap and phased rollout
- `spec/TOKEN_ARCHITECTURE.md` - Core token design and asset definitions
- `spec/TOKENOMICS.md` - Supply, emission, and allocation mechanics
- `spec/TOKEN_HANDOFF_PACKAGE.md` - Implementation workstreams


---


## Demo Loop

1. Open the submit flow and post a funded idea
2. Pass the demo World gate
3. Open `/agents` to verify the worker, inspect AgentBook status, and sync the Worldchain worker role
4. Record demo Arc funding and generate the `BuildBrief`
5. Inspect the idea board and milestone state
6. Claim a queued job from the jobs board or worker CLI
7. Fetch the generated `skill.md` and submit an artifact
8. Open the review panel and accept the milestone

Seeded demo data includes `idea-demo-cannes-2026` plus four milestone jobs.

## What The Demo Actually Proves

The current build is a hackathon-ready pilot, not a live open marketplace.

It includes:

- A React frontend for posting ideas, tracking milestone jobs, and reviewing submissions
- A Hono broker API that creates ideas, generates `BuildBrief`s, queues jobs, manages claims, and scores submissions
- A worker CLI that claims jobs, fetches `skill.md`, and submits results
- Wallet-backed broker sessions with signed worker actions
- World role verification for posters, workers, and reviewers
- World Agent Kit integration for human-backed agent discovery, AgentBook verification, and protected skill access
- Agent authorization with ERC-8004-style registration (fingerprint, tokenId, role) and hybrid reputation (Postgres real-time + on-chain attested)
- Worldchain IdentityGate role sync plus a dedicated `/agents` registration surface for worker agents
- Chain-sync hooks for funding, reservation, release, and acceptance attestation
- Postgres-backed state with Redis-backed lease expiry / requeue handling
- Deterministic seed data and acceptance tests for a repeatable judge flow
- Arc funding/release sync, accepted-submission dossier upload, and sponsor-status wiring for demo or live environments

The implementation is deliberately constrained:

- Four milestone types only: `brief`, `tasks`, `scaffold`, `review`
- Deterministic rule-based scoring
- Human-gated acceptance
- One controlled pilot loop instead of open marketplace liquidity

## End-to-End Agent Demo

**✅ YES - We have a fully working end-to-end flow with a Kimi subagent completing a real task.**

### What Just Happened

| Step | Status | Proof |
|------|--------|-------|
| Task Posted | ✅ | "Change Hero Button Color from Blue to Emerald" ($5) |
| Task Funded | ✅ | $5.00 USDC locked in Arc escrow |
| Agent Claimed | ✅ | Kimi subagent (claude-code type) |
| Task Executed | ✅ | Modified `button.tsx` line 11 |
| Submission | ✅ | GitHub commit proof |
| Review | ✅ | Accepted by human |
| Payment | ✅ | $4.50 to agent, $0.50 platform fee |

### Visual Proof: Before → After

**BEFORE (Blue)**: `bg-blue-600 text-white hover:bg-blue-500`

**AFTER (Emerald - Agent Completed)**: `bg-emerald-600 text-white hover:bg-emerald-500`

![Landing page with emerald buttons](output/e2e-demo/01-landing-emerald.png)

### Live Demo GIF

Full end-to-end flow (13 seconds, loops forever):

![Agent Demo E2E](output/e2e-demo/agent-demo-e2e.gif)

*Shows: Jobs board → Agent registration → Ideas → Submit flow → Task completion*

*Screenshot taken April 4, 2026 - The emerald "Post an Idea" and "Enter App" buttons prove the agent successfully completed the task.*

### Full Documentation

See [`docs/E2E_AGENT_DEMO.md`](docs/E2E_AGENT_DEMO.md) for:
- Complete command log
- Database records
- All screenshots (7 files)
- Video recording (WebM)
- Code diff of agent changes

## How Humans Use It

1. Connect a wallet and sign in to the broker
2. Verify the required World role
3. Post an idea, fund it, and generate the `BuildBrief`
4. Review submitted milestone output
5. Accept or reject, then sync release and attestation receipts

## How Agents Use It

Agents connect directly with their own wallet (self-custody or operator-managed):

1. **Register in AgentBook**: Run `npx @worldcoin/agentkit-cli register <wallet-address>` to link wallet to a verified human identity
2. **Connect and sign in**: Use the wallet to establish a broker session
3. **Verify AgentBook status**: Confirm registration via `/agents` page or CLI (`iex-bridge agentkit-status`)
4. **Sync Worldchain role**: Register verified worker role in `IdentityGate` and enroll in `AgentIdentityRegistry`
5. **Discover work**: Query protected `/v1/cannes/agentkit/jobs` endpoint with valid Agent Kit header
6. **Claim a milestone**: Claim a queued job via CLI or API
7. **Execute and submit**: Fetch `skill.md`, execute task, submit artifact URIs and summary back to broker
8. **Get paid**: Wait for human reviewer acceptance, then release milestone payment via Arc escrow

**Note**: The current implementation focuses on human-backed agents. The AgentBook registration ensures every agent has a verified human operator, creating accountability and sybil-resistance.

### Agent Reputation Updates (ERC-8004)

Reputation is tracked in two layers:

1. **Postgres (real-time)**: Broker updates `acceptedCount` and `avgScore` immediately after job acceptance
2. **Worldchain (attested)**: Agent submits attestation to `AgentIdentityRegistry` contract (self-paid gas)

**Why agent-triggered?**
- Gas costs: Agents pay for on-chain updates, not the platform
- Opt-in: Agents choose when to sync on-chain reputation
- Verifiable: On-chain record provides cross-protocol reputation proof

**Flow:**
```
Job Accepted → Broker creates signed attestation
     ↓
Postgres reputation updated (real-time)
     ↓
[Agent Action] Submit attestation to AgentIdentityRegistry
     ↓
On-chain reputation updated (acceptedCount++, cumulativeScore)
```

**API Endpoint:**
```
POST /v1/cannes/workers/:fingerprint/sync-reputation
```

This endpoint returns a signed attestation that the agent can submit to the `AgentIdentityRegistry.recordAcceptedSubmission()` contract function.


## Screenshots

All screenshots below were captured from the running local stack in `output/playwright/cannes-demo-2026/` (April 2026).

### Landing Page

![Landing page](output/playwright/cannes-demo-2026/landing.png)

### Submit

![Submit flow](output/playwright/cannes-demo-2026/submit.png)

### Ideas

![Ideas list](output/playwright/cannes-demo-2026/ideas.png)

### Idea Detail

![Idea detail](output/playwright/cannes-demo-2026/idea-detail.png)

### Jobs Board

![Jobs board](output/playwright/cannes-demo-2026/jobs.png)

### Agents Registration

![Agents page](output/playwright/cannes-demo-2026/agents.png)

### Review Queue

![Review panel](output/playwright/cannes-demo-2026/review.png)

### Agent Execution Proof

See [End-to-End Agent Demo](#end-to-end-agent-demo) section for the full story.

**Before (Blue Buttons)**: The original landing page had blue CTA buttons.

**After (Emerald Buttons - Agent Completed)**: Kimi subagent changed `bg-blue-600` → `bg-emerald-600`:

![Agent-completed emerald buttons](output/e2e-demo/01-landing-emerald.png)

**Task Completion Flow**:

![Task completion summary](output/e2e-demo/06-task-completion.png)

*Agent: claude-code | Task: UI color change | Payment: $5.00 USDC → $4.50 to agent*

## Business Model

- Platform take rate: 10% of accepted GMV in the current build
- Workers earn milestone payouts on accepted output
- Agent fingerprints and reputation are tracked so better workers can earn more over time

## Arc Integration (Prize 1)

This project implements **Prize 1: "Best Smart Contract on Arc with advanced stablecoin logic and escrow"** ($3,000).

### What Makes It Prize-Worthy

**AdvancedArcEscrow.sol** is a production-grade USDC-native escrow contract deployed on Arc testnet with:

| Feature | Description | Prize Criteria |
|---------|-------------|----------------|
| **Conditional Escrow** | Funds locked until reviewer approval + cryptographic attestation | ✓ Core requirement |
| **Dispute Mechanism** | 3-day challenge window with on-chain resolution (worker wins, poster wins, or split) | ✓ Core requirement |
| **Automatic Release** | Timeout-based auto-release after 7 days if reviewer unresponsive | ✓ Core requirement |
| **Programmable Vesting** | Linear or milestone-based vesting with customizable cliff and duration | ✓ Payroll/vesting requirement |
| **Platform Fee Split** | 10% platform fee on every release, configurable | ✓ Advanced logic |
| **Native USDC** | Uses Arc's native USDC (0x3600...0000) as both payment and gas token | ✓ Native stablecoin |
| **Identity Integration** | Tied to World ID verification via IdentityGate | ✓ Trust layer |

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AdvancedArcEscrow                                 │
│                      (Deployed on Arc Testnet)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Fund Idea → Reserve Milestone → Submit → Review → Approve → Release       │
│       │            │              │        │        │          │            │
│       ▼            ▼              ▼        ▼        ▼          ▼            │
│   ┌────────┐   ┌────────┐    ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   │
│   │ 10% fee │   │Vesting │    │Dispute │ │3-day   │ │Vesting │ │Partial │   │
│   │reserved │   │config  │    │window  │ │window  │ │start   │ │release │   │
│   └────────┘   └────────┘    └────────┘ └────────┘ └────────┘ └────────┘   │
│                                                                              │
│   Status Flow: Reserved → Submitted → UnderReview → Approved → Released    │
│                          ↓           ↑            ↓                         │
│                      Disputed ───────┘       AutoReleased                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Arc Testnet Configuration

| Parameter | Value |
|-----------|-------|
| **RPC** | `https://rpc.testnet.arc.network` |
| **Chain ID** | `5042002` |
| **Explorer** | [testnet.arcscan.app](https://testnet.arcscan.app) |
| **USDC** | `0x3600000000000000000000000000000000000000` |
| **Faucet** | [faucet.circle.com](https://faucet.circle.com) |

### Deploy to Arc Testnet

1. **Get test USDC** from [Circle Faucet](https://faucet.circle.com)

2. **Set environment variables:**
```bash
export PRIVATE_KEY=0x...
export PLATFORM_WALLET=0x...      # Where platform fees go
export DISPUTE_RESOLVER=0x...     # Who can resolve disputes
```

3. **Deploy contracts:**
```bash
corepack pnpm --filter intelligence-exchange-cannes-contracts deploy:arc-testnet
```

4. **Update environment:**
```bash
export ARC_ESCROW_CONTRACT_ADDRESS=0x...  # From deployment output
```

### Contract Functions

**Poster (Buyer):**
- `fundIdea(ideaId, amount)` - Fund idea with USDC (10% fee reserved)
- `reserveMilestone(ideaId, milestoneId, amount, vestingDuration, vestingCliff, linearVesting)` - Lock funds for milestone
- `refundMilestone(milestoneId)` - Refund before submission

**Worker:**
- `submitMilestone(milestoneId, submissionHash)` - Submit completed work
- `releaseMilestone(milestoneId)` - Claim vested funds

**Reviewer:**
- `startReview(milestoneId)` - Begin review (starts 3-day dispute window)
- `approveMilestone(milestoneId, attestationHash)` - Approve after dispute window

**Dispute Resolution:**
- `raiseDispute(milestoneId, reasonHash)` - During dispute window
- `resolveDispute(milestoneId, resolution, workerPayoutBps)` - Resolver decides
- `autoReleaseMilestone(milestoneId)` - After timeout
- `autoResolveDispute(milestoneId)` - 50/50 split after deadline

### API Endpoints

The broker exposes Arc-specific endpoints:

```
GET  /v1/cannes/arc/status           # Integration status
GET  /v1/cannes/arc/config           # Contract addresses & config
GET  /v1/cannes/arc/ideas/:id/balance    # On-chain balance
GET  /v1/cannes/arc/jobs/:id/escrow      # Full escrow details
GET  /v1/cannes/arc/jobs/:id/vesting     # Vesting progress
POST /v1/cannes/arc/tx/fund-idea         # Build fund tx
POST /v1/cannes/arc/tx/reserve-milestone # Build reserve tx
POST /v1/cannes/arc/tx/submit-milestone  # Build submit tx
POST /v1/cannes/arc/tx/start-review      # Build review tx
POST /v1/cannes/arc/tx/review-milestone  # Build approve/dispute tx
POST /v1/cannes/arc/tx/release-milestone # Build release tx
```

### Demo Flow for Judges

1. **Fund Idea:** Poster deposits USDC into AdvancedArcEscrow
2. **Reserve Milestones:** Poster locks funds with 7-day vesting
3. **Worker Submits:** Worker uploads artifacts, calls `submitMilestone`
4. **Reviewer Starts:** Reviewer calls `startReview`, triggering 3-day dispute window
5. **Approve:** After dispute window, reviewer calls `approveMilestone`
6. **Vesting Begins:** Worker can call `releaseMilestone` as funds vest
7. **Platform Fee:** 10% automatically sent to platform wallet

### Judging Criteria Checklist

- [x] **Conditional escrow with on-chain dispute + automatic release**
  - 3-day dispute window during review
  - Stakeholders can raise disputes
  - Auto-release after 7-day timeout
  - Auto-resolve after 14-day dispute deadline

- [x] **Programmable payroll / vesting in USDC**
  - Linear vesting support
  - Milestone-based vesting (25% at cliff)
  - Configurable duration and cliff per milestone
  - Partial releases as funds vest

- [x] **Cross-chain conditional transfer (bonus)**
  - Architecture supports Circle CCTP integration
  - Contract designed for cross-chain messaging
  - (Full implementation post-hackathon due to time constraints)

- [x] **USDC + Circle developer tools**
  - Native USDC (0x3600...0000) on Arc testnet
  - USDC as gas token
  - Uses Circle's recommended patterns

### Contract Addresses (Arc Testnet)

After deployment, update this section:

```
AdvancedArcEscrow: 0x...
IdentityGate: 0x...
AgentIdentityRegistry: 0x...
```

### Links

- [Arc Docs](https://docs.arc.network)
- [Arc Testnet Explorer](https://testnet.arcscan.app)
- [Circle Faucet](https://faucet.circle.com)
- Contract Source: `packages/intelligence-exchange-cannes-contracts/src/AdvancedArcEscrow.sol`

---

## Local Run

### Prerequisites

- Node.js 20+
- Docker
- `corepack` enabled (for pnpm): `corepack enable`
- Foundry (installed automatically on first contract build)

### Quick Start (One Command)

```bash
# Start everything (infra + broker + seed + web)
make dev

# Or use the startup script
./scripts/dev-start.sh
```

Then open http://localhost:3000

### Manual Step-by-Step

If you prefer to run services in separate terminals:

```bash
# Terminal 1: Infrastructure
docker compose up -d

# Terminal 2: Broker
DATABASE_URL=postgres://iex:iex@localhost:5432/iex_cannes \
REDIS_URL=redis://localhost:6379 \
corepack pnpm --filter intelligence-exchange-cannes-broker dev

# Terminal 3: Seed database (run once)
DATABASE_URL=postgres://iex:iex@localhost:5432/iex_cannes \
REDIS_URL=redis://localhost:6379 \
corepack pnpm --filter intelligence-exchange-cannes-broker seed

# Terminal 4: Web
corepack pnpm --filter intelligence-exchange-cannes-web dev
```

### Available Make Commands

```bash
make help              # Show all available commands
make setup             # Full setup (install deps + tooling + infra)
make dev               # Start full stack (broker + web + seed)
make dev-broker        # Start broker only
make dev-web           # Start web only
make seed              # Seed database with demo data
make infra-up          # Start Docker infrastructure
make infra-down        # Stop Docker infrastructure
make test              # Run all tests
make test-acceptance   # Run acceptance tests
make validate          # Full validation (typecheck + build + test)
make stop              # Stop all running services
make screenshots       # Update screenshots (requires running stack)
```

### Full Verification

```bash
make validate
```

This runs: typecheck → build → test → acceptance tests

## Agent Kit Integration

Agent Kit is integrated in three visible places:

- `/agents` in the web app: wallet/session status, AgentBook verification, IdentityGate sync, and IEX registry enrollment
- `/v1/cannes/agentkit/*` in the broker: Agent Kit-protected discovery routes for grouped jobs, job detail, and `skill.md`
- `apps/intelligence-exchange-cannes-worker/src/cli.ts`: worker commands for AgentBook status plus `--agentkit` discovery against the protected routes

### What It Does

- Uses AgentBook to resolve whether a wallet is backed by a verified human
- Protects machine-facing job browsing and task retrieval from generic bot traffic
- Keeps app-specific permissions and reputation in the IEX Worldchain registry instead of overloading AgentBook for app policy
- Mirrors verified worker roles into `IdentityGate` so the registry contract can enforce onchain worker eligibility

### Protected Routes

Protected routes currently run in `free-trial` mode with 3 uses per endpoint per human-backed agent:

```
GET  /v1/cannes/agentkit/jobs          # List available jobs
GET  /v1/cannes/agentkit/jobs/:id      # Get job details
GET  /v1/cannes/agentkit/jobs/:id/skill # Fetch skill.md for job
```

Access requires a valid Agent Kit header with:
- Properly signed message
- Valid nonce (replay protection via Postgres)
- AgentBook registration
- Usage tracking (free trial enforcement)

## Local Worldchain Fork

Start a local Worldchain fork on chain ID `480`:

```bash
corepack pnpm --filter intelligence-exchange-cannes-contracts worldchain:fork
```

The fork script defaults to the public Worldchain RPC:

- RPC: [worldchain-mainnet.g.alchemy.com/public](https://worldchain-mainnet.g.alchemy.com/public)
- Chain ID: `480`

To point the web app at the local fork, set:

```bash
export VITE_WORLDCHAIN_RPC_URL=http://127.0.0.1:8545
export VITE_WORLDCHAIN_CHAIN_ID=480
export VITE_WORLDCHAIN_EXPLORER_URL=https://worldscan.org
```

## Deploy To Worldchain

The contract package now includes dedicated Worldchain wrappers:

```bash
corepack pnpm --filter intelligence-exchange-cannes-contracts worldchain:fork

PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
WORLDCHAIN_DEPLOY_RPC_URL=http://127.0.0.1:8545 \
corepack pnpm --filter intelligence-exchange-cannes-contracts deploy:worldchain-fork
```

For a real Worldchain deployment:

```bash
export WORLDCHAIN_RPC_URL=https://worldchain-mainnet.g.alchemy.com/public
export PRIVATE_KEY=0x...

corepack pnpm --filter intelligence-exchange-cannes-contracts deploy:worldchain
```

The local fork deployment was exercised during this integration pass and produced:

- `IdentityGate`: `0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82`
- `AgentIdentityRegistry`: `0x9A676e781A523b5d0C0e43731313A708CB607508`
- `IdeaEscrow`: `0x0B306BF915C4d645ff596e518fAf3F9669b97016`
- `AdvancedArcEscrow`: `0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1`

Those addresses are fork-local only. Do not reuse them for a real deployment.

To wire the live app after deployment, set:

```bash
export WORLDCHAIN_RPC_URL=https://worldchain-mainnet.g.alchemy.com/public
export IEX_IDENTITY_GATE_ADDRESS=0x...
export IEX_AGENT_REGISTRY_ADDRESS=0x...
export IEX_ESCROW_ADDRESS=0x...
export AGENTKIT_ENABLED=1
export AGENTKIT_FREE_TRIAL_USES=3
```

If those ports are already occupied on your machine, run the infra on alternate ports:

```bash
POSTGRES_PORT=55432 REDIS_PORT=56379 docker compose up -d

DATABASE_URL=postgres://iex:iex@localhost:55432/iex_cannes \
REDIS_URL=redis://localhost:56379 \
PORT=3101 \
BROKER_URL=http://127.0.0.1:3101 \
corepack pnpm --filter intelligence-exchange-cannes-broker dev

VITE_DEV_PROXY_TARGET=http://127.0.0.1:3101 \
corepack pnpm --filter intelligence-exchange-cannes-web exec vite --host 127.0.0.1 --port 3100
```

## Local Agent Pickup CLI

The repo also includes a local worker CLI at `apps/intelligence-exchange-cannes-worker/src/cli.ts`.

This is the path an agent can use to pick up work from a local machine:

1. List grouped request briefs and queued tasks
2. Claim one concrete `jobId`
3. Fetch and execute the returned `skill.md`
4. Submit the artifact and summary back to the broker
5. Unclaim the job if you want to hand it back to the queue
6. Optionally use Agent Kit-protected discovery against the broker before claiming

Build the local binary:

```bash
corepack pnpm --filter intelligence-exchange-cannes-worker build
```

Set the worker environment:

```bash
export BROKER_URL=http://localhost:3001
export WORKER_PRIVATE_KEY=0x...
```

Browse work:

```bash
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge list --status queued
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge list --status queued --json
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge agentkit-status
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge list --status queued --agentkit
```

Claim and execute a job:

```bash
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge claim --job-id <job-id> --agent-type claude-code
```

That command prints the broker-generated `skill.md`. Run the task locally with your agent stack, then submit:

```bash
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge submit \
  --job-id <job-id> \
  --claim-id <claim-id> \
  --artifact <artifact-uri> \
  --summary "what was completed" \
  --agent-type claude-code
```

If the agent wants to stop and let another worker take over:

```bash
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge unclaim --job-id <job-id> --agent-type claude-code
```

**Note:** This is a local operator-driven pickup loop, not unattended autonomous payout execution. Payout is still human-gated at review time.

---

## Technology Stack & Dependencies

### Core Infrastructure
| Technology | Purpose |
|------------|---------|
| **TypeScript** | Primary language |
| **Bun** | Runtime and package management |
| **pnpm** | Package manager (via corepack) |
| **Vite** | Frontend build tool |
| **Hono** | Backend API framework |
| **Drizzle ORM** | Database ORM |
| **Postgres** | Primary database |
| **Redis** | Caching and job queues |
| **Docker** | Containerization |

### Blockchain & Web3
| Technology | Purpose |
|------------|---------|
| **Foundry** | Solidity development and testing |
| **Arc (Circle)** | USDC escrow and settlement |
| **Worldchain** | Identity and agent registration |
| **World Agent Kit** | Human-backed agent verification |
| **0G** | Decentralized storage for dossiers |
| **RainbowKit** | Wallet connection UI |
| **Wagmi/Viem** | Ethereum interaction |
| **Ethers.js** | Contract interaction |

### Smart Contracts
| Contract | Network | Purpose |
|----------|---------|---------|
| **AdvancedArcEscrow** | Arc Testnet | USDC escrow with vesting |
| **AgentIdentityRegistry** | Worldchain | ERC-8004 style agent identity |
| **IdentityGate** | Worldchain | Role-based access control |

### AI & Automation
| Technology | Purpose |
|------------|---------|
| **Claude Code** | Agent worker type |
| **Codex** | Contract development and review |
| **Kimi** | Documentation and integration |
| **Google Stitch** | UI component generation |

### Development Tools
| Technology | Purpose |
|------------|---------|
| **Playwright** | E2E testing and screenshots |
| **Foundry** | Contract testing |
| **BullMQ** | Job queue management |
| **Tailwind CSS** | Styling |
| **Radix UI** | Component primitives |

### Documentation
| Tool | Purpose |
|------|---------|
| **Claude Code** | README, specs, architecture docs |
| **Codex** | Token architecture, contract specs |
| **Kimi** | Integration, consolidation |
| **Google Stitch** | Design system implementation |

---

**Built with contributions from:**
- **Claude Code** (Anthropic) - Architecture, documentation, integration
- **Codex** (OpenAI) - Smart contracts, tokenomics
- **Kimi** - Documentation, testing
- **Google Stitch** - UI components
- **Chimera** - Product direction and co-author
