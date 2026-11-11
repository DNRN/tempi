import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

/** A one-line summary of a tool call for the progress output. */
export function describeToolCall(toolName: string, args: unknown): string {
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const shorten = (value: string, max = 70) => {
    const line = value.replace(/\s+/g, " ").trim();
    return line.length > max ? `${line.slice(0, max - 1)}…` : line;
  };
  switch (toolName) {
    case "read":
    case "write":
    case "edit":
      return `${toolName} ${text(a.path)}`.trim();
    case "bash":
      return `bash ${shorten(text(a.command))}`.trim();
    case "save_asset":
      return `save_asset ${text(a.name)}`.trim();
    case "subagent":
      return `subagent ${text(a.agent)}: ${shorten(text(a.task), 60)}`.trim();
    case "web_search":
      return `web_search ${shorten(Array.isArray(a.queries) ? a.queries.join(" | ") : text(a.query))}`.trim();
    default:
      return toolName;
  }
}

/**
 * Prints an agent session's progress as plain text: the agent's words as they
 * stream, and one line per tool call (ADR 0002).
 */
export function createProgressPrinter(write: (text: string) => void) {
  let midLine = false;
  const newline = () => {
    if (midLine) write("\n");
    midLine = false;
  };
  return {
    onEvent(event: AgentSessionEvent) {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        const delta = event.assistantMessageEvent.delta;
        write(delta);
        midLine = !delta.endsWith("\n");
      } else if (event.type === "tool_execution_start") {
        newline();
        write(`  › ${describeToolCall(event.toolName, event.args)}\n`);
      } else if (event.type === "tool_execution_end" && event.isError) {
        newline();
        write(`  ✗ ${event.toolName} failed\n`);
      } else if (event.type === "agent_end") {
        newline();
      }
    },
    /** Ends a partial line before tempi prints its own. */
    newline,
  };
}
