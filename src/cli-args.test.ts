import { expect, test } from "vitest";
import { parseCliArgs } from "./cli-args.js";

test("an idea alone builds for the default target, web", () => {
  expect(parseCliArgs(["a cat catches falling fish"])).toEqual({ kind: "create", idea: "a cat catches falling fish", target: "web", open: true, mcp: true });
});

test("unquoted words form the idea; options take target, out, and model", () => {
  expect(parseCliArgs(["--target", "godot", "-o", "roll", "-m", "anthropic/claude-haiku-5-5", "roll", "a", "ball"])).toEqual({
    kind: "create",
    idea: "roll a ball",
    target: "godot",
    out: "roll",
    model: "anthropic/claude-haiku-5-5",
    open: true,
    mcp: true,
  });
  expect(parseCliArgs(["--no-open", "x"])).toMatchObject({ open: false, mcp: true });
  expect(parseCliArgs(["--no-mcp", "x"])).toMatchObject({ open: true, mcp: false });
});

test("help and version need no idea", () => {
  expect(parseCliArgs(["--help"])).toEqual({ kind: "help" });
  expect(parseCliArgs(["-v"])).toEqual({ kind: "version" });
});

test("missing ideas, unknown targets, and unknown options are errors", () => {
  expect(() => parseCliArgs([])).toThrow(/Describe the game/);
  expect(() => parseCliArgs(["-t", "unity", "x"])).toThrow(/Unknown target "unity"/);
  expect(() => parseCliArgs(["--fast", "x"])).toThrow(/Unknown option/);
});
