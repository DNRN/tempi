import { expect, test } from "vitest";
import { createCheckGameTool } from "./check-tool.js";
import { createFakeTarget } from "./fake-target.testutil.js";
import { formatCheckResult, parseTargetId, TARGET_IDS } from "./target.js";

test("parseTargetId accepts the targets, case-insensitively, and names them on error", () => {
  expect(TARGET_IDS).toEqual(["web", "godot"]);
  expect(parseTargetId("web")).toBe("web");
  expect(parseTargetId(" Godot ")).toBe("godot");
  expect(() => parseTargetId("unity")).toThrow('Unknown target "unity". Choose one of: web, godot.');
});

test("formatCheckResult reads as a verdict plus the errors", () => {
  const { target } = createFakeTarget();
  expect(formatCheckResult(target, { playable: true, errors: [] })).toBe("The Fake game loaded and ran without errors.");
  expect(formatCheckResult(target, { playable: false, errors: ["ReferenceError: x is not defined", "missing index.html"] })).toBe(
    "Fake check: The game is not playable. Errors:\n- ReferenceError: x is not defined\n- missing index.html",
  );
  expect(formatCheckResult(target, { playable: true, errors: ["404 assets/cat.png"] })).toBe(
    "Fake check: The game loaded, but reported errors:\n- 404 assets/cat.png",
  );
  expect(formatCheckResult(target, { playable: false, errors: [] })).toContain("no error message");
});

test("check_game runs the target's check on the workspace and returns text and details", async () => {
  const failing = { playable: false, errors: ["TypeError: boom"] };
  const { target, calls } = createFakeTarget([failing]);
  const tool = createCheckGameTool(target, "/games/cat");
  expect(tool.name).toBe("check_game");
  const result = await tool.execute("call-1", {}, undefined, undefined, undefined as never);
  expect(calls).toEqual(["check /games/cat"]);
  expect(result.details).toEqual(failing);
  expect(result.content).toEqual([{ type: "text", text: "Fake check: The game is not playable. Errors:\n- TypeError: boom" }]);
});
