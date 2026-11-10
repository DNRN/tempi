# 0004. Load pi's MCP, codemode, and tool-search extensions in tempi's sessions

Date: 2026-11-10

## Status
Proposed

## Context
[ADR 0003](0003-mcp-through-pis-built-in-mcp-support.md) decided that tempi reaches MCP servers through pi's built-in support, and left open how a session created through the SDK loads them. pi 1.5.2's SDK documentation (`docs/sdk.md`, "Codemode and MCP", and `examples/sdk/14-codemode-mcp.ts`) answers it: the CLI loads MCP, `codemode`, and `tool_search` as built-in extensions, and SDK sessions do not. An SDK session adds them through the resource loader. By default a server's tools are reachable only from `codemode` scripts; servers set to `deferred` exposure need `tool_search`.

## Decision
We will create tempi's sessions with a `DefaultResourceLoader` whose `extensionFactories` hold `createMcpExtension()`, `createCodemodeExtension()`, and `createToolSearchExtension()`, and call `session.bindExtensions()` so the servers connect. `createMcpExtension()` reads the same `mcp.json` files as the CLI, so servers added with `pi mcp add` work unchanged, with whatever exposure the user configured.

## Consequences
- Every exposure mode a user can configure (`codemode`, `deferred`, `direct`) works in tempi as it does in the pi CLI.
- With the default exposure, the agent calls asset services from codemode scripts. Those scripts receive the complete tool result, so a script can write image, audio, or model data to the workspace itself; tempi's asset-saving helper has to be usable from there.
- tempi follows pi's extension API for these three factories; a change to them in a later pi version is tempi's to track.
- Taken from the documentation and the bundled example, not yet run in tempi: the plan's spike confirms it with a real server.

Rejected alternatives:

- Loading only the MCP extension: servers with the default `codemode` exposure would connect but their tools would be unreachable.
- Driving the `pi` CLI as a subprocess (RPC mode) to get the built-ins for free: contradicts the technical direction in PROJECT.md, which has tempi drive the agent through the SDK.
