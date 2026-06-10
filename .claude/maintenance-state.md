# Maintenance State
last_run: 2026-06-10
focus: security
status: completed
completed: [security scan passed — all secret/password refs use process.env; .env in .gitignore confirmed; no eval/exec patterns; no hardcoded tokens]
in_progress:
pending: [broker unit tests — require PostgreSQL mock setup]
known_failures:
  - broker bun test fails with ECONNREFUSED 5432 (no PostgreSQL in sandbox) — skip broker tests in this env
  - infra-hardening-regression CI check requires Docker — pre-existing skip in all PRs
  - worker cli.test.ts fails with "Cannot find package viem" — pnpm workspace not installed in worker pkg dir; run from root
skip_next_run: [tokenomics amm.ts — fully covered until amm.ts changes]
