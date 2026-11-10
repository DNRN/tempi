# Doc audit rubric

The single source for what correct documentation looks like and how an audit reports drift. It is used by whoever does the audit: an auditor subagent in any harness, or the author auditing alone when no subagent is available. The author also writes and updates docs to the standards below.

## Stance

- Compare documentation against code reality. Your only loyalty is to what is true: docs that pass must be trustworthy to a reader six months from now.
- Run the diff command yourself; read every candidate doc and the code it describes, including code the diff touches that a doc references indirectly.
- Read-only: propose replacements, never edit. The author applies them.

## Input

- A diff command (e.g. `git diff --cached`), the repository path, and a list of candidate doc files.
- What counts as docs: the paths in `.commit-gate-docs` at the repository root when present, otherwise the project's markdown docs.

## Documentation standards

- **Audience**: docs are for humans: what it does, how to use it, how it fits together. Not a line-by-line restatement of the code.
- **Surgical**: stale passages are corrected in place; files are never regenerated wholesale. Docs for removed features are deleted. New user-visible features get docs in the project's existing voice and structure.
- **Diagrams**: a feature with flow, sequence, state, or dependency structure gets exactly one mermaid diagram, drawn from the actual code paths and simple enough to verify by reading. Updated when the structure changes, deleted when it collapses. No decorative diagrams, no second diagram of the same concept.
- **ADR correlation**: a doc making an architectural claim links the governing ADR (`docs/adr/` or the project's ADR home). A superseded design is never described as current; the doc links the superseding ADR. Prose never contradicts an Accepted ADR.

## What to check

For each candidate doc, check every claim against the code:

1. **Factual drift**: names, flags, commands, endpoints, defaults, paths, return shapes. Do they still exist and behave as written?
2. **Stale diagrams**: does each mermaid diagram still match the actual code paths, states, and dependencies? A diagram showing a removed step is a finding.
3. **ADR correlation**: per the standard above.
4. **Missing docs**: user-visible changes in the diff (new flags, endpoints, flows, behavior changes) with no doc coverage anywhere.
5. **Scope**: docs describing features the diff deleted or replaced.
6. **Audience**: prose that restates code instead of explaining use and structure (minor).

## What counts as a finding

- Verified: cite `doc:line` and the contradicting `file:line` from source, quoting both.
- Each finding carries an exact proposed replacement (passage or mermaid block, ready to paste). A finding without one is incomplete.
- Fix truth, not taste: keep the project's voice; no style rewrites.

## Severity

- `blocker`: the doc tells a reader something false (renamed flag, removed endpoint, superseded design presented as current).
- `major`: user-visible change undocumented; diagram shows old structure; ADR link missing or wrong.
- `minor`: wording that misleads slightly; audience problems.

## Report

| Severity | Location | Finding | Proposed fix |
| --- | --- | --- | --- |

Verdict: **docs in sync** or **update then commit** (repeat the blockers as a checklist).

An auditor subagent ends with `Verification: read-only, no files modified`.
