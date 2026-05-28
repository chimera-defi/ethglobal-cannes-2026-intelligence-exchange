# Intelligence Exchange — Governance Model

## Summary

Intelligence Exchange uses a two-phase governance model. Phase 1 (current) gives the deployer full operational control to move fast during the hackathon and early testnet. Phase 2 transfers ownership to a multisig-backed TimelockController so no single key can change protocol parameters without a 48-hour public window.

INTEL tokens grant economic rights (stake yield, mint allowance) but **do not carry governance votes**. Governance is off-chain multisig, not on-chain token voting. This is a deliberate design choice to avoid plutocracy and voter apathy at early scale.

---

## Phase 1: Deployer (Current)

**Status:** Active at deployment.

| Role | Holder | Rights |
|------|--------|--------|
| Deployer EOA | Chimera (bootstrap) | All `Owner` calls on all contracts |
| Operator | Same EOA initially | `executeMint`, `depositYield`, `consumeAllowance`, `recordAcceptedSubmission` |
| Timelock Admin | Deployer EOA | Can queue/execute/cancel operations via TimelockController |
| Timelock Proposer | Deployer EOA | Can propose operations (initial bootstrap) |

**Constraints even in Phase 1:**
- TimelockController is deployed with a 48h minimum delay from day 1. No operation on timelock-gated contracts can execute without waiting 48h after queueing.
- `adminCancel` exists as an emergency override to cancel malicious queued operations.

---

## Phase 2: Timelock + Multisig (Target)

**Target timeline:** Month 3 post-mainnet deployment, after audits and 90-day stability window.

### Structure

```
Gnosis Safe (3-of-5 signers)
  └─► IntelTimelockController (48h delay)
        ├─► IntelStaking.setParams()
        ├─► IntelMintController.setEpochMintCap(), setFloorPrice()
        ├─► IntelToken.setMinter()
        └─► Treasury withdrawals
```

### Transition steps

1. Deploy Gnosis Safe with 3-of-5 signers (team + advisors).
2. Queue `transferOwnership(timelockAddress)` on IntelStaking via current deployer — wait 48h.
3. Execute. Then call `acceptOwnership()` from within a timelock operation.
4. Repeat for IntelMintController.
5. Update the Gnosis Safe as the `proposer` on TimelockController via `setProposer`.
6. Revoke deployer EOA as proposer.

### Operator rotation (Month 1)

The operator role (lower-privilege: yield deposits, allowance consumption) is rotated to a Gnosis Safe (2-of-3) earlier, at Month 1, after audits complete. This is lighter-weight than full ownership transfer.

---

## Emergency Powers

Emergency powers are designed to execute **immediately** — no timelock delay — so the team can react to exploits within minutes.

| Power | Caller | Effect |
|-------|--------|--------|
| `IntelStaking.pause()` | Owner (can be 1-of-5 key) | Freezes all stake/unstake/claim operations |
| `IntelMintController.pauseMinting()` | Owner | Freezes all minting |
| `IntelToken.pause()` | Token owner | Freezes all ERC-20 transfers |
| `TimelockController.adminCancel(id)` | Admin | Cancels a malicious queued operation before it executes |

**Design note:** In Phase 2, the `pause()` capability is held by a 1-of-5 Gnosis key for speed. All other owner operations require 3-of-5. This separates the emergency response key from the governance key.

---

## Parameter Governance Table

All `setParams` calls and their timelock requirements:

| Contract | Function | Phase 1 | Phase 2 |
|----------|----------|---------|---------|
| IntelStaking | `setParams(epochLen, cooldown, K, maxStake)` | Deployer EOA (immediate) | Timelock 48h |
| IntelStaking | `setOperator(addr)` | Deployer EOA | Timelock 48h |
| IntelMintController | `setEpochMintCap(cap)` | Deployer EOA | Timelock 48h |
| IntelMintController | `setFloorPrice(price)` | Deployer EOA | Timelock 48h |
| IntelMintController | `setOperator(addr)` | Deployer EOA | Timelock 48h |
| IntelToken | `setMinter(addr)` | Deployer EOA | Timelock 48h |
| IntelToken | `pause() / unpause()` | Deployer EOA (immediate) | 1-of-5 key (immediate) |
| IntelStaking | `pause() / unpause()` | Deployer EOA (immediate) | 1-of-5 key (immediate) |
| IntelMintController | `pauseMinting() / unpauseMinting()` | Deployer EOA (immediate) | 1-of-5 key (immediate) |
| IntelPOLManager | `enablePhase2()` | Deployer EOA | Timelock 48h |
| IntelPOLManager | `deployToUniV3(...)` | Deployer EOA (Phase 2 flag required) | Timelock 48h |
| IntelVesting | `revoke()` | Treasury (before cliff) | Treasury (before cliff) |
| TimelockController | `setDelay(...)` | Self via execute | Self via execute |
| TimelockController | `setProposer(...)` | Self via execute | Self via execute |

---

## Decentralization Timeline

| Phase | When | Change | Key contracts affected |
|-------|------|--------|------------------------|
| Now | Deployed | Deployer EOA as bootstrap operator + admin. Timelock already deployed (48h). | All |
| Month 1 | After audits pass | Rotate operator to Gnosis Safe 2-of-3 | IntelStaking, IntelMintController, AgentIdentityRegistry |
| Month 3 | After 90d mainnet stability | Transfer ownership to TimelockController. Update proposer to Gnosis Safe 3-of-5. | IntelStaking, IntelMintController, IntelToken |
| Month 6 | After 6mo on-chain history | Enable Uniswap V3 TWAP oracle (Phase 2 flag) | IntelPOLManager |
| Month 12 | After POL reserve established | Enable `deployToUniV3` — full liquidity deployment | IntelPOLManager → Uniswap V3 INTEL/WETH |

---

## What INTEL Is NOT

- **Not a governance token.** INTEL does not carry votes. Governance is off-chain multisig.
- **Not inflationary by design.** Max supply is capped at 100M INTEL. The bonding curve and epoch caps enforce this.
- **Not custodial.** The protocol does not hold user funds outside of escrow contracts (`IdeaEscrow`, `AdvancedArcEscrow`). All other ETH flows (yield, POL, treasury) are contract-held but user-claimable.
- **Not a security (by intent).** INTEL is a work-coordination token: it gates minting throughput based on staking commitment. It does not represent equity, profit share, or a claim on protocol revenue.

---

## Audit Status

See `docs/CSO_SECURITY_REPORT.md` and `packages/intelligence-exchange-cannes-contracts/x-ray/` for the full contract audit findings. New contracts (IntelToken, IntelStaking, IntelMintController, IntelTimelockController, IntelVesting, IntelPOLManager) scored 99/99. Legacy escrow contracts (IdeaEscrow, AdvancedArcEscrow) have known settlement routing issues tracked in `.context/`.
