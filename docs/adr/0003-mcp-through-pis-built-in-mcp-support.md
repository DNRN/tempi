# 0003. MCP servers through pi's built-in MCP support

Date: 2026-11-10

## Status
Accepted

Decided by the user in round 1 of [the vertical-slice plan](../plans/vertical-slice.md).

## Context
tempi generates game assets (images, sound effects, 3D models) through MCP services that the user configures; tempi bundles no asset service. pi had no MCP support before 0.99. From 0.99 it has a built-in MCP extension with `pi mcp add | remove | list`, storing servers in `~/.pi/agent/mcp.json` (global) or `.pi/mcp.json` (project). The author's machine ran pi 0.85.1 when this was decided; the latest release was 1.5.2.

## Decision
We will reach MCP servers through pi's built-in MCP support. Users add servers with `pi mcp add`, as in any pi setup, and tempi's agent sessions use the servers configured there. tempi depends on the pi SDK at 1.x and needs a pi CLI of the same major version.

## Consequences
- A user who already uses pi with MCP has nothing extra to set up, and tempi has no MCP configuration format of its own.
- tempi cannot run on pi versions before 0.99; the author's pi must be upgraded.
- tempi inherits how built-in MCP exposes tools to the model and how it handles sign-in. If that proves a poor fit for asset generation, this ADR is superseded.
- Not verified when written: that a session created through the SDK loads the built-in MCP extension and the configured servers the way the CLI does. The plan's spike checks this; how the servers are loaded into SDK sessions gets its own ADR after it.

Rejected alternatives:

- The `pi-mcp-adapter` extension (`pi install npm:pi-mcp-adapter`, servers in `.mcp.json`, managed with `/mcp`): works on older pi and exposes tools through one proxy tool, but it adds a third-party dependency and turns pi's built-in MCP off, which is not "as normally done in pi".
- tempi's own MCP client and configuration: full control, but a second place to configure servers and code that pi already provides.
