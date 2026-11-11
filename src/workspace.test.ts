import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { chooseWorkspace, prepareWorkspace, workspaceName } from "./workspace.js";

let dir: string;
const settingsFile = () => path.join(dir, "game", ".pi", "settings.json");
const readSettings = () => JSON.parse(readFileSync(settingsFile(), "utf8")) as Record<string, unknown>;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "tempi-workspace-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("creates the workspace and turns off ambient extensions for subagent children", () => {
  prepareWorkspace(path.join(dir, "game"));
  expect(readSettings()).toEqual({ subagents: { defaultExtensions: [] } });
});

test("keeps other settings in an existing file", () => {
  mkdirSync(path.dirname(settingsFile()), { recursive: true });
  writeFileSync(settingsFile(), JSON.stringify({ theme: "dark", subagents: { defaultModel: "x", defaultExtensions: ["a.ts"] } }));
  prepareWorkspace(path.join(dir, "game"));
  expect(readSettings()).toEqual({ theme: "dark", subagents: { defaultModel: "x", defaultExtensions: [] } });
});

test("leaves a file that is already right untouched", () => {
  prepareWorkspace(path.join(dir, "game"));
  const before = statSync(settingsFile()).mtimeMs;
  writeFileSync(settingsFile(), JSON.stringify({ subagents: { defaultExtensions: [] } }));
  const written = statSync(settingsFile()).mtimeMs;
  prepareWorkspace(path.join(dir, "game"));
  expect(statSync(settingsFile()).mtimeMs).toBe(written);
  expect(written).toBeGreaterThanOrEqual(before);
});

test("refuses a settings file that is not a JSON object", () => {
  mkdirSync(path.dirname(settingsFile()), { recursive: true });
  writeFileSync(settingsFile(), "[]");
  expect(() => prepareWorkspace(path.join(dir, "game"))).toThrow(/JSON object/);
});

test("names the file when the settings are not valid JSON", () => {
  mkdirSync(path.dirname(settingsFile()), { recursive: true });
  writeFileSync(settingsFile(), "{ nope");
  expect(() => prepareWorkspace(path.join(dir, "game"))).toThrow(/settings\.json is not valid JSON/);
});

test("workspaceName makes a short folder name from the idea", () => {
  expect(workspaceName("A cat catches falling fish!")).toBe("a-cat-catches-falling-fish");
  expect(workspaceName("Café — über 2 players")).toBe("cafe-uber-2-players");
  expect(workspaceName("roll a ball through a small obstacle course quickly")).toBe("roll-a-ball-through-a-small-obstacle-cou");
  expect(workspaceName("!!!")).toBe("game");
});

test("chooseWorkspace picks a free folder, or checks the one given", () => {
  expect(chooseWorkspace("cat game", dir)).toBe(path.join(dir, "cat-game"));
  mkdirSync(path.join(dir, "cat-game"));
  expect(chooseWorkspace("cat game", dir)).toBe(path.join(dir, "cat-game"));
  writeFileSync(path.join(dir, "cat-game", "index.html"), "");
  expect(chooseWorkspace("cat game", dir)).toBe(path.join(dir, "cat-game-2"));
  expect(chooseWorkspace("cat game", dir, "mine")).toBe(path.join(dir, "mine"));
  expect(() => chooseWorkspace("cat game", dir, "cat-game")).toThrow(/not an empty directory/);
});
