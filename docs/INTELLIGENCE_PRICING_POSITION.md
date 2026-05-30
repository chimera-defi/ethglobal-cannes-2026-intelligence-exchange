# Intelligence Pricing: Where We Stand vs. Competitors

**Date:** 2026-05-30  
**Status:** Internal strategic reference

---

## How We Price Intelligence (The Mechanism)

INTEL mint price is determined by a TWAP-anchored formula with a utilization premium:

```
mintPrice = max(TWAP × (1 + utilizationBps / 10000), floorPrice)
```

Where:
- **TWAP** = 30-min time-weighted average of INTEL/ETH on UniswapV3 (manipulation-resistant)
- **utilizationBps** = protocol-side signal of acceptance rate / marketplace velocity
- **floorPrice** = absolute minimum set by owner to prevent zero-cost minting
- **staking gate** = only wallets with staked INTEL earn mint allowances (`k * sqrt(staked)`)

This means the price of acquiring new INTEL is directly anchored to:
1. What the market already prices INTEL at (TWAP)
2. How much verified work is flowing through the protocol (utilization)
3. How much the buyer has committed to the protocol (staked position)

---

## Competitor Comparison

| Protocol | Pricing Mechanism | Quality Gate | Demand Driver |
|----------|-------------------|--------------|---------------|
| **Pearl Protocol** | Proof-of-compute (MatMul proofs) | None | GPU throughput |
| **Bittensor (TAO)** | Net staking flow → subnet emissions | Automated validator scoring | TAO staking inflows |
| **Gensyn ($AI)** | Compute fee market + buy-and-burn | None | Training job demand |
| **Fetch.ai (FET)** | Bonding curve per-agent speculation | None | Token speculation |
| **SingularityNET (AGIX)** | Service payment rail | Rating-based (unverified) | Service completions |
| **Olas (OLAS)** | Service coordination bonding curve | None | Agent coordination |
| **Ritual (RITUAL)** | TEE compute fees | None | Inference demand |
| **Intelligence Exchange (INTEL)** | TWAP + acceptance utilization premium | **Human review required** | Accepted output volume |

---

## Our Structural Advantages on Pricing

### 1. Acceptance-gated demand is uncheatable
Every other protocol's demand signal can be gamed: buy more GPU time (Pearl), stake more TAO (Bittensor), deploy more agents (Fetch.ai). Ours cannot: the demand signal is human reviewer acceptance of real work output. You can't fake a reviewer accepting bad work without staking a bond that can be slashed.

### 2. TWAP ties price to real market clearing, not speculation
Bittensor's emission rate depends on TAO staking flows — pure speculation. Fetch.ai agent tokens are pure bonding curves. Our mint price is anchored to the open-market ETH/INTEL price via a tamper-resistant TWAP. The market's view of INTEL value is always the floor; utilization can only push the price up, never down.

### 3. The utilization multiplier creates a self-braking supply expansion
When protocol utilization surges (lots of accepted work), mint price rises. This dampens reflexive mint-sell loops: you need to pay more to mint when demand is highest. Bittensor has the opposite dynamic: high staking flows increase emissions, creating inflationary pressure precisely when demand is strongest. Gensyn's buy-and-burn only kicks in after revenue is captured.

### 4. Staking gate aligns mint rights with commitment
You can only mint if you hold a staked INTEL position (allowance = k × √staked). This means the marginal minter has already committed capital to the protocol. Fetch.ai's bonding curves allow anyone to speculate with zero commitment. Bittensor requires TAO staking but not protocol usage.

---

## What We Can Adopt from Competitors

### From Bittensor: flow-based emission shaping
Bittensor's DTAO model routes more emissions to subnets receiving more TAO staking inflows. We could adapt this: allocate a larger epoch mint cap share to wallets whose staking position grew this epoch (new staking = more active commitment). This rewards fresh capital commitment over stagnant whale positions. Implementation path: add a `stakingFlowBonus` to `mintAllowance()` calculation.

### From Gensyn: buy-and-burn split (70/29/1 → BuybackBurn)
Gensyn routes 70% of protocol revenue to token buyback+burn, 29% to treasury, 1% to executors. Our BuybackBurn.sol currently routes a configurable amount. We should compare our split explicitly and consider adopting the 70% burn floor as a governance-minimizing default — it creates a cleaner supply model than discretionary treasury allocation.

### From Fetch.ai: agent operational metrics as supplementary AIU signal
Fetch.ai tracks agent uptime and request counts as operational stats. We don't yet include agent availability signals in the AIU index. A worker agent that has been consistently available (measured by claim response time and zero-unclaim rate) should earn a small AIU bonus. This rewards reliability, not just output quality.

### From SingularityNET: cross-chain reputation querying
AGIX's reputation layer is queryable by other protocols. Our AgentIdentityRegistry is on one chain. Adding a cross-chain read (LayerZero or Wormhole bridge for registry queries) would let Ethereum mainnet protocols query Base-deployed agent reputation. This dramatically expands the external demand flywheel.

---

## Where We Are Weakest vs. Competitors

### Liquidity depth
Fetch.ai's FET token and Bittensor's TAO have deep on-chain liquidity. Our TWAP-based mint price requires sufficient INTEL/ETH liquidity on UniswapV3 to be manipulation-resistant. With shallow liquidity, a single large buy can spike the TWAP, inflating mint prices for everyone and disrupting honest minting. The 50% POL routing from mint inflows is the fix — but it only works once significant volume flows through.

### No automated validator fallback
Bittensor has automated validator scoring as a fallback when human reviewers are unavailable. We have zero fallback: if no human reviewers are online, no jobs can be accepted. A lightweight automated quality score (LLM-based pre-screening, >0.8 score auto-accepts) would reduce reviewer bottleneck risk while keeping human gating for final settlement.

### No subnet-style market segmentation
Bittensor subnets can set their own evaluation criteria and have distinct token economics. We treat all task categories the same. CategoryRegistry.sol has weights, but there's no mechanism for high-value categories (e.g., medical research) to have a higher mint premium than low-value categories (e.g., content writing). This is a future feature but worth noting.

---

## The Pricing Position in One Sentence

Every competitor prices *input* (compute, staking, speculation). We are the only protocol that prices *accepted output* — and our utilization-adjusted TWAP mint mechanism means the price of acquiring new INTEL is always a direct function of how much verified work humanity is completing, not how much capital is chasing the token.

---

*See also: `docs/COMPETITOR_ANALYSIS_DEEP.md`, `spec/TOKENOMICS.md`, `packages/intelligence-exchange-cannes-contracts/src/IntelMintController.sol`*
