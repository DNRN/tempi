import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CheckOptions, CheckResult, RunningGame, Target } from "./target.js";

export interface GodotTargetOptions {
  /** The Godot binary. Default: `godot` on PATH. */
  godot?: string;
  /** Frames the check runs the main scene for. Default 240 (about 4 s at 60 fps). */
  checkFrames?: number;
  /** Open a Godot window for the user. Default true. */
  open?: boolean;
}

const GODOT_MISSING =
  "Godot 4 is not on PATH as `godot`. Install Godot 4 (https://godotengine.org/download, or your package manager) and make sure `godot --version` works.";
const PROCESS_TIMEOUT_MS = 60_000;

export const GODOT_INSTRUCTIONS = `Target: Godot 4 (GDScript). Build the game as a Godot project in the workspace root:
- project.godot is already there; its run/main_scene is res://main.tscn. Write scenes (.tscn) and GDScript (.gd) as text files. No C#, no GDExtensions, no addons from the network.
- 2D or 3D, whichever suits the idea. Placeholders: ColorRect/Polygon2D/draw calls in 2D, primitive meshes (BoxMesh, SphereMesh, CapsuleMesh) with a StandardMaterial3D in 3D. A 3D scene needs a Camera3D and a light.
- Assets live in assets/ and are loaded by res:// path (load("res://assets/ball.glb") gives a PackedScene to instantiate; images give a Texture2D, sounds an AudioStream). Godot imports them when check_game runs, so run it after adding assets.
- Input: use the built-in ui_left, ui_right, ui_up, ui_down, ui_accept actions, or define your own actions in project.godot's [input] section. Show the controls on screen.
- check_game imports the project, runs the main scene headless for a few seconds, presses the arrow keys, space, and enter and clicks the centre, and reports script errors, parse errors, and engine errors with file and line. It has no screenshot: headless Godot doesn't render.`;

const SCAFFOLD: Record<string, string> = {
  "project.godot": `; Engine configuration file.
config_version=5

[application]
config/name="Game"
run/main_scene="res://main.tscn"
config/features=PackedStringArray("4.7")

[display]
window/size/viewport_width=1152
window/size/viewport_height=648
`,
  "main.tscn": `[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://main.gd" id="1"]

[node name="Main" type="Node2D"]
script = ExtResource("1")
`,
  "main.gd": `extends Node2D

func _draw() -> void:
	var size := get_viewport_rect().size
	draw_rect(Rect2(Vector2.ZERO, size), Color.BLACK)
	draw_string(ThemeDB.fallback_font, Vector2(size.x / 2 - 120, size.y / 2), "Your game goes here", HORIZONTAL_ALIGNMENT_LEFT, -1, 24)
`,
};

/** The autoload tempi adds while checking: it presses the usual keys and clicks once the game has started. */
const CHECK_INPUT_SCRIPT = `extends Node

var _frame := 0

func _press(event: InputEvent) -> void:
	Input.parse_input_event(event)
	var release := event.duplicate()
	release.pressed = false
	Input.parse_input_event(release)

func _process(_delta: float) -> void:
	_frame += 1
	if _frame != 30:
		return
	for key in [KEY_LEFT, KEY_RIGHT, KEY_UP, KEY_DOWN, KEY_SPACE, KEY_ENTER]:
		var event := InputEventKey.new()
		event.keycode = key
		event.physical_keycode = key
		event.pressed = true
		_press(event)
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = get_viewport().get_visible_rect().size / 2
	_press(click)
`;
const CHECK_SCRIPT_PATH = ".tempi/tempi_check_input.gd";
const OVERRIDE_FILE = "override.cfg";

interface GodotRun {
  output: string;
  code: number | null;
  timedOut: boolean;
}

function runGodot(godot: string, args: string[], signal?: AbortSignal): Promise<GodotRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(godot, args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NO_COLOR: "1" } });
    let output = "";
    let timedOut = false;
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, PROCESS_TIMEOUT_MS);
    const abort = () => child.kill("SIGKILL");
    signal?.addEventListener("abort", abort, { once: true });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) reject(new Error("The check was cancelled."));
      else resolve({ output, code, timedOut });
    });
  });
}

