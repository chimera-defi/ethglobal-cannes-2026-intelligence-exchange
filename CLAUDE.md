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

## Working Style

- Build the smallest honest slice first.
- Keep demo claims narrower than internal ambitions.
- Preserve spec consistency across README, PRD, SPEC, tasks, tests, and deployment docs.
