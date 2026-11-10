# Question rounds

Goal: a plan that someone else could build without asking you again. A conversation, not a form: ask, listen, follow up.

## Rules

- **Batches, blocking first.** Up to about five related questions per round. Blocking questions (the answer changes the scope, the design, or what gets deleted) come before details. Don't ask what the sources, the code, or an earlier answer already settled.
- **Options with a recommendation.** Where the answer is a choice, give 2-4 options, each with its tradeoff in a line, and say which you recommend and why. Always allow "not decided yet".
- **Raise what you found.** Each issue or quirk from the impact map is a question, not a footnote: a contradiction in the comments, an ADR it conflicts with, a hot path it slows, a breaking change, an edge case nobody mentioned.
- **One question per deprecation finding**: remove it in this feature (callers migrated in the same change), or deprecate it first (keep it with a warning, remove it later). Recommend one: removal for internal code, deprecation for public interfaces with outside users.
- **Follow up on vague answers once.** "Fast" → a number or a comparison; "the usual" → name them; "like X" → which part of X. Still vague → record it as said.
- **Undecided is an answer.** Record it as an open decision; don't decide for the user. Recommend when asked, and record an accepted recommendation as a decision with its reason.
- **Update between rounds.** Edit the plan after every round, before asking the next. If an answer changed the scope, check the impact again before asking more.
- **Stop when done.** No material question left, or the user says "enough", "skip", or "just build it". Everything still open stays in *Open questions*, marked blocking or not.

## Topics

Take them in the order the sources leave them unclear. Skip what is settled.

| Topic | What to learn | Questions |
| --- | --- | --- |
| Problem | Who has it, how they cope today, why now | "Who runs into this, and what do they do today instead?" |
| Outcome | How we will know it worked | "What will be different for the user when this ships? Anything measurable?" |
| Scope | The smallest useful version; what is out | "What is the smallest version that solves it?" · "What is out of scope, even if it sounds related?" |
| Behavior | The main flow end to end; edge cases; errors | "Walk me through it from the user's side." · "What should happen when <edge case>?" |
| Interfaces | Names, flags, endpoints, formats, defaults | "Is <name/flag/format> what you want, or is there a convention to follow?" |
| Compatibility | Existing users, data, and callers | "Can existing <data/config/callers> break, or must they keep working?" |
| Deprecations | Remove or deprecate each finding | One question per finding, as in the rules |
| Constraints | Deadline, performance, security, platforms, dependencies | "Any hard constraints: deadline, performance target, data rules, new dependencies allowed?" |
| Rollout | Flag, migration, staged release, announcement | "Does it ship to everyone at once, behind a flag, or with a migration?" |
| Acceptance | The checks that say it is done | "Are these the right acceptance criteria? Anything missing?" |
| Risks | What the user is least sure about | "Which part are you least sure about?" |
