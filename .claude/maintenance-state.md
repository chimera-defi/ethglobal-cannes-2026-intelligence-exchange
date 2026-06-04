# Maintenance State
last_run: 2026-06-04
focus: test-coverage
status: completed
completed: [add 22 AMM tests for intel/amm.ts (tokenomics 10→32), PR #62 open and green]
in_progress:
pending: [broker acceptance tests require PostgreSQL — cannot run in sandbox, worker tests need viem workspace install]
known_failures:
  - broker bun test fails: ECONNREFUSED 127.0.0.1:5432 (no PostgreSQL in CI sandbox) — skip until infra available
  - worker bun test fails: Cannot find package 'viem' — workspace deps not resolved when running from package dir directly; try running from repo root with pnpm
  - contract Foundry tests: foundryup blocked (GitHub API 403 in sandbox) — skip
skip_next_run: [intel/amm.ts tests already added]
