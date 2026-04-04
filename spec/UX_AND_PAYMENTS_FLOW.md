## Intelligence Exchange UX and Payments Flow

## Buyer UX (Happy Path)
1. Buyer signs in and creates a workspace.
2. Buyer defines job profile:
   - budget limits
   - turnaround/SLA target
   - quality threshold
   - policy/risk profile
3. Buyer sees stable-denominated pricing and selects funding rails, limits, and payout preference.
4. Buyer submits jobs via UI or API queue endpoint.
5. Buyer gets real-time dashboard:
   - queue status
   - acceptance/rework rates
   - spend and payout ledger
   - failure/retry events

## Worker Operator UX (Happy Path)
1. Worker operator creates account and verifies identity.
2. Worker operator installs worker app (desktop/server).
3. Worker config setup:
   - execution mode (`manual`, `scheduled`, `autonomous`)
   - backend connector (`local CLI` or `API key`)
   - allowed task classes
   - budget and runtime guardrails
4. Worker starts heartbeat and begins pulling eligible jobs.
5. Worker receives job bundle, executes, and submits outputs automatically.
6. Worker operator tracks:
   - accepted jobs
   - rejection/rework reasons
   - earnings and payout schedule
   - creator/finisher points, stake health, and optional token rewards

## MVP Execution Cadence
1. Manual mode first for onboarding and trust calibration.
2. Scheduled mode next (night/weekend windows).
3. Autonomous mode after quality and abuse thresholds stabilize.

## Payment Rails Strategy (MVP -> Phase 2)

### Rail A: Stablecoin escrow and payout
- Default for the Cannes build and protocol-visible settlement.
- Buyer prices and milestone budgets remain stable-denominated.

### Rail B: Utility-token coordination layer (phase-gated)
- Optional token for worker staking/slashing, buyer fee discounts, and access tiers.
- Token is not the default wage or job-pricing unit.

### Rail C: Agentic commerce rails (ACP)
- Support machine-to-machine purchasing and delegated payment authorization where available.
- Use as optional rail for autonomous agents and enterprise automation workflows.

### Rail D: Fiat on/off-ramp or card/invoice bridge (optional)
- Optional bridge for users who need familiar checkout or cashout.
- Keep this additive; do not make it core for initial GTM.

## Checkout / Funding UX
1. Buyer chooses a stable settlement method and optional access-token usage.
   - task payout preference:
     - `stable_only`
     - `stable_plus_points`
     - `points_only` for platform-owned or whitelisted campaigns
2. Buyer configures guardrails:
   - daily cap
   - per-job cap
   - approved job categories
   - required minimum quality score
3. Buyer confirms funding and receives route credentials.
4. Broker starts metering and displays running budget burn.

## Risk Controls in UX
1. Explicit warnings when job type exceeds worker trust tier.
2. Auto-pause toggles on anomalous spend or rejection spikes.
3. Review gates for high-risk categories and new workers.
4. Kill switch for buyers and workers.

## Notes
This flow is designed around fulfillment of execution jobs and measured output acceptance. A utility token may coordinate staking and access, while creator and finisher points convert into token emissions over time. Stable settlement still remains the default marketplace path.
