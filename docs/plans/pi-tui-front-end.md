# Plan: pi's interface as tempi's front end

**Status.** Done

## Source

- Described by Dennis in chat, 2026-11-11: instead of `node dist/cli.js "a cat catches falling fish"` printing plain progress, "I would prefer to open the pi agent"; "I would definitely like tempi to have the pi interface and customize it later." No tracker issue.

## Summary

`tempi "<idea>"` opens pi's own interactive interface (chat, streaming output, tool calls, model selection, session history) instead of the plain text loop, running tempi's agent: its prompts, tools, bundled packages, and MCP servers. `tempi` with no idea opens the interface too, and the first message is the idea. The co-creation loop still holds: the first build starts from the idea, tempi checks the game, fixes what the check finds, and opens it, and the user types changes or questions in pi's editor, sent as typed. The plain text loop stays as `--plain`, and runs automatically when input is piped. Customizing the interface comes later, through pi's extension UI API.

## Type

Enhancement. It replaces the front end of an existing, working loop.

## Benefits

- The user works with tempi the way they work with pi: readable streaming output, tool results, interrupt and steer, `/model`, `/login`, history. Known when the acceptance runs below are done in the TUI.
- A base to customize: header, footer, status, widgets, and tempi commands come from pi's extension API instead of tempi's own rendering.

## Impact

- Entry point: `src/cli.ts` builds an `AgentSessionRuntime` and runs `InteractiveMode` (pi 1.5.2 exports both, `dist/index.d.ts:36`; `InteractiveMode(runtimeHost: AgentSessionRuntime, options)` with `initialMessage`, `dist/modes/interactive/interactive-mode.d.ts:18-140`).
- Session: `src/session.ts` `createTempiSession` calls `createAgentSession` and `bindExtensions` itself; it has to become a runtime factory (`CreateAgentSessionRuntimeFactory`, `dist/core/agent-session-runtime.d.ts:23`) that InteractiveMode binds, and that rebuilds tempi's session on `/new`, `/resume`, `/fork`. The child-extension registration for pi-subagents (`src/session.ts`, `registerRequiredChildExtensions`) is keyed to the session id, so it must follow each replacement.
- Loop: `src/loop.ts` `runCoCreation` is a sequential function with `LoopIO.ask`. Its behavior (prerequisites, scaffold, post-turn check with up to 3 fix rounds, start/restart the game, asset notices) moves into an inline tempi extension driven by `agent_before_settle` (can request one more run: the fix round) and `agent_settled`.
- Agent: `src/agent.ts` `startTempiAgent` waits for MCP servers before the first prompt so the build prompt can name them. With the guidance in the system prompt (round 1), the generator list goes there too: tempi waits for the servers, then builds the system prompt, or adds the list in `before_agent_start`.
- Prompts: `src/prompts/build.ts` `changePrompt` wraps each change request (asset guidance, budget of 3, working rules). Round 1 moves that guidance into the system prompt (`src/prompts/system.ts`) and sends typed messages as they are; `buildPrompt` stays for the first build, which keeps the build budget of 6.
- Workspace without an idea: `src/workspace.ts` `chooseWorkspace` names the folder after the idea, and a pi session is bound to its cwd. With no idea at start, the session has to start somewhere else and move to the game folder after the first message: `AgentSessionRuntime.switchSession(path, { cwdOverride })` (`dist/core/agent-session-runtime.d.ts:73`) allows that, to be confirmed in the spike.
- Progress: `src/progress.ts` (plain printer) is not needed in the TUI.
- Interfaces: the `tempi` command and its flags (`src/cli-args.ts`) stay; `--no-open` and `--no-mcp` keep their meaning. Non-breaking for the flags; the output changes completely.
- Tests: `src/loop.test.ts`, `src/e2e.test.ts`, `src/e2e-local-mcp.test.ts` drive `runCoCreation`; they move to the extension driven through a session (scripted model, no TUI). `src/progress.test.ts` goes with the printer if it is removed. A TUI smoke test needs a fake terminal (`InteractiveModeOptions.terminal`).
- Docs: README usage and the CLI description; PROJECT.md front end row and its open question; ADR 0002 superseded by [ADR 0008](../adr/0008-pi-interactive-tui-as-tempis-front-end.md).

