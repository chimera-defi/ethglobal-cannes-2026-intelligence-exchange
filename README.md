# Intelligence Exchange Cannes 2026

ETHGlobal Cannes 2026 hackathon submission for a controlled-supply marketplace where humans post AI work, verified operators run agents, and the platform releases escrow only after human review.

## What We Built

Intelligence Exchange is a brokered execution marketplace for AI jobs, not an open freelance board and not a token resale scheme.

The current build includes:

- a React frontend for posting ideas, tracking milestone jobs, and reviewing output
- a Hono broker API that plans ideas into briefs, creates milestone jobs, handles claims, and scores submissions
- a worker CLI entrypoint for agent operators
- Postgres-backed state with Redis-backed lease handling
- deterministic demo data for a repeatable judge flow
- local stand-ins for Arc escrow, World ID gating, and 0G dossier storage

## Why This Exists

The product thesis is simple:

1. Buyers want a way to turn a prompt into shipped work without hiring a full team.
2. Workers want paid, scoped milestones instead of vague one-off gigs.
3. The platform should take a fee only when work is accepted, not when people just browse.

## How It Works

1. A buyer verifies as human and posts an idea with a budget.
2. The broker turns that idea into a `BuildBrief`.
3. The brief is split into four fixed milestone types: `brief`, `tasks`, `scaffold`, and `review`.
4. A worker operator claims one milestone with the worker app or CLI.
5. The worker submits artifacts, a summary, and execution metadata.
6. The broker scores the submission deterministically.
7. A human reviewer accepts or rejects the milestone.
8. Accepted work releases payout from escrow and records the agent identity / dossier trail.

The demo uses deterministic seeded data so the same flow can be replayed every time.

## Demo Flow

The seeded demo story is:

1. Open the submit screen and create a funded idea.
2. Verify with the demo World ID gate.
3. Fund the idea and generate the brief.
4. Open the ideas board to inspect the brief and milestone state.
5. Open the jobs board to see queued milestones.
6. Open the review panel for the submitted milestone.
7. Accept the milestone to release payout.

Current demo data includes the seeded idea `idea-demo-cannes-2026` and four milestone jobs.

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

## Money

### How We Make Money

- Platform take rate on accepted GMV: 10% in the current build.
- Optional enterprise fee for hosted broker, audit logs, and private deployment.
- Optional support / integration fee for teams that want their own broker configuration.

### How Users Make Money

- Workers earn milestone payouts in USDC when their submissions are accepted.
- Workers also build reputation, which can unlock better jobs and higher-value milestones.
- Buyers save money by paying only for accepted work instead of staffing the whole execution layer in-house.

## Local Run

Prereqs:

- Node.js 20+
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

Then open:

- `http://localhost:3000`

The browser frontend proxies API calls to `http://localhost:3001`.

## Validation

What I verified locally:

- the web app production build succeeds
- the broker starts against the local Postgres and Redis services
- the seeded demo data loads and exposes the full milestone flow
- the broker acceptance suite passes against the live local stack
- browser screenshots were captured from the live app

## Scope Notes

- Payouts are still human-gated in this build.
- World ID, Arc escrow, and 0G are represented by demo wiring where the real integration is not needed for the hackathon flow.
- This is a local deterministic demo, not an open marketplace with live liquidity.
