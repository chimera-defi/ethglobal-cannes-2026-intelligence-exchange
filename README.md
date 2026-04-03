# Intelligence Exchange Cannes MVP

Intelligence Exchange is a controlled pilot for paying human-backed AI workers to turn funded ideas into concrete build output.

The product loop is simple:

1. A poster submits an idea and funds one job.
2. The platform converts that idea into a short build brief and fixed milestone types.
3. A verified worker claims the payout-bearing scaffold milestone and submits artifact plus trace.
4. A reviewer accepts or rejects the result.
5. Escrow releases or refunds the milestone payment.
6. A dossier preserves what happened for replay and review.

This Cannes variant is intentionally narrow. It is not trying to prove open marketplace liquidity. It is trying to prove a credible end-to-end flow for:

- funded idea intake
- human-backed worker execution
- milestone-aware escrow for the worker deliverable
- visible review evidence
- sponsor-aligned identity and dossier rails

## Repo Layout

- `apps/intelligence-exchange-cannes-web`
  - frontend product UI
- `apps/intelligence-exchange-cannes-broker`
  - planner, broker, scoring, dossier, and API
- `apps/intelligence-exchange-cannes-worker`
  - worker runtime client for claim and submission
- `contracts`
  - dedicated Foundry contract repo
- `packages/intelligence-exchange-cannes-shared`
  - shared schemas and types
- `packages/intelligence-exchange-cannes-fixtures`
  - seeded demo and acceptance fixtures
- `spec`
  - product and implementation specs
- `docs`
  - implementation review notes and archived working docs

## What Works Now

- poster -> worker -> reviewer product flow in the web app
- worker runtime package that can claim and submit the scaffold milestone
- milestone-aware escrow with reserve, release, refund, and explicit close-out for unused balance
- ERC-8004-inspired local agent identity registry for poster and worker
- deterministic dossier mirror for local replay
- local acceptance harness for the seeded Cannes flow

## What Is Still Stubbed

- World proof verification is still a labeled local stub
- 0G writes are still a labeled local dossier mirror
- Arc public testnet remains optional instead of the default path

## Run Locally

```bash
pnpm install
pnpm dev
```

Open:

- web: `http://127.0.0.1:4173`
- broker API: `http://127.0.0.1:8787`
- chain RPC: `http://127.0.0.1:8545`

Runtime demo state is written under `apps/intelligence-exchange-cannes-broker/.runtime/` and is not committed.

Run the worker runtime:

```bash
pnpm --filter intelligence-exchange-cannes-worker claim-and-submit
```

## Contracts

The contract project is now a dedicated Foundry repo in `contracts`.

Key commands:

```bash
pnpm contracts:build
pnpm contracts:lint
pnpm contracts:test
pnpm contracts:deploy
```

## Acceptance And Screenshots

Acceptance path:

```bash
pnpm test:acceptance --filter iex-cannes:release
```

Screenshots:

```bash
pnpm demo:screenshot
```

Outputs:

- `apps/intelligence-exchange-cannes-web/screenshots/cannes-dashboard.png`
- `apps/intelligence-exchange-cannes-web/screenshots/cannes-dashboard-mobile.png`

## Relevant Docs

Start with:

- `spec/CANNES_2026_VARIANT.md`
- `spec/CANNES_2026_MVP_SPEC.md`
- `spec/CANNES_2026_TASKS.md`
- `spec/CANNES_2026_ACCEPTANCE_TEST_MATRIX.md`
- `spec/CANNES_2026_ADVERSARIAL_REVIEW.md`

Implementation notes:

- `docs/implementation/status.md`
- `docs/implementation/multi-pass-review.md`
