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
