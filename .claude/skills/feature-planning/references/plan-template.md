# Plan template

`docs/plans/<slug>.md`, where the slug is the feature in a few kebab-case words (`export-notes-csv`). One plan per feature, edited in place every round. Keep the headings; leave a section's body as "None." rather than dropping it, so a reader sees it was considered.

## Feature

```markdown
# Plan: <feature title>

**Status.** Draft

## Source

- <link to the issue, MR, ticket, or doc>, fetched YYYY-MM-DD: body and N comments<, linked items read>
- Not read: <attachment, linked item, and why>
- Or: "Described by <user> in chat, YYYY-MM-DD."

## Summary

<What the feature is and why, in the user's and the source's words. Two to five sentences.>

## Type

<Enhancement | New capability | Refactor | Removal>. <One sentence on why.>

## Benefits

- <Who gains what; how we will know.>

## Impact

- <Area>: <what changes> (<file:line>)
- Interfaces and data: <changes; breaking or not>
- Tests: <covering, breaking, to add>
- Docs: <to update>

## Deprecations

| What | Where | Callers | Choice |
| --- | --- | --- | --- |
| <old path> | <file:line> | <callers> | <Remove in this feature / Deprecate first / Open> |

## Risks and quirks

- <Risk or surprise>: <how the plan handles it>

## Decisions

- <Decision>: <reason>. <ADR link, when it is architectural.>

## Assumptions

- <Inferred, not confirmed>: <how to confirm it>

## Open questions

Blocking:

1. <Question> (options: …; recommended: …)

Non-blocking:

1. <Question>

## Acceptance criteria

- [ ] <Observable check>

## Implementation steps

1. <Step>: <files>

## Refinement log

| Round | Question | Answer |
| --- | --- | --- |
```

## Bug fix

```markdown
# Plan: <bug title>

**Status.** Draft

## Source

## Summary

## Type

Bug fix. <What is broken, for whom.>

## Reproduction

<The smallest command or test that fails, with its output.>

## Root cause

<What is wrong in the code (file:line), and how the reproduction proves it. Unproven → say so.>

## Fix scope

- Changes: <…>
- Must not change: <…>
- Regression test: <…>

## Open questions

## Acceptance criteria

## Refinement log

| Round | Question | Answer |
| --- | --- | --- |
```

## Status

- **Draft**: being refined; open blocking questions allowed.
- **Ready**: the user approved the playback; no blocking question open. Implementation may start.
- **Done**: set in the commit that completes the feature, with the acceptance criteria checked off.
