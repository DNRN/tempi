---
name: doc-sync
description: Use when code changes are about to be committed and documentation may need updating, when the user asks to write or update docs, or when a git commit was denied by the documentation check - keeps human-readable markdown docs and their mermaid diagrams accurate, current, and correlated with ADRs.
---

# Doc sync

Documentation rots silently: the flag gets renamed, the doc keeps the old name, tests stay green. Every commit must leave documentation correct — updated, not appended. Stale docs are worse than no docs; readers trust them.

## When this applies

- Code changes are complete and about to be committed: **offer a doc check first** when the commit changes code without touching any doc.
- The user asks to write, update, or check documentation.
- A PreToolUse commit gate denied the commit with "documentation" pending.

Skip for changes with no observable surface: internal refactors with identical behavior, test-only changes, formatting.

## Procedure

The documentation standards (audience, surgical edits, diagrams, ADR correlation), the audit checklist, severities, and the report format live in [`references/rubric.md`](references/rubric.md), the single source shared with every auditor subagent.

1. **Fix the scope and summarize the change for a human.** Scope from the target the user or gate named: none / `staged` → `git diff --cached`; `worktree` → `git diff HEAD`; a branch → `git diff $(git merge-base <branch> <default-branch>)..HEAD`; a ref range → `git diff <ref>..<ref>`. From that diff, state what now behaves differently: renamed flags/commands/endpoints, new or removed features, changed defaults, new flows. No observable change → no doc change; say so.
2. **Find affected docs.** Docs live where the project keeps them (`docs/`, `doc/`, `README*.md`, root `*.md`): follow the existing convention, never create a second one. A `.commit-gate-docs` file at the repo root, when present, lists the paths that count as docs (one git pathspec per line). Candidates:
   - Docs referencing changed files, paths, commands, flags, or symbols (grep the docs tree).
   - Docs describing the changed feature, even without naming it.
   - `README.md` claims about setup, usage, structure.
3. **Get fresh eyes.** Whenever the harness can spawn subagents, delegate, even for a small diff: the author already believes the docs are fine. Use the bundled `doc-auditor` agent where the harness loads this toolkit's agents; otherwise any read-only subagent. Pass exactly four things:
   - the diff command,
   - the repository path,
   - the candidate doc list,
   - this skill's `references/rubric.md`, in a form the subagent can read (an absolute path, or a harness URI such as `skill://doc-sync/references/rubric.md`), with the instruction to audit as the rubric describes.

   Never pass your reasoning. Only without subagents: audit each candidate yourself against the rubric, claim by claim.
4. **Apply** the accepted proposals, and write any new docs, to the rubric's standards. If the project has no docs yet, start `docs/` with a short index that links the README.
5. **Check ADRs.** The change implements or contradicts an Accepted ADR → surface it; a genuine direction change goes through the adr-planning skill first, then the docs. A new architectural decision appeared while writing docs → stop, run the adr-planning skill, then continue.
6. **Report** per doc: updated / created / deleted / unchanged (and why), then offer to commit. doc-sync's output is applied documentation, not just findings.
7. **Unblock the commit.** If the commit gate denied with "documentation" pending (a Claude Code hook denial, or a `git commit` that failed with `commit-gate:` on stderr), stamp with the command from that message (`commit-gate.sh --stamp-docs`). Only the user can waive the check: if they declined, commit with `--no-verify`. Never stamp a code diff whose docs were not actually checked.

## Gotchas

- A commit that already edits docs passes the docs gate by design; the gate detects forgetting, the audit detects inaccuracy.
- What counts as docs: `*.md` by default; a repo where markdown is also code (skills, prompts) lists its real docs paths in `.commit-gate-docs`. Don't edit that file to make a pending check go away.
- Never touch docs unrelated to the change; never reorganize the docs tree while syncing.
- One pass, one report: don't leave half-updated docs because the diff was large; split by doc instead.
