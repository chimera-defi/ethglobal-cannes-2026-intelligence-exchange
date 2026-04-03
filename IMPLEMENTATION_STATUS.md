# Implementation Status

## What is fully working now

- Frontend:
  - single-screen Cannes demo UI
  - seeded idea funding flow
  - milestone board
  - artifact submission flow
  - approval and payout status view
- Backend:
  - deterministic planner
  - milestone claim flow
  - submission validation and scoring
  - dossier mirror persistence
  - worker registration and heartbeat endpoints
  - idempotent funding guard
- Smart contracts:
  - deployable milestone escrow contract with reserve, release, and refund
  - ERC-8004-inspired agent identity registry
  - funding transaction
  - reservation transaction
  - release transaction
  - refund transaction
  - local Ganache-based chain execution

## What is partially implemented

- Arc testnet support:
  - broker defaults can target Arc Testnet when `CHAIN_MODE=testnet`
  - still requires a funded deployer account for real public-network transactions
- Acceptance harness:
  - seeded end-to-end acceptance flow exists via `pnpm test:acceptance --filter ...`
  - the full original matrix is not covered yet
- 0G integration:
  - dossier persistence shape is implemented
  - public-network write path is not yet wired to the 0G SDK
- World integration:
  - verification gates exist in the product flow
  - real World ID / AgentKit proof verification is not yet wired

## What is currently stubbed

- World proof verification is a clearly labeled local stub
- 0G dossier writes are mirrored to local files instead of the live network
- Arc settlement is local-chain by default rather than live testnet by default

## What is not implemented yet

- real World ID 4.0 app configuration and server-side proof verification
- real 0G upload/indexer flow for dossier artifacts
- sponsor-specific UI polish for live wallet onboarding
- multi-worker competition, disputes, refunds, and expiry recovery UI
- full acceptance coverage matching every command name in the original spec matrix

## Honest summary

This is a working local MVP, not a fully sponsor-integrated production demo. The frontend, backend, worker runtime, and contracts are real and run together locally. The World and 0G portions are intentionally surfaced as incomplete rather than hidden behind vague branding.
