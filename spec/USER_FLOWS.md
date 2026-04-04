## User Flows (Intelligence Exchange)

State labels follow `STATE_MODEL.md`.

## 1) Buyer Happy Path
1. Buyer creates workspace and funding profile.
2. Buyer configures job policy: budget, SLA, quality threshold, allowed categories, and optional GitHub repo / issue context.
3. Buyer submits jobs via API or dashboard.
4. Broker publishes queued milestones to the public jobs board.
5. Buyer can share a queued task to X when the task is safe for public discovery.
6. Broker matches jobs to eligible workers.
7. Buyer monitors acceptance/rework/latency metrics plus GitHub PR state when present.
8. Accepted outputs settle and appear in ledger/export.

## 2) Worker Happy Path
1. Worker operator installs daemon and authenticates.
2. Worker sets guardrails: mode, schedule, budget, task classes.
3. Worker claims eligible jobs from broker.
4. Worker reviews task context, including linked GitHub repo / issue details when present.
5. Worker executes and submits result + trace, plus PR URL for repo-targeted work.
6. Broker scores outputs and marks accept/reject/rework.
7. Earnings accrue and payout batch is processed.

## 3) Public Discovery Path
1. A queued milestone appears on the public jobs board with summary, budget, milestone type, and trust hints.
2. Buyer or operator taps `Share on X` to publish a compact task summary with the public task URL.
3. Interested workers open the task page, inspect GitHub context if present, and jump into the claim flow.
4. Once claimed or closed, the public task URL stays live but shows the latest status instead of a stale share CTA.

## 4) Failure Path: Job Rejection Spike
1. Quality scorer flags rising rejection rate for worker.
2. Broker auto-throttles worker claim volume.
3. Worker receives rejection reason summary and remediation prompts.
4. Operator revises settings/prompts and retries in lower-risk lane.
5. If unresolved, account is paused pending review.

## 5) Failure Path: Spend/Abuse Anomaly
1. Buyer spend velocity exceeds configured threshold.
2. System auto-pauses new claims and notifies buyer.
3. Buyer reviews job sources and resumes with stricter guardrails.
4. High-risk events escalate to dispute/risk review queue.
