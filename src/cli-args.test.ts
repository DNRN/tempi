import { expect, test } from "vitest";
import { parseCliArgs, USAGE } from "./cli-args.js";

test("an idea alone builds for the default target, web", () => {
  expect(parseCliArgs(["a cat catches falling fish"])).toEqual({
    kind: "create",
    idea: "a cat catches falling fish",
    target: "web",
    open: true,
    mcp: true,
    plain: false,
  });
});

test("no idea opens the chat interface; the first message becomes the idea", () => {
  expect(parseCliArgs([])).toEqual({ kind: "create", target: "web", open: true, mcp: true, plain: false });
});

test("unquoted words form the idea; options take target, out, model, and plain", () => {
  expect(parseCliArgs(["--target", "godot", "-o", "roll", "-m", "anthropic/claude-haiku-5-5", "roll", "a", "ball"])).toEqual({
    kind: "create",
    idea: "roll a ball",
    target: "godot",
    out: "roll",
    model: "anthropic/claude-haiku-5-5",
    open: true,
    mcp: true,
    plain: false,
  });
  expect(parseCliArgs(["--no-open", "x"])).toMatchObject({ open: false, mcp: true });
  expect(parseCliArgs(["--no-mcp", "x"])).toMatchObject({ open: true, mcp: false });
  expect(parseCliArgs(["--plain", "x"])).toMatchObject({ plain: true, open: true, mcp: true });
});

test("help and version need no idea", () => {
  expect(parseCliArgs(["--help"])).toEqual({ kind: "help" });
  expect(parseCliArgs(["-v"])).toEqual({ kind: "version" });
  expect(USAGE).toContain("--plain");
});

test("unknown targets and unknown options are errors", () => {
  expect(() => parseCliArgs(["-t", "unity", "x"])).toThrow(/Unknown target "unity"/);
  expect(() => parseCliArgs(["--fast", "x"])).toThrow(/Unknown option/);
});
