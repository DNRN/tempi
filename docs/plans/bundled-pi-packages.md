# Plan: Bundled pi packages (web access, subagents)

**Status.** Done

## Source

- Described by Dennis in chat, 2026-11-11: "plan a feature for these plugins: pi-mcp-extension, I need to enable mcp access; pi-web-access for web access; and also subagents: pi-subagents". Earlier in the same chat: packages that ship with tempi, loaded as npm dependencies through the SDK rather than `pi install`. Round 1 dropped pi-mcp-extension.
- Repositories read 2026-11-11 (README, `package.json`, selected source):
  - [nicobailon/pi-web-access](https://github.com/nicobailon/pi-web-access) `fed1695`, npm 0.47.0, MIT.
  - [nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents) `c99503a`, npm 0.88.0, MIT.
  - [irahardianto/pi-mcp-extension](https://github.com/irahardianto/pi-mcp-extension) `ee7bd47`, npm 1.15.0, MIT: read, then left out (round 1).
- Not read: the packages' full source and their `docs/` beyond configuration notes.

## Summary

tempi ships two third-party pi packages so its agent has them without the user installing anything: web search and page fetching (pi-web-access) and delegation to child agents (pi-subagents). They are pinned npm dependencies loaded into tempi's SDK sessions, and tempi's sessions load only what tempi ships. MCP stays on pi's built-in support (ADR 0003, 0004). Built as part of the [vertical slice](vertical-slice.md), step 3.

## Type

New capability. tempi's sessions gain tools they do not have; nothing existing changes behavior.

## Benefits

- The agent can look things up while building a game: engine docs (Godot API), library usage, reference material. Known when a build that needs an API lookup succeeds without the user pasting docs.
- The agent can hand bounded jobs to child agents (scouting, review of a build) and keep its own context small. Known when a delegated review in an acceptance run returns findings the parent acts on.

## Impact

- Code: session creation does not exist yet; it is vertical-slice step 3 (`src/session.ts`), and this feature is built there. It adds `src/packages.ts` (the bundled list and path resolution) and uses it in the session's `DefaultResourceLoader`, created with `noExtensions`, `noSkills`, `noPromptTemplates` next to ADR 0004's inline MCP, codemode, and tool-search factories. Inline factories and `additional*Paths` load under those flags (`dist/core/resource-loader.js`, pi 1.5.2). `src/cli.ts` only prints the version today.
- Dependencies: two new runtime dependencies, exact versions. Their own trees include `@modelcontextprotocol/sdk` 1.32.1 (web access's Exa client), `undici`, `jiti`, `yaml`, `acorn`, `defuddle`, `turndown`, `unpdf`. Peer dependencies on `@earendil-works/*` resolve to tempi's pinned 1.5.2; pi-subagents needs `pi-ai >= 1.2.0`.
- Interfaces and data: no tempi flag or format changes. The packages read and write user-level pi files: `web-search.json`, `web-search-cache/`, subagents settings and run artifacts. tempi shares these with the user's own pi. The user's own installed pi packages, extensions, skills, and prompts no longer reach tempi's sessions.
- ADRs: 0003 and 0004 unchanged. [0005](../adr/0005-bundle-pi-packages-as-pinned-npm-dependencies.md) Accepted; [0006](../adr/0006-mcp-through-pi-mcp-extension.md) Rejected.
- Tests: none cover sessions yet. To add: the package list resolves to existing package roots with a `pi` manifest; a session built with the loader registers `web_search`, `fetch_content`, and `subagent` or `subagents_enable`, and none of the user's extensions, with a stubbed model and no network.
- Docs: README (what ships, where its config lives, that web access sends queries to hosted search), PROJECT.md technical direction (bundled packages), the vertical-slice plan (step 3 points here).

## Deprecations

None. pi's built-in MCP stays.

## Risks and quirks

- **Children get web access only through a host registration.** Foreground children never load the parent's extensions, and each agent's `tools` is a strict allowlist. Handled: tempi calls `registerRequiredChildExtensions` (`pi-subagents/required-child-extensions`) with the session id and pi-web-access's entry file; agents that list web tools (`researcher`) then get them (spike, 2026-11-11). Agents that don't list them (`scout`) don't, by design.
- **Background children load the user's pi extensions by default.** The detached runner's children load "ambient" extensions from the user's pi settings (here pi-claude-bridge and pi's built-in MCP) unless `subagents.defaultExtensions` is set. pi-subagents reads that from settings files, not from tempi's in-memory `SettingsManager`, and the capability ceiling's `denyExtensions` rejects launches that have required extensions. Handled: tempi writes `{ "subagents": { "defaultExtensions": [] } }` to the game workspace's `.pi/settings.json`. pi-subagents read it with the workspace untrusted (spike).
- **Children must not get MCP.** Builtin agents list no `mcp:` tools, and with ambient extensions off no MCP code loads in a child (spike). An agent that lists `mcp:` selectors would still get them; tempi ships none.
- **Model providers from the user's extensions are gone.** With `noExtensions`, a provider an extension registers (here pi-claude-bridge's) is not available in tempi's sessions. Built-in providers with `auth.json` credentials work. A user whose only model comes from an extension gets none: tempi should say so at start.
- **pi-subagents ships coding agents** (scout, reviewer, oracle, researcher, …), a skill, and prompts. Used as they are; game-specific agents are a later plan.
- **Shared user config.** `web-search.json`, keys, and caches are the user's pi files; tempi's agent sees the same keys as the user's pi.
- **Web access sends data out.** With no keys it searches through Exa's hosted MCP; fetched page content goes to hosted extractors only on explicit opt-in. Stated in the README.
- **pi-subagents warns on every launch** that `defaultExtensions: []` disables all ambient extensions for the child. That is the intent, but the warning reaches the console. Follow-up when the CLI loop is built (slice step 7): filter it, or list the child extensions explicitly if that keeps workspaces portable.
- **Size and supply chain.** 28 MB for the two packages (11 MB web access, 17 MB subagents); 234 MB `node_modules` together with the pi SDK. Both release often. Each bump is reviewed.
- **Package roots can't be found with `require.resolve("<pkg>/package.json")`**: pi-subagents' `exports` hides it. Handled: walk `require.resolve.paths(name)` for a directory with `package.json`.

## Decisions

- Bundled pi packages are pinned npm dependencies loaded through `DefaultResourceLoader` paths, not `pi install`: user, 2026-11-11 chat. [ADR 0005](../adr/0005-bundle-pi-packages-as-pinned-npm-dependencies.md), Accepted.
- tempi's sessions load only the bundled packages, not the user's installed ones; the user's config files are still read: user, round 1. Part of ADR 0005.
- MCP stays on pi's built-in support for now; pi-mcp-extension is not bundled: user, round 1. [ADR 0006](../adr/0006-mcp-through-pi-mcp-extension.md) Rejected.
- Built as part of vertical-slice step 3, not as a separate change: user, round 1.
- pi-subagents' builtin agents are used as they are; game-specific agents are a later plan: user, round 1.
- Subagent children get web access; MCP stays with the main agent: user, round 1.
- Web access runs zero-config (Exa hosted search) by default and uses keys from the user's `web-search.json` when present: user, round 2.
- No switch to turn a bundled package off for now: user, round 2.

## Assumptions

- The latest npm versions (0.47.0, 0.88.0) are the ones to pin: confirm at install.
- Both packages work under pi SDK 1.5.2 in an SDK session as in the CLI: confirmed by the spike.

## Open questions

Blocking:

None.

Non-blocking:

None.

## Acceptance criteria

Agreed when the plan was approved, round 2.

- [x] `npm ci` installs both packages at exact versions; `npm ls @earendil-works/pi-coding-agent` shows one copy.
- [x] A tempi session registers `web_search`, `fetch_content`, and `subagent` (or `subagents_enable`), with no `pi install` and no change to `~/.pi/agent/settings.json`.
- [x] A pi package the user installed with `pi install` does not load in a tempi session.
- [x] The agent answers a question that needs a web search, in a tempi session.
- [x] The agent runs one foreground subagent and gets its result back; the child has `web_search` and no MCP tools.
- [x] Tests for package resolution and tool registration run in CI without API keys or network.
- [x] README lists what ships and where each package's config lives.

## Implementation steps

Part of vertical-slice step 3; step 1 here runs with the slice's spike (step 2).

1. Spike (throwaway, outside the repo): done 2026-11-11, see [Spike results](#spike-results).
2. Dependencies: add both at exact versions; verify one pi SDK copy: `package.json`, `package-lock.json`.
3. Package list and resolution: `src/packages.ts`, with tests.
4. Session loader: the list in `DefaultResourceLoader` with `noExtensions`, `noSkills`, `noPromptTemplates`; `registerRequiredChildExtensions` for pi-web-access (disposed with the session); the workspace's `.pi/settings.json` with `subagents.defaultExtensions: []`; a clear message when no model is available: `src/session.ts`, `src/workspace.ts`.
5. Prompts: tell the agent when to search the web and when to delegate: `src/prompts/`.
6. Tests: tool registration with a stubbed model, and that a user-installed extension is not loaded.
7. Docs: README, PROJECT.md.

## Spike results

2026-11-11, `/tmp/tempi-spike`, pi SDK 1.5.2, pi-web-access 0.47.0, pi-subagents 0.88.0, model `anthropic/claude-haiku-5-5`.

- Install: one copy of `@earendil-works/pi-coding-agent` and `pi-ai` (`npm ls`); no install scripts in either package.
- Loading: both packages load by path with `noExtensions`, `noSkills`, `noPromptTemplates`, no load errors. Skills `council-mode`, `pi-subagents` and six prompts come with pi-subagents. The user's pi-claude-bridge did not load. ADR 0004's MCP, codemode, and tool-search factories load alongside; the comfyui and blender servers connected with codemode exposure.
- Tools: `web_search`, `fetch_content`, `get_search_content`, `source_check` start behind a `web_enable` loader, `subagent` behind `subagents_enable`; the model called both loaders itself.
- Web search: zero-config, through Exa; found Godot 4.7.2 with its source URL.
- Foreground subagent: `scout` ran and returned; its tools were `read, grep, find, ls, bash, write, contact_supervisor` (no web, no MCP). `researcher` without the host registration failed with "these child tools were unavailable: web_search, …"; with it, it searched and returned a sourced answer.
- Background subagent: `researcher` with `async: true` ran in the detached runner, found tempi's pi SDK, searched the web, and `bg_wait` returned its result. With the workspace setting, its launch record showed `disableAmbientExtensions: true` and only pi-subagents' runtime plus pi-web-access loaded.
- Packages ship compiled JS (`pi-web-access/dist`, `pi-subagents/bundle`), not only TypeScript. ADR 0005's reason for rejecting factory imports ("Node cannot import") is therefore wrong; path loading stays the decision, because it follows each package's `pi` manifest (skills, prompts) without tempi naming entry files.

## Implementation

Built 2026-11-11 with vertical-slice step 3: `src/packages.ts`, `src/workspace.ts`, `src/session.ts`, `src/prompts/system.ts` (short guidance on web lookups and delegation; the full prompts are slice step 9), with tests for each; a test observes the child registration through pi-subagents' own API. A session with no usable model fails with `NoModelError`: pi keeps a placeholder model instead of none, so tempi checks the model's provider for credentials. A live run of `createTempiSession` against the author's pi setup had a `researcher` subagent search the web and return a sourced answer.

## Refinement log

| Round | Question | Answer |
| --- | --- | --- |
| 0 | How are packages that ship with tempi installed? | Pinned npm dependencies loaded through the SDK's resource loader (chat, 2026-11-11). |
| 1 | MCP route: pi-mcp-extension or built-in? | Keep the built-in for now; ADR 0006 rejected, pi-mcp-extension dropped. |
| 1 | Load the user's own pi packages too? | No, only the bundled ones. |
| 1 | Part of the vertical slice or separate? | Part of vertical-slice step 3. |
| 1 | Use pi-subagents' builtin agents as they are? | Yes; game agents later. |
| 1 | Children get web access and MCP? | Web access yes; MCP only for the main agent. |
| 2 | ADR 0005 verdict? | Accepted. |
| 2 | Zero-config web access by default, keys optional? | Yes. |
| 2 | A switch to turn a bundled package off? | No, not now. |
| 2 | Acceptance criteria and plan approval? | Approved; plan Ready. |
