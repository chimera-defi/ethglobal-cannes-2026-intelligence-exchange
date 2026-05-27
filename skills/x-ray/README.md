# X-Ray Smart Contract Audit Skill

Methodology adapted from SharedStake-ui PR #378 / SharedDeposit x-ray.md.

## Passes
1. **Enumerate** — SLOC, function inventory, toolchain detection
2. **Entry points** — permissionless vs role-gated, access control map
3. **Invariants** — what must always hold (BPS sums, balance tracking, state machines)
4. **Git security** — commit patterns, force pushes, suspicious authorship
5. **Static analysis** — forge build warnings, slither if available
6. **Manual audit** — CEI pattern, unchecked returns, overflow, oracle, flash loan, front-run

## Reports
- `packages/intelligence-exchange-cannes-contracts/x-ray/pass1-intel-contracts.md` (done)
- `packages/intelligence-exchange-cannes-contracts/x-ray/pass2-adversarial.md` (in progress)
- `packages/intelligence-exchange-cannes-contracts/x-ray/pass2-tokenomics-math.md` (in progress)

## Run
Invoke as agent prompt referencing this methodology + the contracts dir.
See CLAUDE.md skill routing: smart contract audit → x-ray methodology.
