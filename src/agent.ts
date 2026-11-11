import { type AgentSession, type AgentSessionEvent, type ExtensionError, getAgentDir, type ModelRuntime } from "@earendil-works/pi-coding-agent";
import { configuredMcpServerCount, waitForAssetGenerators } from "./assets.js";
import type { StartedAgent } from "./loop.js";
import { createTempiSession } from "./session.js";
import { createCheckGameTool } from "./targets/check-tool.js";
import type { Target } from "./targets/target.js";
import { createSaveAssetTool } from "./tools/save-asset.js";

export interface StartTempiAgentOptions {
  target: Target;
  workspace: string;
  /** pi's agent directory. Default: the user's, ~/.pi/agent. */
  agentDir?: string;
  modelRuntime?: ModelRuntime;
  model?: NonNullable<AgentSession["model"]>;
  thinkingLevel?: AgentSession["thinkingLevel"];
  /** Connect the MCP servers from pi's mcp.json (asset generators). Default true. */
  mcp?: boolean;
  /** Every session event, for progress output. */
  onEvent?: (event: AgentSessionEvent) => void;
  /** Called once the session runs, with the model and extension problems. */
  onStart?: (info: { model?: string; extensionErrors: ExtensionError[] }) => void;
}

/**
 * Starts tempi's agent for the co-creation loop: a tempi session with the
 * target's check_game and save_asset tools, after the configured MCP servers
 * have connected so the prompts can name them.
 */
export async function startTempiAgent(options: StartTempiAgentOptions): Promise<StartedAgent & { session: AgentSession }> {
  const { target, workspace } = options;
  const agentDir = options.agentDir ?? getAgentDir();
  const tempi = await createTempiSession({
    workspace,
    agentDir,
    modelRuntime: options.modelRuntime,
    model: options.model,
    thinkingLevel: options.thinkingLevel,
    mcp: options.mcp,
    customTools: [createCheckGameTool(target, workspace), createSaveAssetTool(workspace)],
  });
  try {
    const active = tempi.session.model;
    options.onStart?.({ ...(active ? { model: `${active.provider}/${active.id}` } : {}), extensionErrors: tempi.extensionErrors });
    // pi connects MCP servers in the background; wait for them so the prompts can name them.
    const assetGenerators =
      options.mcp === false ? [] : await waitForAssetGenerators(() => tempi.session.getAllTools(), configuredMcpServerCount(agentDir));
    const unsubscribe = options.onEvent ? tempi.session.subscribe(options.onEvent) : () => {};
    return {
      session: tempi.session,
      agent: { prompt: (text) => tempi.session.prompt(text) },
      assetGenerators,
      dispose() {
        unsubscribe();
        tempi.dispose();
      },
    };
  } catch (error) {
    tempi.dispose();
    throw error;
  }
}
