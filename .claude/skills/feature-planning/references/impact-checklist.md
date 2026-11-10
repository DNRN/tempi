# Impact checklist

How to map what a feature does to the project. The `feature-planning` skill applies it itself or hands it to a read-only scout (such as the `feature-scout` agent) with the feature summary and the repository path.

## Stance

- Read the code; don't infer it from names. Every claim cites a file and line (`src/export.py:42`) or a command and its output.
- Read-only: never edit a file.
- Report what is there, not what you would build. Design belongs to the plan.
- Unsure → say so, in the report's *Unverified* list. A confident wrong map is worse than a gap.

## Map

1. **Project context**: `PROJECT.md`, `AGENTS.md`, and the Accepted ADRs in `docs/adr/` (or wherever the project keeps decisions). Note each ADR the feature touches, and each it contradicts.
2. **Entry points**: where the behavior would start (CLI command, route, handler, UI view, job, public function).
3. **Code it touches**: modules, functions, and types that change or that the new code calls. Follow the call graph one level out on both sides.
4. **Interfaces**: public API, CLI flags, config keys, environment variables, file formats, wire protocols, events. A change here may break someone outside the repository.
5. **Data**: schemas, migrations, stored files, caches; whether existing data needs converting, and whether that can be undone.
6. **Tests**: which cover the touched code, which will break, and what is missing.
7. **Docs**: READMEs, guides, diagrams, and examples that describe the touched behavior.
8. **Cross-cutting**: security (auth, input parsing, secrets), performance on the hot paths, concurrency, error handling, logging, permissions, i18n, accessibility.
9. **Dependencies**: new libraries or services the feature needs, and existing ones it would make unused.

## Deprecation scan

For new functionality and enhancements, find what the feature makes obsolete or duplicates:

- Code that does the same thing, or part of it, an older way: functions, flags, endpoints, config keys, scripts.
- Code that only exists to work around the missing feature.
- Docs, examples, and tests that describe the old way.

For each finding, list:

- what it is and where (file:line);
- its callers and users, inside the repository and, for public interfaces, outside it;
- what removing it would break;
- whether it can go in the same change, or needs a deprecation period (a warning, then removal later). This is input for the user's choice, not the choice.

## Report

Keep it short; the planner reads it and verifies it.

```markdown
## Impact
- <area>: <what changes> (<file:line>)

## Interfaces and data
- <interface or schema>: <change>; breaking: yes/no

## Tests and docs
- <file>: <covers / breaks / missing>

## Deprecation candidates
- <thing> (<file:line>): callers <list>; removal breaks <…>; same change or deprecate first: <why>

## ADRs
- <NNNN title>: touched / contradicted, how

## Risks and quirks
- <what could go wrong or surprise>

## Unverified
- <claim you could not confirm, and why>
```
