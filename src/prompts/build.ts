import { type CheckResult, formatCheckResult, type Target } from "../targets/target.js";

const WORKING_RULES = `How to work:
- Keep the game small: one screen or level, a clear goal, simple controls. It must be playable now, not later.
- Run check_game after your changes and fix everything it reports. Finish only when it reports no errors.
- Save generated images, sounds, and models with save_asset into assets/. If no asset generator is available, draw placeholder shapes in code instead.
- End with two or three lines for the player: what the game is and its controls.`;

/** The first prompt: build a playable game from the user's idea. */
export function buildPrompt(idea: string, target: Target): string {
  return `${target.instructions}

Build this game: ${idea.trim()}

${WORKING_RULES}`;
}

/** A change request from the user after they played the game. */
export function changePrompt(request: string, target: Target): string {
  return `The player tried the game and asks for this change: ${request.trim()}

Change the game in this workspace accordingly; keep what already works. ${target.name} rules from before still apply.

${WORKING_RULES}`;
}

/** Sent when tempi's own check after a build still finds problems. */
export function fixPrompt(result: CheckResult, target: Target): string {
  return `tempi checked the game after your last turn and it still has problems:

${formatCheckResult(target, result)}

Fix them, run check_game until it reports no errors, then end with the same short summary for the player.`;
}
