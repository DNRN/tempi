import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { detectGame, manifestPath, notesPath, readGameManifest, readNotes, resolveGame, writeGameManifest } from "./game.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "tempi-game-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("the manifest round-trips the target and the idea", () => {
  const written = writeGameManifest(dir, { target: "godot", idea: "roll a ball" });
  expect(readGameManifest(dir)).toEqual(written);
  expect(written).toMatchObject({ version: 1, target: "godot", idea: "roll a ball" });
  expect(written.createdAt).toMatch(/^\d{4}-\d\d-\d\dT/);
});

test("an unreadable manifest is a clear error", () => {
  mkdirSync(path.join(dir, ".tempi"));
  writeFileSync(manifestPath(dir), "{");
  expect(() => readGameManifest(dir)).toThrow(/game\.json is not valid JSON/);
  writeFileSync(manifestPath(dir), JSON.stringify({ target: "unity" }));
  expect(() => readGameManifest(dir)).toThrow(/Unknown target "unity"/);
});

test("detection: the manifest wins over engine files", () => {
  writeFileSync(path.join(dir, "index.html"), "");
  writeGameManifest(dir, { target: "godot" });
  expect(detectGame(dir)).toMatchObject({ target: "godot", source: "manifest" });
});

test("detection without a manifest: project.godot is Godot, index.html is web, and nothing is written", () => {
  writeFileSync(path.join(dir, "project.godot"), "");
  writeFileSync(path.join(dir, "index.html"), "");
  const found = detectGame(dir);
  expect(found).toMatchObject({ target: "godot", source: "engine-files", manifest: { target: "godot" } });
  expect(found?.manifest.idea).toBeUndefined();
  expect(existsSync(manifestPath(dir))).toBe(false);
  // The caller adopts the folder by writing what detection found.
  writeGameManifest(dir, found!.manifest);
  expect(readGameManifest(dir)).toEqual(found!.manifest);

  const web = path.join(dir, "web");
  mkdirSync(web);
  writeFileSync(path.join(web, "index.html"), "");
  expect(detectGame(web)).toMatchObject({ target: "web", source: "engine-files" });
});

test("an empty folder, a folder of other files, or no folder holds no game", () => {
  expect(detectGame(dir)).toBeUndefined();
  writeFileSync(path.join(dir, "notes.txt"), "");
  expect(detectGame(dir)).toBeUndefined();
  expect(detectGame(path.join(dir, "missing"))).toBeUndefined();
  expect(existsSync(manifestPath(dir))).toBe(false);
});

test("resolveGame continues the game in the working directory with its own target", () => {
  writeGameManifest(dir, { target: "godot", idea: "roll a ball" });
  expect(resolveGame({}, dir)).toMatchObject({ kind: "existing", target: "godot", workspace: dir, manifest: { idea: "roll a ball" }, adopt: false });
  expect(resolveGame({ target: "godot" }, dir)).toMatchObject({ kind: "existing", target: "godot" });
});

test("resolveGame refuses a --target that disagrees with the game", () => {
  writeGameManifest(dir, { target: "godot" });
  expect(() => resolveGame({ target: "web" }, dir)).toThrow(/holds a godot game.*--target godot/);
});

test("a --target that disagrees with a folder's engine files leaves no manifest behind", () => {
  writeFileSync(path.join(dir, "index.html"), "");
  expect(() => resolveGame({ target: "godot" }, dir)).toThrow(/holds a web game/);
  expect(existsSync(manifestPath(dir))).toBe(false);
  expect(resolveGame({}, dir)).toMatchObject({ kind: "existing", target: "web", adopt: true });
  expect(existsSync(manifestPath(dir))).toBe(false);
});

test("resolveGame looks in --out instead of the working directory", () => {
  const game = path.join(dir, "game");
  mkdirSync(game);
  writeFileSync(path.join(game, "index.html"), "");
  expect(resolveGame({ out: "game" }, dir)).toMatchObject({ kind: "existing", target: "web", workspace: game });
  expect(resolveGame({ out: "new-game", target: "godot" }, dir)).toEqual({ kind: "new", target: "godot" });
  expect(resolveGame({}, dir)).toEqual({ kind: "new", target: "web" });
});

test("notes are read when present and capped", () => {
  expect(readNotes(dir)).toBeUndefined();
  mkdirSync(path.join(dir, ".tempi"));
  writeFileSync(notesPath(dir), "  \n");
  expect(readNotes(dir)).toBeUndefined();
  writeFileSync(notesPath(dir), "A snake game.\n");
  expect(readNotes(dir)).toBe("A snake game.");
  writeFileSync(notesPath(dir), "x".repeat(100));
  expect(readNotes(dir, 10)).toBe(`${"x".repeat(10)}\n[… notes cut; read .tempi/notes.md for the rest]`);
  expect(readFileSync(notesPath(dir), "utf8")).toHaveLength(100);
});
