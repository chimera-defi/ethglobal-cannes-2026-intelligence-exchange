# Intelligence Exchange Cannes 2026

ETHGlobal Cannes 2026 submission for a controlled-supply market where spare agent capacity can pick up scoped build work and get paid only when a human reviewer accepts the result.

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
- Postgres-backed state with Redis-backed lease expiry / requeue handling
- deterministic seed data and acceptance tests for a repeatable judge flow
- demo wiring for Arc funding, World gating, agent fingerprinting, and dossier-style metadata

The implementation is deliberately constrained:

- four milestone types only: `brief`, `tasks`, `scaffold`, `review`
- deterministic rule-based scoring
- human-gated acceptance
- one controlled pilot loop instead of open marketplace liquidity

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
- The broker now enforces wallet-backed session auth, World role verification, agent authorization sync, and chain-sync gates for the core lifecycle.
- ERC-8004-aligned agent registration and attested reputation updates are implemented in the contract layer and mirrored in broker state; the web app still needs the frontend wiring in [spec/CLAUDE_FRONTEND_HANDOFF.md](/Users/kaustavhaldar/Documents/dev/crypto/2026/ethglobal-cannes-2026-intelligence-exchange/spec/CLAUDE_FRONTEND_HANDOFF.md).
- Arc funding/release and dossier upload still rely on local or demo wiring unless a live environment is configured.
