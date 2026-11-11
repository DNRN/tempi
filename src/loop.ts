import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { AgentSessionRuntime, ExtensionAPI, ExtensionContext, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { configuredMcpServerCount, waitForAssetGenerators, type AssetGenerator } from "./assets.js";
import { assetGuidance, fixPrompt } from "./prompts/build.js";
import { type CheckResult, formatCheckResult, type RunningGame, type Target } from "./targets/target.js";
import { chooseWorkspace, prepareWorkspace } from "./workspace.js";

/** The target cannot run on this machine. */
export class PrerequisiteError extends Error {
  constructor(
    readonly target: Target,
    readonly problems: string[],
  ) {
    super(`The ${target.name} target can't run on this machine:\n${problems.map((p) => `- ${p}`).join("\n")}`);
    this.name = "PrerequisiteError";
  }
}

/** What tempi knows about the co-creation session so far. */
export interface TempiLoopState {
  /** The game workspace; undefined until the idea is known. */
  readonly workspace?: string;
  /** The idea that started the game, as the user wrote it. */
  readonly idea?: string;
  /** The running game, while it is open. */
  readonly running?: RunningGame;
  /** tempi's last playable check. */
  readonly lastCheck?: CheckResult;
  /** Change requests carried out after the first build. */
  readonly changes: number;
}

export interface TempiLoopOptions {
  target: Target;
  /** Where `chooseWorkspace` puts new game folders (the process's working directory). */
  parentDir: string;
  /** pi's agent directory, to read how many MCP servers to wait for. */
  agentDir: string;
  /** The workspace tempi was started with (`tempi "<idea>"` or `--out`). */
  workspace?: string;
  /** Wait for the configured MCP servers (asset generators). Default true. */
  mcp?: boolean;
  /** Fix rounds tempi asks for when its check still fails after a turn. Default 3. */
  maxFixRounds?: number;
  /** Receives tempi's own lines when there is no UI to notify (tests, plain mode). */
  info?: (message: string) => void;
}

export interface TempiLoop {
  /** The inline extension that drives the loop inside a session (ADR 0008). */
  factory: ExtensionFactory;
  /** The session runtime, once created; the loop moves the session to the game folder. */
  setRuntime(runtime: AgentSessionRuntime): void;
  readonly state: TempiLoopState;
}

/** What kind of agent turn this is, decided at the turn's end. */
type TurnKind = "build" | "change" | "question" | "fix";

function isClean(result: CheckResult): boolean {
  return result.playable && result.errors.length === 0;
}

/** Files in `workspace/assets`, the generated ones. */
export function assetCount(workspace: string): number {
  const dir = path.join(workspace, "assets");
  return existsSync(dir) ? readdirSync(dir, { recursive: true }).length : 0;
}

const IGNORED_ENTRIES = new Set([".tempi", ".pi", ".git", "node_modules"]);

/** The workspace's files with their modification times, tempi's own state left out. */
export function scanWorkspace(workspace: string): Map<string, number> {
  const files = new Map<string, number>();
  const walk = (rel: string) => {
    const dir = path.join(workspace, rel);
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORED_ENTRIES.has(entry.name)) continue;
      const entryPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(entryPath);
      else if (entry.isFile()) {
        try {
          files.set(entryPath, statSync(path.join(dir, entry.name)).mtimeMs);
        } catch {
          // Gone between readdir and stat: the agent may be deleting files.
        }
      }
    }
  };
  walk("");
  return files;
}

/** Whether the workspace's files changed between two scans (ADR 0008: only changes restart the game). */
export function filesChanged(before: Map<string, number>, after: Map<string, number>): boolean {
  if (before.size !== after.size) return true;
  for (const [file, mtime] of after) {
    if (!before.has(file) || before.get(file) !== mtime) return true;
  }
  return false;
}

/**
 * tempi's co-creation loop as a pi extension (ADR 0008): the first user message
 * is the game idea (it creates the game folder when tempi was started without
 * one), each turn ends with tempi's playable check and fix rounds, and the game
 * is started or restarted for the user — unless the turn changed no files.
 */
