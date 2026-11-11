# 0005. Bundle pi packages as pinned npm dependencies loaded by tempi

Date: 2026-11-11

## Status
Accepted

From [the bundled pi packages plan](../plans/bundled-pi-packages.md).

## Context
tempi's agent needs capabilities that exist as third-party pi packages (extensions, skills, prompts): web access and subagents (MCP stays on pi's built-in support, [ADR 0003](0003-mcp-through-pis-built-in-mcp-support.md)). A pi package is normally installed by the user with `pi install`, which writes it to `~/.pi/agent/settings.json` (or `.pi/settings.json` for a trusted project), and pi installs it with npm when it starts. tempi creates its sessions through the SDK with a `DefaultResourceLoader` ([ADR 0004](0004-load-pis-mcp-extensions-in-tempi-sessions.md)), which takes `additionalExtensionPaths`, `additionalSkillPaths`, and `additionalPromptTemplatePaths`. These packages ship TypeScript sources as their `pi` entry points, which pi's extension loader handles and a plain Node `import` from `node_modules` does not. With `noExtensions` (and `noSkills`, `noPromptTemplates`), the loader skips the packages and extensions in the user's pi settings but still loads the `additional*Paths` and the inline `extensionFactories` (read in `dist/core/resource-loader.js`, pi 1.5.2).

## Decision
We will add each bundled pi package to tempi's `dependencies` at an exact version, and load it into tempi's sessions by resolving its package root from tempi's `node_modules` and passing that root to `DefaultResourceLoader` (`additionalExtensionPaths`, plus the skill and prompt paths its `pi` manifest declares). The list of bundled packages lives in one module, `src/packages.ts`. A package is only bundled if it declares the `@earendil-works/*` host packages and `typebox` as peer dependencies, never as dependencies.

tempi's sessions load only what tempi ships: the loader is created with `noExtensions`, `noSkills`, and `noPromptTemplates`, so the user's own installed pi packages, extensions, skills, and prompts are not loaded. The user's pi configuration files (models, auth, `mcp.json`, and the bundled packages' own config such as `web-search.json`) are still read.

## Consequences
- tempi and its packages are tested and shipped together: the lockfile and CI pin what a user gets, and an upgrade is a reviewed dependency bump.
- Nothing is written to the user's pi settings; tempi needs no npm install at start and works offline.
- Peer dependencies resolve to tempi's single copy of the pi SDK, so extension classes and registries are shared, not duplicated.
- tempi carries the packages' dependency trees (the two in the plan add roughly 41 MB of source before their own dependencies) and their security surface: each bump needs a read of the changelog and diff.
- Loading by path follows pi's package discovery rules; if a package's `pi` manifest changes shape, tempi's loading code follows.
- A package the user also installed with `pi install` is not loaded twice, and tempi's sessions behave the same on every machine.
- A user's own pi extensions and skills do not reach tempi's agent; adding a way to opt them in later is a new decision.
- The bundled packages still share the user's pi config files, tokens, and caches with the user's own pi.

Rejected alternatives:

- `pi install` (or writing `packages` into the user's `settings.json`) at first run: changes the user's normal pi sessions, installs at startup (fails offline), and leaves versions to the user's machine.
- Declaring the packages in a per-game workspace `.pi/settings.json`: loads only after project trust is granted and still installs at runtime.
- Loading the user's installed pi packages alongside the bundled ones: more capability, but double loading and conflicts when they overlap, and behavior that differs per machine.
- Importing each package's extension factory into `extensionFactories`: typed and simple, but these packages export TypeScript entry points that Node cannot import from `node_modules`, so it would need a build step or loader hook in tempi.
