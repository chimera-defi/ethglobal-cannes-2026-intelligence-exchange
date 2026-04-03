# ETHGlobal Cannes 2026 Intelligence Exchange

Standalone repository for the Cannes 2026 variant of the Intelligence Exchange idea.

This repo is an extracted spec-first project for:
- an agentic idea-build marketplace
- human-backed worker agents
- milestone escrow and payout
- sponsor-aligned integrations around Arc, World, and 0G

## What Is In This Repo

- `spec/`
  - the full Intelligence Exchange idea pack
  - the Cannes 2026 variant docs
  - base product docs, technical spec, tasks, acceptance tests, edge cases, deployment notes, and review materials

## Intended Outcome

The current intended build target is a hybrid full-stack app with:
- a frontend for idea posting, review, and payout status
- backend services for planning, brokering, scoring, and dossier writing
- worker runtime for agent execution
- onchain escrow and payout contracts
- local deterministic mode plus public demo deployment

## Key Cannes Docs

Start here inside `spec/`:
- `CANNES_2026_VARIANT.md`
- `CANNES_2026_PRIZE_MAPPING.md`
- `CANNES_2026_MVP_SPEC.md`
- `CANNES_2026_TASKS.md`
- `CANNES_2026_ACCEPTANCE_TEST_MATRIX.md`
- `CANNES_2026_EDGE_CASES.md`
- `CANNES_2026_DEPLOYMENT_AND_DEMO.md`
- `CANNES_2026_ADVERSARIAL_REVIEW.md`

## Scope

This repo is the standalone spec-first home for the Intelligence Exchange Cannes 2026 work.

## Local MVP Demo

This repo now includes a runnable Cannes-specific MVP in a pnpm workspace:

- `apps/intelligence-exchange-cannes-web`
- `apps/intelligence-exchange-cannes-broker`
- `apps/intelligence-exchange-cannes-worker`
- `packages/intelligence-exchange-cannes-contracts`
- `packages/intelligence-exchange-cannes-shared`

### What the demo covers

- World-style verified poster and worker gating via explicit local stubs
- idea funding and deterministic `BuildBrief` generation
- fixed milestone board with a claimable `scaffold` job
- worker artifact + trace + paid dependency submission
- deterministic scoring and human approval
- onchain escrow deploy, fund, reserve, release, and refund on a local chain
- ERC-8004-inspired agent identity registration for the poster and worker
- 0G-style dossier persistence to a local mirror file

### Run it

```bash
pnpm install
pnpm dev
```

Open:

- web: `http://127.0.0.1:4173`
- broker API: `http://127.0.0.1:8787`
- chain RPC: `http://127.0.0.1:8545`

Optional worker runtime:

```bash
pnpm --filter intelligence-exchange-cannes-worker claim-and-submit
```

### Optional chain modes

Local deterministic mode is the default.

To use a forked RPC when credentials are available:

```bash
CHAIN_MODE=fork FORK_RPC_URL=https://... pnpm dev
```

To point the broker at Arc Testnet with the official default RPC:

```bash
CHAIN_MODE=testnet pnpm dev
```

Override the RPC or chain ID only if needed:

```bash
CHAIN_MODE=testnet RPC_URL=https://... CHAIN_ID=5042002 pnpm dev
```

### Current public-network targets

The intended sponsor-grade targets for this Cannes variant are:

- Arc Testnet for escrow deployment and payout rehearsal
- World ID 4.0 / AgentKit for proof-of-human gating
- 0G Galileo Testnet for dossier persistence

The current codebase runs fully in local deterministic mode by default, with Arc Testnet wiring available through env config. World remains an explicit verification stub unless app credentials are provided. 0G remains a labeled local dossier mirror until the live write path is wired.

See:

- `IMPLEMENTATION_STATUS.md`
- `IMPLEMENTATION_MULTIPASS_REVIEW.md`

### Screenshots

Generate review screenshots while the demo is running:

```bash
pnpm demo:screenshot
```

Outputs:

- `apps/intelligence-exchange-cannes-web/screenshots/cannes-dashboard.png`
- `apps/intelligence-exchange-cannes-web/screenshots/cannes-dashboard-mobile.png`
