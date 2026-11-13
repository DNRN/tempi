import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_TARGET } from "./targets/index.js";
import { parseTargetId, type TargetId } from "./targets/target.js";
import { tempiVersion } from "./version.js";

/** What tempi records about a game in its workspace (ADR 0010). */
export interface GameManifest {
  version: 1;
  /** The game's target; it never changes for a game. */
  target: TargetId;
  /** The idea that started the game, as the user wrote it; absent for adopted games. */
  idea?: string;
  /** When tempi created or adopted the game, ISO 8601. */
  createdAt: string;
  /** The tempi version that wrote the manifest. */
  tempiVersion: string;
}

/** Where a workspace keeps its manifest. */
export function manifestPath(workspace: string): string {
  return path.join(workspace, ".tempi", "game.json");
}

/** Where the agent keeps its notes on the game: what it is, controls, layout, changes. */
export function notesPath(workspace: string): string {
  return path.join(workspace, ".tempi", "notes.md");
}

/** The notes file relative to the workspace, as the agent reads it. */
export const NOTES_FILE = ".tempi/notes.md";

/** A new manifest for a game, not yet written. */
function newManifest(game: { target: TargetId; idea?: string }): GameManifest {
  return {
    version: 1,
    target: game.target,
    ...(game.idea ? { idea: game.idea } : {}),
    createdAt: new Date().toISOString(),
    tempiVersion: tempiVersion(),
  };
}

/** Records a game's manifest in its workspace: a new one, or one {@link detectGame} found unsaved. */
export function writeGameManifest(workspace: string, game: { target: TargetId; idea?: string } | GameManifest): GameManifest {
  const manifest = "version" in game ? game : newManifest(game);
  const file = manifestPath(workspace);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** The workspace's manifest, undefined when there is none. Throws on a manifest tempi can't read. */
export function readGameManifest(workspace: string): GameManifest | undefined {
  const file = manifestPath(workspace);
  if (!existsSync(file)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${file} must hold a JSON object.`);
  const raw = parsed as Record<string, unknown>;
  if (typeof raw.target !== "string") throw new Error(`${file} has no "target".`);
  let target: TargetId;
  try {
    target = parseTargetId(raw.target);
  } catch (error) {
    throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    version: 1,
    target,
    ...(typeof raw.idea === "string" && raw.idea ? { idea: raw.idea } : {}),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    tempiVersion: typeof raw.tempiVersion === "string" ? raw.tempiVersion : "",
  };
}

/** A game found in a folder. */
export interface DetectedGame {
  target: TargetId;
  /** tempi's manifest; for a folder adopted by its engine files, a new one not yet written. */
  manifest: GameManifest;
  /** Whether the target came from tempi's manifest or was read from the engine's files. */
  source: "manifest" | "engine-files";
}

/** The target an engine's files point to, for folders without a manifest. */
function targetFromEngineFiles(dir: string): TargetId | undefined {
  if (existsSync(path.join(dir, "project.godot"))) return "godot";
  if (existsSync(path.join(dir, "index.html"))) return "web";
  return undefined;
}

/**
 * The game in `dir`, if there is one: tempi's manifest wins; without one, the
 * engine's files decide (project.godot → Godot, index.html → web). Writes
 * nothing: the caller adopts the folder by writing the manifest once it is
 * sure to continue the game, so later runs agree.
 */
export function detectGame(dir: string): DetectedGame | undefined {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return undefined;
  const manifest = readGameManifest(dir);
  if (manifest) return { target: manifest.target, manifest, source: "manifest" };
  const target = targetFromEngineFiles(dir);
  if (!target) return undefined;
  return { target, manifest: newManifest({ target }), source: "engine-files" };
}

/** Which game a tempi run works on. */
export type GameChoice =
  | { kind: "new"; target: TargetId }
  | {
      kind: "existing";
      target: TargetId;
      workspace: string;
      manifest: GameManifest;
      /** Found by its engine files: write the manifest once tempi is sure to continue it. */
      adopt: boolean;
    };

/**
 * Decides whether tempi continues an existing game (the working directory, or
 * `--out`) or starts a new one. An explicit `--target` that disagrees with the
 * existing game's target is an error: a game keeps its engine.
 */
export function resolveGame(options: { target?: TargetId; out?: string }, cwd: string): GameChoice {
  const dir = options.out ? path.resolve(cwd, options.out) : cwd;
  const game = detectGame(dir);
  if (!game) return { kind: "new", target: options.target ?? DEFAULT_TARGET };
  if (options.target && options.target !== game.target) {
    throw new Error(
      `${dir} holds a ${game.target} game; tempi can't continue it as ${options.target}. Drop --target or use --target ${game.target}.`,
    );
  }
  return { kind: "existing", target: game.target, workspace: dir, manifest: game.manifest, adopt: game.source === "engine-files" };
}

/** The agent's notes on the game, capped so they don't crowd the prompt; undefined when there are none. */
export function readNotes(workspace: string, maxBytes = 8_000): string | undefined {
  const file = notesPath(workspace);
  if (!existsSync(file)) return undefined;
  const text = readFileSync(file, "utf8").trim();
  if (!text) return undefined;
  return text.length > maxBytes ? `${text.slice(0, maxBytes)}\n[… notes cut; read ${NOTES_FILE} for the rest]` : text;
}
