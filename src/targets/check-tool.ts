import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { type CheckResult, formatCheckResult, type Target } from "./target.js";

/**
 * The `check_game` tool: lets the agent run the target's headless playable
 * check on the workspace and read the errors, so it fixes them before
 * handing the game over.
 */
export function createCheckGameTool(target: Target, workspace: string) {
  return defineTool<ReturnType<typeof Type.Object>, CheckResult>({
    name: "check_game",
    label: "Check game",
    description: `Load the ${target.name} game in this workspace headlessly and report whether it is playable, with any errors. Run it after every change and fix what it reports before you finish.`,
    promptSnippet: "check_game: load the game headlessly and get its errors",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal) {
      const result = await target.check(workspace, { signal });
      return { content: [{ type: "text", text: formatCheckResult(target, result) }], details: result };
    },
  });
}
