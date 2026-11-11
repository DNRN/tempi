# 0006. MCP servers through the pi-mcp-extension package

Date: 2026-11-11

## Status
Rejected: the user chose to keep pi's built-in MCP for now (round 1 of the plan, 2026-11-11); ADR 0003 and 0004 stand.

From [the bundled pi packages plan](../plans/bundled-pi-packages.md). Supersedes [0003](0003-mcp-through-pis-built-in-mcp-support.md), and the MCP part of [0004](0004-load-pis-mcp-extensions-in-tempi-sessions.md) (`createMcpExtension()`); 0004's codemode and tool-search extensions are unchanged.

## Context
ADR 0003 chose pi's built-in MCP extension; ADR 0004 loads it into tempi's sessions with `createMcpExtension()`. Neither has been run in tempi yet (the vertical-slice spike, step 2, is still open). The user asked on 2026-11-11 to ship [`pi-mcp-extension`](https://github.com/irahardianto/pi-mcp-extension) (MIT, 1.15.0) with tempi to enable MCP access.

pi-mcp-extension replaces the built-in: its README asks pi CLI users to disable `builtin:mcp`. It reads the same `~/.pi/agent/mcp.json` and trusted-project `.pi/mcp.json`, accepts pi 1.x schema aliases, and adds OAuth 2.1 (PKCE, dynamic client registration), lazy or eager server lifecycles, reconnection, and agent tools `mcp_status`, `mcp_connect`, `mcp_list_resources`, `mcp_read_resource`. It ignores pi's `exposure` setting and registers each server's tools as direct tools.

## Decision
We will reach MCP servers through pi-mcp-extension, bundled as [ADR 0005](0005-bundle-pi-packages-as-pinned-npm-dependencies.md) describes, and stop loading `createMcpExtension()` in tempi's sessions (`disabledBuiltinExtensions: ["mcp"]`). Servers stay configured in pi's `mcp.json` files.

## Consequences
- OAuth-protected servers, lazy connection, and MCP resources become available to tempi's agent.
- MCP tools reach the model as direct tools, not through codemode: every connected server's tool schemas sit in the context, and a tool's full result (base64 images, audio, models) comes back to the model unless the agent calls it from a codemode script. The vertical slice's asset-saving design (ADR 0004's consequence) has to work with that.
- Lazy servers (the default) are not connected until the agent calls `mcp_connect`; the prompts have to say so, or servers have to be set `eager`.
- tempi depends on a single-maintainer package (11 stars on 2026-11-11) for a core path of the slice, and tracks its releases.
- Not verified: that `pi mcp add` writes entries pi-mcp-extension accepts unchanged, and that it runs in an SDK session as it does in the CLI. The plan's spike checks both.

Rejected alternatives:

- Keep pi's built-in MCP (ADR 0003 and 0004 unchanged): no extra dependency, honours `exposure` so tools stay behind codemode, and is maintained with pi; lost because the user asked for pi-mcp-extension. Recommended in the plan's first round if the built-in covers what the user needs.
- Load both: they register overlapping tools and commands, and pi warns when both are enabled.