const ANSI = /\x1b\[[0-9;]*m/g;

/**
 * Reads Godot's log: script and parse errors (not playable), engine and user
 * errors (reported), each with its res:// location when Godot gives one.
 * Repeats of the same error are counted, not listed again.
 */
export function parseGodotOutput(output: string): { errors: string[]; fatal: boolean } {
  const lines = output.replace(ANSI, "").split(/\r?\n/);
  const counts = new Map<string, number>();
  let fatal = false;
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    const match = /^(SCRIPT ERROR|USER SCRIPT ERROR|ERROR|USER ERROR|Error):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, kind = "", message = ""] = match;
    // The location is on the following lines: "at: fn (res://file.gd:4)" or a GDScript backtrace "[0] fn (res://file.gd:4)".
    let where = "";
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
      const res = /\((res:\/\/[^)]+)\)/.exec(lines[j] ?? "");
      if (res) {
        where = res[1] ?? "";
        break;
      }
      if (/^(SCRIPT ERROR|USER SCRIPT ERROR|ERROR|USER ERROR|WARNING|Error):/.test((lines[j] ?? "").trim())) break;
    }
    if (kind === "SCRIPT ERROR" || kind === "USER SCRIPT ERROR" || /Failed to load script|Can't run project|Failed loading resource: res:\/\/main\.tscn/.test(message)) {
      fatal = true;
    }
    const text = `${kind}: ${message}${where ? ` (${where})` : ""}`;
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return { errors: [...counts].map(([text, n]) => (n > 1 ? `${text} (x${n})` : text)), fatal };
}

/** The Godot 4 target: a GDScript project, checked by running it headless. */
export function createGodotTarget(options: GodotTargetOptions = {}): Target {
  const godot = options.godot ?? "godot";
  const checkFrames = options.checkFrames ?? 240;
  const open = options.open ?? true;

  return {
    id: "godot",
    name: "Godot 4",
    instructions: GODOT_INSTRUCTIONS,

    async prerequisites() {
      try {
        const { output, code } = await runGodot(godot, ["--version"]);
        const version = output.trim().split(/\s+/)[0] ?? "";
        if (code !== 0) return [GODOT_MISSING];
        if (!version.startsWith("4.")) return [`tempi needs Godot 4; \`${godot} --version\` says ${version || "nothing"}.`];
        return [];
      } catch {
        return [GODOT_MISSING];
      }
    },

    async scaffold(workspace) {
      const existing = existsSync(workspace) ? readdirSync(workspace).filter((f) => !f.startsWith(".")) : [];
      if (existing.length > 0) throw new Error(`Workspace ${workspace} is not empty; scaffold only into a new game.`);
      for (const [file, content] of Object.entries(SCAFFOLD)) {
        const target = path.join(workspace, file);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, content);
      }
      mkdirSync(path.join(workspace, "assets"), { recursive: true });
    },

    async check(workspace, checkOptions: CheckOptions = {}): Promise<CheckResult> {
      if (!existsSync(path.join(workspace, "project.godot"))) {
        return { playable: false, errors: ["project.godot is missing from the workspace root."] };
      }
      const imported = await runGodot(godot, ["--headless", "--path", workspace, "--import"], checkOptions.signal);
      const importErrors = parseGodotOutput(imported.output);
      if (imported.timedOut) return { playable: false, errors: [...importErrors.errors, "Godot's import did not finish within 60 s."] };

      // A check-time autoload simulates input. override.cfg is the project's
      // local settings override; an existing one is restored afterwards.
      const overridePath = path.join(workspace, OVERRIDE_FILE);
      const previousOverride = existsSync(overridePath) ? readFileSync(overridePath, "utf8") : undefined;
      mkdirSync(path.join(workspace, ".tempi"), { recursive: true });
      writeFileSync(path.join(workspace, CHECK_SCRIPT_PATH), CHECK_INPUT_SCRIPT);
      writeFileSync(overridePath, `${previousOverride ? `${previousOverride}\n` : ""}[autoload]\n\nTempiCheckInput="*res://${CHECK_SCRIPT_PATH}"\n`);
      let ran: GodotRun;
      try {
        ran = await runGodot(godot, ["--headless", "--path", workspace, "--quit-after", String(checkFrames)], checkOptions.signal);
      } finally {
        if (previousOverride === undefined) rmSync(overridePath, { force: true });
        else writeFileSync(overridePath, previousOverride);
      }

      const runErrors = parseGodotOutput(ran.output);
      const errors = [...new Set([...importErrors.errors, ...runErrors.errors])];
      if (ran.timedOut) errors.push(`The game did not finish ${checkFrames} frames within 60 s (an endless loop?).`);
      else if (ran.code !== 0 && errors.length === 0) errors.push(`Godot exited with code ${ran.code}.`);
      return { playable: !runErrors.fatal && !ran.timedOut && ran.code === 0, errors };
    },

    async run(workspace): Promise<RunningGame> {
      if (!open) return { location: `not opened; play it with: ${godot} --path ${workspace}`, stop: async () => {} };
      const child: ChildProcess = spawn(godot, ["--path", workspace], { stdio: "ignore" });
      await new Promise<void>((resolve, reject) => {
        child.once("spawn", () => resolve());
        child.once("error", reject);
      });
      return {
        location: "a Godot window",
        stop: async () => {
          if (child.exitCode !== null || child.signalCode !== null) return;
          await new Promise<void>((resolve) => {
            child.once("exit", () => resolve());
            child.kill("SIGTERM");
          });
        },
      };
    },
  };
}
