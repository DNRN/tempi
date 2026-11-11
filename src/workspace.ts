import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

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
