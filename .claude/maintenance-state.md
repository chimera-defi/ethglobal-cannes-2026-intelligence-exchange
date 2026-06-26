# Maintenance State
last_run: 2026-06-22
focus: deps
status: completed
completed:
  - playwright 1.59.1 → 1.61.0 (root devDep + web app exact pin + web app caret range)
  - @radix-ui/react-accordion ^1.2.12 → ^1.2.14
  - @radix-ui/react-avatar ^1.1.11 → ^1.2.0
  - @radix-ui/react-dialog ^1.1.15 → ^1.1.17
  - @radix-ui/react-dropdown-menu ^2.1.16 → ^2.1.18
  - @radix-ui/react-label ^2.1.8 → ^2.1.10
  - @radix-ui/react-progress ^1.1.8 → ^1.1.10
  - @radix-ui/react-select ^2.2.6 → ^2.3.1
  - @radix-ui/react-separator ^1.1.8 → ^1.1.10
  - @radix-ui/react-slot ^1.2.4 → ^1.3.0
  - @radix-ui/react-tabs ^1.1.13 → ^1.1.15
  - @radix-ui/react-toast ^1.2.15 → ^1.2.17
  - @radix-ui/react-tooltip ^1.2.8 → ^1.2.10
in_progress:
pending:
  - investigate @ts-ignore at StakingPage.tsx:204 — Type '0n | Element | undefined' not assignable to ReactNode
  - hono ^4.3.0 → ^4.12.26 in broker app (skipped — large minor jump; verify API compat first)
  - viem ^2.11.0 → ^2.53.1 (skipped — large minor jump; verify API compat first)
  - drizzle-orm ^0.30.10 → ^0.45.2 in broker app (skipped — large minor jump; verify API compat first)
  - bullmq ^5.7.0 → ^5.79.1 (skipped — large minor jump; verify API compat first)
  - zod 3 → 4 (MAJOR, skip)
  - typescript 5 → 6 (MAJOR, skip)
  - pnpm-lock.yaml needs updating via pnpm install after dep bumps (lockfile not updated in sandbox)
known_failures:
  - broker acceptance tests require PostgreSQL — skip in sandbox
  - worker bun test fails from pkg dir — run from workspace root with pnpm test
  - StakingPage.tsx has one @ts-ignore comment needing proper fix
skip_next_run: []
