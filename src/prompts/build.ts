import type { AssetGenerator } from "../assets.js";
import { type CheckResult, formatCheckResult, type Target } from "../targets/target.js";

/** Generated assets per agent turn: each one takes about 20 seconds or more. */
export const ASSET_BUDGET = { build: 6, change: 3 } as const;

const WORKING_RULES = `How to work:
- Keep the game small: one screen or level, a clear goal, simple controls. It must be playable now, not later.
- Run check_game after your changes and fix everything it reports. Finish only when it reports no errors.
- End with two or three lines for the player: what the game is and its controls.`;

/** What the agent should do about art, sound, and models, given the generators the user configured. */
export function assetGuidance(generators: readonly AssetGenerator[], target: Target, budget: number): string {
  if (generators.length === 0) {
    return `Assets: no asset generators are configured, so draw all art in code (shapes, colours, simple patterns) and skip sound files.`;
  }
  const list = generators.map((g) => `- ${g.name}${g.description ? `: ${g.description}` : ""}`).join("\n");
  return `Assets: the user set up these asset generators (MCP servers) for tempi's games. Use them for the game's art, sound, and models instead of placeholders:
${list}
- Call their tools from a codemode script (tools.mcp__<server>__<tool>; find them with searchTools or describeNamespace), and pass each result straight to tools.save_asset in the same script: a file path, base64 data, or a URL.
- Budget: at most ${budget} generated assets in this turn. Generate the ones that matter most (the player, the main objects, one or two sounds) and draw the rest in code; reuse an asset where you can.
- If a generator fails or can't make what you need, use a placeholder for that asset and carry on: the game must be playable either way.
${target.assetNotes}`;
}

/** The first prompt: build a playable game from the user's idea. */
export function buildPrompt(idea: string, target: Target, generators: readonly AssetGenerator[] = []): string {
  return `${target.instructions}

Build this game: ${idea.trim()}

${assetGuidance(generators, target, ASSET_BUDGET.build)}

${WORKING_RULES}`;
}

/** A change request from the user after they played the game. */
export function changePrompt(request: string, target: Target, generators: readonly AssetGenerator[] = []): string {
  return `The player tried the game and asks for this change: ${request.trim()}

Change the game in this workspace accordingly; keep what already works. ${target.name} rules from before still apply. Keep existing assets unless the change needs new ones.

${assetGuidance(generators, target, ASSET_BUDGET.change)}

${WORKING_RULES}`;
}

/** Sent when tempi's own check after a build still finds problems. */
export function fixPrompt(result: CheckResult, target: Target): string {
  return `tempi checked the game after your last turn and it still has problems:

${formatCheckResult(target, result)}

Fix them, run check_game until it reports no errors, then end with the same short summary for the player.`;
}
