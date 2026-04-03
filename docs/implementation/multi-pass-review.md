# Multi-Pass Review

Date: 2026-04-03
Branch baseline: `main` after PR 3 merge, continued on `codex/main-pr3-hardening`

## Pass 1: Correctness And Contract Fit

- Fixed repo build blockers:
  - worker package now has a real `tsconfig.json`
  - contract scripts resolve `forge` reliably in this environment
  - contract deploy script now exists and deploys escrow, registry, and local mock USDC
- Fixed broker acceptance tests so they match actual API behavior instead of stale expectations.
- Fixed local bootstrap race conditions by waiting for Postgres/Redis before migrating and seeding.
- Added broker-owned World verification records and dossier writing rails so sponsor integrations now have real ownership boundaries.
- Added local chain lifecycle scripts so the demo bootstrap now includes Anvil + contract deploy.
- Replaced the web funding stub with a live wallet-backed escrow funding path for local/testnet configuration.
- Wired buyer review actions to the escrow contract so local review now signs reserve/release or refund from the connected wallet before the broker records the outcome.
- Verified:
  - `pnpm check`
  - `pnpm demo:bootstrap`
  - `pnpm --filter intelligence-exchange-cannes-broker test:acceptance`
  - `pnpm --filter intelligence-exchange-cannes-contracts deploy:local`

## Pass 2: Consistency Across Docs, Spec, And Tests

- README now explains the product clearly as a human-gated milestone marketplace, not a vague autonomous system.
- Local demo instructions now match the repo scripts:
  - `pnpm demo:bootstrap`
  - `pnpm dev:cannes`
- Buyer-facing routing now better matches the Cannes MVP and the requested page model:
  - `/buyer`
  - `/buyer/new`
  - `/buyer/review`
  - `/buyer/history`
  - `/jobs`
- Buyer review actions now use the active buyer session identity instead of a hardcoded reviewer ID.
- Repo/spec URLs now flow from idea creation into the brief, job skill file, idea detail, and review panel.
- Submission/review now treats pull request links as first-class artifacts instead of generic opaque blobs.
- Screenshots captured from the current local stack:
  - `docs/screenshots/buyer-workspace.png`
  - `docs/screenshots/jobs-board.png`
  - `docs/screenshots/buyer-review-mobile.png`
- Wallet connection is now wired into the web shell via RainbowKit/wagmi, and the broker exposes `/v1/cannes/integrations/status`.
- Review payloads now carry settlement metadata back to the broker, and job detail includes the latest settlement record for UI/status display.

## Pass 3: Demo Honesty, Edge Cases, And Slop Removal

- README explicitly labels what is still simulated:
  - World proof generation in the UI when no World credentials are configured
  - 0G remote write unless `ZERO_G_WRITE_URL` is configured
- Prize mapping was corrected to match the actual integration depth:
  - World ID 4.0 is the real current World target
  - World Agent Kit is not
  - 0G Wildcard is the real current 0G target unless the worker is ported into OpenClaw proper
  - Arc stablecoin logic is the real current Arc target unless agent nanopayments are added
- Product language stays honest:
  - human review is required before payout
  - this is not an open autonomous onchain labor market
- Remaining honest gaps:
  - World verification is still demo fallback unless `WORLD_APP_ID` / `WORLD_ACTION_ID` and `VITE_WORLD_*` are configured
  - 0G still needs a real remote writer target configured in deployment
