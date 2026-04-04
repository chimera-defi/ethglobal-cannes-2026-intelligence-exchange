## Intelligence Exchange Token Handoff Package

### Objective
Implement the token layer as a disciplined extension of stablecoin-settled job execution, not as a replacement for it.

### Build Order
1. Stablecoin escrow and accepted-work settlement must already work.
2. Identity and dispute controls must already exist.
3. Only then add utility-token stake, fee, and reward mechanics.
4. Only after receipt inventory exists should the protocol build derivative vaults.
5. Payout preference and points conversion should ship before any token-heavy campaign mode.

### Workstreams

#### WS-1 Contracts
Scope:
- `IdeaEscrow` integration hardening
- payout preference enum on task creation
- `WorkerStakeManager`
- `AccessTierRegistry`
- `FeeRouter`
- `RewardDistributor`
- `WorkReceipt1155`
- `DerivativeVaultFactory` interface stubs only

Acceptance:
1. Worker stake can lock, unlock, cool down, and slash.
2. Accepted jobs route stablecoin payout and protocol fee correctly.
3. Receipt mint happens only on accepted work.
4. Platform-owned tasks can select `points_only`; ordinary third-party tasks cannot bypass stable-backed defaults.
5. No contract path allows token-denominated default wages for the general marketplace.

#### WS-2 Broker And Data Plane
Scope:
- risk-tier assignment for stake requirements
- payout preference validation
- creator and finisher points ledger
- `AIU` calculation and epoch reward snapshots
- receipt metadata generation
- fee-routing events
- derivative data export for later vaults

Acceptance:
1. Every accepted job emits enough metadata to reconstruct points, reward, and receipt state.
2. Broker can publish epoch point conversions and reward allocations deterministically.
3. Slash decisions reference replayable evidence.

#### WS-3 Web And Worker UX
Scope:
- worker stake dashboard
- payout preference picker on task creation
- buyer access tier and fee discount UX
- creator points dashboard
- accepted receipt explorer
- reward history
- warning states when token exposure exceeds policy limits

Acceptance:
1. Buyer always sees stable-denominated job pricing.
2. Buyer can choose `stable_only`, `stable_plus_points`, or `points_only` if policy allows.
3. Worker always sees stable payout separately from points and token rewards.
4. Premium claims clearly show required stake and slash risk.

#### WS-4 Risk, Policy, And Ops
Scope:
- slash policy matrix
- platform-owned campaign policy for `points_only` tasks
- buyer lock policy
- reward budget governance
- emergency pause
- provider-terms policy gating for supported worker connectors

Acceptance:
1. Fraud slash policy is explicit and bounded.
2. Good-faith model variance cannot trigger full slash.
3. Reward emissions can be paused without breaking stablecoin settlement.
4. Points-only campaigns can be disabled without impacting stable settlement paths.

#### WS-5 Derivative Readiness
Scope:
- receipt inventory quality checks
- `AIU` publishing job
- vault whitelist criteria
- first receipt-backed vault spec

Acceptance:
1. No derivative vault launches without enough receipt history.
2. Vault docs name underlying cash-flow or receipt logic explicitly.
3. The first derivative is receipt-backed or revenue-backed, not provider-credit-backed.

### Critical Dependencies
1. Stablecoin escrow must be production-correct before `IX` goes live.
2. Worker identity and replayable dossier storage must exist before slashing is enabled.
3. Points ledger and epoch conversion must ship before points-heavy task campaigns.
4. `WorkReceipt1155` must ship before any derivative vault.
5. `AIU` index methodology must be published before any forward-style product.

### Suggested Milestones
1. Milestone A
   - stablecoin payout, payout preferences, and fee routing finalized
2. Milestone B
   - worker stake, creator points, and buyer access tiers live
3. Milestone C
   - epoch points conversion and reward distribution live
4. Milestone D
   - accepted-work receipts live
5. Milestone E
   - first receipt-backed vault in closed beta

### Verification Checklist
1. Unit tests
   - stake lock/unlock/slash
   - fee routing
   - receipt minting
2. Acceptance tests
   - accepted job releases stable payout and mints receipt
   - rejected job emits no receipt and can slash according to policy
   - creator and finisher receive the expected points on accepted work
   - buyer lock tier changes fee schedule without changing stable price display
3. Simulation tests
   - emission schedule over 24 months
   - points conversion under mixed `stable_only` / `stable_plus_points` / `points_only` workloads
   - reward pool depletion bounds
   - slash reserve sufficiency under dispute spikes

### Explicit Non-Goals For The First Build
1. No raw-intelligence spot market.
2. No provider-credit resale.
3. No token-denominated default wages.
4. No unrestricted `points_only` tasks for ordinary buyers on day one.
5. No open public forward market on day one.
6. No derivative pool without receipt inventory and cash-flow logic.

### Human Decisions Still Required
1. Exact slash percentages by fraud severity.
2. Exact buyer lock tiers and fee discounts.
3. Whether worker stake is optional or mandatory for Tier 1 jobs.
4. Whether platform-created tasks can pay entirely in points from day one or only after beta.
5. Whether reward top-ups come from fee routing, buybacks, or both.
6. When to allow the first closed-beta derivative vault.

### Package For The Next Implementing Agent
Read in this order:
1. `EXECUTIVE_SUMMARY.md`
2. `TOKEN_ARCHITECTURE.md`
3. `TOKENOMICS.md`
4. `SPEC.md`
5. `CANNES_2026_MVP_SPEC.md`
6. `OPEN_QUESTIONS.md`

Implement in this order:
1. contract interfaces
2. broker reward and receipt logic
3. UX surfaces
4. tests
5. derivative stubs
