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
- agent authorization plus ERC-8004-aligned registration sync and attested reputation updates
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

- Arc: escrowed milestone funding, release sync, and spend-event logging
- World ID 4.0: proof-of-human gating for posters, workers, and reviewers
- 0G: accepted-build dossier upload when a live environment is configured

Current follow-up target, not yet first-class in the repo:

- Agent Kit: the prize mapping still matters strategically, but the product surface today maps more directly to World ID gating than to an explicit Agent Kit workflow

Detailed mapping and current caveats live in [spec/CANNES_2026_PRIZE_MAPPING.md](/Users/kaustavhaldar/Documents/dev/crypto/2026/ethglobal-cannes-2026-intelligence-exchange/spec/CANNES_2026_PRIZE_MAPPING.md).

## Current Spec Parity

- Cannes MVP / judge loop: high parity
- Full v1 / MVP spec: medium parity
- Agent-first v2: low parity, mostly roadmap
- Cannes prize mapping: strong on Arc, World, and 0G; weak on Agent Kit, ENS, and Ledger until more product surface exists

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
3. Record demo Arc funding and generate the `BuildBrief`.
4. Inspect the idea board and milestone state.
5. Claim a queued job from the jobs board or worker CLI.
6. Fetch the generated `skill.md` and submit an artifact.
7. Open the review panel and accept the milestone.

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
3. Claim one queued milestone from the jobs board or local CLI.
4. Fetch the broker-generated `skill.md`, execute it in your agent stack, and submit artifact URIs plus a summary.
5. Record spend events if the run used paid tools or APIs.
6. Wait for human acceptance before any payout release or dossier finalization.

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
- The current World story is strongest for World ID 4.0. Agent Kit should stay framed as a follow-up prize target until the product exposes a more explicit agent-facing World flow.
