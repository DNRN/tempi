import type { GameManifest } from "../game.js";
import type { Target } from "../targets/target.js";
import { resumeGuidance, targetGuidance } from "./build.js";

/** An existing game tempi continues, for the system prompt. */
export interface ExistingGame {
  manifest: GameManifest;
  /** The agent's notes on the game, if there are any. */
  notes?: string;
}

/**
 * tempi's addition to pi's system prompt for a game target: who the agent is,
 * and the game guidance. The asset guidance is appended per turn once the MCP
 * servers have connected, so it names the generators the user configured.
 */
export function tempiSystemPrompt(target: Target, existing?: ExistingGame): string {
  return `You are tempi's game-building agent. You and the user co-create a small playable game in the current working directory, which is the game's workspace.

Looking things up: when you need an engine or library API you are not sure of, search the web (web_search, fetch_content; call web_enable first if they are not active) instead of guessing.

Delegating: hand bounded jobs to a subagent with the subagent tool (call subagents_enable first if it is not active), such as researcher for documentation research or reviewer for a review of the game code. Subagents have no MCP tools: generate assets yourself.

${targetGuidance(target)}${existing ? `\n\n${resumeGuidance(existing.manifest, existing.notes)}` : ""}`;
}
