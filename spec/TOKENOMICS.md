## Intelligence Exchange Tokenomics

### Token Role
`IX` is a utility and coordination token for the Intelligence Exchange.

It exists to:
1. stake workers for higher-trust job classes
2. unlock buyer fee discounts and access tiers
3. route rewards to high-quality workers and sticky buyers
4. anchor later receipt-backed and cohort-backed derivative products

It does not replace stablecoin escrow or default worker wages.

### Token Supply
- token ticker: `IX` (placeholder)
- max supply: `100,000,000 IX`
- minting policy: capped supply, no inflation above the max

### Genesis Allocation
1. `35,000,000 IX` (`35%`) network incentives and rewards
2. `20,000,000 IX` (`20%`) protocol treasury and ecosystem reserve
3. `18,000,000 IX` (`18%`) core contributors and future team grants
4. `12,000,000 IX` (`12%`) strategic backers and partners
5. `10,000,000 IX` (`10%`) liquidity and market operations
6. `5,000,000 IX` (`5%`) risk, security, and compliance reserve

### Vesting Discipline
- network incentives
  - emitted over time by schedule
- treasury and ecosystem reserve
  - multisig-controlled, release-gated by milestone plan
- core contributors
  - 12-month cliff, 36-month linear vest
- strategic backers and partners
  - 12-month cliff, 24-month linear vest
- liquidity and market operations
  - only what is required for launch liquidity and partner programs
- risk, security, and compliance reserve
  - emergency and legal reserve, not for ordinary ops

### Emission Schedule
Emissions come only from the `35,000,000 IX` network-incentive bucket.

Nominal annual cap:
1. Year 1: up to `6,000,000 IX`
2. Year 2: up to `5,000,000 IX`
3. Year 3: up to `4,000,000 IX`
4. Year 4: up to `3,000,000 IX`
5. Year 5 and beyond: up to `2,000,000 IX` per year until the incentive bucket is exhausted

Actual emission rule:

```text
actual_epoch_emission = min(schedule_cap, fee_coverage_cap)
```

Suggested fee coverage cap:

```text
fee_coverage_cap = 1.5 x trailing_90d_reward_budget
```

Interpretation:
- the protocol can emit up to the scheduled amount
- but should not out-emit the amount that its recent fee base can plausibly support

### Reward Split Per Epoch
1. `65%` worker quality rewards
2. `20%` buyer lock and retention rewards
3. `10%` insurance/staker rewards
4. `5%` ecosystem experiments and referral programs

### Worker Reward Formula
Stablecoin remains the base payout.
`IX` is the upside layer.

Suggested reward calculation:

```text
worker_ix_reward =
epoch_worker_pool x
(worker_aiu / total_epoch_aiu) x
reliability_multiplier
```

Where:
- `worker_aiu` is the worker's accepted intelligence units in the epoch
- `reliability_multiplier` ranges from `0.8` to `1.2`

Default worker compensation guardrail:
- stablecoin should remain at least `80%` of expected worker compensation
- token rewards should default to no more than `20%`
- curated premium cohorts can opt into higher token share later, but that is not the default market path

### Buyer Lock Utility
Suggested buyer tiers:
1. `Explorer`
   - no lock
   - standard fees and queue priority
2. `Pro`
   - token lock unlocks lower fees and larger budget caps
3. `Priority`
   - higher lock unlocks tighter queue priority and premium support lanes

Fee discount should be bounded.
Do not exceed a discount level that destroys stablecoin fee revenue.

### How The Token Helps
1. Better worker quality
   - stake plus slash risk discourages spam and forged submissions
2. Better worker retention
   - upside rewards make reliable operators care about future participation
3. Better buyer retention
   - token locks create real switching cost through fee savings and access tiers
4. Better protocol margins
   - the protocol can reward behavior without replacing its stable settlement base
5. Better derivative base layer
   - receipts, `AIU`, and fee routing create a measurable underlying for later vault products

### Fee Routing
Suggested protocol fee split on accepted work:
1. operations and treasury
2. dispute and risk reserve
3. reward budget top-up
4. optional buyback or burn sink

Illustrative accepted-job flow:
- buyer funds `$100`
- worker receives `$80` stablecoin
- protocol keeps `$20`
- from that `$20`, a bounded portion can replenish the reward pool or optional buyback sink

The key point:
protocol value should come from fee routing and usage, not from paying workers in a volatile token instead of stable assets.

### Why Not Pure Token Wages
Pure token wages create the wrong incentives:
- workers price in volatility and sell pressure
- buyers lose stable cost expectations
- protocol revenue looks better on paper while dilution increases in the background

The token works best when it sits on:
- participation
- access
- rewards
- receipt-backed upside

Not on basic labor settlement.

### How Derivatives Fit
There are two realistic derivative families:

#### 1. Receipt-backed or revenue-backed instruments
- backed by accepted-work receipts, licensing flows, or protocol fee streams
- simplest path to "intelligence exposure"

#### 2. Forward `AIU` delivery instruments
- backed by future accepted intelligence units
- require stake collateral, a public `AIU` index, and strong failure handling

### Intelligence Derivative Framing
The token itself is not the intelligence derivative.
The derivative layer sits on top of the tokenized coordination system.

The stack is:
1. stablecoin settlement
2. `IX` utility and stake
3. accepted-work receipts
4. `AIU` index
5. derivative vaults or forward products

That sequencing is what makes the design believable.

### Guardrails
- no provider-credit redemption
- no unlimited emissions
- no required token wage exposure for the default worker path
- no derivative pool without replayable receipt inventory
- no public claim that `IX` price equals "the price of intelligence"

### Success Metrics
The token is helping only if it improves:
1. accepted-job completion rate
2. worker retention for high-score operators
3. buyer repeat rate
4. fraud and dispute loss rate
5. protocol fee retention after rewards and buybacks
