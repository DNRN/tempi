---
name: project-init
description: Use when the user asks to initialize, bootstrap, or start a new project or repository - sets up git and, if the user has one, a remote; writes AGENTS.md with a CLAUDE.md that imports it; and writes PROJECT.md from a dialogue that captures what the project is, who it is for, its scope and constraints, so development can start. The dialogue can be skipped. Also use to resume an unfinished PROJECT.md. Skip for feature work or bug fixes in a project that is already set up.
---

# Project init

A new project starts with a repository and three files: `AGENTS.md`, the always-on instructions every harness reads; `CLAUDE.md`, which imports it for Claude Code; and `PROJECT.md`, what is being built and why. Without `PROJECT.md`, the first feature gets planned against the agent's guesses instead of the user's intent.

## When this applies

- The user asks to initialize, bootstrap, or set up a new project, or to prepare a directory or repository for agent work.
- A `PROJECT.md` has open questions and the user wants to continue the dialogue.

Skip for feature work, bug fixes, and refactors in an existing project.

## Procedure

Ask with the harness's question tool if it has one, otherwise in plain text. One question per turn, concrete options where the answer is a choice, and skipping always allowed.

1. **Find the root and what exists.** The root is the working directory unless the user named another. Never initialize `$HOME` or `/` itself; ask for a project directory. Run `git rev-parse --show-toplevel`:
   - prints the root → git is set up; skip `git init`.
   - prints a parent directory (a dotfiles repository in `$HOME`, a monorepo) → unless the user already said, ask: a new repository here, or a project inside the parent's? Never `git init` inside another repository without the user's word.
   - fails → no repository yet.

   Note any existing `AGENTS.md`, `CLAUDE.md`, `PROJECT.md`, `README*`, and manifests (`package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, …). What the files answer, you don't ask.
2. **Set up git** when there is no repository: `git init`, which respects the user's `init.defaultBranch`; when that is unset, `git init -b main`. Don't commit yet.
3. **Ask about the remote now**, before the dialogue, so the user can create one while the rest runs. Skip if `git remote` already lists one; report it. Options:
   - **Connect one**: the user gives the URL → step 4.
   - **I'll create one now** → go on with step 5 and say they can paste the URL whenever it's ready; a URL that arrives mid-dialogue goes through step 4, then the dialogue resumes. Tip: create it empty (no README, licence, or `.gitignore`), so there is no unrelated history to merge.
   - **Stay local** → no remote. `git remote add origin <url>` connects one later.
4. **Connect the remote.** Check it first with `git ls-remote <url>`. On failure (wrong URL, no access, not created yet), show the error and offer: a corrected URL, continue and come back to it, or stay local. Never add a remote that didn't answer. Then `git remote add origin <url>`. If `git ls-remote --heads origin` lists branches, the remote has history: `git fetch origin`, then, while the local repository has no commits, `git checkout -t origin/<default-branch>` (stop and ask if it would overwrite local files); with local commits, ask before `git pull --rebase origin <default-branch>`.
5. **Run the dialogue** for `PROJECT.md` as described in [`references/dialogue.md`](references/dialogue.md). Open by offering it or skipping it; the user can also stop at any question. Skipped → step 6 with what is known.
6. **Write the files** from [`references/templates.md`](references/templates.md):
   - `PROJECT.md` from the dialogue. Every topic not answered goes to *Open questions*, never filled with a guess.
   - `AGENTS.md`: a one-line purpose, the pointer to `PROJECT.md`, the decisions line when the project has an ADR folder, and only the commands and conventions the user stated or the repository shows.
   - `CLAUDE.md`: the line `@AGENTS.md`. Claude Code reads `CLAUDE.md`, not `AGENTS.md`; the import loads it. An import rather than a symlink: a symlink checks out as a plain text file on Windows without `core.symlinks`, and the import leaves room for Claude-only lines below it.

   Existing files are updated, never replaced:
   - `AGENTS.md` exists → add the `PROJECT.md` pointer, and the decisions line when there is an ADR folder, if missing; change nothing else.
   - `CLAUDE.md` exists, no `AGENTS.md` → move its content into the new `AGENTS.md`, the shared source for every harness, and leave `CLAUDE.md` as `@AGENTS.md` plus any lines only Claude Code understands. Say what moved.
   - Both exist and `CLAUDE.md` doesn't import `AGENTS.md` → add `@AGENTS.md` as its first line.
   - `PROJECT.md` exists → resume: ask only about its *Open questions* and missing sections, then update it in place.
7. **Commit, if the user wants.** A remote still being created → ask once more: the URL now, or stay local. Then ask whether to commit the files as the initial commit, and to push with `git push -u origin <branch>` when a remote is connected. Stage only the files this skill wrote (`git add AGENTS.md CLAUDE.md PROJECT.md`), and, when `.agents/afk.tsv` exists, what the afk installer put there: the manifest and each path in its `paths` column (such as `.agents/skills/project-init` and `.claude/skills/project-init`), which the installer says to commit. Not `git add -A`, which takes whatever else is in the directory, and not all of `.claude/`, which can hold personal files such as `settings.local.json`. With `user.name` or `user.email` unset, ask; never invent an identity.
8. **Report**: branch and remote (or local only), files created or changed, the open questions left in `PROJECT.md`, and the next step: planning the first milestone.

## Gotchas

- `PROJECT.md` records what the user said. Anything inferred is marked as an assumption and confirmed in the dialogue's playback, or goes to *Open questions*.
- `AGENTS.md` loads into every session: keep it short. Purpose, users, scope, and history belong in `PROJECT.md`.
- Initialization records intent; building starts after. Don't scaffold code, pick a stack, or add a `.gitignore`, README, or licence unless the user asks.
