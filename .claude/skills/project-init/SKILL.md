---
name: project-init
description: Use when the user asks to initialize, bootstrap, or start a new project or repository - asks for the project's title (suggesting the folder name) and a description in the user's words, offers follow-up questions on users, scope, and constraints, then sets up git and, if the user has one, a remote; writes PROJECT.md, and AGENTS.md with a CLAUDE.md that imports it, so development can start. Every question can be skipped. Also use to resume an unfinished PROJECT.md. Skip for feature work or bug fixes in a project that is already set up.
---

# Project init

A new project starts with a repository and three files: `AGENTS.md`, the always-on instructions every harness reads; `CLAUDE.md`, which imports it for Claude Code; and `PROJECT.md`, what is being built and why. Without `PROJECT.md`, the first feature gets planned against the agent's guesses instead of the user's intent.

## When this applies

- The user asks to initialize, bootstrap, or set up a new project, or to prepare a directory or repository for agent work.
- A `PROJECT.md` has open questions and the user wants to continue the dialogue.

Skip for feature work, bug fixes, and refactors in an existing project.

## Procedure

Ask with the harness's question tool if it has one, otherwise in plain text. One question per turn, concrete options where the answer is a choice, and skipping always allowed.

1. **Find the root and what exists.** The root is the working directory unless the user named another. Never initialize `$HOME` or `/` itself; ask for a project directory. Run `git rev-parse --show-toplevel` and remember the result for step 5: the root (git is set up), a parent directory (a dotfiles repository in `$HOME`, a monorepo), or a failure (no repository yet). Change nothing yet.

   Note any existing `AGENTS.md`, `CLAUDE.md`, `PROJECT.md`, `README*`, and manifests (`package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, …). What the files or the user's request answer, you don't ask. An existing `PROJECT.md` → resume (see step 6) instead of steps 2-4.
2. **Ask for the title.** Suggest one made from the folder name, `shelfie` or `board-game-tracker` → "Shelfie" or "Board Game Tracker", and offer to use the folder name as it is or type another. A name in a manifest or `README` is a further option. Skipped → the suggestion. The title heads `PROJECT.md` and `AGENTS.md`; the folder is not renamed.
3. **Ask for a description.** "Describe the project in your own words: what is it, who is it for, and why does it exist?" A free answer, not options. Record it as said; a skipped description goes to *Open questions*.
4. **Offer the follow-up questions** for `PROJECT.md`, as described in [`references/dialogue.md`](references/dialogue.md): answer some now (about ten), or skip and fill them in later. The user can also stop at any question. Skipped → step 5 with what is known.
5. **Set up git.**
   - Already a repository at the root → skip `git init`.
   - Inside a parent's repository → unless the user already said, ask: a new repository here, or a project inside the parent's? Never `git init` inside another repository without the user's word.
   - No repository → `git init`, which respects the user's `init.defaultBranch`; when that is unset, `git init -b main`. Don't commit yet.

   Then the remote. Skip if `git remote` already lists one; report it. Otherwise ask:
   - **Connect one**: the user gives the URL. Check it first with `git ls-remote <url>`. On failure (wrong URL, no access, not created yet), show the error and offer: a corrected URL, continue and come back to it, or stay local. Never add a remote that didn't answer. Then `git remote add origin <url>`. If `git ls-remote --heads origin` lists branches, the remote has history: `git fetch origin`, then, while the local repository has no commits, `git checkout -t origin/<default-branch>` (stop and ask if it would overwrite local files); with local commits, ask before `git pull --rebase origin <default-branch>`.
   - **I'll create one now** → write the files (step 6) meanwhile and ask for the URL again at step 7. Tip: create it empty (no README, licence, or `.gitignore`), so there is no unrelated history to merge.
   - **Stay local** → no remote. `git remote add origin <url>` connects one later.
6. **Write the files** from [`references/templates.md`](references/templates.md):
   - `PROJECT.md` from the title, the description, and the follow-up answers. Every topic not answered goes to *Open questions*, never filled with a guess.
   - `AGENTS.md`: a one-line purpose, the pointer to `PROJECT.md`, the decisions line when the project has an ADR folder, and only the commands and conventions the user stated or the repository shows.
   - `CLAUDE.md`: the line `@AGENTS.md`. Claude Code reads `CLAUDE.md`, not `AGENTS.md`; the import loads it. An import rather than a symlink: a symlink checks out as a plain text file on Windows without `core.symlinks`, and the import leaves room for Claude-only lines below it.

   Existing files are updated, never replaced:
   - `AGENTS.md` exists → add the `PROJECT.md` pointer, and the decisions line when there is an ADR folder, if missing; change nothing else.
   - `CLAUDE.md` exists, no `AGENTS.md` → move its content into the new `AGENTS.md`, the shared source for every harness, and leave `CLAUDE.md` as `@AGENTS.md` plus any lines only Claude Code understands. Say what moved.
   - Both exist and `CLAUDE.md` doesn't import `AGENTS.md` → add `@AGENTS.md` as its first line.
   - `PROJECT.md` exists → resume: its title and description stand; ask only about its *Open questions* and missing sections, set up git (step 5) if needed, then update it in place.
7. **Commit, if the user wants.** A remote still being created → ask once more: the URL now (connect it as in step 5), or stay local. Then ask whether to commit the files as the initial commit, and to push with `git push -u origin <branch>` when a remote is connected. Stage only the files this skill wrote (`git add AGENTS.md CLAUDE.md PROJECT.md`), and, when `.agents/afk.tsv` exists, what the afk installer put there: the manifest and each path in its `paths` column (such as `.agents/skills/project-init` and `.claude/skills/project-init`), which the installer says to commit. Not `git add -A`, which takes whatever else is in the directory, and not all of `.claude/`, which can hold personal files such as `settings.local.json`. With `user.name` or `user.email` unset, ask; never invent an identity.
8. **Report**: branch and remote (or local only), files created or changed, the open questions left in `PROJECT.md`, and the next steps: planning the first milestone, and, when `.agents/afk.tsv` exists, running `afk` in the project folder to install other components, such as `code-review` and `commit-gate`. Don't run it yourself: without arguments it opens a menu that needs the user's terminal.

## Gotchas

- `PROJECT.md` records what the user said. Anything inferred is marked as an assumption and confirmed in the dialogue's playback, or goes to *Open questions*.
- `AGENTS.md` loads into every session: keep it short. Purpose, users, scope, and history belong in `PROJECT.md`.
- Initialization records intent; building starts after. Don't scaffold code, pick a stack, or add a `.gitignore`, README, or licence unless the user asks.
