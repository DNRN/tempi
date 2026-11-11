import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { createProgressPrinter, describeToolCall } from "./progress.js";

test("describeToolCall names the file, command, asset, or task", () => {
  expect(describeToolCall("write", { path: "src/main.js", content: "x" })).toBe("write src/main.js");
  expect(describeToolCall("bash", { command: "ls   -la\nassets" })).toBe("bash ls -la assets");
  expect(describeToolCall("bash", { command: "x".repeat(100) })).toHaveLength(75);
  expect(describeToolCall("save_asset", { name: "fish.png", path: "/tmp/x.png" })).toBe("save_asset fish.png");
  expect(describeToolCall("web_search", { queries: ["godot input", "godot physics"] })).toBe("web_search godot input | godot physics");
  expect(describeToolCall("check_game", {})).toBe("check_game");
  expect(describeToolCall("read", undefined)).toBe("read");
});

test("the printer streams text and puts each tool call on its own line", () => {
  let out = "";
  const printer = createProgressPrinter((text) => {
    out += text;
  });
  const text = (delta: string) =>
    ({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta } }) as unknown as AgentSessionEvent;
  printer.onEvent(text("Building the "));
  printer.onEvent(text("game."));
  printer.onEvent({ type: "tool_execution_start", toolName: "write", args: { path: "index.html" } } as unknown as AgentSessionEvent);
  printer.onEvent({ type: "tool_execution_end", toolName: "check_game", isError: true } as unknown as AgentSessionEvent);
  printer.onEvent(text("Done."));
  printer.newline();
  expect(out).toBe("Building the game.\n  › write index.html\n  ✗ check_game failed\nDone.\n");
});
