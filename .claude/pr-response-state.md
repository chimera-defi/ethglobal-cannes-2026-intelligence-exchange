# PR Response State
last_run: 2026-06-07T19:20

prs:
  - number: 52
    repo: chimera-defi/ethglobal-cannes-2026-intelligence-exchange
    last_activity: "2026-05-30T17:16:57Z"
    attempt_count: 0
    status: needs_human
    notes: >
      infra-hardening-regression CI fails: pnpm/action-setup@v4 pinned to
      version 10.33.0 in workflow but package.json has packageManager pnpm@11.0.8.
      mergeable_state: dirty (conflicts with main). Root fix is already on main
      (PRs #58+ pass). Recommend closing this stale maintenance PR.

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
      infra-hardening-regression CI fails: pnpm version mismatch (10.33.0 vs 11.0.8).
      mergeable_state: dirty. Nightly maintenance from 2026-05-30; stale.

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
      infra-hardening-regression CI fails: pnpm version mismatch (10.33.0 vs 11.0.8).
      mergeable_state: dirty. Dep-update PR from 2026-06-01; superseded by #58+
      which pass the same check. Recommend closing.

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
      New PR 2026-06-04. All CI green (commit-format + infra-hardening-regression
      both pass). mergeable_state: clean. 22 AMM tokenomics tests added.
      No CHANGES_REQUESTED. Awaiting human review/merge.

  - number: 63
    repo: chimera-defi/ethglobal-cannes-2026-intelligence-exchange
    last_activity: "2026-06-06T14:49:28Z"
    attempt_count: 0
    status: skipped
    notes: >
      docs(dream) consolidation PR. All CI passing (commit-format +
      infra-hardening-regression: success). No CHANGES_REQUESTED. Awaiting human merge.

  - number: 64
    repo: chimera-defi/ethglobal-cannes-2026-intelligence-exchange
    last_activity: "2026-06-07T19:17:19Z"
    attempt_count: 1
    status: fixed
    notes: >
      attribution CI FAILED (PR body missing **Agent:** and **Co-authored-by:** fields).
      Fixed by updating PR description via MCP tool. CI re-triggered and now green
      (attribution: success, commit-format: success, infra-hardening-regression: success).
      Awaiting human review/merge.
