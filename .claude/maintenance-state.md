# Maintenance State
last_run: 2026-07-13
focus: deps
status: completed
completed:
  - chore(deps): bump 11 @radix-ui/* to latest patch versions (web app)
  - chore(deps): @rainbow-me/rainbowkit ^2.1.3 → ^2.2.11 (minor bump)
  - chore(deps): hono ^4.12.14 → ^4.12.29 (broker-core)
  - pnpm-lock.yaml regenerated; PR #81 opened
in_progress:
pending: [investigate @ts-ignore at StakingPage.tsx:204 — Type '0n | Element | undefined' not assignable to ReactNode; remaining noUnusedLocals errors tracked in open PR #66 (unmerged)]
known_failures:
  - broker acceptance tests require PostgreSQL — skip in sandbox
  - worker bun test fails from pkg dir — run from workspace root with pnpm test
  - StakingPage.tsx has one @ts-ignore comment needing proper fix
  - PR #66 (chore/maintenance-2026-06-09) unmerged — contains earlier noUnusedLocals fixes
skip_next_run: []
