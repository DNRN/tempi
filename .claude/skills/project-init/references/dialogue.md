# PROJECT.md dialogue

Goal: understand the project well enough that the next session can plan the first feature without asking again. A conversation, not a form: ask, listen, follow up.

## Rules

- **Offer, don't impose.** Open with the choice: answer some questions now (about ten), or skip and fill `PROJECT.md` in later. "Skip", "enough", or "just write it" at any point ends the dialogue: write what you have; the rest goes to *Open questions*.
- **Start broad.** First question: "What is the project called, and what is it, in a sentence or two? Why does it exist?" Then take the topics below in the order the answers leave them unclear. Skip a topic that an answer or the repository already covers.
- **One question per turn.** Two or three only when they are short and about the same thing. Offer options when the answer is a choice (web app, CLI, library, …), and always a "not decided yet" option.
- **Undecided is an answer.** Record it as an open decision; don't decide for the user. Recommend only when asked, and record an accepted recommendation as a decision with its reason.
- **Follow up on vague answers once.** "Everyone" → "who first?"; "fast" → a number or a comparison; "the usual features" → "name the three that matter most". Still vague → record it as said.
- **Stop when done.** Every topic answered, skipped, or open, usually after 6-12 questions. Don't pad.
- **Play back before writing.** At most eight lines: purpose, users, first milestone, key constraints, open decisions, and anything you assumed. Ask for corrections, then write.

## Topics

| Topic | What to learn | Questions |
| --- | --- | --- |
| Purpose | What it is, the problem it solves, why now | "What problem does this solve, and for whom?" · "What do people do today instead, and why isn't it enough?" |
| Users | Who uses it first, who later, how they reach it | "Who is the first user: you, a team, customers, the public?" |
| Use cases | The 3-5 things a user does, end to end | "Walk me through the most important thing a user does with it." |
| Scope | The first milestone; what comes later; what is out | "What is the smallest version you would actually use?" · "What is out of scope, even if it sounds related?" |
| Success | How the user will know it works | "How will you know the first milestone is done?" |
| Platform and stack | Form (web, CLI, mobile, library, service), language, framework, storage, hosting: decided or open | "Is the platform or stack decided, or should it stay open for now?" |
| Integrations | External APIs, existing systems, data sources, auth providers | "Does it need to talk to anything that already exists?" |
| Constraints | Deadline, budget, privacy or compliance, performance, licence, who works on it | "Any hard constraints: deadline, budget, data rules, licence?" |
| Ways of working | Testing, CI, code style, review, commit habits, things the agent must never do: these go to `AGENTS.md` | "How should I work in this repository? Tests first, small commits, anything off-limits?" |
| Risks | What the user is least sure about | "What part are you least sure will work?" |
