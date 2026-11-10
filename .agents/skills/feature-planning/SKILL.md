---
name: feature-planning
description: Use when the user asks to plan, define, scope, implement, or add a feature, or to work on an issue, ticket, or bug report from a tracker ("implement issue #42", "add X", "plan X") - fetch the full description (issue, comments, linked docs) or ask for one, map what the change touches and makes obsolete, write a plan in docs/plans/, and refine it with the user in question rounds until it is Ready, before any code is written. Skip small, fully specified changes in one place with the behavior stated (a typo, a rename, "add a --verbose flag to cli.py that prints each step") and plain failing tests with a clear cause: make those directly.
---

# Feature planning

A feature built from half a description gets the other half guessed. This skill gets the whole description first, maps what the change does to the project, and questions the user in rounds until nothing material is open. Then it plans, and only then builds. The plan is a file, `docs/plans/<slug>.md`, refined in place, so the reasoning survives the session and shows up in review.

## When this applies

- The user asks to plan, define, scope, implement, or add a feature, or names an issue, merge request, ticket, or spec to work on.
- A bug report from a tracker, or a bug whose cause is unknown: the [light path](#bug-fixes-light-path).
- A plan in `docs/plans/` is *Draft* and the user answers its questions or wants to continue it: resume at step 7.

**Size gate.** Skip this skill for a change that is small and fully specified: one place in the code, the behavior stated, no issue or document to read first. Examples: a typo, a rename, "add a --verbose flag to cli.py that prints each step". Skip it too for a failing test whose cause is clear. Make those changes directly. When in doubt, the question is: would a competent colleague start coding, or ask first?

## Procedure

Ask with the harness's question tool if it has one, otherwise in plain text. Rules for rounds and the question catalog: [`references/questions.md`](references/questions.md).

1. **Read the settings.** Look for a `## Feature planning` section in `AGENTS.md` (or `CLAUDE.md` when there is no `AGENTS.md`):

   ```markdown
   ## Feature planning

   - Tracker: GitHub issues, via `gh`
   - Scout model: sonnet
   ```

   - No `Tracker` line → ask which tracker the team uses, then follow [`references/sources.md`](references/sources.md#set-up-access): check that you can reach it, and if you can't, walk the user through logging in or connecting it. Never create a tracker, project, or repository. With no tracker, record `- Tracker: none` and don't ask again; intake then takes the user's description and nothing is posted.
   - Write the section when it is missing, in `AGENTS.md`, or in `CLAUDE.md` when that exists without `AGENTS.md`. Create `AGENTS.md` only when neither exists. Change nothing else in the file.
   - A recorded setting is never asked again; the user edits the section to change it.
2. **Get the whole description.**
   - The request names an issue, ticket, merge request, URL, or file → fetch it as [`references/sources.md`](references/sources.md#fetch) describes: the body, every comment, and the linked items that bear on the scope.
   - It names none and doesn't say there is none → ask first: "Is there an issue, ticket, document, or discussion that describes this feature?" Then fetch it.
   - No source → ask the user to describe the feature in their own words: what it is, who it is for, and why it is needed now. If the request already describes it, however briefly, and says there is nothing more, don't ask again: go on with what there is. The gaps become the first round's questions (step 7).
   - A fetch fails → show the error and ask the user to paste the text. Never fill gaps from the title alone: what isn't said goes to *Open questions*, not into the plan as fact.
3. **Classify** the change: *bug fix*, *enhancement* (changes existing behavior), *new capability*, *refactor*, or *removal*. A bug fix takes the [light path](#bug-fixes-light-path). Say which type you chose; the user can correct it.
4. **Map the impact.** Read `PROJECT.md`, `AGENTS.md`, and the Accepted ADRs, then the code the feature touches. Follow [`references/impact-checklist.md`](references/impact-checklist.md), which covers the impact map and the deprecation scan.
   - If the harness can spawn subagents, delegate the mapping. Use the bundled `feature-scout` agent where the harness loads this toolkit's agents, and otherwise the harness's own small read-only scout agent. Pass the feature summary, the repository path, and this skill's `references/impact-checklist.md` in a form the subagent can read (an absolute path, or a harness URI such as `skill://feature-planning/references/impact-checklist.md`).
   - Pass the recorded `Scout model` as the subagent's model. None recorded → ask once ("Which model should the scout use? A smaller one is cheaper; a stronger one catches more subtle overlaps.") and record the answer in the settings.
   - Without subagents, apply the checklist yourself.
   - Verify what the report claims before you rely on it: open the files it names.
5. **Benefits, costs, and risks.** Who gains what, and how you will know: the outcome, not the mechanism. Then what it costs and what could go wrong. A request that contradicts an Accepted ADR is a risk to raise, never something to work around in silence: the superseding ADR is drafted in step 6, and the user decides on it.
6. **Draft the plan** in `docs/plans/<slug>.md` from [`references/plan-template.md`](references/plan-template.md). If the project keeps its plans elsewhere, use that place. Record what the user and the sources said as said. Everything unknown goes to *Open questions*, everything inferred to *Assumptions*. Each deprecation finding is an open question of its own.

   Each architectural decision the plan needs (hard to reverse, crossing module boundaries, constraining what comes next) goes to the `adr-planning` skill: load it and follow it to write a Proposed ADR, linked from *Decisions*. Don't write ADRs without that skill: its format, numbering, and bootstrap rules are the project's.
   - The choice is already made (the request names it, or the user decided it) or only one option fits → write the ADR now, as the request states it, even if you would recommend something else: your alternative goes into the ADR's rejected alternatives with its case, and into the first round, where the user decides. This holds for a superseding ADR too: a request that contradicts an Accepted ADR gets a Proposed one that supersedes it, and the Accepted one is left alone.
   - The choice is open and depends on a blocking question → ask that first, and write the ADR in the round after the answer. An ADR drafted before its inputs are known only gets rewritten.

   Briefs and verdict requests for the ADRs written go into the first round.
7. **Refine in rounds.** Ask the open questions in batches of up to about five, blocking ones first ([`references/questions.md`](references/questions.md)). Each issue or quirk you found comes with options and your recommendation. After every round:
   - update the plan in place: answered questions leave *Open questions*, and the answer goes where it belongs (scope, decisions, deprecations) and into the *Refinement log*;
   - if an answer changed the scope, map the impact again for what changed (step 4), and ask about anything new it turns up;
   - with a tracker source, offer to post the questions still open as a comment on the item. Ask every time, and post only what the user approves.

   Stop when no material question is left, or when the user says enough. Whatever is left stays in *Open questions*, marked non-blocking or blocking; a blocking question left open keeps the plan in *Draft*.
8. **Ready.** Play the plan back in at most ten lines: the goal, the type, the scope and what is out of it, the impact, each deprecation with the user's choice, the risks, the decisions, and the assumptions still unconfirmed. Ask for approval. On approval, set the status to *Ready*.
   - No ADR of the plan may still be Proposed: each is Accepted or Rejected, as `adr-planning` records it. A decision the user already settled in the rounds counts as their verdict.
   - Then offer to implement, following the plan's steps. "Go ahead" starts it in this session.
9. **Done.** The commit that completes the feature sets the plan's status to *Done* and checks off its acceptance criteria. The file stays.

No code is written before the plan is *Ready*. A spike to answer a question (reading code, running the tests, a throwaway script outside the repository) is fine; say what it showed.

## Bug fixes: light path

For a bug from a tracker or with an unknown cause:

1. Settings and the full description (steps 1-2): the report, every comment, the logs and steps attached.
2. **Reproduce** it: the smallest command or test that fails. Record it in the plan.
3. **Root cause**: prove it, from the code and from the reproduction. A guess is an assumption.
4. **Fix scope**: what changes, what must not, and the regression test.
5. Benefits and the deprecation scan are skipped, unless the fix changes behavior someone relies on. Then the fix is an enhancement, and the full flow applies.

Plan sections for the light path: [`references/plan-template.md`](references/plan-template.md#bug-fix). Then rounds (step 7) only for what is unclear, and Ready (step 8).

## Gotchas

- The description from the tracker is a source, not the spec. Comments often change the scope; a later comment overrides an earlier one, and a maintainer overrides a drive-by commenter. Say which one you followed.
- Never mark a question answered from a guess. "Not decided yet" is an answer: record it as an open decision.
- Don't invent acceptance criteria the user didn't agree to. Propose them, and they are agreed when the plan is approved.
- A plan longer than a page or two is a design document trying to get out. Move the design to its own file and link it from the plan.
- The plan is a doc: `doc-sync` keeps it true while the feature is built, so a changed step is edited in the plan, not only in chat.
