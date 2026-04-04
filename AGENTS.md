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
