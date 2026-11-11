import type { Target, TargetId } from "./target.js";
import { createGodotTarget } from "./godot.js";
import { createWebTarget } from "./web.js";

export interface TargetOptions {
  /** Open the game for the user (a browser tab, a window). Default true. */
  open?: boolean;
}

/** The target the CLI uses when `--target` is not given. */
export const DEFAULT_TARGET: TargetId = "web";

/** Creates the target for an id. */
export function createTarget(id: TargetId, options: TargetOptions = {}): Target {
  switch (id) {
    case "web":
      return createWebTarget(options.open === false ? { openUrl: async () => {} } : {});
    case "godot":
      return createGodotTarget({ open: options.open !== false });
  }
}
