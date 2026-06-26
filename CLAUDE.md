# Claude Code Instructions

> **Master rules:** `.cursorrules` | **Token efficiency:** `skills/token-reduce/SKILL.md`

## Quick Start

1. Read `.cursorrules`.
2. Use `./skills/token-reduce/scripts/token-reduce-paths.sh topic words` before broad repo exploration.
3. Keep the read set narrow.
4. Verify outputs before finishing.

## Required Attribution

### PR description

```markdown
**Agent:** <MODEL NAME>
**Co-authored-by:** Chimera <chimera_defi@protonmail.com>

## Summary
[What changed]

## Original Request
> [User prompt]

## Changes Made
- [List]
```

### Commit title

```text
feat(scope): summary [Agent: <MODEL NAME>]
```

### Commit trailer

```text
Co-authored-by: Chimera <chimera_defi@protonmail.com>
```

## Multi-Pass Review Rule

Before opening or updating a PR:
- pass 1: correctness and internal consistency
- pass 2: acceptance tests, edge cases, and deployment realism
- pass 3: remove filler, sponsor theater, and unsupported claims

## Token Reduction

- Use repo-local `skills/token-reduce/`.
- Prefer QMD or scoped `rg` over broad scans.
- Do not narrate tool usage in detail.

## Design System

Always read `DESIGN.md` before making any visual or UI decisions.
All font choices, colors, spacing, border-radius, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match `DESIGN.md`.

Key rules from DESIGN.md:
- Background `#070D1A`, surface `#0D1625`, primary `#3B82F6`, amber `#F59E0B` for human-review states
- Display font: Departure Mono. Body: Plus Jakarta Sans. Data/code: JetBrains Mono.
- All cards have `border border-border` (1px). No borderless floating cards.
- `rounded-sm` (4px) for inputs/badges, `rounded-md` (8px) for cards.
- Status-driven 2px left border on job cards is a semantic indicator, not decoration.
- No purple gradients, no 3-col icon grids, no centered section headers in app pages.

## Working Style

- Build the smallest honest slice first.
- Keep demo claims narrower than internal ambitions.
- Preserve spec consistency across README, PRD, SPEC, tasks, tests, and deployment docs.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Smart contract audit → use x-ray methodology (skills/x-ray/README.md); reports go to packages/intelligence-exchange-cannes-contracts/x-ray/
- Infrastructure/secrets/OWASP audit → invoke /cso (skills/cso/ → gstack CSO skill)

<!-- kimi-delegate-claude:begin -->
## Kimi Delegation (enforced)

NEVER write `pi --provider kimi-coding`. Always use `kimi-delegate --task "..."` instead.
(`kd` alias is not reliably on PATH — use `kimi-delegate` as the canonical form.)

Wrong: `pi --provider kimi-coding "summarize this"`
Right: `kimi-delegate --task "summarize this"`

The wrapper handles auth, timeouts, fallback, and telemetry automatically.
<!-- kimi-delegate-claude:end -->

<!-- devin-delegate:begin -->
## Devin Delegation (enforced)

All Devin subagent calls MUST route through `devin-delegate`. Direct `devin -p` or `devin --print` calls bypass telemetry, fallback routing, and workspace context injection.

**NEVER** call `devin` directly. **ALWAYS** use:
```bash
devin-delegate --task "..." --workspace /home/agents/workspace/ethglobal-cannes-2026-intelligence-exchange
```

Skill installed at: `skills/devin-delegate/`
Config: `.devin-delegate.json`

Task classes: `research`, `implement`, `debug`, `review`, `browser`
Fallback chain: Devin → Codex → Kimi → Claude
<!-- devin-delegate:end -->

## Meta Learnings

- `.claude/` is listed in `.gitignore` but operational state files are tracked anyway via `git add -f` — consistent with existing `.claude/pr-response-state.md` already committed in the repo.
- `intel/amm.ts` (constant-product AMM) is a core financial primitive with no external deps — good candidate for unit tests; `bun test` runs without network/DB.
- Broker acceptance tests (`src/__tests__/acceptance/`) require a live PostgreSQL connection — always fail in sandbox CI; skip until infra is available.
- Worker `bun test` fails with "Cannot find package 'viem'" when run from the package directory directly — run from workspace root with `pnpm test` instead.
- Maintenance PRs on `chore/maintenance-*` branches return 0 CI check_runs — attribution/commit-format CI does not fire on these branch names; no action needed.
- `pnpm install --no-frozen-lockfile` is required when bumping deps (frozen lockfile rejects updated ranges); commit both `package.json` files and `pnpm-lock.yaml`.
- Monday deps skip list (as of 2026-06-08): typescript 5→6, zod 3→4 — both are major and require explicit migration planning.
