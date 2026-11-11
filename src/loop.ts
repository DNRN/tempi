import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { buildPrompt, changePrompt, fixPrompt } from "./prompts/build.js";
import { type CheckResult, formatCheckResult, type RunningGame, type Target } from "./targets/target.js";

/** The part of an agent session the loop uses. */
export interface LoopAgent {
  prompt(text: string): Promise<void>;
}

export interface StartedAgent {
  agent: LoopAgent;
  dispose(): void;
}

/** How the loop talks to the user. */
export interface LoopIO {
  /** A line from tempi itself (not the agent). */
  info(message: string): void;
  /** Asks the user; resolves to undefined when input has ended. */
  ask(question: string): Promise<string | undefined>;
}

export interface CoCreationOptions {
  idea: string;
  target: Target;
  /** A new or empty directory for the game. */
  workspace: string;
  startAgent(workspace: string): Promise<StartedAgent>;
  io: LoopIO;
  /** Fix rounds tempi asks for when its own check still fails after a turn. Default 3. */
  maxFixRounds?: number;
}

export interface CoCreationResult {
  workspace: string;
  /** Change requests carried out after the first build. */
  changes: number;
  lastCheck: CheckResult;
}

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

const FINISH_WORDS = /^(done|quit|exit|q)$/i;

function isClean(result: CheckResult): boolean {
  return result.playable && result.errors.length === 0;
}

function assetCount(workspace: string): number {
  const dir = path.join(workspace, "assets");
  return existsSync(dir) ? readdirSync(dir, { recursive: true }).length : 0;
}

/**
 * The co-creation loop: idea → playable game → the user plays → change
 * request → rebuild → play again, until the user is done. Front-end
 * independent (ADR 0002): the CLI supplies the agent and the I/O.
 */
export async function runCoCreation(options: CoCreationOptions): Promise<CoCreationResult> {
  const { idea, target, workspace, io } = options;
  const maxFixRounds = options.maxFixRounds ?? 3;

  const problems = await target.prerequisites();
  if (problems.length > 0) throw new PrerequisiteError(target, problems);

  await target.scaffold(workspace);
  const { agent, dispose } = await options.startAgent(workspace);
  let running: RunningGame | undefined;

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
    io.info(`Building a ${target.name} game in ${workspace}`);
    let lastCheck = await turn(buildPrompt(idea, target));
    if (assetCount(workspace) === 0) {
      io.info("No generated assets: the game uses placeholder art. Add an image or sound generator with `pi mcp add` to get real assets.");
    }
    await play();

    let changes = 0;
    for (;;) {
      const request = (await io.ask("What should change? (Enter to finish) "))?.trim();
      if (!request || FINISH_WORDS.test(request)) break;
      await running?.stop();
      running = undefined;
      io.info("Changing the game...");
      lastCheck = await turn(changePrompt(request, target));
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
