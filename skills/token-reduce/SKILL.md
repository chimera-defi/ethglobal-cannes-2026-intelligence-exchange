---
name: token-reduce
license: MIT
description: |
  Reduce total token usage across AI coding tasks by keeping discovery, reading, and follow-up context minimal.
  Use when file location is uncertain, the repo is large, or the user asks to explore, review, gather context, or work across multiple files.
  rg is the real search path; QMD is a bonus if pre-indexed. Skip for small edits with an exact file path.
metadata:
  author: "GPT-5 Codex"
  category: "productivity"
  version: "5.2.0"
  argument_hint: "[file-or-directory]"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Token Reduction Skill

## Description

Use targeted retrieval and short summaries for `$ARGUMENTS`.

## Triggers

- The user asks to review, explore, search for context, or find where something lives.
- The user asks to validate, check, verify, improve, fix, or update a skill, hook, script, or file.
- The user's request implies the skill is not being used correctly or needs to work better.
- You do not know the exact file path yet.
- The task spans several files or areas of the repo.
- Broad scans or full-file reads would likely waste context.
- When maintaining this skill itself, the same narrow-discovery rules apply.
- **Run token-reduce BEFORE delegating to devin-delegate** — scope the relevant files first, then hand the path list to Devin. Token-reduce and Devin complement each other; they are not alternatives.

## Skip

- The exact file path is already given and the task is a small local edit.
- A one-command operational check is enough.
- A direct targeted read is clearly cheaper than search.

## First Move

- If file location is unknown, start with one standalone discovery command from **repo root**:
  - `cd $(git rev-parse --show-toplevel) && ./skills/token-reduce/scripts/token-reduce-paths.sh "topic words"`
  - `cd $(git rev-parse --show-toplevel) && ./skills/token-reduce/scripts/token-reduce-snippet.sh "topic words"`
- If the exact symbol is already known and `token-savior` is installed, you may use:
  - `uv run python scripts/token-reduce-structural.py --project-root . find-symbol ExactSymbol`
  - `uv run python scripts/token-reduce-structural.py --project-root . change-impact ExactSymbol`
- Prefer `scripts/token-reduce-paths.sh` for the initial path-only kickoff.
- Prefer the structural helper only for exact symbol or dependency questions; do not use it as the default for vague repo discovery.
- Use `scripts/token-reduce-snippet.sh` only when the path list is not enough.
- Do not treat raw `qmd search` or raw `rg` as the first compliant move when the helper is available; those belong inside the helper workflow or as a narrow follow-up after helper output.
- Do not chain discovery commands with `||`, `&&`, `find`, `ls`, or extra fallback shell logic.
- Do not treat `rg --files .` as compliant discovery.
- Do not start with `find .`, `ls -R`, `grep -R`, or broad `Glob` patterns such as `**/*`.
- After two failed discovery attempts or once the candidate set exceeds 5 files, stop expanding and ask the user to narrow the scope.

## Heuristics

| Strategy | Measured Savings | When |
|----------|-----------------|------|
| Concise responses | 89% | Always |
| Scoped `rg` search | ~80% vs naive reads | Finding which files to read |
| Targeted reads | 33% | Large files |
| Parallel calls | 20% | Independent lookups |

## Process

1. Always run from repo root: `cd $(git rev-parse --show-toplevel)` before calling any helper script.
2. Run `./skills/token-reduce/scripts/token-reduce-paths.sh "topic words"` to get the candidate file list.
3. If you know the file or keyword, use a scoped grep first, then read only the needed lines.
4. If you need one ranked excerpt after the kickoff, use `scripts/token-reduce-snippet.sh topic words`.
5. If a file is large, read only the relevant section.
6. If the search space stays broad, stop expanding and ask the user to narrow it.

## Delegation Handoff

After using token-reduce to scope the relevant files, pass the path list to `devin-delegate` for implementation tasks > 100 lines. Token-reduce scopes; Devin implements. They complement each other.

```bash
# Scope first
cd $(git rev-parse --show-toplevel) && ./skills/token-reduce/scripts/token-reduce-paths.sh "feature area"

# Then delegate with the scoped context
devin-delegate --task "Implement X. Relevant files: <paths from above>" \
  --workspace /home/agents/workspace/ethglobal-cannes-2026-intelligence-exchange
```

## Success Criteria

- Discovery starts with the helper script from repo root, not recursive shell scans.
- `rg` is the real search fallback; QMD is a bonus if the collection is already indexed.
- `rg --files .` and similar broad inventory commands are treated as violations.
- Reads stay targeted.
- Final summaries cite only the minimum files needed.
- Repo-level instructions and hooks point at the same first-move workflow.

## QMD

QMD is often not indexed — the helper falls through to rg automatically. Do not attempt to install or index QMD mid-session; it adds tokens without benefit unless the collection is pre-built.

If QMD is pre-indexed, it can be used as:

```bash
qmd search "topic" -n 5 --files
qmd search "topic" -n 5
qmd get filename.md -l 50 --from 100
```

Skip `qmd embed`, `qmd vsearch`, and `qmd query` for this workflow.

## Anti-Patterns

- Restating requests
- Narrating tool usage
- Starting exploration with `find .`, `ls -R`, `grep -R`, or broad `Glob` patterns
- Reading entire large files
- Re-reading the same file in one session unless it changed
- Per-file commentary instead of a single summary
- Calling `./skills/token-reduce/scripts/token-reduce-paths.sh` from a subdirectory instead of repo root — the script requires repo root to resolve relative paths correctly
- Using token-reduce as a substitute for delegation — it scopes, not implements; for tasks >100 lines use devin-delegate after scoping

## Usage

```
/token-reduce src/app.tsx
/token-reduce wallets/frontend
/token-reduce
```

---
Read `references/token-reduction-guide.md` for benchmark notes and integration details.
Read `references/companion-tools.md` for how to evaluate future companion backends.
