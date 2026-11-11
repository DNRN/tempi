import {
  type AgentSession,
  type AgentSessionRuntime,
  type CreateAgentSessionRuntimeFactory,
  createAgentSession,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  createCodemodeExtension,
  createMcpExtension,
  createToolSearchExtension,
  DefaultResourceLoader,
  type ExtensionError,
  type ExtensionFactory,
  getAgentDir,
  type ModelRuntime,
  type ResourceLoader,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { registerRequiredChildExtensions } from "pi-subagents/required-child-extensions";
import { type BundledResources, bundledResources } from "./packages.js";
import { tempiSystemPrompt } from "./prompts/system.js";
import type { Target } from "./targets/target.js";
import { prepareWorkspace, sessionDir } from "./workspace.js";

type SessionModel = NonNullable<AgentSession["model"]>;

/** What every tempi session is built from, whichever front end drives it. */
export interface TempiSessionOptions {
  /** The game's target; its rules join the system prompt (ADR 0008). */
  target: Target;
  /** The game's workspace directory; created if missing. */
  workspace: string;
  /** pi's agent directory (models, auth, mcp.json). Default: the user's, ~/.pi/agent. */
  agentDir?: string;
  modelRuntime?: ModelRuntime;
  /** Model to use. Default: pi's settings, else the first available. */
  model?: SessionModel;
  thinkingLevel?: AgentSession["thinkingLevel"];
  /** Default: the packages tempi ships. */
  resources?: BundledResources;
  /** Connect the MCP servers from pi's mcp.json. Default true. */
  mcp?: boolean;
}

/** Extra options the plain front end passes to its own session. */
export interface TempiPlainSessionOptions extends TempiSessionOptions {
  /** Default: a persistent session in the workspace's `.tempi/sessions`. */
  sessionManager?: SessionManager;
  /** tempi's own tools for this session, such as the target's `check_game`. */
  customTools?: ToolDefinition[];
}

/** Extra options the interactive front end passes to its session runtime. */
export interface TempiRuntimeOptions extends Omit<TempiSessionOptions, "workspace"> {
  /** The game's workspace, when tempi was started with an idea or `--out`. */
  workspace?: string;
  /** Extra inline extensions, such as tempi's co-creation loop. */
  extensionFactories?: ExtensionFactory[];
  /** tempi's tools for a workspace, such as check_game and save_asset. */
  customToolsFor?: (workspace: string) => ToolDefinition[];
  /** tempi's holding directory for the session before the game folder exists. */
  lobby?: string;
  /** The game workspace once the idea is known; the lobby session moves there. */
  getWorkspace?: () => string | undefined;
}

export interface TempiSessionResult {
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
 * The resource loader tempi's sessions use: pi's MCP, codemode, and tool-search
 * extensions (ADR 0004), the bundled pi packages (ADR 0005), and nothing from
 * the user's own pi setup but its configuration files.
 */
function tempiResourceLoaderOptions(
  options: { mcp?: boolean; target: Target },
  resources: BundledResources,
  factories: ExtensionFactory[],
) {
  return {
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    additionalExtensionPaths: resources.extensionPaths,
    additionalSkillPaths: resources.skillPaths,
    additionalPromptTemplatePaths: resources.promptPaths,
    extensionFactories: [
      createCodemodeExtension(),
      createToolSearchExtension(),
      ...(options.mcp === false ? [] : [createMcpExtension()]),
      ...factories,
    ],
    appendSystemPrompt: [tempiSystemPrompt(options.target)],
  };
}

function throwOnLoadErrors(loader: ResourceLoader): void {
  const errors = loader.getExtensions().errors;
  if (errors.length > 0) {
    throw new Error(`Bundled pi extensions failed to load: ${errors.map((e) => `${e.path}: ${e.error}`).join("; ")}`);
  }
}

/** A model tempi can use, or a NoModelError explaining why there is none. */
function requireModel(session: AgentSession, passed: boolean, fallbackMessage: string | undefined): void {
  const model = session.model;
  if (!passed && (!model || !session.modelRuntime.hasConfiguredAuth(model.provider))) {
    session.dispose();
    throw new NoModelError(fallbackMessage);
  }
}

/**
 * Creates tempi's agent session in a game workspace: pi's MCP, codemode, and
 * tool-search extensions (ADR 0004) plus the bundled pi packages, and nothing
 * from the user's own pi setup but its configuration files (ADR 0005). Binds
 * the extensions itself; the interactive front end uses {@link createTempiRuntime},
 * whose sessions pi's InteractiveMode binds.
 */
export async function createTempiSession(options: TempiPlainSessionOptions & { extensionFactories?: ExtensionFactory[] }): Promise<TempiSessionResult> {
  const { workspace } = options;
  const agentDir = options.agentDir ?? getAgentDir();
  const resources = options.resources ?? bundledResources();
  prepareWorkspace(workspace);

  const resourceLoader = new DefaultResourceLoader({
    cwd: workspace,
    agentDir,
    ...tempiResourceLoaderOptions(options, resources, options.extensionFactories ?? []),
  });
  await resourceLoader.reload();
  throwOnLoadErrors(resourceLoader);

  const { session, modelFallbackMessage } = await createAgentSession({
    cwd: workspace,
    agentDir,
    modelRuntime: options.modelRuntime,
    model: options.model,
    thinkingLevel: options.thinkingLevel,
    resourceLoader,
    customTools: options.customTools,
    settingsManager: SettingsManager.create(workspace, agentDir),
    sessionManager: options.sessionManager ?? SessionManager.create(workspace, sessionDir(workspace)),
  });
  // With no usable model pi keeps a placeholder, so check for credentials. A model
  // the caller passed is taken as is.
  requireModel(session, options.model !== undefined, modelFallbackMessage);

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

/**
 * Creates the session runtime for pi's interactive front end (ADR 0008): the
 * factory builds a tempi session for the game workspace on every session
 * replacement (`/new`, `/resume`, `/fork`), so those keep tempi's tools,
 * prompts, and bundled packages. Before the idea is known, the session runs in
 * tempi's lobby directory, unsaved; pi's InteractiveMode binds each session's
 * extensions, which connects the MCP servers in the background.
 */
export async function createTempiRuntime(options: TempiRuntimeOptions): Promise<AgentSessionRuntime> {
  const agentDir = options.agentDir ?? getAgentDir();
  const resources = options.resources ?? bundledResources();
  let childRegistration: ReturnType<typeof registerRequiredChildExtensions> | undefined;

  const factory: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
    childRegistration?.dispose();
    // The lobby session moves to the game folder once there is one; any other
    // cwd (a resumed session's own folder) wins over the lobby.
    const workspace = options.lobby && cwd === options.lobby ? (options.getWorkspace?.() ?? cwd) : cwd;
    prepareWorkspace(workspace);
    const manager =
      sessionManager && sessionManager.getCwd() === workspace
        ? sessionManager
        : workspace === options.lobby
          ? SessionManager.inMemory(workspace)
          : SessionManager.create(workspace, sessionDir(workspace));

    const services = await createAgentSessionServices({
      cwd: workspace,
      agentDir,
      modelRuntime: options.modelRuntime,
      settingsManager: SettingsManager.create(workspace, agentDir, { projectTrusted: true }),
      resourceLoaderOptions: tempiResourceLoaderOptions(options, resources, options.extensionFactories ?? []),
    });
    throwOnLoadErrors(services.resourceLoader);

    const created = await createAgentSessionFromServices({
      services,
      sessionManager: manager,
      sessionStartEvent,
      model: options.model,
      thinkingLevel: options.thinkingLevel,
      customTools: options.customToolsFor?.(workspace),
    });
    requireModel(created.session, options.model !== undefined, created.modelFallbackMessage);
    childRegistration = registerRequiredChildExtensions({
      sessionId: created.session.sessionId,
      extensions: resources.childExtensions,
    });
    return { ...created, services, diagnostics: services.diagnostics };
  };

  const initial = options.workspace ?? options.lobby ?? process.cwd();
  const runtime = await createAgentSessionRuntime(factory, {
    cwd: initial,
    agentDir,
    sessionManager: options.workspace
      ? SessionManager.create(options.workspace, sessionDir(options.workspace))
      : SessionManager.inMemory(initial),
  });
  // The runtime tears sessions down itself; the pi-subagents registration for
  // the last one is tempi's to release.
  const dispose = runtime.dispose.bind(runtime);
  runtime.dispose = async () => {
    childRegistration?.dispose();
    childRegistration = undefined;
    await dispose();
  };
  return runtime;
}
