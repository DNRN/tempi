# 0008. pi's interactive TUI as tempi's front end

Date: 2026-11-11

## Status
Accepted

From [the pi TUI front end plan](../plans/pi-tui-front-end.md). Supersedes [0002](0002-plain-cli-front-end-for-the-vertical-slice.md).

## Context
[ADR 0002](0002-plain-cli-front-end-for-the-vertical-slice.md) gave the vertical slice a plain CLI: progress printed as text, change requests read line by line from standard input. That slice is done: the loop works on both targets. ADR 0002 rejected a TUI on pi's components as "more to build before the loop is proven"; the loop is now proven, and the user wants tempi to look and work like pi, then customize that interface later.

pi 1.5.2 exports its whole interactive interface: `InteractiveMode` runs on an `AgentSessionRuntime` (`createAgentSessionRuntime` with a factory that creates the session), the same way the `pi` command does. The runtime recreates the session through that factory on `/new`, `/resume`, and `/fork`. pi's extension API gives what tempi's loop does today and what later customization needs: commands (`pi.registerCommand`), status lines, widgets, header and footer, custom editor and components (`ctx.ui`), and run lifecycle events (`agent_before_settle` can request one more agent run; `agent_settled` marks the end).

Options:

1. tempi starts pi's `InteractiveMode` on its own session runtime (tempi's resource loader, tools, and prompts), with tempi's loop as an inline extension.
2. tempi becomes a pi package: the user runs `pi` in a game folder and pi loads tempi's extension.
3. Keep the plain CLI and grow tempi's own TUI from pi's TUI components.

## Decision
We will make pi's interactive interface tempi's front end: `tempi` creates an `AgentSessionRuntime` whose factory builds tempi's session as today (`createTempiSession`: tempi's resource loader, bundled packages, MCP, `check_game`, `save_asset`, system prompt), and runs pi's `InteractiveMode` on it in the game workspace.

What the co-creation loop does beyond chatting (scaffold before the first build, tempi's own check with fix rounds after a turn, starting and restarting the game) moves into an inline tempi extension, so it works the same in the TUI, in tests, and in any later front end. Customizing the interface (header, footer, status, widgets, commands) is done through pi's extension UI API in that extension.

## Consequences
- Users get pi's full interface for free: streaming markdown, tool rendering, model and thinking selection, `/login`, session history, interrupt and steer, themes, keybindings.
- Customization later uses pi's documented extension UI API rather than tempi's own rendering code.
- tempi depends on `InteractiveMode` and `AgentSessionRuntime`, which are larger surfaces of pi than `createAgentSession`; a pi upgrade can change them, and tempi's pinned version (ADR 0003) has to be bumped with care.
- pi's built-in commands come with it, including `/new`, `/resume`, `/fork`, and settings: tempi's session factory has to rebuild a correct tempi session for each, and commands that make no sense in tempi may need hiding.
- The loop logic leaves `runCoCreation` and is driven by agent events instead of a sequential function; its tests move with it.
- ADR 0005 still holds: the user's own pi packages, extensions, skills, and prompts stay out, because tempi supplies the resource loader.

Rejected alternatives:

- Keep the plain CLI (ADR 0002): no rich output, no model switching or session history, and nothing to customize; the reason it won (the loop was unproven) no longer applies.
- tempi as a pi package run with `pi`: the closest to stock pi, but pi would load the user's own extensions and packages next to tempi's (against ADR 0005), tempi would not control which session, tools, or folder a game gets, and `tempi "<idea>"` would no longer be a single command.
- tempi's own TUI from pi's TUI components: full control, but rebuilds what `InteractiveMode` already does before any customization starts.
