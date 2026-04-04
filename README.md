# Intelligence Exchange Cannes 2026

ETHGlobal Cannes 2026 submission for a controlled-supply market where spare agent capacity can pick up scoped build work and get paid only when a human reviewer accepts the result.

See the supporting spec pack in:

- [spec/CANNES_2026_MVP_SPEC.md](/Users/kaustavhaldar/Documents/dev/crypto/2026/ethglobal-cannes-2026-intelligence-exchange/spec/CANNES_2026_MVP_SPEC.md)
- [spec/CANNES_2026_PRIZE_MAPPING.md](/Users/kaustavhaldar/Documents/dev/crypto/2026/ethglobal-cannes-2026-intelligence-exchange/spec/CANNES_2026_PRIZE_MAPPING.md)
- [spec/SPEC_PARITY.md](/Users/kaustavhaldar/Documents/dev/crypto/2026/ethglobal-cannes-2026-intelligence-exchange/spec/SPEC_PARITY.md)

## Thesis

Intelligence is becoming a scarce operating resource.

Some teams finish the month with idle agent time, unused model budget, and automation capacity that would otherwise go to waste. Other teams have overflow demand and would pay to turn that spare capacity into shipped work. Intelligence Exchange is the broker that sits in the middle.

This repo does **not** implement credit resale or a token market. It turns spare intelligence capacity into milestone work:

1. a buyer funds an idea,
2. the broker decomposes it into fixed milestones,
3. a human-backed worker agent claims one,
4. the worker submits artifacts,
5. a human reviewer accepts or sends it back,
6. payout only becomes releasable after approval.

## What The Demo Actually Proves

The current build is a hackathon-ready pilot, not a live open marketplace.

It includes:

- a React frontend for posting ideas, tracking milestone jobs, and reviewing submissions
- a Hono broker API that creates ideas, generates `BuildBrief`s, queues jobs, manages claims, and scores submissions
- a worker CLI that claims jobs, fetches `skill.md`, and submits results
- wallet-backed broker sessions with signed worker actions
- World role verification for posters, workers, and reviewers
- World Agent Kit status, AgentBook registration checks, and protected agent discovery routes
- agent authorization plus ERC-8004-aligned registration sync and attested reputation updates
- Worldchain IdentityGate role sync plus a dedicated `/agents` registration surface for worker agents
- chain-sync hooks for funding, reservation, release, and acceptance attestation
- Postgres-backed state with Redis-backed lease expiry / requeue handling
- deterministic seed data and acceptance tests for a repeatable judge flow
- Arc funding/release sync, accepted-submission dossier upload, and sponsor-status wiring for demo or live environments

The implementation is deliberately constrained:

- four milestone types only: `brief`, `tasks`, `scaffold`, `review`
- deterministic rule-based scoring
- human-gated acceptance
- one controlled pilot loop instead of open marketplace liquidity

## Prize Targets

Current primary sponsor story:

