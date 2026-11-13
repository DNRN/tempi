import { expect, test } from "vitest";
import { parseCliArgs, USAGE } from "./cli-args.js";

test("an idea alone leaves the target to the game: the existing game's, else the default", () => {
  expect(parseCliArgs(["a cat catches falling fish"])).toEqual({
    kind: "create",
    idea: "a cat catches falling fish",
    open: true,
    mcp: true,
    plain: false,
  });
});

test("no idea opens the chat interface; the first message becomes the idea", () => {
  expect(parseCliArgs([])).toEqual({ kind: "create", open: true, mcp: true, plain: false });
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

test("the usage says tempi continues the game it is run in", () => {
  expect(USAGE).toContain("Run tempi inside a game folder");
});