export function createTempiLoop(options: TempiLoopOptions): TempiLoop {
  const maxFixRounds = options.maxFixRounds ?? 3;
  let workspace = options.workspace;
  let idea: string | undefined;
  let running: RunningGame | undefined;
  let lastCheck: CheckResult | undefined;
  let changes = 0;
  let built = false;
  let turnKind: TurnKind = "question";
  let fixRounds = 0;
  let fixing = false;
  let lastScan = new Map<string, number>();
  let generators: AssetGenerator[] = [];
  let runtime: AgentSessionRuntime | undefined;

  const say = (ctx: ExtensionContext, message: string) => {
    if (options.info) options.info(message);
    else if (ctx.hasUI) ctx.ui.notify(message, "info");
  };

  const status = (ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus("tempi", workspace ? `${options.target.name} game: ${workspace}` : `${options.target.name} — send your game idea`);
  };

  /** The asset generators connected in this session; waits for pi's background MCP connects. */
  async function refreshGenerators(pi: ExtensionAPI): Promise<void> {
    const expected = options.mcp === false ? 0 : configuredMcpServerCount(options.agentDir);
    generators = await waitForAssetGenerators(() => pi.getAllTools(), expected);
  }

  const factory: ExtensionFactory = (pi: ExtensionAPI) => {
    pi.on("session_start", async (event, ctx) => {
      if (event.reason === "resume") workspace = ctx.cwd;
      status(ctx);
      if (event.reason === "startup") {
        void refreshGenerators(pi).then(() => {
          if (generators.length === 0 && options.mcp !== false) {
            say(ctx, "No asset generators configured: the game will use placeholder art. Add an image, sound, or 3D model generator with `pi mcp add` to get real assets.");
          }
        });
      }
    });

    // The first message in a tempi started without an idea is the idea: it
    // creates the game folder, moves the session there, and starts the build.
    pi.on("input", async (event, ctx) => {
      if (workspace || event.source === "extension") return { action: "continue" };
      const text = event.text.trim();
      if (!text || text.startsWith("/")) return { action: "continue" };
      let dir: string;
      try {
        dir = chooseWorkspace(text, options.parentDir);
        prepareWorkspace(dir);
        await options.target.scaffold(dir);
      } catch (error) {
        say(ctx, `tempi could not set up the game folder: ${error instanceof Error ? error.message : String(error)}`);
        return { action: "handled" };
      }
      workspace = dir;
      idea = text;
      status(ctx);
      void runtime
        ?.newSession({
          withSession: async (replaced) => {
            await replaced.sendUserMessage(text);
          },
        })
        .catch((error: unknown) => {
          say(ctx, `tempi could not start the game session: ${error instanceof Error ? error.message : String(error)}`);
          workspace = undefined;
          idea = undefined;
        });
      return { action: "handled" };
    });

    // The asset guidance depends on which MCP servers connected, so it joins
    // the system prompt per turn instead of statically (ADR 0008).
    pi.on("before_agent_start", async (event, ctx) => {
      if (event.messageType !== "user") return;
      if (!fixing) fixRounds = 0; // a fix round's continuation keeps its turn's count
      await refreshGenerators(pi);
      return { systemPrompt: `${event.systemPrompt}\n\n${assetGuidance(generators, options.target)}` };
    });

    // tempi's own check at the end of a turn, with fix rounds while it fails.
    pi.on("agent_before_settle", async (event, ctx) => {
      if (!workspace) return;
      const scan = scanWorkspace(workspace);
      turnKind = fixing ? "fix" : built ? (filesChanged(lastScan, scan) ? "change" : "question") : "build";
      if (turnKind === "question") {
        lastScan = scan;
        return;
      }
      lastCheck = await options.target.check(workspace);
      if (!isClean(lastCheck) && fixRounds < maxFixRounds) {
        fixRounds += 1;
        fixing = true;
        say(ctx, `tempi's check found problems; asking the agent to fix them (round ${fixRounds} of ${maxFixRounds}).`);
        return {
          entries: [...event.entries, { type: "custom_message", customType: "tempi/fix", content: fixPrompt(lastCheck, options.target), display: true }],
          continue: true,
        };
      }
      fixing = false;
      built = true;
      lastScan = scan;
      if (!isClean(lastCheck)) {
        say(ctx, `${formatCheckResult(options.target, lastCheck)}\nThe game still has problems. Describe them as your change request, or finish.`);
      }
      return;
    });

    pi.on("agent_settled", async (event, ctx) => {
      if (event.aborted) {
        fixing = false;
        return;
      }
      if (!workspace || fixing || turnKind === "question") return;
      if (turnKind === "change") changes += 1;
      if (turnKind !== "build") {
        await running?.stop();
        running = undefined;
      }
      running = await options.target.run(workspace);
      status(ctx);
      say(ctx, `Your game is running: ${running.location}`);
      if (turnKind === "build" && generators.length > 0 && assetCount(workspace) === 0) {
        say(ctx, "The agent generated no assets this time; the game uses placeholder art. Ask for generated art as a change if you want it.");
      }
    });

    pi.on("session_shutdown", async () => {
      await running?.stop();
      running = undefined;
    });

    pi.registerCommand("play", {
      description: "Start or restart the game",
      handler: async (_args, ctx) => {
        if (!workspace) return;
        await running?.stop();
        running = await options.target.run(workspace);
        status(ctx);
        say(ctx, `Your game is running: ${running.location}`);
      },
    });
    pi.registerCommand("check", {
      description: "Run tempi's playable check on the game",
      handler: async (_args, ctx) => {
        if (!workspace) return;
        lastCheck = await options.target.check(workspace);
        say(ctx, formatCheckResult(options.target, lastCheck));
      },
    });
  };

  return {
    factory,
    setRuntime(next: AgentSessionRuntime) {
      runtime = next;
    },
    get state(): TempiLoopState {
      return {
        ...(workspace ? { workspace } : {}),
        ...(idea ? { idea } : {}),
        ...(running ? { running } : {}),
        ...(lastCheck ? { lastCheck } : {}),
        changes,
      };
    },
  };
}
