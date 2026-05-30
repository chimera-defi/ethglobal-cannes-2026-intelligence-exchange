# Incentive Flywheel Architecture

**Date:** 2026-05-30

---

## The Five Flywheels

```
┌─────────────────────────────────────────────────────────┐
│                 FLYWHEEL 1 (core)                       │
│  Task posted → accepted work → 9% staker yield          │
│  → more stakers → higher mint allowances                │
│  → more minting → more INTEL supply → more tasks        │
│  (IntelStaking.sol + TaskEscrow.sol — LIVE)             │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                 FLYWHEEL 2 (LP depth)                   │
│  ETH mints → 50% to POL → UniV3 deployed                │
│  → pool earns fees → fees fund LP mining rewards        │
│  → external LPs attracted → deeper liquidity            │
│  → better TWAP → manipulation-resistant mint price      │
│  → more trust → more minting → more POL                 │
│  (IntelPOLManager.sol + LiquidityMining.sol — BUILDING) │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                 FLYWHEEL 3 (burn pressure)              │
│  Protocol revenue (task fees + mint fees)               │
│  → BuybackBurn buys INTEL from POL → 80% burned         │
│  → 20% to LP mining reward pool                         │
│  → less supply + LP attracted → price rises             │
│  → higher fee revenue → more buyback pressure           │
│  (BuybackBurn.sol — updating; LiquidityMining — BUILDING)│
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                 FLYWHEEL 4 (quality)                    │
│  Quality work → high AIU score → epoch bonus rewards    │
│  → worker reinvests in reputation → more quality work   │
│  → more acceptances → more WorkReceipt1155 NFTs         │
│  → richer AgentIdentityRegistry → external demand       │
│  (EpochRewardDistributor.sol — LIVE)                    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                 FLYWHEEL 5 (reviewer trust)             │
│  Low dispute-overturned rate → reviewer earns more fees │
│  → better review capacity → faster turnaround           │
│  → more tasks completed → more INTEL velocity           │
│  (ReviewerStakeManager.sol — partial; needs reputation  │
│   fee multiplier in future)                             │
└─────────────────────────────────────────────────────────┘
```

---

## What Is Being Built Now

### LiquidityMining.sol

A `rewardRate`-based gauge where:
- Users stake INTEL tokens (signalling LP commitment)
- Rewards paid in INTEL from a dedicated `miningPool`
- Pool funded by: POLManager fee collection + 20% of BuybackBurn proceeds
- Standard reward-per-share accumulator (no lock; rewards stop on unstake)
- Separate from IntelStaking — no double-dipping on 9% yield

**Reward source:** `BuybackBurn.executeBuyback()` routes 80% burn / 20% → `LiquidityMining.depositRewards()`. Plus manual `depositRewards()` from POL fee collection.

### BuybackBurn.sol change

Add `lpMiningAddress` + `lpMiningBps = 2000` (20%). On every `executeBuyback()` run: 80% of purchased INTEL burns, 20% deposits to `LiquidityMining`.

### YieldPage.tsx

Unified yield dashboard surfacing all 5 flywheels:
- INTEL Staking: APR from 9% task yield + 45% ETH mint yield (IntelStaking)
- LP Mining: APR from BuybackBurn + POL fees (LiquidityMining)
- Epoch Rewards: estimated bonus from AIU score (EpochRewardDistributor)
- Task Worker: pending settlement yield

---

## APR Estimates at Scale (illustrative)

At $1M annualized GMV (accepted task volume):
- 9% staker yield = $90K/yr → staker APR depends on total staked
- 10% treasury = $100K/yr → partially feeds BuybackBurn → LP mining
- 20% of buyback = ~$20K/yr → LP mining rewards
- POL fee revenue at 0.3% on $500K liquidity = ~$1.5K/yr → LP mining

Early phase: LP mining APR will be high (small pool, generous rewards) to bootstrap liquidity depth.

---

## Future Flywheels (not in scope now)

- **Referral rewards**: worker A refers worker B → A earns 1% of B's future yield for 6 months
- **Quality streaks**: 5 consecutive accepted tasks → 10% bonus on next settlement
- **Poster rebates**: if poster's task has >90% acceptance rate over 10+ jobs → 2% fee rebate
- **Cross-chain reputation**: LayerZero bridge to let Ethereum protocols query Base registry → creates external INTEL demand