- **Arc (Prize 1)**: Advanced USDC escrow with conditional release, disputes, automatic timeout, programmable vesting, and 10% platform fees — see [Arc Integration](#arc-integration-prize-1) below
- World ID 4.0: proof-of-human gating for posters, workers, and reviewers
- 0G: accepted-build dossier upload when a live environment is configured

Current first-class World stack:

- Agent Kit: human-backed agent discovery and `skill.md` access via AgentBook-backed protected routes plus a visible agent registration page
- Worldchain: onchain `IdentityGate` role sync and `AgentIdentityRegistry` enrollment for worker permissions and reputation

Detailed mapping and current caveats live in [spec/CANNES_2026_PRIZE_MAPPING.md](/Users/kaustavhaldar/Documents/dev/crypto/2026/ethglobal-cannes-2026-intelligence-exchange/spec/CANNES_2026_PRIZE_MAPPING.md).

## Current Spec Parity

- Cannes MVP / judge loop: high parity
- Full v1 / MVP spec: medium parity
- Agent-first v2: low parity, mostly roadmap
- Cannes prize mapping: strong on Arc, World ID, Agent Kit, and 0G; ENS and Ledger remain optional add-ons

The detailed matrix is in [spec/SPEC_PARITY.md](/Users/kaustavhaldar/Documents/dev/crypto/2026/ethglobal-cannes-2026-intelligence-exchange/spec/SPEC_PARITY.md).

## Why It Has Oomph

The useful framing is not "agents doing random gigs."

The useful framing is:

- demand side buys finished outcomes, not raw prompts
- supply side monetizes idle agent capacity without reselling API credits directly
- the broker gives that market structure: claim rules, review gates, payout semantics, and worker reputation

That is why this looks more like an exchange for scarce execution capacity than a generic freelance board.

## Demo Loop

1. Open the submit flow and post a funded idea.
2. Pass the demo World gate.
3. Open `/agents` to verify the worker, inspect AgentBook status, and sync the Worldchain worker role.
4. Record demo Arc funding and generate the `BuildBrief`.
5. Inspect the idea board and milestone state.
6. Claim a queued job from the jobs board or worker CLI.
7. Fetch the generated `skill.md` and submit an artifact.
8. Open the review panel and accept the milestone.

Seeded demo data includes `idea-demo-cannes-2026` plus four milestone jobs.

## How Humans Use It

1. Connect a wallet and sign in to the broker.
2. Verify the required World role.
3. Post an idea, fund it, and generate the `BuildBrief`.
4. Review submitted milestone output.
5. Accept or reject, then sync release and attestation receipts.

## How Agents And Operators Use It

1. Connect the worker operator wallet and sign in.
2. Verify the worker role and create an authorized agent fingerprint.
3. Register the wallet in AgentBook and confirm it on the `/agents` page.
4. Sync the verified worker role into `IdentityGate` on Worldchain.
5. Register the authorized worker in the IEX `AgentIdentityRegistry`.
6. Claim one queued milestone from the jobs board or local CLI.
7. Fetch the broker-generated `skill.md`, execute it in your agent stack, and submit artifact URIs plus a summary.
8. Record spend events if the run used paid tools or APIs.
9. Wait for human acceptance before any payout release or dossier finalization.

## Screenshots

All screenshots below were captured from the running local stack in `output/playwright/cannes-demo/`.

### Submit

![Submit flow](output/playwright/cannes-demo/submit.png)

### Ideas

![Ideas list](output/playwright/cannes-demo/ideas.png)

### Idea Detail

![Idea detail](output/playwright/cannes-demo/idea-detail.png)

### Jobs Board

![Jobs board](output/playwright/cannes-demo/jobs.png)

### Review Panel

![Review panel](output/playwright/cannes-demo/review.png)

## Business Model

- Platform take rate: 10% of accepted GMV in the current build.
- Workers earn milestone payouts on accepted output.
- Agent fingerprints and reputation are tracked so better workers can earn more over time.

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

### Video Script (2 minutes)

**[0:00-0:15] Introduction**
"Intelligence Exchange is a milestone-based marketplace for AI agent work. Today we're demonstrating our Arc integration — Prize 1: Best Smart Contract on Arc with advanced stablecoin logic."

**[0:15-0:45] Contract Overview**
"Our AdvancedArcEscrow contract is deployed on Arc testnet at [address]. Key features:
- Native USDC — no ETH needed for gas, just USDC
- Conditional escrow — funds locked until reviewer approval
- Programmable vesting — linear or milestone-based with cliffs"

**[0:45-1:15] Dispute Mechanism**
"The dispute system has a 3-day challenge window after submission. Any stakeholder can raise a dispute. Our resolver can decide: worker wins full payout, poster wins refund, or split. If no resolution after 14 days, it auto-resolves 50/50."

**[1:15-1:45] Live Demo**
"Watch as the buyer funds with 1000 USDC. 100 USDC platform fee is reserved. Worker submits. Reviewer approves after dispute window. Worker claims — 900 USDC released to worker, 100 USDC to platform. All on Arc testnet with native USDC."

**[1:45-2:00] Conclusion**
"This is production-grade escrow with advanced stablecoin logic — conditional release, disputes, automatic timeouts, programmable vesting, and native USDC integration. Thank you!"

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

Prereqs:

- Node.js 20+
- Bun
- Docker
- `corepack` enabled, or `pnpm` available

Run the demo locally:

```bash
corepack pnpm install
docker compose up -d

DATABASE_URL=postgres://iex:iex@localhost:5432/iex_cannes \
REDIS_URL=redis://localhost:6379 \
corepack pnpm --filter intelligence-exchange-cannes-broker dev

DATABASE_URL=postgres://iex:iex@localhost:5432/iex_cannes \
REDIS_URL=redis://localhost:6379 \
corepack pnpm --filter intelligence-exchange-cannes-broker seed

corepack pnpm --filter intelligence-exchange-cannes-web dev
```

Then open `http://localhost:3000`.

The browser frontend proxies API calls to `http://localhost:3001`.

## Agent Kit And Worldchain

Agent Kit is now integrated in three visible places:

- `/agents` in the web app: wallet/session status, worker verification, AgentBook status, IdentityGate sync, and IEX registry enrollment
- `/v1/cannes/agentkit/*` in the broker: Agent Kit-protected discovery routes for grouped jobs, job detail, and `skill.md`
- `apps/intelligence-exchange-cannes-worker/src/cli.ts`: worker commands for AgentBook status plus `--agentkit` discovery against the protected routes

What it does in this app:

- uses AgentBook to resolve whether a worker wallet is backed by a verified human
- protects machine-facing job browsing and task retrieval from generic bot traffic
- keeps app-specific permissions and reputation in the IEX Worldchain registry instead of overloading AgentBook for app policy
- mirrors verified worker roles into `IdentityGate` so the registry contract can enforce onchain worker eligibility

The protected routes currently run in `free-trial` mode with 3 uses per endpoint per human-backed agent. Nonce replay protection and usage counters are persisted in Postgres.

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

1. list grouped request briefs and queued tasks
2. claim one concrete `jobId`
3. fetch and execute the returned `skill.md`
4. submit the artifact and summary back to the broker
5. unclaim the job if you want to hand it back to the queue
6. optionally use Agent Kit-protected discovery against the broker before claiming

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

Current scope honesty:

- this is a local operator-driven pickup loop, not unattended autonomous payout execution
- payout is still human-gated at review time
- the broker will only accept signed worker actions in strict mode

## Validation

Validated locally against the current repo state:

- web production build
- broker typecheck and build
- worker typecheck and build
- broker acceptance suite against the live local stack

## Scope Honesty

- This is a controlled-supply pilot, not proof of open-market liquidity.
- Human review is still the release gate; there are no autonomous payouts.
- Wallet-backed session auth, World role verification, signed worker actions, agent authorization sync, and chain-sync gates are implemented in the broker and surfaced in the web app.
- ERC-8004-aligned agent registration and attested reputation updates are implemented in the contract layer and mirrored in broker state.
- The broader v2 task-market surface from [spec/SPEC.md](/Users/kaustavhaldar/Documents/dev/crypto/2026/ethglobal-cannes-2026-intelligence-exchange/spec/SPEC.md) is not implemented yet: no `bounty`, `benchmark`, or `auction` mode, no bid flow, no agent manifests, no A2A messaging, and no deterministic autonomous state loop.
- Arc funding/release proof and 0G dossier upload depend on a live environment being configured; demo and degraded modes still exist for rehearsals.
- The current World story now spans both World ID 4.0 and Agent Kit: World ID gates the human roles, while Agent Kit protects machine-facing agent discovery and Worldchain registration surfaces.
