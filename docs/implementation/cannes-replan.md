# Cannes MVP Replan

## Why Replan

The current implementation proves the local escrow and worker loop, but the frontend is still too collapsed into a single-page demo surface.

That is weaker than the intended product shape in the spec:
- buyer console
- worker console / job board
- review queue
- completed and cancelled history

The next pass should optimize for the real operating surfaces, not for a one-screen pitch.

## Required Web Surfaces

### 1. Public Job Board
- list all open jobs
- filter by capability, payout, and status
- show whether a job is claimable
- entry point for external workers and MCP-driven agents

### 2. Buyer Workspace
- wallet sign-in / identity gate
- create new job from prompt
- see jobs posted by this buyer
- split into:
  - open / in progress
  - awaiting review
  - completed
  - cancelled / refunded

### 3. Review Queue
- only jobs with submitted work that need buyer approval
- compare artifact, trace, score, and spend event
- approve, request rework, or refund

### 4. Job Detail
- full lifecycle state
- dossier pointer
- escrow state
- worker identity
- trace and submission evidence

### 5. Worker / Operator Console
- register operator profile
- view eligible jobs
- claim job
- submit result
- see accepted / rejected / refunded history

## Revised Cannes MVP Routing

Use explicit pages instead of one collapsed dashboard:

- `/`
  - landing page
  - explain the product briefly
  - route to buyer workspace or worker job board

- `/jobs`
  - public job board for open claimable work

- `/buyer`
  - buyer workspace shell

- `/buyer/new`
  - submit prompt, payout, escrow, and target artifact

- `/buyer/review`
  - outstanding submissions requiring approval

- `/buyer/history`
  - completed and cancelled jobs

- `/jobs/:jobId`
  - shared job detail page

- `/worker`
  - operator dashboard

## State Model Adjustments

The backend should expose buyer-oriented buckets directly instead of forcing the frontend to reconstruct them:

- `open`
- `in_progress`
- `awaiting_review`
- `completed`
- `cancelled`

Keep milestone-level states underneath this, but add buyer-facing derived status at the job level.

## What To Keep

- current Bun workspace
- broker service and local deterministic state
- Foundry contracts
- worker MCP bridge
- World / Arc / 0G integration wrappers
- screenshot and acceptance infrastructure

## What To Refactor

- replace the single-surface web app with routed pages
- stop using one demo state view as the main UX model
- expose buyer-scoped and worker-scoped API responses
- move agent comparison to job detail or buyer review flow, not the whole app shell

## What To Remove Or De-emphasize

- the current all-in-one poster / worker / reviewer page as the primary product surface
- copy that implies many simultaneous onchain fulfillers when the MVP only supports one active payout-bearing claim
- hero-first pitch density that hides the operational queues

## Build Order

1. Add routed frontend shell and auth stub / wallet entry.
2. Add buyer workspace pages and derived job buckets.
3. Add public job board and worker console pages.
4. Add review queue and job detail pages.
5. Refit acceptance tests and screenshots to the multi-page flow.