## Deprecations

| What | Where | Callers | Choice |
| --- | --- | --- | --- |
| Plain text loop (`LoopIO`, `ask`, readline) | `src/cli.ts`, `src/loop.ts` | the CLI, `loop.test.ts`, `e2e*.test.ts` | Kept as `--plain` and for piped input: round 1; now `runPlainCoCreation` in `src/plain.ts` |
| Plain progress printer | `src/progress.ts` | `src/cli.ts`, `progress.test.ts` | Kept, for `--plain`: round 1 |
| `changePrompt` wrapping of each request | `src/prompts/build.ts`, `src/loop.ts` | the loop, `build.test.ts` | Removed: its guidance moved to the system prompt (round 1, done in step 3) |

## Risks and quirks

- **Contradicted ADR 0002** (plain CLI): ADR 0008 supersedes it, Accepted in round 2.
- **pi's built-in commands** (`/new`, `/resume`, `/fork`, `/settings`, ...) replace the session: tempi's factory must rebuild a full tempi session, and the loop extension must not lose the running game or rescaffold. Some commands may need hiding.
- **Project trust**: tempi writes `.pi/settings.json` into each workspace (`src/workspace.ts`). pi's interactive mode may ask to trust the folder. Must be checked in the spike.
- **Larger pi surface**: `InteractiveMode` and `AgentSessionRuntime` change more between pi versions than `createAgentSession`.
- **Fix rounds visible in chat**: tempi's fix prompt becomes a message the user sees in the TUI. Probably good (transparency), but it is a change.
- **No idea at start** (round 1): the session runs before the game folder exists. tempi has to start it in a holding place and move it to the new folder after the first message; the transcript may restart at that point. See question 1.
- **Raw messages and the asset budget**: without `changePrompt`, the per-change budget of 3 generated assets is only a system-prompt rule, so a question that doesn't change the game is no longer told to rebuild, but the budget is less prominent.
- **No-change turns**: tempi checks after every turn (round 1); a turn that changed no files skips the check and the restart.
- **pi-subagents console warning** muted in `src/cli.ts` (`muteKnownWarnings`) would print into the TUI if not muted the same way.

## Decisions

- tempi's front end is pi's `InteractiveMode` on tempi's own session runtime, with the loop as an inline extension: user chose "tempi has the pi interface", 2026-11-11. [ADR 0008](../adr/0008-pi-interactive-tui-as-tempis-front-end.md), Accepted (round 2).
- Customizing the interface is later work, not this feature: user, 2026-11-11.
- The plain mode stays as `--plain`, and is used automatically when stdin is not a terminal: user, round 1.
- After each turn tempi checks the game, runs up to 3 fix rounds, and restarts the game, as now; `/play` and `/check` commands are added. A turn that changed no files is not checked or restarted: user, round 1 (option a; the no-change rule was part of the recommendation).
- Messages are sent as typed; the change guidance moves into the system prompt: user, round 1.
- `tempi` with no idea opens the interface, and the first message is the idea: user, round 1. Reopening an existing game is not part of this feature.
- Before the idea exists, the session is a temporary, unsaved one; the first message creates the game folder (named after it), tempi moves the session there with `switchSession(..., { cwdOverride })`, and builds. The chat may restart at the move and show the idea again: user, round 2.
- No idea and no `--target` gives a web game; the target stays a flag: recommendation, not contested in round 2.
- All of pi's commands stay for now; hiding any is part of the customization work: recommendation, not contested in round 2.
- The only customization in this feature is a status line with the target and the game's location: recommendation, not contested in round 2.

## Assumptions

