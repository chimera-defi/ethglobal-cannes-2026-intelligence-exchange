# PR Response State
last_run: 2026-06-13T15:16

prs:
  - number: 52
    repo: chimera-defi/ethglobal-cannes-2026-intelligence-exchange
    last_activity: "2026-05-30T17:16:57Z"
    attempt_count: 0
    status: needs_human
    notes: >
      infra-hardening-regression CI fails: pnpm version mismatch.
      mergeable_state: dirty. Root fix already on main. Recommend closing.

  - number: 53
    repo: chimera-defi/ethglobal-cannes-2026-intelligence-exchange
    last_activity: "2026-05-30T17:19:43Z"
    attempt_count: 0
    status: needs_human
    notes: >
      infra-hardening-regression CI fails: same pnpm version mismatch as #52.
      mergeable_state: dirty. Recommend closing; superseded by newer maintenance PRs.

  - number: 55
    repo: chimera-defi/ethglobal-cannes-2026-intelligence-exchange
    last_activity: "2026-05-30T18:46:33Z"
    attempt_count: 0
    status: needs_human
    notes: >
      infra-hardening-regression CI fails: pnpm version mismatch.
      mergeable_state: dirty. Stale.

  - number: 56
    repo: chimera-defi/ethglobal-cannes-2026-intelligence-exchange
    last_activity: "2026-06-01T06:11:03Z"
    attempt_count: 0
    status: skipped
    notes: All CI green. No CHANGES_REQUESTED. Awaiting human review/merge.

  - number: 57
    repo: chimera-defi/ethglobal-cannes-2026-intelligence-exchange
    last_activity: "2026-06-01T00:19:31Z"
    attempt_count: 0
    status: needs_human
    notes: >
      infra-hardening-regression CI fails: pnpm version mismatch. Superseded.

  - number: 58
    repo: chimera-defi/ethglobal-cannes-2026-intelligence-exchange
    last_activity: "2026-06-01T18:11:04Z"
    attempt_count: 0
    status: skipped
    notes: All CI green. No CHANGES_REQUESTED. Awaiting human review/merge.

  - number: 59
    repo: chimera-defi/ethglobal-cannes-2026-intelligence-exchange
    last_activity: "2026-06-01T18:22:41Z"
    attempt_count: 0
    status: skipped
    notes: All CI green. No CHANGES_REQUESTED. Awaiting human review/merge.

  - number: 60
    repo: chimera-defi/ethglobal-cannes-2026-intelligence-exchange
    last_activity: "2026-06-02T00:09:26Z"
    attempt_count: 0
    status: skipped
    notes: All CI green. No CHANGES_REQUESTED. Awaiting human review/merge.

  - number: 61
    repo: chimera-defi/ethglobal-cannes-2026-intelligence-exchange
    last_activity: "2026-06-03T00:13:42Z"
    attempt_count: 0
    status: skipped
    notes: All CI green. No CHANGES_REQUESTED. Awaiting human review/merge.

  - number: 62
    repo: chimera-defi/ethglobal-cannes-2026-intelligence-exchange
    last_activity: "2026-06-04T04:04:30Z"
    attempt_count: 0
    status: skipped
    notes: >
      New PR 2026-06-04. All CI green. 22 AMM tokenomics tests added.
      No CHANGES_REQUESTED. Awaiting human review/merge.

  - number: 64
    repo: chimera-defi/ethglobal-cannes-2026-intelligence-exchange
    last_activity: "2026-06-07T19:19:44Z"
    attempt_count: 0
    status: skipped
    notes: >
      chore(skills): migrate token-reduce vendored plugin to symlink.
      CI green. No CHANGES_REQUESTED. Awaiting human review/merge.

  - number: 66
    repo: chimera-defi/ethglobal-cannes-2026-intelligence-exchange
    last_activity: "2026-06-09T07:24:17Z"
    attempt_count: 0
    status: skipped
    notes: >
      chore(maintenance): 2026-06-09 - TS cleanup pass. CI green.
      No CHANGES_REQUESTED. Awaiting human review/merge.

  - number: 67
    repo: chimera-defi/ethglobal-cannes-2026-intelligence-exchange
    last_activity: "2026-06-10T00:08:19Z"
    attempt_count: 0
    status: skipped
    notes: >
      chore(maintenance): 2026-06-10 - security pass. CI green.
      No CHANGES_REQUESTED. Awaiting human review/merge.

  - number: 68
    repo: chimera-defi/ethglobal-cannes-2026-intelligence-exchange
    last_activity: "2026-06-12T04:27:04Z"
    attempt_count: 0
    status: skipped
    notes: >
      chore(maintenance): 2026-06-12 - dead code pass. CI green
      (commit-format: success, infra-hardening-regression: success).
      No CHANGES_REQUESTED. Awaiting human review/merge.

# Cross-repo blocked fix (persistent):
# SharedStake/SharedStake-ui PR #380:
#   CI FAILURE: bun audit --level moderate
#   - joi < 17.13.4 (moderate) via @web3-onboard/common
#   - esbuild >= 0.17.0 < 0.28.1 (high) via vite/@web3-onboard/core
#   Push blocked: 403, no write access to SharedStake org.
#   Manual fix needed: add joi/esbuild overrides in package.json.
#
# chimera-defi/Etc-mono-repo: push to main requires PR (branch protection).
# sharedstake-ui state file: push blocked (403).
