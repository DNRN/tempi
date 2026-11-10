---
name: code-review
description: Use when code changes are ready to commit, when the user asks for a review or second opinion on a diff or branch, or when a git commit was denied by a review gate - fresh-eyes review of the diff producing severity-ranked findings before committing.
---

# Code review

Review is a separate act from writing. The author's context already believes the code is correct; a review run from the author's memory reviews nothing.

## When this applies

- Work is complete and about to be committed: **offer review first**. Never commit a non-trivial change unreviewed unless the user explicitly declines.
- The user asks for a review, sanity check, or second opinion on a diff, branch, or PR.
- A PreToolUse review gate denied a `git commit` as unreviewed.

Skip for whitespace/formatting-only diffs, lockfiles, and generated/vendored files.

## Procedure

How to review, what counts as a finding, severities, and the report format all live in [`references/rubric.md`](references/rubric.md), the single source shared with every reviewer subagent.

1. **Fix the scope.** From the target the user or gate named, or the default:
   - none / `staged` → `git diff --cached`
   - `worktree` (the gate's scope for `git commit -a`) → `git diff HEAD`
   - a branch → `git diff $(git merge-base <branch> <default-branch>)..HEAD` (default branch from `git remote show origin` or the repo's layout)
   - a ref range → `git diff <ref>..<ref>`
2. **Get fresh eyes.** If the harness can spawn subagents, delegate. Use the bundled `code-reviewer` agent where the harness loads this toolkit's agents; otherwise any read-only subagent. Pass exactly three things:
   - the diff command,
   - the repository path,
   - this skill's `references/rubric.md`, in a form the subagent can read (an absolute path, or a harness URI such as `skill://code-review/references/rubric.md`), with the instruction to review as the rubric describes.

   Never pass your reasoning about the change. Without subagents: apply the rubric yourself, re-reading every hunk from the diff and checking it against (not through) your intent.
3. **Report** the reviewer's findings table and verdict verbatim. After **approve**, offer to commit.
4. **Resolve** after **fix then commit**: fix blockers and majors, then re-review the hunks the fixes touched. The author applies fixes; the reviewer stays read-only.
5. **Unblock the commit.** If the commit gate denied the commit (a Claude Code hook denial, or a `git commit` that failed with `commit-gate:` on stderr), stamp the reviewed diff by running the stamp command named in that message (`commit-gate.sh --stamp-review`). Only the user can waive review: if they declined, commit with `--no-verify` instead. Never stamp a diff that was not reviewed.

## Gotchas

- The stamp records a diff hash, not permanent approval: any new staged change re-triggers the gate. That is by design.
- The gate is a nudge, not enforcement (`--no-verify` exists). Do not bypass it silently.
