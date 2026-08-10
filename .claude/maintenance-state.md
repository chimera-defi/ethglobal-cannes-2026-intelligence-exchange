# Maintenance State
last_run: 2026-08-10
focus: deps
status: completed
completed: [viem 2.11→2.55, hono 4.3→4.13, drizzle 0.30→0.45, lucide 1.7→1.31, playwright 1.61→1.62, mermaid 11.15→11.16, tailwind-merge 3.5→3.6, rainbowkit 2.1→2.2, postgres 3.4.4→3.4.9, hono-zod-validator 0.2→0.9 — PR #93]
in_progress:
pending: []
known_failures:
  - broker acceptance tests require PostgreSQL — skip in sandbox
  - worker bun test fails from pkg dir — run from workspace root with pnpm test
  - StakingPage.tsx has one @ts-ignore comment needing proper fix
  - PR #66 (chore/maintenance-2026-06-09) unmerged — contains earlier noUnusedLocals fixes
skip_next_run: []
attempt_counts:
