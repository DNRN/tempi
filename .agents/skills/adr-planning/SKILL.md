---
name: adr-planning
description: Use when an architectural decision arises - while a feature is planned (often handed over by feature-planning), during design, or in code - record each significant decision as an Architecture Decision Record (ADR) before it is implemented, brief the user, and record their verdict. Also use when the user asks to write, record, or create an ADR for a decision, to supersede, replace, or reverse an Accepted ADR, or accepts, rejects, or wants to change a Proposed ADR. Skip for bug fixes, chores, and choices with no lasting structural impact.
---

# ADR planning

Architecture decisions made during feature planning get captured as [ADRs](https://adr.github.io/) - short, numbered, immutable records. A decision that is not written down gets re-litigated; one buried in a PR description gets lost.

## When this applies

- A feature is being planned (by `feature-planning`, or by the user directly) and a decision needs recording. The planning itself (description, impact, question rounds) is `feature-planning`'s job; this skill records the decisions it hands over.
- During planning, a choice appears that is hard to reverse, crosses module or service boundaries, constrains future work, or carries real tradeoffs: frameworks, data models, protocols, storage engines, sync vs async, monolith vs services.
- The user asks to record a decision as an ADR outside a planning flow: see [Record a decision on demand](#record-a-decision-on-demand).
- The user wants to change, replace, or reverse an Accepted decision: see [Supersede an Accepted ADR](#supersede-an-accepted-adr).

Trivial choices - naming, formatting, single-file changes, library upgrades without alternatives - do not get ADRs.

## Procedure

1. **Surface the decisions** while planning. Test each candidate: would changing it later require coordinated edits in multiple places? Does it constrain what can be built next? No to both means it is not architectural - leave it as a plan note, not an ADR.
2. **Find the project's ADR home** before creating anything: look for `docs/adr/`, `doc/architecture/decisions/`, `adr/`, or grep for existing `NNNN-*.md` decision records. If the project already has ADRs, follow its numbering and section format - never impose a second convention.
3. **If none exists**, create `docs/adr/` and start with `0001-record-architecture-decisions.md` (the bootstrap record), using the template below. Then tell every future session where decisions live: add this line to `AGENTS.md`, or to `CLAUDE.md` when there is no `AGENTS.md` (create neither):

   > Architecture decisions are recorded in [docs/adr/](docs/adr/). Accepted ones hold: read the one that applies before changing what it decides, and change a decision by superseding it with a new ADR, never by editing it.
4. **One ADR per decision.** Number sequentially with zero-padded 4 digits (`0002-kebab-title.md`); never renumber or reuse numbers.
5. **Write it** with these sections:

   ```markdown
   # NNNN. <Short noun-phrase title>

   Date: YYYY-MM-DD

   ## Status
   Proposed

   ## Context
   The forces at play: requirements, constraints, and the options on the table.

   ## Decision
   We will <decision in active voice>.

   ## Consequences
   What becomes easier, what becomes harder, which risks we now accept.
   ```

6. **Record rejected alternatives** with the reason each was rejected. This is the core value: it prevents re-debating settled questions six months later.
7. **Link both ways**: the feature plan references the ADR file; ADRs covering related decisions reference each other.
8. **Leave status `Proposed`** and don't implement a decision while it is Proposed. Other work that doesn't depend on it can go ahead.
9. **Brief the user and ask for a verdict** once the ADRs for the plan are written. Don't paste the files: a long record gets skimmed and approved unread. For each ADR, in a few lines:
   - the decision, in one sentence;
   - the strongest rejected alternative, and why it lost;
   - what the user is signing up for: the costliest or hardest-to-reverse consequence;
   - anything assumed or not verified that the decision rests on;
   - the file path, for the full text.

   Then ask, for all of them at once: **accept**, **change** (and what), or **reject**, per ADR. Use the harness's question tool if it has one; otherwise ask in plain text. Point out the ADR you would most expect them to push back on.
10. **Record the verdict**:
    - *Accept*: set the status to `Accepted`. Change nothing else.
    - *Change*: edit the Proposed ADR, then brief only what changed and ask again.
    - *Reject*: set the status to `Rejected` with the reason in one sentence, keep the file, and revise the plan. A rejected option is a decision too; the record stops it from being proposed again.
    - A verdict the user already gave in the request ("record it as Accepted, the team agreed") counts: write the ADR, record that verdict, and say so in the brief instead of asking.
    - No answer, or an answer that doesn't address the ADRs: they stay Proposed. If the user says to go ahead right after the brief, take it as accepting the ADRs in that brief and say so in the reply ("Recorded 0004 and 0005 as Accepted"), so a wrong reading can be caught.

    Accepted ADRs are immutable - a change of direction is a new ADR that supersedes the old one: see [Supersede an Accepted ADR](#supersede-an-accepted-adr).

## Record a decision on demand

The user names a decision to record ("write an ADR that we use Postgres"), often one already made in chat or code.

1. Find the ADR home and the next free number (steps 2-4); bootstrap `0001` only when no home exists.
2. Write one ADR in the project's format (step 5). Take the context and alternatives from what the user said and what the code shows; where neither says why an alternative lost, write that it was not recorded rather than inventing a reason.
3. Status `Proposed`, even when the decision is already in the code: brief it (step 9) and record the verdict (step 10). A user who asked for the record and says "yes" or "go ahead" after the brief has accepted it; a request that already says to record it as Accepted is the verdict.

## Supersede an Accepted ADR

The user wants to change, replace, or reverse a decision an Accepted ADR records. Never edit the old ADR's Context, Decision, or Consequences.

1. Write a new ADR with the next number, status `Proposed`. Its Context says what changed since the old decision and links it (`Supersedes [NNNN](NNNN-title.md)`, or `Supersedes the <part> of [NNNN](…)` when only part changes). Its rejected alternatives include keeping the old decision, with the reason it lost.
2. Brief it and record the verdict (steps 9 and 10). Leave the old ADR alone while the new one is Proposed.
3. On acceptance, change only the old ADR's Status section:
   - whole decision replaced: `Superseded by [NNNN](NNNN-title.md)`;
   - part replaced: keep `Accepted` first and add what was replaced, as in `Accepted. The <part> superseded by [NNNN](NNNN-title.md).`
4. Update the plan or docs that cite the old decision so they point at the new one.

A commit that edits an Accepted ADR anywhere but its Status section is denied where the commit gate runs as a git hook; a supersede done as above passes.

## Gotchas

- One page max per ADR. If it grows into a design document, the design doc is a separate file the ADR links to.
- Never leave decisions only in chat, commit messages, or PR descriptions.
- Never rewrite an Accepted ADR - supersede it. The history is the point. Where the commit gate runs as a git hook, a commit that edits an Accepted ADR outside its Status section is denied.
- If the user's request contradicts an existing Accepted ADR, surface the conflict and propose a superseding ADR instead of silently deviating.
