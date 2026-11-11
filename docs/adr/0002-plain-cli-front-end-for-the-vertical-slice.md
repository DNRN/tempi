# 0002. Plain CLI front end for the vertical slice

Date: 2026-11-10

## Status
Superseded by [0008](0008-pi-interactive-tui-as-tempis-front-end.md)

Decided by the user in round 1 of [the vertical-slice plan](../plans/vertical-slice.md).

## Context
PROJECT.md leaves the front end open: CLI, TUI, or web UI. The vertical slice has to prove the co-creation loop (idea → playable game → one change → playable again) on two targets, web and Godot. The front end only has to take an idea, show progress, start the game, and take a change request.

## Decision
We will give the vertical slice a plain CLI: `tempi "<idea>"` prints the agent's progress, starts the game (browser for web, the system `godot` for Godot), then prompts for a change request on standard input.

The loop logic stays separate from the CLI code, so another front end can drive it later.

## Consequences
- Least code between the idea and the proof that the loop works.
- Works the same for both targets, since neither is shown inside tempi.
- The long-term front end for public users stays an open question in PROJECT.md; this ADR decides the slice only.
- Progress output is plain text: no side-by-side chat and game, no rich rendering of generated assets.

Rejected alternatives:

- TUI on pi's TUI components: nicer to use, but more to build before the loop is proven.
- Web UI with chat and game side by side: the best fit for web games and the largest front-end effort; it does not help the Godot target, which runs in its own window.
