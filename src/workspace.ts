import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

/** A folder name from the idea: lowercase words joined by dashes, at most 40 characters. */
export function workspaceName(idea: string): string {
  const slug = idea
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return slug || "game";
}

function isEmptyDir(dir: string): boolean {
  return readdirSync(dir).length === 0;
}

/**
 * Chooses the game's workspace. An explicit `out` must be new or empty. Without
 * one, a new folder in `parent` is named after the idea, with -2, -3, ... added
 * when the name is taken.
 */
export function chooseWorkspace(idea: string, parent: string, out?: string): string {
  if (out) {
    const dir = path.resolve(parent, out);
    if (existsSync(dir) && (!statSync(dir).isDirectory() || !isEmptyDir(dir))) {
      throw new Error(`${dir} already exists and is not an empty directory. Choose a new --out.`);
    }
    return dir;
  }
  const base = path.resolve(parent, workspaceName(idea));
  for (let n = 1; ; n++) {
    const dir = n === 1 ? base : `${base}-${n}`;
    if (!existsSync(dir) || (statSync(dir).isDirectory() && isEmptyDir(dir))) return dir;
  }
}

/** Where a workspace keeps tempi's pi session files. */
export function sessionDir(workspace: string): string {
  return path.join(workspace, ".tempi", "sessions");
}

/**
 * Creates the game workspace if needed and writes the pi project settings tempi
 * relies on: `subagents.defaultExtensions: []` keeps background subagent
 * children from loading the user's own pi extensions (pi-subagents reads this
 * from the settings file, not from tempi's in-memory settings). Other keys in
 * an existing `.pi/settings.json` are kept.
 */
export function prepareWorkspace(workspace: string): void {
  mkdirSync(workspace, { recursive: true });
  const file = path.join(workspace, ".pi", "settings.json");
  let settings: Record<string, unknown> = {};
  if (existsSync(file)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error(`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${file} must hold a JSON object.`);
    }
    settings = parsed as Record<string, unknown>;
  }
  const current = settings.subagents;
  const subagents = current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>) : {};
  const next = { ...settings, subagents: { ...subagents, defaultExtensions: [] } };
  if (existsSync(file) && JSON.stringify(next) === JSON.stringify(settings)) return;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
}
