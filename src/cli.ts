#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { getAgentDir, initTheme, InteractiveMode, ModelRuntime, resolveCliModel } from "@earendil-works/pi-coding-agent";
import { startTempiAgent } from "./agent.js";
import { parseCliArgs, USAGE } from "./cli-args.js";
import { createTempiLoop, PrerequisiteError } from "./loop.js";
import { runPlainCoCreation } from "./plain.js";
import { createProgressPrinter } from "./progress.js";
import { createTempiRuntime } from "./session.js";
import { createCheckGameTool } from "./targets/check-tool.js";
import { createTarget } from "./targets/index.js";
import type { TargetId } from "./targets/target.js";
import { createSaveAssetTool } from "./tools/save-asset.js";
import { tempiVersion } from "./version.js";
import { chooseWorkspace, prepareWorkspace } from "./workspace.js";

/**
 * pi-subagents warns on every launch that `defaultExtensions: []` keeps the
 * user's extensions out of the child. tempi sets that on purpose (ADR 0005),
 * so this one message is dropped; everything else passes through.
 */
function muteKnownWarnings(): void {
  for (const level of ["warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].includes("disables ALL ambient extensions")) return;
      original(...args);
    };
  }
}

/** Resolves `--model` and checks the provider is logged in. */
async function resolveModel(pattern: string | undefined, modelRuntime: ModelRuntime) {
  if (!pattern) return {};
  const resolved = resolveCliModel({ cliModel: pattern, modelRuntime });
  if (resolved.error || !resolved.model) throw new Error(resolved.error ?? `Unknown model "${pattern}".`);
  if (!modelRuntime.hasConfiguredAuth(resolved.model.provider)) {
    throw new Error(`No credentials for ${resolved.model.provider}. Log in with pi (/login) or set its API key.`);
  }
  return { model: resolved.model, thinkingLevel: resolved.thinkingLevel };
}

/** The plain front end: the old line-by-line loop (ADR 0008), used with `--plain` and for piped input. */
async function runPlain(command: { idea?: string; target: TargetId; out?: string; model?: string; open: boolean; mcp: boolean }): Promise<number> {
  const target = createTarget(command.target, { open: command.open });
  const modelRuntime = await ModelRuntime.create();
  const { model, thinkingLevel } = await resolveModel(command.model, modelRuntime);

  const progress = createProgressPrinter((text) => process.stdout.write(text));
  const readline = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  // Buffered, so lines piped in before a question is asked are not lost.
  const lines = readline[Symbol.asyncIterator]();
  const info = (message: string) => {
    progress.newline();
    console.log(`\n[tempi] ${message}`);
  };

  try {
    const result = await runPlainCoCreation({
      idea: command.idea,
      target,
      parentDir: process.cwd(),
      ...(command.out ? { out: command.out } : {}),
      io: {
        info,
        async ask(question) {
          progress.newline();
          process.stdout.write(`\n${question}`);
          const next = await lines.next();
          if (next.done) {
            process.stdout.write("\n");
            return undefined;
          }
          if (!process.stdin.isTTY) process.stdout.write(`${next.value}\n`);
          return next.value;
        },
      },
      startAgent: (workspace) =>
        startTempiAgent({
          target,
          workspace,
          modelRuntime,
          model,
          thinkingLevel,
          mcp: command.mcp,
          onEvent: (event) => progress.onEvent(event),
          onStart({ model: active, extensionErrors }) {
            for (const error of extensionErrors) info(`Extension problem (${error.extensionPath}): ${error.error}`);
            if (active) info(`Model: ${active}`);
          },
        }),
    });
    return result.lastCheck.playable ? 0 : 1;
  } finally {
    readline.close();
  }
}

/** pi's own interactive interface running tempi's agent (ADR 0008). */
async function runInteractive(
  command: { idea?: string; target: TargetId; out?: string; model?: string; open: boolean; mcp: boolean },
): Promise<number> {
  const target = createTarget(command.target, { open: command.open });
  const modelRuntime = await ModelRuntime.create();
  const { model, thinkingLevel } = await resolveModel(command.model, modelRuntime);

  // With an idea (or --out), the game folder exists before the session starts.
  let workspace: string | undefined;
  if (command.out || command.idea) {
    workspace = chooseWorkspace(command.idea ?? "game", process.cwd(), command.out);
    prepareWorkspace(workspace);
    await target.scaffold(workspace);
  }
  // Without one, the session waits in tempi's lobby until the first message.
  const lobby = workspace ? undefined : mkdtempSync(path.join(tmpdir(), "tempi-"));

  const loop = createTempiLoop({
    target,
    parentDir: process.cwd(),
    agentDir: getAgentDir(),
    ...(workspace ? { workspace } : {}),
    mcp: command.mcp,
  });
  const runtime = await createTempiRuntime({
    target,
    ...(workspace ? { workspace } : {}),
    ...(lobby ? { lobby } : {}),
    getWorkspace: () => loop.state.workspace,
    modelRuntime,
    model,
    thinkingLevel,
    mcp: command.mcp,
    extensionFactories: [loop.factory],
    customToolsFor: (dir) => [createCheckGameTool(target, dir), createSaveAssetTool(dir)],
  });
  loop.setRuntime(runtime);

  initTheme(runtime.services.settingsManager.getTheme(), true);
  const mode = new InteractiveMode(runtime, command.idea ? { initialMessage: command.idea } : undefined);
  try {
    await mode.run();
  } finally {
    await runtime.dispose();
    if (lobby) rmSync(lobby, { recursive: true, force: true });
  }
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const command = parseCliArgs(argv);
  if (command.kind === "help") {
    console.log(USAGE);
    return 0;
  }
  if (command.kind === "version") {
    console.log(`tempi ${tempiVersion()}`);
    return 0;
  }

  muteKnownWarnings();
  const target = createTarget(command.target, { open: command.open });
  const problems = await target.prerequisites();
  if (problems.length > 0) throw new PrerequisiteError(target, problems);

  const plain = command.plain || !process.stdin.isTTY;
  return plain ? runPlain(command) : runInteractive(command);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`tempi: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
