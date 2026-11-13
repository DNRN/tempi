# Plan: Continue an existing game

**Status.** Done

## Source

- Described by the user in chat, 2026-11-13: "if a user runs tempi within an existing game it should be able to pick up the work and also understand which engine etc has been selected."

## Summary

Running `tempi` inside a game folder (or with `--out` pointing at one) continues that game: the right target, the last conversation, and a summary of the game. The next message is a change request, not the idea for a new game.

## Type

Enhancement. It changes what `tempi` does in a folder that holds a game, and fixes `/resume` treating a resumed game's next turn as a first build.

## Benefits

- Users can stop and come back to a game across tempi runs without re-explaining it or passing `--target` again.
- Godot games are no longer checked as web games when `--target` is forgotten.

## Impact

- New `src/game.ts`: manifest (`.tempi/game.json`), detection, `resolveGame`, notes (`.tempi/notes.md`).
- `src/cli-args.ts`: `target` is only set when `--target` is given; usage text.
- `src/cli.ts`: resolves the game before checking the target's prerequisites; existing games skip scaffold and the lobby.
- `src/session.ts`, `src/agent.ts`: `resume` continues the most recent session and adds the resume guidance to the system prompt.
- `src/loop.ts`: `existing` option; `built` from the start; `/resume` into a game folder continues it; new game folders get a manifest.
- `src/plain.ts`: `existing` option: no scaffold or first build; the idea is the first change request.
- `src/prompts/build.ts`, `src/prompts/system.ts`: notes rule for every game; `resumeGuidance`.
- Tests: `game.test.ts` (new), and additions to the CLI, loop, plain, prompt, and session tests.
- Docs: README usage, PROJECT.md use cases and technical direction, ADR 0010.

## Deprecations

None.

## Risks and quirks

- Any folder with an `index.html` is adopted as a web game: accepted (ADR 0010). The manifest is written only after the target and prerequisite checks pass, so a failed run leaves nothing behind.
- A moved or renamed game folder gets a new session (pi matches sessions by path); the notes carry over. Documented in the README and ADR 0010.
- Games from earlier tempi versions have no recorded idea: the guidance says so and asks the agent to read the code.

## Decisions

- Manifest, detection in the working directory or `--out`, error on a `--target` mismatch, continue the session plus notes: [ADR 0010](../adr/0010-game-manifest-and-continuing-existing-games.md).

## Assumptions

- `SessionManager.continueRecent` in pi 1.5.2 opens the newest session in `.tempi/sessions` for the folder's path, or creates one: both cases covered by `session.test.ts`.

## Open questions

None.

## Acceptance criteria

- [x] `tempi` in a tempi game folder continues it with the manifest's target and the last session.
- [x] A folder with `project.godot` or `index.html` and no manifest is adopted with the matching target.
- [x] `--target` that disagrees with the game stops with an error naming the game's target.
- [x] The first turn in a continued game is a change or a question, never a build; no new folder is created.
- [x] New games record `.tempi/game.json`; the agent is asked to keep `.tempi/notes.md`.
- [x] Plain mode continues a game the same way.

## Implementation steps

1. `src/game.ts` with tests.
2. CLI resolution; session `resume`; loop `existing`; plain `existing`.
3. Prompts: notes rule, resume guidance.
4. Docs.

## Refinement log

| Round | Question | Answer |
| --- | --- | --- |
| 1 | How to pick up the work? | Continue the last session and keep notes |
| 1 | Which folders count as a game? | tempi's manifest, else engine files |
| 1 | Where to look? | The working directory or `--out` |
| 1 | `--target` disagrees with the game? | Stop with an error |
