import {
  type AgentSession,
  createAgentSession,
  createCodemodeExtension,
  createMcpExtension,
  createToolSearchExtension,
  DefaultResourceLoader,
  type ExtensionError,
  getAgentDir,
  type ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { registerRequiredChildExtensions } from "pi-subagents/required-child-extensions";
import { type BundledResources, bundledResources } from "./packages.js";
import { TEMPI_SYSTEM_PROMPT } from "./prompts/system.js";
import { prepareWorkspace, sessionDir } from "./workspace.js";

type SessionModel = NonNullable<AgentSession["model"]>;

export interface TempiSessionOptions {
  /** The game's workspace directory; created if missing. */
  workspace: string;
  /** pi's agent directory (models, auth, mcp.json). Default: the user's, ~/.pi/agent. */
  agentDir?: string;
  modelRuntime?: ModelRuntime;
  /** Model to use. Default: pi's settings, else the first available. */
  model?: SessionModel;
  /** Default: a persistent session in the workspace's `.tempi/sessions`. */
  sessionManager?: SessionManager;
  /** Default: the packages tempi ships. */
  resources?: BundledResources;
}

export interface TempiSession {
  session: AgentSession;
  /** Errors extensions reported while starting (an MCP server that failed to connect, for example). */
  extensionErrors: ExtensionError[];
  dispose(): void;
}

/** No model is available: pi has no credentials for any model tempi can load. */
export class NoModelError extends Error {
  constructor(detail?: string) {
    super(
      "No model is available to tempi. Log in to a provider with `pi` (/login) or set a provider API key. " +
        "tempi does not load your own pi extensions, so a provider an extension adds is not available here." +
        (detail ? ` (${detail})` : ""),
    );
    this.name = "NoModelError";
  }
}

/**
 * Creates tempi's agent session in a game workspace: pi's MCP, codemode, and
 * tool-search extensions (ADR 0004) plus the bundled pi packages, and nothing
 * from the user's own pi setup but its configuration files (ADR 0005).
 */
export async function createTempiSession(options: TempiSessionOptions): Promise<TempiSession> {
  const { workspace } = options;
  const agentDir = options.agentDir ?? getAgentDir();
  const resources = options.resources ?? bundledResources();
  prepareWorkspace(workspace);

  const resourceLoader = new DefaultResourceLoader({
    cwd: workspace,
    agentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    additionalExtensionPaths: resources.extensionPaths,
    additionalSkillPaths: resources.skillPaths,
    additionalPromptTemplatePaths: resources.promptPaths,
    extensionFactories: [createCodemodeExtension(), createToolSearchExtension(), createMcpExtension()],
    appendSystemPrompt: [TEMPI_SYSTEM_PROMPT],
  });
  await resourceLoader.reload();
  const loadErrors = resourceLoader.getExtensions().errors;
  if (loadErrors.length > 0) {
    throw new Error(`Bundled pi extensions failed to load: ${loadErrors.map((e) => `${e.path}: ${e.error}`).join("; ")}`);
  }

  const { session, modelFallbackMessage } = await createAgentSession({
    cwd: workspace,
    agentDir,
    modelRuntime: options.modelRuntime,
    model: options.model,
    resourceLoader,
    settingsManager: SettingsManager.create(workspace, agentDir),
    sessionManager: options.sessionManager ?? SessionManager.create(workspace, sessionDir(workspace)),
  });
  // With no usable model pi keeps a placeholder, so check for credentials. A model
  // the caller passed is taken as is.
  const model = session.model;
  if (!options.model && (!model || !session.modelRuntime.hasConfiguredAuth(model.provider))) {
    session.dispose();
    throw new NoModelError(modelFallbackMessage);
  }

  // Foreground subagent children never load the parent's extensions; this is
  // how they get web access. MCP is left out on purpose: assets stay with the main agent.
  let childRegistration: ReturnType<typeof registerRequiredChildExtensions> | undefined;
  const extensionErrors: ExtensionError[] = [];
  try {
    childRegistration = registerRequiredChildExtensions({
      sessionId: session.sessionId,
      extensions: resources.childExtensions,
    });
    // Emits session_start, which connects the MCP servers in the background.
    await session.bindExtensions({ onError: (error) => extensionErrors.push(error) });
  } catch (error) {
    childRegistration?.dispose();
    session.dispose();
    throw error;
  }
  const registration = childRegistration;

  let disposed = false;
  return {
    session,
    extensionErrors,
    dispose() {
      if (disposed) return;
      disposed = true;
      registration.dispose();
      session.dispose();
    },
  };
}
