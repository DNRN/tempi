/** The game targets tempi builds, chosen per game with `--target`. */
export const TARGET_IDS = ["web", "godot"] as const;
export type TargetId = (typeof TARGET_IDS)[number];

/** Parses a `--target` value. Throws with the valid choices when it is not one. */
export function parseTargetId(value: string): TargetId {
  const id = value.trim().toLowerCase();
  if ((TARGET_IDS as readonly string[]).includes(id)) return id as TargetId;
  throw new Error(`Unknown target "${value}". Choose one of: ${TARGET_IDS.join(", ")}.`);
}

/** What the headless playable check found. */
export interface CheckResult {
  /** The game loaded and ran for the check's duration without errors. */
  playable: boolean;
  /** Errors in the order they appeared: console errors, script errors, a missing entry file. */
  errors: string[];
  /** A screenshot taken at the end of the check, relative to the workspace, when the target takes one. */
  screenshot?: string;
}

/** A game started for the user to play. */
export interface RunningGame {
  /** Where the game is, for the user: a URL or "Godot window". */
  location: string;
  /** Stops the game and anything started for it (a web server, the Godot process). */
  stop(): Promise<void>;
}

export interface CheckOptions {
  signal?: AbortSignal;
}

/**
 * A game target: what the co-creation loop needs from an engine. The loop is
 * the same for every target; everything engine-specific lives here.
 */
export interface Target {
  readonly id: TargetId;
  /** Shown to the user, such as "Web (HTML5)". */
  readonly name: string;
  /**
   * Target-specific instructions added to the build and change prompts: project
   * layout, engine version, entry file, and how the playable check works.
   */
  readonly instructions: string;
  /** Problems that stop this target from running on this machine; empty when ready. */
  prerequisites(): Promise<string[]>;
  /** Puts the target's starting files into a new, empty workspace. */
  scaffold(workspace: string): Promise<void>;
  /** Loads the game headlessly and reports whether it is playable. */
  check(workspace: string, options?: CheckOptions): Promise<CheckResult>;
  /** Starts the game for the user. */
  run(workspace: string): Promise<RunningGame>;
}

/** The check result as the agent reads it. */
export function formatCheckResult(target: Target, result: CheckResult): string {
  const screenshot = result.screenshot ? [`Screenshot at the end of the check: ${result.screenshot}`] : [];
  if (result.playable && result.errors.length === 0) {
    return [`The ${target.name} game loaded and ran without errors.`, ...screenshot].join("\n");
  }
  const lines = result.errors.length > 0 ? result.errors.map((e) => `- ${e}`) : ["- (no error message; the game did not start)"];
  const verdict = result.playable ? "The game loaded, but reported errors:" : "The game is not playable. Errors:";
  return [`${target.name} check: ${verdict}`, ...lines, ...screenshot].join("\n");
}