- `InteractiveMode` works on a runtime whose factory uses tempi's `DefaultResourceLoader` with `noExtensions` (as `createAgentSessionFromServices` allows): confirmed in the spike (step 1).
- The user's pi settings (theme, keybindings) apply in tempi's TUI as in pi: confirmed for the theme in the spike; keybindings and `/login` are pi's own code paths, not re-verified individually.

## Open questions

Blocking:

None.

Non-blocking:

None.

## Acceptance criteria

Proposed; agreed when the plan is approved.

- [x] `tempi "<idea>"` opens pi's interactive interface in a new game workspace, builds the game from the idea, checks it, and opens it, on both targets. (Verified for web by the TUI smoke test with the real check; Godot shares the loop, target, and runtime, covered by its plain e2e test and `session.test.ts`.)
- [x] `tempi` with no idea opens the interface; the first message creates the game folder and builds that idea. (TUI smoke test; a live run of the same wiring in the spike.)
- [x] A change typed in the editor produces a new playable version, and the game restarts; a question that changes no files does not restart it.
- [x] `/play` and `/check` work, and a status line shows the target and where the game runs. (Commands in `loop.test.ts`; the status line sets through `ctx.ui.setStatus`, seen in the spike.)
- [x] `tempi --plain "<idea>"`, and any run with piped input, works as the plain loop does today. (`plain.test.ts`; the e2e tests run the same code path.)
- [x] tempi's tools, bundled packages, MCP servers, and system prompt are active in the TUI session; the user's own pi extensions are not loaded (ADR 0005). (`session.test.ts`, spike.)
- [x] `/model`, `/login`, interrupt, and session history work as in pi. (They come from `InteractiveMode` itself; the smoke test exercises the session/prompt path. Not each verified live — noted below.)
- [x] Tests cover the loop extension through a session with a scripted model, and run in CI without API keys.

## Implementation steps

1. Spike (throwaway): run `InteractiveMode` on a runtime built from tempi's resource loader in a temp workspace; confirm tools, MCP, no user extensions, project trust behavior, `/new` rebuild, and moving a session to a new folder with `switchSession(..., { cwdOverride })`. Done 2026-11-11, two scripts outside the repo. Results:
   - `InteractiveMode` runs on an `AgentSessionRuntime` whose factory uses tempi's `DefaultResourceLoader` (`noExtensions`, bundled packages, codemode/tool-search, extra inline factories): the bundled tools and packages load, the user's own extensions don't.
   - The session move works better through `runtime.newSession({ withSession })` than `switchSession`: `newSession` keeps the runtime's cwd, so the factory maps the lobby cwd to the game folder; `withSession`'s `sendUserMessage` starts the build in the new session. The user's first message is swallowed by an `input` handler (`{ action: "handled" }`) and re-sent as the build prompt, so the chat restarts at the move, as the plan said it might.
   - Project trust: `hasTrustRequiringProjectResources` lists `settings.json` under `.pi` — tempi's workspace settings file. tempi's settings manager is created with `projectTrusted: true`, so no trust prompt appears.
   - pi's theme and settings come from the runtime's settings manager; the user's theme applies.
   - pi's interactive loop only ends with the process (`process.exit` in its shutdown path), so a host cannot `await mode.run()`; it stops the TUI and disposes the runtime instead. Found again when writing the TUI smoke test; recorded here.
   - Startup noise: pi-subagents' prompts loaded twice (package root plus manifest prompt paths, per ADR 0005's clause) and pi listed the collisions as skipped at startup. Seen again live by the user; fixed after the plan's steps by loading packages through their root only — [ADR 0009](../adr/0009-load-bundled-packages-through-their-root-only.md).
2. Session runtime factory: `src/session.ts`. Done 2026-11-11: `createTempiRuntime` creates an `AgentSessionRuntime` whose factory builds tempi's session per workspace (prepare, settings `projectTrusted`, resource loader, tempi's system prompt with the target's rules, `check_game`/`save_asset` via `customToolsFor`, model check, pi-subagents child registration tracked and released on dispose); `createTempiSession` stays for the plain front end, and both share the loader options. Before the idea is known the session runs in-memory in a lobby directory; a resumed session's own cwd wins over the lobby.
3. Prompts: change guidance and asset generators into the system prompt; remove `changePrompt`: `src/prompts/`. Done 2026-11-11: the system prompt carries the target's rules and how to work (first-build rule, question rule, check rule); the asset guidance — which depends on which MCP servers connected — is appended per turn by the loop's `before_agent_start` handler; `changePrompt` and `buildPrompt` are gone and messages reach the agent as typed.
4. Loop extension: scaffold, first message as the idea, post-turn check and fix rounds (skipped when no files changed), run/restart, `/play` and `/check`: `src/loop.ts`. Done 2026-11-11: `createTempiLoop` is an inline extension; the first `input` in the lobby creates the game folder (`chooseWorkspace` + `prepareWorkspace` + scaffold) and moves the session (`runtime.newSession` + `sendUserMessage`); tempi's check and fix rounds run in `agent_before_settle` (a fix round is a `custom_message` entry with `continue`, shown in the chat); the game starts or restarts in `agent_settled`, only when the turn changed files (`scanWorkspace` mtimes, `.tempi`/`.pi`/`.git`/`node_modules` ignored); `session_shutdown` stops the game when the session is replaced or quits. The old sequential loop lives on as `runPlainCoCreation` in `src/plain.ts` for `--plain` and piped input, with raw messages and the same fix rounds.
5. CLI: start the runtime and `InteractiveMode`; the idea becomes optional; `--plain`, and plain mode when stdin is not a terminal: `src/cli.ts`, `src/cli-args.ts`. Done 2026-11-11: prerequisites are checked once in `main`; with an idea (or `--out`) the workspace is scaffolded before the session starts and the idea becomes the TUI's `initialMessage`; without one the session waits in a lobby temp folder until the first message; plain mode keeps the old readline loop and progress printer; `--plain` and a non-TTY stdin choose it.
6. Tests: loop and e2e tests drive the extension; plain mode keeps its e2e test. Done 2026-11-11: `src/loop.test.ts` drives the extension's state machine through a scripted extension host (idea creates the folder, fix rounds as entries, change restarts, question doesn't, `/play`, `/check`, shutdown stops the game, scan helpers); `src/plain.test.ts` covers the plain loop; `src/tui-smoke.test.ts` runs the real `InteractiveMode` on a fake terminal with the faux model and the real web target and Chrome check (idea → build → question without restart → change with restart, session file in the workspace); `src/e2e.testutil.ts`/`e2e.test.ts` moved to `runPlainCoCreation` unchanged in behavior; `session.test.ts` gained a runtime test (lobby → game folder, unsaved → persisted, tempi tools and prompt in the replaced session).
7. Docs: README, PROJECT.md, ADR 0002 status. Done 2026-11-11: README status and usage rewritten for the chat front end (default, `--plain`, piped input, `/play`, `/check`, raw messages, lobby session); PROJECT.md's front end row and open question now point at ADR 0008; ADR 0002 marked superseded (done when ADR 0008 was accepted).

## Refinement log

| Round | Question | Answer |
| --- | --- | --- |
| 0 | Plain CLI or pi's interface? | pi's interface, customized later. |
| 1 | Keep the plain mode? | Yes, as `--plain` and for piped input. |
| 1 | Does tempi still check and restart the game after each turn? | Yes, plus `/play` and `/check`. |
| 1 | Typed messages wrapped or raw? | Raw; the guidance moves to the system prompt. |
| 1 | Starting points? | `tempi` with no idea: the first message is the idea. |
| 2 | Where does the session live before the idea exists? | (a) A temporary session, moved to the game folder after the first message. |
| 2 | ADR 0008 verdict? | Accepted. |
| 2 | Target prompt, command hiding, first customization, reopening games | Recommendations stand: flag only, hide nothing, a status line, reopening out of scope. |
