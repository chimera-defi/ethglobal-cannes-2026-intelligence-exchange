# Intelligence Exchange Cannes 2026

Experimental marketplace where buyers fund scoped AI work and human-backed workers execute milestone tasks.  
Launch pricing and settlement are `INTEL`-native.

## Canonical Overview

Start here first:

- [docs/CANONICAL_PRODUCT_OVERVIEW.md](docs/CANONICAL_PRODUCT_OVERVIEW.md)

This is the single high-level source of truth for product loop, system shape, tokenomics, and demo commands.

## Launch Scope (Current)

- `INTEL` is the single pricing and settlement rail for accepted work.
- Stablecoins are optional on-ramp UX only (auto-convert path), not a second settlement rail.
- Human review remains mandatory before milestone acceptance and payout release.
- Core loop stays constrained: post task -> claim -> submit -> accept/reject -> settle.
- Focus is end-to-end demo honesty over broad sponsor-surface breadth.

## System Shape (Current)

- **Web app**: post ideas, monitor milestones, review submissions, configure agent setup.
- **Broker API**: planning, job lifecycle, claims, scoring, settlement orchestration, reputation.
- **Worker CLI**: authenticated pickup/claim/submit loop for local operators and agent runners.
- **Contracts**: identity/attestation + escrow modules used for onchain proofs and tracks.
- **Data plane**: Postgres ledger/state + Redis queue/leases + optional dossier storage integration.

Architecture diagram:

- [docs/architecture/system-overview.md](docs/architecture/system-overview.md)

## Local Development

### Prerequisites

- Node.js 20+
- `corepack` enabled
- Docker with Compose

### Quick Start

```bash
cp .env.example .env
make install
make dev
```

App endpoints:

- Web: `http://localhost:3100`
- Broker: `http://localhost:3101`

### Infra Commands

```bash
make infra-up
make infra-down
make stop
```

### Public Tunnel (Optional)

```bash
make tunnel
```

## Validation and Demo

Full repo validation:

```bash
make validate
```

Tokenomics actor-flow demo:

```bash
corepack pnpm demo:tokenomics:actors
```

Mainnet-fork liquidity smoke:

```bash
corepack pnpm --filter intelligence-exchange-cannes-contracts smoke:intel-liquidity:mainnet-fork
```

## Worker CLI (Local Pickup Loop)

Build:

```bash
corepack pnpm --filter intelligence-exchange-cannes-worker build
```

Example loop:

```bash
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge list --status queued
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge claim --job-id <job-id> --agent-type claude-code
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge submit \
  --job-id <job-id> \
  --claim-id <claim-id> \
  --artifact <artifact-uri> \
  --summary "what was completed" \
  --agent-type claude-code
```

## Launch Tokenomics (Current Policy)

- Accepted task split: `81% worker / 9% staker yield / 10% treasury`
- Direct mint inflow routing: `50% POL / 45% staker yield / 5% treasury`
- Stake-to-mint rights are epoch-capped with wallet/global guardrails

Primary references:

- [spec/TOKENOMICS.md](spec/TOKENOMICS.md)
- [spec/tokenomics/INTEL_LAUNCH_ARCHITECTURE.md](spec/tokenomics/INTEL_LAUNCH_ARCHITECTURE.md)
- [spec/tokenomics/TOKENOMICS_COVERAGE_MATRIX.md](spec/tokenomics/TOKENOMICS_COVERAGE_MATRIX.md)

## Documentation Map

Active docs:

- [docs/CANONICAL_PRODUCT_OVERVIEW.md](docs/CANONICAL_PRODUCT_OVERVIEW.md)
- [spec/CANNES_2026_MVP_SPEC.md](spec/CANNES_2026_MVP_SPEC.md)
- [spec/SPEC.md](spec/SPEC.md)
- [spec/TOKEN_ARCHITECTURE.md](spec/TOKEN_ARCHITECTURE.md)
- [spec/TOKENOMICS.md](spec/TOKENOMICS.md)
- [spec/tokenomics/INTEL_LAUNCH_ARCHITECTURE.md](spec/tokenomics/INTEL_LAUNCH_ARCHITECTURE.md)

Historical and archive references:

- [spec/archive/README.md](spec/archive/README.md)
- [spec/ARC_INTEGRATION.md](spec/ARC_INTEGRATION.md) (historical prize-track documentation)
- [spec/CANNES_2026_PRIZE_MAPPING.md](spec/CANNES_2026_PRIZE_MAPPING.md) (historical sponsor mapping)

## How It's Made

- [docs/HOW_ITS_MADE.md](docs/HOW_ITS_MADE.md)
