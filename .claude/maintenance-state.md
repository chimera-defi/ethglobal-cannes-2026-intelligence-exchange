# Maintenance State
last_run: 2026-08-31
focus: deps
status: completed
completed:
  - bump viem ^2.11.0 → ^2.56.0 (web, broker, worker)
  - bump lucide-react ^1.7.0 → ^1.37.0 (web)
  - bump mermaid ^11.15.0 → ^11.17.2 (web)
  - bump @tanstack/react-query ^5.36.2 → ^5.102.8 (web)
  - bump @rainbow-me/rainbowkit ^2.1.3 → ^2.2.11 (web)
  - bump tailwind-merge ^3.5.0 → ^3.6.0 (web)
  - bump @playwright/test 1.61.0 → 1.62.1 (web)
  - bump playwright ^1.61.0 → ^1.62.1 (web)
  - bump postcss ^8.4.38 → ^8.5.26 (web)
  - bump hono ^4.3.0 → ^4.13.5 (broker)
  - bump @hono/zod-validator ^0.2.2 → ^0.9.0 (broker)
  - bump drizzle-orm ^0.30.10 → ^0.45.2 (broker)
  - bump postgres ^3.4.4 → ^3.4.9 (broker)
in_progress:
pending: []
known_failures:
  - broker acceptance tests require PostgreSQL — skip in sandbox
  - worker bun test fails from pkg dir — run from workspace root with pnpm test
  - bullmq 5→6 major — deferred
  - ioredis 5→6 major — deferred
  - StakingPage.tsx has one @ts-ignore comment needing proper fix
skip_next_run: []
attempt_counts:
