# Plan: Vertical slice of the co-creation loop

**Status.** Ready

## Source

- Described by Dennis in chat, 2026-11-10: "a plan for running a vertical slice. For assets generation I would like to use the different MCP services which should be added with the MCP command as normally done in pi."
- [PROJECT.md](../../PROJECT.md), first milestone and success criteria.

## Summary

The thinnest end-to-end version of tempi's loop: a one-line idea goes in, the pi agent builds a playable game, the user plays it, asks for one change, and plays the new version, with no hand-editing of generated code. The slice covers both targets, web (HTML5) and Godot, behind a plain CLI. Game assets (images and sprites, sound effects, 3D models) are generated through MCP services. tempi bundles no asset service of its own: the user adds MCP servers with pi's own MCP command, and tempi's agent uses whatever is configured.

## Type

New capability. The repository holds only docs and skills; this is the first code.

## Benefits

- The author learns whether the loop works hands-off, which is the project's success criterion. We know by running the slice on a fixed idea and counting manual fixes (target: zero).
- The riskiest integrations (pi SDK session, MCP tools inside that session, getting generated asset files into the game) are proven before anything is built on them.

## Impact

- Code: everything is new. `package.json`, TypeScript config, `src/`, tests, CI workflow.
- Interfaces and data: a `tempi` command; a per-game workspace directory on disk (game code, `assets/`, the pi session file).
- Tests: none exist. Unit tests for the harness, plus one end-to-end smoke test with a stubbed model and a stub MCP server so CI needs no API keys.
- Docs: PROJECT.md (technical direction rows for front end, pi version, assets; three open questions close), a README with setup including `pi mcp add`.

## Deprecations

None. Nothing exists to replace.

## Risks and quirks

- **pi version.** `pi mcp add | remove | list` exists from pi 0.99. The author's pi was upgraded from 0.85.1 to 1.5.2 on 2026-11-10, and the SDK is pinned at 1.5.2.
- **MCP in SDK sessions needs explicit loading.** pi's SDK docs say SDK sessions do not load the built-in MCP, `codemode`, and `tool_search` extensions; tempi adds them through the resource loader ([ADR 0004](../adr/0004-load-pis-mcp-extensions-in-tempi-sessions.md)). Known from the docs and the bundled example; step 2 confirms it with a real server.
- **Asset bytes must reach the disk.** MCP image and audio tools return a URL, base64 content, or a job id, depending on the service. The agent needs a dependable way to save the result into the game's `assets/`. Handled by a tempi tool that saves MCP output to a file, plus prompt guidance.
- **No MCP server configured.** The loop must still finish: the agent falls back to code-drawn placeholders and tempi says so.
- **Cost and latency.** Generation services bill per asset and can take minutes. The slice caps assets per game in the system prompt.
- **Godot is not on this machine's PATH.** The Godot half of the slice cannot run here until Godot 4 is installed; tempi checks for `godot` at start and says how to get it.
- **Two targets roughly double the slice.** Each needs its own build prompt, playable check, and acceptance run. Steps are ordered so web is complete before Godot starts, and the shared parts (session, MCP, asset saving, CLI) are built once.
- **3D is the hardest part of the slice.** A 3D game is harder for the agent to get right than 2D, and model generation is the slowest and costliest asset kind. It is limited to the Godot target and to one small fixed idea.
- **Three asset kinds, three file shapes.** Images (PNG), audio (WAV/OGG/MP3), and models (GLB) each need import handling per target: Godot imports assets on first headless run; web needs loaders.
- **Verifying "playable" without a human.** The agent needs a check it can run itself (load the game headlessly, fail on console errors) or it will hand over broken builds.

## Decisions

- Assets come only from user-configured MCP servers, added with `pi mcp add`; tempi ships no asset-service integration: stated in the request.
- The slice covers both targets, web and Godot: user, round 1. Matches the first milestone in PROJECT.md.
- The front end for the slice is a plain CLI: user, round 1. [ADR 0002](../adr/0002-plain-cli-front-end-for-the-vertical-slice.md).
- MCP goes through pi's built-in `pi mcp add`; pi is upgraded to 1.x and the SDK pinned there: user, round 1. [ADR 0003](../adr/0003-mcp-through-pis-built-in-mcp-support.md).
- Asset kinds in the slice: images/sprites, sound effects, 3D models. Music is out: user, round 1.
- The target is chosen per game with a `--target web|godot` flag; the agent choosing the engine stays later work: user, round 2.
- 3D games and generated 3D models apply to the Godot target only; web stays 2D with sprites and sound effects: user, round 2.
- Acceptance runs: web 2D, "a cat catches falling fish"; Godot 3D, "roll a ball through a small obstacle course": user, round 2.
- tempi's sessions load pi's MCP, codemode, and tool-search extensions through the resource loader: [ADR 0004](../adr/0004-load-pis-mcp-extensions-in-tempi-sessions.md), Proposed.

## Assumptions

- The model and provider come from the user's existing pi configuration (here: OpenRouter): confirm with the user.
- The slice is single-user and local; no packaging or distribution.

## Open questions

Blocking:

None.

Non-blocking:

1. Which MCP services will the author add first? The plan does not depend on it, but the README example and the acceptance runs do.

## Acceptance criteria

Proposed; agreed when the plan is approved.

- [ ] `tempi "<one-line idea>"` produces a game in a fresh workspace and starts it; the game is playable. Holds for the web target (opens in the browser) and the Godot target (runs with the system `godot`).
- [ ] `tempi --target web|godot` selects the target.
- [ ] With MCP servers added through `pi mcp add`: the web run ("a cat catches falling fish") uses at least one generated sprite and one generated sound effect, and the Godot run ("roll a ball through a small obstacle course") uses at least one generated 3D model, all stored under the workspace's `assets/`.
- [ ] With no MCP server configured, the loop still completes with placeholder art, and tempi says assets were skipped.
- [ ] One typed change request produces a new playable version in the same workspace, on each target.
- [ ] Neither step needs a manual edit of generated code.
- [ ] Tests run in CI on push without API keys.

## Implementation steps

1. Scaffold: `package.json`, TypeScript, test runner, CI workflow, pi SDK pinned at 1.5.2; local pi CLI upgraded to match. Done 2026-11-10.
2. Spike (throwaway, outside the repo): an SDK session built as ADR 0004 describes calls a tool from a server added with `pi mcp add`, and saves a binary result to disk. Record the result here.
3. Session core: create the pi session in a per-game workspace, with tempi's system prompt and the model from pi's settings: `src/session.ts`.
4. Target interface: what a target supplies (build prompt, playable check, run command), so web and Godot plug into one loop: `src/targets/`.
5. Asset tool: saves MCP output (URL or base64; image, audio, or model) into `assets/`: `src/tools/save-asset.ts`.
6. Web target: build prompt, headless check that returns console errors, open in browser: `src/targets/web.ts`.
7. CLI loop: idea → build → run the game → read a change request → rebuild → rerun: `src/cli.ts`. The web half of the slice is complete here.
8. Godot target: `godot` detection, project template, headless import and run that returns script errors, run windowed for the user: `src/targets/godot.ts`.
9. Asset guidance in the prompts: use MCP tools when present, placeholders otherwise, a cap on assets per game, per-target import notes for images, audio, and models: `src/prompts/`.
10. Tests: unit tests per module; an end-to-end smoke test per target with a stubbed model and a stub MCP server (the Godot one skipped where `godot` is absent, installed in CI).
11. Docs: README (setup, `pi mcp add` example), PROJECT.md updates.
12. Acceptance runs on the fixed ideas, per target, with and without MCP servers; record manual fixes needed (target: zero).

## Refinement log

| Round | Question | Answer |
| --- | --- | --- |
| 1 | Which game target does the slice cover? | Both web and Godot. |
| 1 | Which front end? | Plain CLI. |
| 1 | Which asset kinds through MCP? | Images/sprites, sound effects, 3D models. Not music. |
| 1 | Which MCP route? | pi's built-in `pi mcp add`; upgrade pi to 1.x. |
| 2 | How is the target chosen per game? | A `--target` flag taking `web` or `godot`. |
| 2 | Where do 3D models apply? | Godot only; web stays 2D. |
| 2 | Which tracker? | GitHub issues. No remote exists yet. |
| 2 | Are the proposed acceptance runs right? | Yes. |
