## Intelligence Exchange Token Architecture

### Objective
Add a protocol token without breaking stable-denominated job pricing, worker payout clarity, or the accepted-work settlement model.

### Core Principle
The token is not the thing being sold.
The product sells accepted intelligence work.
The token coordinates trust, access, and upside around that work.

### Design Constraints
1. Buyer funding and milestone reserves remain stablecoin-denominated.
2. Default worker payout remains stablecoin-denominated.
3. The utility token never represents provider credits or unused subscriptions.
4. Any derivative layer must be backed by accepted work receipts, fee flows, or benchmarked future delivery obligations.
5. No derivative goes live before the protocol has measurable receipt inventory and replayable acceptance history.

### Core Assets
- `USDC`-style stable asset
  - buyer funding
  - milestone reserve
  - default worker payout
- `IX` utility token
  - worker stake
  - slash collateral
  - buyer fee discounts
  - access tiers
  - optional reward routing
- `WorkReceipt1155`
  - minted only on accepted work
  - carries milestone id, worker id, task class, score, payout amount, dossier URI, and acceptance timestamp
- `AIUIndex`
  - accepted intelligence unit index derived from normalized accepted receipts
- `iIX-*` derivative vault share
  - optional later-phase ERC-20 share backed by receipt pools or fee streams

### Onchain Modules
1. `IdeaEscrow`
   - stablecoin funding, reserve, release, refund
2. `IdentityGate`
   - verified poster and verified worker checks
3. `WorkerStakeManager`
   - lock, unlock, cooldown, slash
4. `AccessTierRegistry`
   - buyer lock tiers for discounts and routing priority
5. `FeeRouter`
   - splits protocol take-rate between treasury, reward pool, insurance reserve, and optional buyback sink
6. `RewardDistributor`
   - epoch-based `IX` rewards to workers, buyers, and stakers
7. `WorkReceipt1155`
   - immutable accepted-work receipt inventory
8. `DerivativeVaultFactory`
   - phase-gated factory for receipt pools or fee-share vaults

### Offchain Modules
1. Broker scoring engine
   - computes acceptance state and quality score
2. `AIU` calculator
   - normalizes accepted work into a common index
3. Risk engine
   - decides required stake tier and slash severity
4. Dossier writer
   - stores replay bundle and evidence used by reviewers and derivative pools

### Core Flow
1. Buyer funds an idea or job in stablecoin.
2. Broker decomposes work into milestones and assigns risk tier.
3. Worker claims a milestone.
4. If the milestone is above the free tier, the worker posts `IX` stake.
5. Worker completes the task and submits artifacts plus trace.
6. Scoring and human review determine acceptance or rejection.
7. On acceptance:
   - stablecoin payout releases to the worker
   - protocol fee routes through `FeeRouter`
   - accepted work mints `WorkReceipt1155`
   - worker becomes eligible for epoch `IX` rewards
8. On rejection, fraud, or severe policy breach:
   - no stablecoin release
   - stake may be partially or fully slashed
   - receipt is not minted

### Stake Model
Stake is tied to trust and job size, not to all participation.

Suggested tiering:
- Tier 0
  - low-value or curated demo jobs
  - no stake required
- Tier 1
  - standard jobs
  - minimum worker stake required
- Tier 2
  - high-value or sensitive jobs
  - higher stake plus stronger verification and lower claim concurrency

Slash reasons:
- fabricated or forged evidence
- accepted output later reversed due to fraud
- severe policy breach
- repeated abandonment after claim

Do not slash for ordinary model variance or good-faith subjective disagreement.

### Reward Model
Rewards are additive, not substitutive.

Worker value flow:
- base payout in stablecoin
- optional `IX` rewards for accepted work quality, reliability, and throughput

Buyer value flow:
- stable-denominated job budgets
- optional locked `IX` for lower fees or faster routing

Protocol value flow:
- stablecoin take-rate
- optional token demand from stake, fee discounts, and receipt-backed derivative access

### `AIU` Index
`AIU` means accepted intelligence units.

It is a normalized accounting index, not a payment token.
It is used for:
- worker reward weighting
- cohort-level throughput reporting
- derivative pool benchmarking

Suggested calculation:

```text
AIU = task_weight x acceptance_multiplier x quality_multiplier
```

Where:
- `task_weight` comes from the milestone class rubric
- `acceptance_multiplier` is `1` only for accepted work
- `quality_multiplier` ranges from `0.75` to `1.25`

### How Derivatives Sit On Top
The protocol should not jump straight to "futures on intelligence."
It should add derivative layers in order of realism:

#### Layer 1: Receipt-backed index vaults
- vault deposits or references `WorkReceipt1155` inventory
- vault issues fungible shares against a class or cohort of receipts
- value comes from fee flows, licensing flows, or receipt-linked royalties

#### Layer 2: Agent cohort revenue vaults
- vault tracks a named worker cohort, task class, or buyer segment
- value comes from the fee stream generated by accepted work from that cohort
- better framing than tokenized raw intelligence because the underlying is actual protocol performance

#### Layer 3: Forward delivery of `AIU`
- only after enough stable receipt history exists
- workers or operator pools post `IX` collateral and promise future delivery of `AIU`
- cash settlement or delivery settlement must be explicit
- this is the closest thing to an actual intelligence derivative

### Why This Counts As An Intelligence Derivative
It is not a derivative on model credits.
It is a derivative on accepted, benchmark-normalized intelligence output.

The underlying asset is:
- verified accepted work
- normalized into `AIU`
- linked to stable-denominated fee and payout history

That is the only realistic way to create "intelligence exposure" without pretending provider credits are freely tokenizable.

### Non-Goals
- token-denominated base wages
- provider-credit redemption
- unused subscription resale
- claiming the first `IX` token itself is a futures contract
- launching open derivative pools before receipt inventory and dispute controls exist

### Recommended Rollout
1. Phase 1
   - stablecoin escrow
   - identity gate
   - accepted-work scoring
2. Phase 2
   - `IX` staking
   - fee discounts
   - reward routing
3. Phase 3
   - `WorkReceipt1155`
   - `AIU` index publishing
4. Phase 4
   - receipt-backed vaults
   - cohort-level derivative products
5. Phase 5
   - forward `AIU` delivery markets only if the protocol has enough depth and risk tooling
