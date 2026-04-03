# Multi-Pass Review

Date: 2026-04-03
Branch baseline: `main` after PR 3 merge, continued on `codex/main-pr3-hardening`

## Pass 1: Correctness And Contract Fit

- Fixed repo build blockers:
  - worker package now has a real `tsconfig.json`
  - contract scripts resolve `forge` reliably in this environment
  - contract deploy script now exists and deploys both escrow and registry
- Fixed broker acceptance tests so they match actual API behavior instead of stale expectations.
- Fixed local bootstrap race conditions by waiting for Postgres/Redis before migrating and seeding.
- Added broker-owned World verification records and dossier writing rails so sponsor integrations now have real ownership boundaries.
- Verified:
  - `pnpm check`
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
- Screenshots captured from the current local stack:
  - `docs/screenshots/buyer-workspace.png`
  - `docs/screenshots/jobs-board.png`
  - `docs/screenshots/buyer-review-mobile.png`
- Wallet connection is now wired into the web shell via RainbowKit/wagmi, and the broker exposes `/v1/cannes/integrations/status`.

## Pass 3: Demo Honesty, Edge Cases, And Slop Removal

- README explicitly labels what is still simulated:
  - World proof generation in the current UI
  - Arc funding transaction from the web app
  - 0G remote write unless `ZERO_G_WRITE_URL` is configured
- Product language stays honest:
  - human review is required before payout
  - this is not an open autonomous onchain labor market
- Remaining honest gaps:
  - web funding still records a demo tx hash instead of using a live wallet transaction
  - World verification still needs a production proof modal / verifier path
  - 0G still needs a real remote writer target configured in deployment
