import type { AssetGenerator } from "../assets.js";
import { type CheckResult, formatCheckResult, type Target } from "../targets/target.js";

/** Generated assets per agent turn: each one takes about 20 seconds or more. */
export const ASSET_BUDGET = { build: 6, change: 3 } as const;

const WORKING_RULES = `How to work:
- Keep the game small: one screen or level, a clear goal, simple controls. It must be playable now, not later.
- Run check_game after your changes and fix everything it reports. Finish only when it reports no errors.
- End with two or three lines for the player: what the game is and its controls.`;

/**
 * Sound effects: simple game sounds are synthesized in code, realistic ones
 * come from a sound generator when there is one (decided for the first milestone).
 */
const SOUND_RULES = `- Sound: synthesize simple game sounds (coins, jumps, hits, explosions, blips, power-ups) in code: write a short WAV into assets/ with a Python script using only the standard library (wave, struct, math), or in a web game play it with the Web Audio API. Synthesized sounds don't count against the budget.`;

/** What the agent should do about art, sound, and models, given the generators the user configured. */
export function assetGuidance(generators: readonly AssetGenerator[], target: Target, budget: number): string {
  if (generators.length === 0) {
    return `Assets: no asset generators are configured, so draw all art in code (shapes, colours, simple patterns).
${SOUND_RULES}`;
  }
  const list = generators.map((g) => `- ${g.name}${g.description ? `: ${g.description}` : ""}`).join("\n");
  return `Assets: the user set up these asset generators (MCP servers) for tempi's games. Use them for the game's art, sound, and models instead of placeholders:
${list}
- Call their tools from a codemode script (tools.mcp__<server>__<tool>; find them with searchTools or describeNamespace), and pass each result straight to tools.save_asset in the same script: a file path, base64 data, or a URL.
- A generator that drives an app the user has open (such as Blender) works in the user's own session: don't change what is already there. Build in a new temporary scene, export to a file, then delete that scene and everything you created for it (objects, meshes, materials). Export first and save_asset after the export has finished, not in parallel.
- A generator may do more than its description says. Before you decide none can make an asset (a sound, a 3D model), search their tools and templates for that kind (sound, audio, sfx, model, mesh).
- Budget: at most ${budget} generated assets in this turn. Generate the ones that matter most (the player, the main objects, a realistic sound) and draw the rest in code; reuse an asset where you can.
${SOUND_RULES} Use a sound generator for realistic sounds (animals, water, voices, ambience); save its output as .wav, .ogg, or .mp3.
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
