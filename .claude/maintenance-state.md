# Maintenance State
last_run: 2026-06-19
focus: dead-code
status: completed
completed: [dead code scan clean — tsc noUnusedLocals found 20 unused imports/vars in web but all are pre-existing issues already addressed in open PR #66 (chore/maintenance-2026-06-09). No new dead code since PR #66 branch was created. No TODOs/FIXMEs found. No orphaned files.]
in_progress:
pending: [investigate @ts-ignore at StakingPage.tsx:204 — Type '0n | Element | undefined' not assignable to ReactNode]
known_failures:
  - broker acceptance tests require PostgreSQL — skip in sandbox
  - worker bun test fails from pkg dir — run from workspace root with pnpm test
  - StakingPage.tsx has one @ts-ignore comment needing proper fix
  - open PRs #66/#67/#68/#69 pending merge — contain TS cleanup, security, dead code, deps work
skip_next_run: []
