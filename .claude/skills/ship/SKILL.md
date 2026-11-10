---
name: ship
description: Use only when the user explicitly asks to ship ("ship it", "ship this", /ship) - review the diff with fresh eyes, bring the docs in line, write the commit message, and commit, so the commit gate passes. Not for a plain "commit this", and never on your own initiative.
metadata:
  opencode/slash: "true"
  opencode/autoinvoke: "false"
---

# Ship

One explicit flow from finished change to commit: code review, documentation check, commit message, commit. It reuses the `code-review` and `doc-sync` skills and leaves the stamps the commit gate looks for, so the commit goes through without a denial.

Asking to ship is the go-ahead to commit. Stop and ask only where a step below says so.

## Procedure

1. **Fix the scope.** Staged changes by default (`git diff --cached`). If nothing is staged and the user said to ship everything, or the worktree: the worktree (`git diff HEAD`), committed with `git commit -a`. If nothing is staged and the user named no scope, show `git status --short` and ask what to include. Untracked files are never added unless the user names them. Nothing to commit: say so and stop.
2. **Review.** Run the `code-review` skill on the scope (`staged` or `worktree`), fresh eyes as it describes.
   - **approve**: continue.
   - **fix then commit**: stop. Report the findings and ask: fix them, or ship as is. Fixing: fix blockers and majors, stage the fixes, re-review the touched hunks, continue. Shipping as is: the user has waived review; never stamp the review.
3. **Docs.** Run the `doc-sync` skill on the same scope. Stage the doc edits it makes: they ship in the same commit, and doc-only edits after a review keep the review valid. If it finds a doc change it can't make without a decision from the user, stop and ask.
4. **Commit message.** Follow the project's style (`git log --oneline -15`). Subject in the imperative, under 72 characters; a body when the why isn't obvious from the subject. When the change implements an ADR, name it (`ADR 0014`). Add the trailers the harness or project requires.
5. **Commit** with that message (`git commit -a` for the worktree scope). If the commit gate denies it, run the stamp commands its message names for the checks this flow completed - review after **approve** or after re-reviewing fixes, docs after `doc-sync` ran - and commit again. A check the user waived, or one this flow didn't complete, is never stamped: ask whether to commit with `--no-verify`. An Accepted-ADR denial has no stamp: report it and ask.
6. **Report** in a few lines: the commit (`git log -1 --oneline`), the review verdict, and the docs changed. Don't push.

## Gotchas

- Don't run the flow for a plain "commit this": that is a commit, with the gate's questions if it asks.
- Never pass `--no-verify` unless the user chose to skip a check in this flow.
- Stamps record a diff hash. A code change staged after stamping (a late fix) needs both checks again; doc-only edits keep both stamps valid.
