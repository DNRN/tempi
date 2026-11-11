import { type FauxResponseStep, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import path from "node:path";
import { startTempiAgent } from "./agent.js";
import { type PlainCoCreationResult, type PlainIO, runPlainCoCreation } from "./plain.js";
import type { Target } from "./targets/target.js";

/** A scripted tool call, as the model's whole turn step. */
export const call = (name: string, args: Parameters<typeof fauxToolCall>[1]) => fauxAssistantMessage(fauxToolCall(name, args), { stopReason: "toolUse" });
/** A scripted final answer, ending the agent's turn. */
export const say = (text: string) => fauxAssistantMessage(text);

export interface ToolRecord {
  name: string;
  isError: boolean;
  text: string;
}

export interface ScriptedRun {
  result: PlainCoCreationResult;
  info: string[];
  tools: ToolRecord[];
  /** Scripted responses the agent never asked for: should be 0. */
  unused: number;
}

/**
 * Runs the plain co-creation loop, as the CLI's plain mode does, with a scripted
 * model (pi-ai's faux provider) instead of a real one, and scripted user lines.
 */
export async function runScripted(options: {
  target: Target;
  workspace: string;
  /** pi's agent directory: a temporary one in CI, the user's for local MCP runs. */
  agentDir: string;
  idea: string;
  answers: (string | undefined)[];
  responses: FauxResponseStep[];
}): Promise<ScriptedRun> {
  const modelRuntime = await ModelRuntime.create({ authPath: path.join(options.agentDir, "auth.json") });
  const faux = fauxProvider({ provider: "tempi-faux" });
  modelRuntime.registerNativeProvider(faux.provider);
  faux.setResponses(options.responses);

  const info: string[] = [];
  const tools: ToolRecord[] = [];
  const answers = [...options.answers];
  const io: PlainIO = { info: (message: string) => void info.push(message), ask: async () => answers.shift() };
  const result = await runPlainCoCreation({
    idea: options.idea,
    target: options.target,
    parentDir: path.dirname(options.workspace),
    out: options.workspace,
    io,
    startAgent: (workspace) =>
      startTempiAgent({
        target: options.target,
        workspace,
        agentDir: options.agentDir,
        modelRuntime,
        model: faux.getModel(),
        onEvent(event) {
          if (event.type !== "tool_execution_end") return;
          const content = (event.result as { content?: { type: string; text?: string }[] } | undefined)?.content ?? [];
          tools.push({ name: event.toolName, isError: event.isError, text: content.map((c) => c.text ?? "").join("\n") });
        },
      }),
  });
  return { result, info, tools, unused: faux.getPendingResponseCount() };
}
