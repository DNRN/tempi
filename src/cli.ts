#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { ModelRuntime, resolveCliModel } from "@earendil-works/pi-coding-agent";
import { parseCliArgs, USAGE } from "./cli-args.js";
import { type LoopIO, runCoCreation } from "./loop.js";
import { createProgressPrinter } from "./progress.js";
import { createTempiSession } from "./session.js";
import { createCheckGameTool } from "./targets/check-tool.js";
import { createTarget } from "./targets/index.js";
import { createSaveAssetTool } from "./tools/save-asset.js";
import { tempiVersion } from "./version.js";
import { chooseWorkspace } from "./workspace.js";

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
  const workspace = chooseWorkspace(command.idea, process.cwd(), command.out);
  const modelRuntime = await ModelRuntime.create();
  let model: ReturnType<typeof resolveCliModel>["model"];
  let thinkingLevel: ReturnType<typeof resolveCliModel>["thinkingLevel"];
  if (command.model) {
    const resolved = resolveCliModel({ cliModel: command.model, modelRuntime });
    if (resolved.error || !resolved.model) throw new Error(resolved.error ?? `Unknown model "${command.model}".`);
    if (!modelRuntime.hasConfiguredAuth(resolved.model.provider)) {
      throw new Error(`No credentials for ${resolved.model.provider}. Log in with pi (/login) or set its API key.`);
    }
    model = resolved.model;
    thinkingLevel = resolved.thinkingLevel;
  }

  const progress = createProgressPrinter((text) => process.stdout.write(text));
  const readline = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  // Buffered, so lines piped in before a question is asked are not lost.
  const lines = readline[Symbol.asyncIterator]();
  const io: LoopIO = {
    info(message) {
      progress.newline();
      console.log(`\n[tempi] ${message}`);
    },
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
  };

  try {
    const result = await runCoCreation({
      idea: command.idea,
      target,
      workspace,
      io,
      async startAgent(dir) {
        const tempi = await createTempiSession({
          workspace: dir,
          modelRuntime,
          model,
          thinkingLevel,
          customTools: [createCheckGameTool(target, dir), createSaveAssetTool(dir)],
        });
        for (const error of tempi.extensionErrors) io.info(`Extension problem (${error.extensionPath}): ${error.error}`);
        const active = tempi.session.model;
        if (active) io.info(`Model: ${active.provider}/${active.id}`);
        const unsubscribe = tempi.session.subscribe((event) => progress.onEvent(event));
        return {
          agent: { prompt: (text) => tempi.session.prompt(text) },
          dispose() {
            unsubscribe();
            tempi.dispose();
          },
        };
      },
    });
    return result.lastCheck.playable ? 0 : 1;
  } finally {
    readline.close();
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`tempi: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
