import type { AssetGenerator } from "./assets.js";
import type { StartedAgent } from "./agent.js";
import { fixPrompt } from "./prompts/build.js";
import { assetCount } from "./loop.js";
import { type CheckResult, formatCheckResult, type Target } from "./targets/target.js";
import { chooseWorkspace } from "./workspace.js";

/** How the plain loop talks to the user. */
export interface PlainIO {
  /** A line from tempi itself (not the agent). */
  info(message: string): void;
  /** Asks the user; resolves to undefined when input has ended. */
  ask(question: string): Promise<string | undefined>;
}

export interface PlainCoCreationOptions {
  /** The game idea. Without one, the first line the user types is the idea. */
  idea?: string;
  target: Target;
  /** Where new game folders are created (the process's working directory). */
  parentDir: string;
  /** An explicit workspace directory, as `--out`. */
  out?: string;
  io: PlainIO;
  startAgent(workspace: string): Promise<StartedAgent>;
  /** Fix rounds tempi asks for when its check still fails after a turn. Default 3. */
  maxFixRounds?: number;
}

export interface PlainCoCreationResult {
  workspace: string;
  /** Change requests carried out after the first build. */
  changes: number;
  lastCheck: CheckResult;
}

const FINISH_WORDS = /^(done|quit|exit|q)$/i;

function isClean(result: CheckResult): boolean {
  return result.playable && result.errors.length === 0;
}

/**
 * The co-creation loop as a plain question-and-answer script: the idea goes in,
 * the game is built and started, and each following line is a change request
 * sent to the agent as typed (ADR 0008: the TUI is the front end; this runs
 * with `--plain` and when input is piped).
 */
export async function runPlainCoCreation(options: PlainCoCreationOptions): Promise<PlainCoCreationResult> {
  const { target, io } = options;
  const maxFixRounds = options.maxFixRounds ?? 3;

  const idea = options.idea?.trim() || ((await io.ask("Describe the game to build (this first line is the idea): ")) ?? "").trim();
  if (!idea) throw new Error("No game idea given.");
  const workspace = chooseWorkspace(idea, options.parentDir, options.out);

  await target.scaffold(workspace);
  const { agent, dispose, assetGenerators = [] } = await options.startAgent(workspace);
  let running: Awaited<ReturnType<Target["run"]>> | undefined;

  /** One agent turn, then tempi's own check, with fix rounds while it fails. */
  async function turn(prompt: string): Promise<CheckResult> {
    await agent.prompt(prompt);
    let result = await target.check(workspace);
    for (let round = 1; round <= maxFixRounds && !isClean(result); round++) {
      io.info(`tempi's check found problems; asking the agent to fix them (round ${round} of ${maxFixRounds}).`);
      await agent.prompt(fixPrompt(result, target));
      result = await target.check(workspace);
    }
    if (!isClean(result)) {
      io.info(`${formatCheckResult(target, result)}\nThe game still has problems. Describe them as your change request, or finish.`);
    }
    return result;
  }

  async function play(): Promise<void> {
    running = await target.run(workspace);
    io.info(`Your game is running: ${running.location}`);
  }

  try {
    io.info(
      assetGenerators.length > 0
        ? `Asset generators: ${assetGenerators.map((g: AssetGenerator) => g.name).join(", ")}`
        : "No asset generators configured: the game will use placeholder art. Add an image, sound, or 3D model generator with `pi mcp add` to get real assets.",
    );
    io.info(`Building a ${target.name} game in ${workspace}`);
    let lastCheck = await turn(idea);
    if (assetGenerators.length > 0 && assetCount(workspace) === 0) {
      io.info("The agent generated no assets this time; the game uses placeholder art. Ask for generated art as a change if you want it.");
    }
    await play();

    let changes = 0;
    for (;;) {
      const request = (await io.ask("What should change? (Enter to finish) "))?.trim();
      if (!request || FINISH_WORDS.test(request)) break;
      await running?.stop();
      running = undefined;
      io.info("Changing the game...");
      lastCheck = await turn(request);
      changes += 1;
      await play();
    }
    io.info(`Done. Your game is in ${workspace}`);
    return { workspace, changes, lastCheck };
  } finally {
    await running?.stop();
    dispose();
  }
}
