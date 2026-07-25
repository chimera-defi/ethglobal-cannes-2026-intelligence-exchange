# Maintenance State
last_run: 2026-07-14
focus: ts-cleanup
status: completed
completed:
  - removed stale @ts-ignore JSX comment from StakingPage.tsx:204 (PR #82)
  - confirmed comment was never a valid TS directive and error no longer exists
  - tsc --noEmit passes (only baseUrl deprecation remains, covered by PR #80)
in_progress:
pending: []
known_failures:
  - broker acceptance tests require PostgreSQL — skip in sandbox
  - worker bun test fails from pkg dir — run from workspace root with pnpm test
  - baseUrl deprecation warning in tsconfig — fix in open PR #80
skip_next_run: []
