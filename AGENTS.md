# Agent Rules

> **Master rules:** `.cursorrules` | **Token efficiency:** `skills/token-reduce/SKILL.md`

## First Move For Discovery

- If file location is unknown, start with `./skills/token-reduce/scripts/token-reduce-paths.sh topic words`.
- If the path is already known, prefer scoped `rg -g` before reading.
- Do not start with `find .`, `ls -R`, `grep -R`, `tree`, or `rg --files .`.

## Token Reduction Defaults

- Keep responses concise.
- Prefer targeted reads over full-file reads.
- Escalate to sub-agents or parallel exploration when the candidate set exceeds 5 files.
- Treat broad scans as a violation, not a convenience.

## PR Discipline

- One task = one PR.
- Never push directly to `main`.
- When a task is complete and the user has not opted out, create the branch, commit, push, and open a PR instead of leaving work on `main`.
- PRs and commits require explicit agent attribution plus human co-author attribution.
- Keep all related commits on the same branch for the request.
- When a scoped coding task is complete and the user has not opted out, create the task branch, stage only the in-scope files, push, and open a draft PR automatically.

## Review Discipline

- Use multi-pass review before declaring work done:
  - pass 1: correctness and contract fit
  - pass 2: consistency across docs / specs / tests
  - pass 3: demo honesty, edge cases, and “AI slop” removal

## No AI Slop

- No decorative sponsor integrations.
- No vague “future agent magic” language.
- No inflated marketplace or autonomy claims.
- Keep every claim tied to an artifact, test, contract, or visible demo behavior.

<!-- SHARED_ATTRIBUTION_RULES_START -->
## Shared Attribution & Meta Learnings

- Commit author should be the active agent model identity.
- Commit trailer must include: `Co-authored-by: Chimera <chimera_defi@protonmail.com>`.
- PR description must include:
  - `**Agent:** <actual model name>`
  - `**Co-authored-by:** Chimera <chimera_defi@protonmail.com>`
- Never use placeholder model names; record the actual model used.
- Never push directly to `main`/`master`; use a feature branch and PR.
- Keep one task per PR for clear review and rollback.
- Verify before claiming complete: run relevant tests/lint/checks or explicitly note what was not run.
<!-- SHARED_ATTRIBUTION_RULES_END -->

<!-- kimi-delegate:begin -->
## Kimi Delegate Routing — MANDATORY

All Kimi subagent calls MUST route through the skill wrapper. Direct `pi --provider kimi-coding` calls are **prohibited** — they bypass telemetry, fallback, auth detection, and timeout scaling.

- **One-liner:** `kimi-delegate --task "..."`
- **Interactive:** `kimi-delegate --interactive`
- **Long path (fallback):** `./skills/kimi-delegate/scripts/delegate.py --task "..."`

**Why this matters:**
- Structured envelopes prevent vague handoffs
- Auto-scaling timeouts prevent hangs on large repos
- Auth error detection gives explicit resume steps instead of silent failures
- Codex fallback ensures tasks always complete
- Telemetry enables continuous improvement

**Bypassing the wrapper will be detected and reported.**

- Always produce an envelope first with `./skills/kimi-delegate/scripts/plan_prompt.py --task "..."`.
- Keep delegation scoped and include acceptance criteria.
- If Kimi fails, keep fallback enabled and inspect telemetry (`./skills/kimi-delegate/scripts/kimi_delegate_telemetry.py summary --days 14`).
<!-- kimi-delegate:end -->

<!-- devin-delegate:begin -->
## Devin Delegate Routing — MANDATORY

All Devin calls MUST route through the skill wrapper. Direct `devin --print` and `devin --task` calls are **prohibited** — they bypass envelope checks, fallback routing, clarification handling, and telemetry.

- **One-liner:** `devin-delegate --task "..."`
- **Interactive:** `devin-delegate --interactive`
- **Long path (fallback):** `./skills/devin-delegate/scripts/delegate.py --task "..."`

**Why this matters:**
- Structured envelopes prevent vague handoffs
- Codex then Claude guidance resolves many clarification loops before human escalation
- Provider fallback keeps execution moving when Devin fails
- Telemetry enables continuous improvement

**Bypassing the wrapper will be detected and reported.**

- Always produce an envelope first with `./skills/devin-delegate/scripts/plan_prompt.py --task "..."`.
- Keep delegation scoped and include acceptance criteria.
- If Devin asks for clarification, use Codex guidance first and Claude second before asking a human.
- Inspect telemetry regularly (`./skills/devin-delegate/scripts/devin_delegate_telemetry.py summary --days 14`).
<!-- devin-delegate:end -->
