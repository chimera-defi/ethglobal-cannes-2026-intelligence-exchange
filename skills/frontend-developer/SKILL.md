---
name: frontend-developer
license: MIT
description: |
  Frontend development guidelines for the intelligence-exchange-cannes-web React app.
  Use when writing, reviewing, or modifying any file in apps/intelligence-exchange-cannes-web/src/.
  Encodes the design system, auth patterns, component library, and API contract for this project.
metadata:
  author: "Claude Sonnet 4.6"
  category: "frontend"
  version: "1.0.0"
  argument_hint: "[component-or-page-name]"
allowed-tools:
  - Read
  - Edit
  - Write
  - Grep
  - Glob
  - Bash
---

# Frontend Developer Skill

## App Overview

React + Vite SPA at `apps/intelligence-exchange-cannes-web/`. TypeScript, React Router v6, TanStack Query, wagmi v2 + RainbowKit, World ID.

**Dev server:** `pnpm dev` → port 3000, proxies `/v1` to broker on 3001.

## Routes

| Path | Component | Role |
|------|-----------|------|
| `/workspace` | BuyerWorkspace | Poster/buyer dashboard |
| `/workspace/review` | BuyerReviewQueue | Review pending jobs |
| `/workspace/history` | BuyerHistory | Past ideas + jobs |
| `/submit` | IdeaSubmission | Post a funded idea |
| `/ideas` | IdeasList | All user ideas |
| `/ideas/:ideaId` | IdeaDetail | Idea + milestone jobs |
| `/jobs` | JobsBoard | Worker job queue |
| `/review/:jobId` | ReviewPanel | Accept/reject submission |

## Design System

**Palette:** Dark gray base — `bg-gray-950` body, `bg-gray-900` cards, `border-gray-800` borders.

**Component library:** shadcn/ui (custom dark-themed). Import from `@/components/ui/`:
- `Button` — variants: `default` (blue), `destructive` (red), `success` (green), `outline`, `secondary`, `ghost`
- `Badge` — variants map 1:1 to job status: `queued`, `claimed`, `submitted`, `accepted`, `rejected`, `rework`, `funded`, `unfunded`, `created`, `settled`
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`
- `Input`, `Textarea`, `Label`
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`
- `Separator`, `Toast`

**Icons:** lucide-react. Common: `Wallet`, `ShieldCheck`, `CheckCircle2`, `XCircle`, `Loader2`, `ChevronRight`, `ArrowLeft`, `ExternalLink`, `Clock`, `AlertCircle`, `Zap`.

**Loading:** Use CSS `.spinner` class (defined in `index.css`) — never emoji spinners.

**cn() helper:** `import { cn } from '@/lib/utils'` for conditional class merging.

## Auth Pattern

All broker calls use `credentials: "include"` for session cookie (`iex_session`).

**Wallet sign-in flow:**
1. `ConnectButton` (RainbowKit) — wallet connection
2. `POST /v1/cannes/auth/challenge` with `{ accountAddress, purpose: "web_login" }`
3. Sign returned message with `signMessageAsync` (wagmi)
4. `POST /v1/cannes/auth/verify` with `{ challengeId, accountAddress, signature }`
5. `GET /v1/cannes/auth/me` to refresh session state

**Role verification:** `POST /v1/cannes/world/verify` with `{ role, proof }` after wallet auth.

**Signed claims (worker):**
1. `POST /v1/cannes/auth/challenge` with `{ accountAddress, purpose: "worker_claim" }`
2. Sign with wallet
3. Send `signedAction: { accountAddress, agentFingerprint, challengeId, signature }` in job claim/submit body

## API Client

`src/api.ts` — typed helpers for all broker endpoints. All session-dependent calls include `credentials: "include"`. Key exports:

Auth: `createAuthChallenge`, `verifyAuthChallenge`, `logout`, `getMe`
World: `verifyWorldRole`, `getWorldStatus`
Agents: `listAgentAuthorizations`, `createAgentAuthorization`, `syncAgentRegistration`
Chain: `syncChainReceipt`
Ideas: `createIdea`, `fundIdea`, `planIdea`, `listIdeas`, `getIdeaDetail`, `cancelIdea`
Jobs: `listJobs`, `claimJob`, `submitJob`, `acceptMilestone`, `rejectMilestone`

## Key Constraints

- **No demo IDs.** Never ask for `buyerId`, `workerId`, `reviewerId` as text input. Identity comes from wallet.
- **No fake tx hashes.** Only send real on-chain tx hashes from wallet interactions.
- **No emoji spinners.** Use `.spinner` CSS class or `<Loader2 className="animate-spin" />`.
- **Gate by auth.** Show clear prerequisite checklist when user lacks wallet / session / World role.
- **Mobile support.** All flows must be usable on mobile (connect, verify, fund, claim, review).

## Handoff Reference

Full spec for remaining frontend work: `spec/CLAUDE_FRONTEND_HANDOFF.md`

## Job Lifecycle States

`created` → `queued` (after milestone reserved) → `claimed` → `submitted` → `accepted` → `settled` (after release sync)

Also: `rejected`, `rework`

## Path Alias

`@/` maps to `apps/intelligence-exchange-cannes-web/src/`. Configured in `tsconfig.json` and `vite.config.ts`.
