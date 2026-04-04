## Frontend Vision (Intelligence Exchange)

## Core Surfaces
1. Buyer dashboard
2. Worker dashboard
3. Public jobs board and share pages
4. Job queue and result explorer
5. Risk/dispute center
6. Settlement and payout views
7. Job detail state/action inspector (agent-first)

## Buyer Dashboard
1. Live queue and SLA status.
2. Acceptance/rework trends by task class.
3. Spend controls and anomaly alerts.
4. GitHub repo / issue / PR context for jobs that target a codebase.
5. Export panel for completed outputs and execution traces.
6. Share action for queued milestones that are safe to post publicly.

## Worker Dashboard
1. Runtime status (manual/scheduled/autonomous).
2. Claimed/completed/rejected jobs.
3. Repo / PR context when the worker is operating against GitHub-linked work.
4. Quality score trend and trust-tier status.
5. Earnings, payout schedule, and policy violations.

## Public Jobs Board
1. Show open milestone cards with budget, milestone type, repo badge, and trust hints.
2. Give each queued task a stable permalink and `Share on X` CTA.
3. Shared task copy should include a short summary, milestone type, budget, and GitHub context when present.
4. Claimed or closed tasks must keep the permalink but disable stale share actions and show current status clearly.

## Interaction Model
1. Guardrails are configured before worker can run autonomously.
2. High-risk tasks require explicit approval for lower-trust workers.
3. Critical actions are reversible where feasible (pause/requeue/dispute).
4. Every key lifecycle state is visible via consistent state chips.
5. Primary CTAs are fixed per surface: submit, claim, review, share.
6. Raw GitHub URLs should render as compact badges or metadata rows, not loose text blobs.
7. Empty, loading, and error states must be explicit; no hidden “nothing happened” panels.

## UI Cleanup Targets
1. Use one task-card system across buyer dashboard, public jobs board, and review queue.
2. Keep status, trust, and payout signals in the same visual order across pages.
3. Remove duplicated panels where queue state and detail state are showing the same information twice.
4. Make the public jobs board mobile-readable because X traffic will land there first.

## MVP Scope
1. Desktop web primary.
2. Mobile web for monitoring and approval actions.
3. Public task pages and share flows must render cleanly on mobile.
4. No native app requirement for MVP.

## Wireframe Mapping
1. Buyer console -> queue + mode + policy controls.
2. Worker console -> runtime + guardrails + recent outcomes.
3. Public jobs board -> discoverability + social share.
4. Job detail -> deterministic state/action loop visibility.
5. Risk panel -> case triage and escalation operations.
6. Mobile review -> high-risk moderation actions only.
