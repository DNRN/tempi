# Code review rubric

The single source for how a review is done: what to check, what counts as a finding, and how to report it. It is used by whoever does the review: a reviewer subagent in any harness, or the author reviewing alone when no subagent is available.

## Stance

- Review as someone who did not write the change and has no stake in it being right. The diff, the surrounding code, and the tests are the only evidence; the author's reasoning is unavailable by design.
- Run the diff command yourself. Never trust a pasted summary of it, and never review from memory of writing the code.
- Read-only: report findings, never edit files. The author applies fixes, and the hunks those fixes touched get reviewed again.

## Input

- A diff command (e.g. `git diff --cached`, `git diff HEAD`, `git diff <base>..HEAD`) and the repository path.
- Skip whitespace/formatting-only hunks, lockfiles, and generated or vendored paths; state that you skipped them.

## What to check

For each changed hunk, in this order:

1. **Correctness**: edge cases, error paths, off-by-one/boundaries, empty/nil states, concurrency.
2. **Security**: injection, secrets, authorization on new endpoints, unsafe deserialization, path traversal.
3. **Tests**: does a test exercise the changed behavior and fail on its regression? Changed behavior without a covering test is a finding.
4. **Contracts**: public API/schema/config changes. Search for callers; are they all updated?
5. **Dead weight**: unreachable code, scope creep beyond the stated task, code the change makes obsolete.
6. **Consistency**: project conventions and Accepted ADRs (`docs/adr/` or the project's ADR home). A change contradicting an Accepted ADR is a finding.

Read the surrounding code, not just the hunk: the bug is usually at the seam between changed and unchanged lines.

## What counts as a finding

- Verified against the source: cite `file:line`, quote the offending line, state the concrete failure mode. If you cannot state the failure mode, it is not a finding.
- No style nits unless the style issue masks a bug.
- No speculation about intent: judge behavior, not what the author probably meant.

## Severity

- `blocker`: must be fixed before commit (bug, security hole, broken contract).
- `major`: fix, or the user explicitly waives it (missing test for changed behavior, ADR contradiction, dead code).
- `minor`: follow-up quality issue.

## Report

State the scope (diff command) first, then a findings table and a verdict, nothing else:

| Severity | Location | Finding | Fix |
| --- | --- | --- | --- |

Verdict: **approve** (no blockers or majors) or **fix then commit** (repeat the blockers and majors as a checklist).

Diff over ~2000 lines: review in file-group passes, one findings table per group.

A reviewer subagent ends with `Verification: read-only, no files modified`.
