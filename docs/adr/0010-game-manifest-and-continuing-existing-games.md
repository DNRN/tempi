# 0010. Game manifest and continuing existing games

Date: 2026-11-13

## Status
Accepted

From [the resume-existing-game plan](../plans/resume-existing-game.md). Extends the loop extension of [0008](0008-pi-interactive-tui-as-tempis-front-end.md); supersedes nothing.

## Context
tempi treated every run as a new game: the working directory was only the parent for a new game folder, the target came from `--target` (default `web`), and `--out` had to be new or empty. Running `tempi` inside a game folder therefore asked for a new idea and built a second game inside the first; a Godot game opened without `--target godot` was checked as a web game. Even pi's `/resume` into a game folder treated the next turn as a first build. Nothing recorded which engine a game used, and the only memory of the work was pi's session history, which `/new` or compaction loses.

Options for each part:

- Engine of a game: (a) a tempi manifest in the workspace; (b) read the engine's files every time; (c) always `--target`.
- Where to look: (a) the working directory or `--out`; (b) also walk up parent folders, like git.
- What the agent remembers: (a) continue the last pi session; (b) a fresh session plus notes; (c) both.

## Decision
We will record every game's target and idea in `.tempi/game.json` (written right after scaffolding) and treat it as the source of truth for the game's target. A folder without one is adopted by its engine's files: `project.godot` → Godot, `index.html` → web; once the target and its prerequisites check out, tempi writes the manifest so later runs agree.

tempi looks for a game in the working directory, or in `--out` when given, and nowhere else. A game found there is continued: no scaffold, no first build, the target from the manifest; an explicit `--target` that disagrees is an error. An idea given on the command line is the first change request.

Continuing reopens the game's most recent pi session (`SessionManager.continueRecent` on `.tempi/sessions`) and adds the game's idea and the agent's notes to the system prompt. The agent keeps those notes in `.tempi/notes.md` (what the game is, controls, file layout, one line per change) after every build or change, in new games too.

## Consequences
- `cd my-game && tempi` picks up where the user left off, with the right engine and the chat history; `/new` still starts clean, but with the notes in the prompt.
- Notes live under `.tempi/`, which the loop's file scan ignores, so updating them never turns a question into a change.
- A folder that merely contains an `index.html` (any static site) is adopted as a web game and gets a `.tempi/game.json`; running tempi in the wrong folder writes that file.
- Games made by earlier tempi versions have no manifest and are adopted by their engine files; their idea is unknown.
- Running tempi in a subfolder of a game starts a new game there; walking up was left for later.
- pi matches sessions to the folder's path, so a moved or renamed game folder continues with a new session; the manifest and notes move with the folder.
- The notes are only as good as the agent keeps them: the prompt tells it to read the code the change touches, not to trust them blindly.

Rejected alternatives:

- Read the engine's files every time, no manifest: works for the two targets now, but becomes ambiguous as targets are added (a Godot project can ship an `index.html` export), and leaves nowhere to keep the idea.
- Always require `--target`: the bug this decision fixes.
- Walk up parent folders: convenient, but the user preferred an explicit rule; tempi creates folders, and finding a game above the working directory could surprise.
- Continue the session only: a compacted or `/new` session loses what the game is.
- Notes only, always a fresh session: throws away the conversation the user just had.
- Warn and use the detected engine on a `--target` mismatch: hides a mistake; a game keeps its engine.
