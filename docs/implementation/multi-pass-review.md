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

## Pass 3: Demo Honesty, Edge Cases, And Slop Removal

- README explicitly labels what is still simulated:
  - World verification UI
  - Arc funding transaction from the web app
  - 0G dossier writes
- Product language stays honest:
  - human review is required before payout
  - this is not an open autonomous onchain labor market
- Remaining honest gaps:
  - wallet connection is still a buyer-session input, not a real connected-wallet flow
  - World and 0G are still demo-mode placeholders
  - web funding still records a demo tx hash instead of using a live wallet transaction
