# Security Learnings from Competitors

**Date:** 2026-05-29
**Context:** Intelligence Exchange security analysis based on competitor exploit history

## Competitor Exploit Classes

**Bittensor:** Supply chain attacks via malicious PyPI packages ($28M stolen 2024), governance centralization (founder controls 38/41 upgrades), validator griefing where low-stake validators can destroy subnets via weight manipulation.

**Gensyn:** DHT poisoning crashes compute nodes, "laziness attacks" (under-delivering compute), backdoor injection in pipeline parallelism, verification bypass via non-deterministic ML outputs.

**Olas:** Service registry manipulation (malicious StakingToken instances DoS deposits), signature binding failures break EIP-712 flows, owner-controlled registry pointers enable reward theft.

**Pearl/PRL:** Founder exploited transferDirector trapdoor to mint 3-4M tokens, price collapsed 63% in 8 hours, single point of failure with directorship control.

## Patterns to Adopt

**From Bittensor:** Yuma Consensus validator scoring prevents Sybil attacks—adapt to ReviewerQueue by requiring stake-weighted reviewer selection and penalizing deviation from consensus acceptance rates.

**From Gensyn:** Staking with slashing for correctness verification—implement reviewer bond slashing for fraudulent accepts/rejects. TWAP-protected price oracles prevent manipulation in AIU index.

**From Pearl:** No patterns—their trapdoor mechanism is exactly what we must avoid. Our multi-sig controlled mint with timelocks prevents single-point mint exploits.

## Economic Attacks Specific to Our Model

**Reviewer collusion:** Worker and reviewer are same person using separate identities. Mitigation: fingerprint reviewer/worker pairs via on-chain behavior analysis, require minimum stake for both roles, implement cooldown periods between job submission and review eligibility.

**Score inflation:** Worker submits garbage, pays reviewer to accept. Mitigation: stake-based reviewer bonds slashed on disputed jobs, reputation decay for accepting low-quality work, quadratic voting on disputes.

**Epoch reward gaming:** Submit many small jobs at epoch end to win EpochRewardDistributor. Mitigation: cap job count per wallet per epoch, implement moving average reward calculation, require minimum job complexity threshold.

**INTEL price depression before large self-mint:** Attacker shorts INTEL, depresses price, self-mints cheap. Mitigation: TWAP-protected mint price (7-day minimum), mint cooldown after large price movements, circuit breakers on rapid mint volume.

## Recommended Mitigations

1. **Multi-sig mint control with timelocks** (prevents Pearl-style trapdoor exploits)
2. **Stake-weighted reviewer selection** (prevents Bittensor-style Sybil attacks)  
3. **Reviewer bond slashing** (adapted from Gensyn's slashing mechanism)
4. **TWAP-protected price oracles** (prevents manipulation attacks)
5. **Fingerprinting for identity collision detection** (prevents reviewer/worker collusion)
6. **Epoch job caps and complexity thresholds** (prevents reward gaming)
7. **Circuit breakers on rapid mint volume** (prevents price manipulation)