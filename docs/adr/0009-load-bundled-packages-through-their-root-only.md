# 0009. Load bundled packages through their root only

Date: 2026-11-11

## Status
Accepted

Supersedes the loading-path clause of [0005](0005-bundle-pi-packages-as-pinned-npm-dependencies.md): "passing that root to `DefaultResourceLoader` (`additionalExtensionPaths`, **plus the skill and prompt paths its `pi` manifest declares**)".

## Context
ADR 0005 loads each bundled pi package by passing its package root to `DefaultResourceLoader` as an extension path, and also passes the skill and prompt paths from the package's `pi` manifest as `additionalSkillPaths`/`additionalPromptTemplatePaths`. But pi loads a package root through its manifest, as `pi install` would: the root already brings the manifest's skills and prompts. Passing them again makes pi discover each one twice, and it reports every duplicate as a collision ("one kept, one skipped") in its startup diagnostics.

With the plain CLI front end (ADR 0002) nobody saw this. pi's interactive front end (ADR 0008) renders startup diagnostics, so every `tempi` start showed a `[Prompt conflicts]` panel with six skipped entries for pi-subagents.

## Decision
We will pass only the package root for a package that has extensions; its skills and prompts load through the root's manifest. A package with no extensions keeps getting its manifest's skill and prompt paths passed directly, as before.

## Consequences
- No duplicate discovery and no collision panel at startup; the `[Skills]` and `[Prompts]` lists stay the same, loaded once.
- Loading relies on pi's package-root loading covering manifest resources; `session.test.ts` asserts the prompts and skills are still there, and the TUI smoke test asserts no collision panel appears.
- A package whose manifest changes shape still surfaces through the same checks as before.

Rejected alternatives:

- Keep passing both and hide the diagnostics: hides a real duplication and fights pi's own reporting.
- Stop passing the root and pass the manifest's paths individually (extensions as files, skills, prompts): loses package-manifest loading semantics that ADR 0005 chose ("as `pi install` would").
