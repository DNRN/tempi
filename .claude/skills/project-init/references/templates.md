# Templates

Fill from the dialogue and the repository. A section with nothing known is left out; a topic the user skipped or left undecided becomes one line under *Open questions*. Never write "TBD" or invent content to fill a section.

## PROJECT.md

```markdown
# <Project name>

<One paragraph: what it is, for whom, and why it exists.>

## Problem

<What the users do today and why it isn't enough.>

## Users

- <Primary user>: <what they need>
- <Secondary user>: <what they need>

## Use cases

1. <A user does X to get Y, end to end.>

## Scope

### First milestone

- <Smallest version the user would use.>

### Later

- <Wanted, not in the first milestone.>

### Out of scope

- <Explicitly not this project.>

## Success criteria

- <Observable check that the first milestone is done.>

## Technical direction

| Area | Choice | Why |
| --- | --- | --- |
| <Platform, language, storage, hosting…> | <decided choice, or "open"> | <the user's reason> |

## Constraints

- <Deadline, budget, privacy, performance, licence, team.>

## Risks

- <What the user is least sure about.>

## Open questions

- <A topic not answered yet, phrased as the question to ask.>
```

With the dialogue skipped, `PROJECT.md` is the title, whatever the user already said, and *Open questions* with one line per topic in [`dialogue.md`](dialogue.md#topics).

## AGENTS.md

```markdown
# <Project name>

<One sentence: what this is.> Read [PROJECT.md](PROJECT.md) before planning or building a feature: purpose, users, scope, constraints, and open decisions live there. Update it when they change.

<Only when the project has an ADR folder:> Architecture decisions are recorded in [docs/adr/](docs/adr/). Accepted ones hold: read the one that applies before changing what it decides, and change a decision by superseding it with a new ADR, never by editing it.

## Commands

- Build: `<command>`
- Test: `<command>`

## Conventions

- <A way of working the user stated, or the repository already follows.>
```

The decisions line appears only when the project already has ADRs (`docs/adr/`, or its own folder: use that path); the `adr-planning` skill adds it when it creates the folder. *Commands* and *Conventions* appear only with real content; a new, empty project usually has neither yet. Keep the file under about 40 lines: it loads into every session.

## CLAUDE.md

```markdown
@AGENTS.md
```

Claude-only instructions, if any, go below the import.
