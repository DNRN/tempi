import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ToolInfo } from "@earendil-works/pi-coding-agent";

/** An MCP server the agent can generate assets with. */
export interface AssetGenerator {
  /** The server's name in pi's `mcp.json`, such as `comfyui`. */
  name: string;
  /** Its `description` from `mcp.json`, when it has one. */
  description?: string;
  /** How many tools it offers. */
  tools: number;
}

/** Groups the session's MCP tools by server (`mcp__<server>__<tool>`). */
export function listAssetGenerators(tools: readonly Pick<ToolInfo, "name" | "namespace">[]): AssetGenerator[] {
  const servers = new Map<string, AssetGenerator>();
  for (const tool of tools) {
    const namespace = tool.namespace;
    if (!namespace?.name.startsWith("mcp__") || !tool.name.startsWith("mcp__")) continue;
    const name = namespace.aliases?.[0] ?? namespace.name.slice("mcp__".length);
    const server = servers.get(namespace.name) ?? { name, ...(namespace.description ? { description: namespace.description } : {}), tools: 0 };
    server.tools += 1;
    servers.set(namespace.name, server);
  }
  return [...servers.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * How many enabled servers the user's global `mcp.json` configures, so tempi
 * knows how many to wait for. Undefined when the file can't be read: then the
 * wait runs to its timeout.
 */
export function configuredMcpServerCount(agentDir: string): number | undefined {
  const file = path.join(agentDir, "mcp.json");
  if (!existsSync(file)) return 0;
  try {
    const text = readFileSync(file, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // pi accepts comments in mcp.json.
      parsed = JSON.parse(text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""));
    }
    const servers = (parsed as { mcpServers?: Record<string, { enabled?: boolean }> }).mcpServers ?? {};
    return Object.values(servers).filter((server) => server?.enabled !== false).length;
  } catch {
    return undefined;
  }
}

/**
 * Waits until the MCP servers have registered their tools: pi connects them
 * in the background after the session starts. Returns as soon as `expected`
 * servers are there, or when none are expected; otherwise at the timeout,
 * with whatever has connected.
 */
export async function waitForAssetGenerators(
  getTools: () => readonly Pick<ToolInfo, "name" | "namespace">[],
  expected: number | undefined,
  timeoutMs = 15_000,
  pollMs = 250,
): Promise<AssetGenerator[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const generators = listAssetGenerators(getTools());
    if (expected === 0 || (expected !== undefined && generators.length >= expected) || Date.now() >= deadline) return generators;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
