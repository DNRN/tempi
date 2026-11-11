import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createGodotTarget, parseGodotOutput } from "./godot.js";

describe("parseGodotOutput, on output captured from Godot 4.7.2", () => {
  test("a runtime script error is fatal, with its location, and repeats are counted", () => {
    const output = `Godot Engine v4.7.2.stable.arch_linux.ed1daf0bf - https://godotengine.org

ready
SCRIPT ERROR: Invalid call. Nonexistent function 'jump' in base 'Nil'.
          at: _unhandled_input (res://main.gd:9)
          GDScript backtrace (most recent call first):
              [0] _unhandled_input (res://main.gd:9)
SCRIPT ERROR: Invalid call. Nonexistent function 'jump' in base 'Nil'.
          at: _unhandled_input (res://main.gd:9)
`;
    expect(parseGodotOutput(output)).toEqual({
      errors: ["SCRIPT ERROR: Invalid call. Nonexistent function 'jump' in base 'Nil'. (res://main.gd:9) (x2)"],
      fatal: true,
    });
  });

  test("a parse error is fatal; the engine's follow-up error is listed with it", () => {
    const output = `SCRIPT ERROR: Parse Error: Expected expression for variable initial value after "=".
          at: GDScript::reload (res://main.gd:4)
ERROR: Failed to load script "res://main.gd" with error "Parse error".
   at: load (modules/gdscript/gdscript_resource_format.cpp:46)
`;
    expect(parseGodotOutput(output)).toEqual({
      errors: [
        'SCRIPT ERROR: Parse Error: Expected expression for variable initial value after "=". (res://main.gd:4)',
        'ERROR: Failed to load script "res://main.gd" with error "Parse error".',
      ],
      fatal: true,
    });
  });

  test("a missing resource is reported with the script line that loaded it, but is not fatal", () => {
    const output = `\x1b[91mERROR: Resource file not found: res://assets/cat.png (expected type: unknown)\x1b[0m
   at: _load (core/io/resource_loader.cpp:325)
   GDScript backtrace (most recent call first):
       [0] _ready (res://main.gd:4)
<Object#null>
WARNING: something harmless
`;
    expect(parseGodotOutput(output)).toEqual({
      errors: ["ERROR: Resource file not found: res://assets/cat.png (expected type: unknown) (res://main.gd:4)"],
      fatal: false,
    });
  });

  test("no main scene is fatal; clean output has no errors", () => {
    expect(parseGodotOutput("Error: Can't run project: no main scene defined in the project.\n")).toEqual({
      errors: ["Error: Can't run project: no main scene defined in the project."],
      fatal: true,
    });
    expect(parseGodotOutput("Godot Engine v4.7.2\nready\n")).toEqual({ errors: [], fatal: false });
  });
});

// These run the real Godot, as the check does.
const target = createGodotTarget({ checkFrames: 90, open: false });
let godotMissing: string | undefined;
beforeAll(async () => {
  godotMissing = (await target.prerequisites())[0];
}, 30_000);

let dir: string;
let workspace: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "tempi-godot-"));
  workspace = path.join(dir, "game");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const script = (body: string) => writeFileSync(path.join(workspace, "main.gd"), `extends Node2D\n\n${body}\n`);

test("scaffold writes a Godot project into an empty workspace only", async () => {
  await target.scaffold(workspace);
  expect(readFileSync(path.join(workspace, "project.godot"), "utf8")).toContain('run/main_scene="res://main.tscn"');
  expect(existsSync(path.join(workspace, "assets"))).toBe(true);
  await expect(target.scaffold(workspace)).rejects.toThrow(/not empty/);
});

test("a workspace without project.godot is not playable, without starting Godot", async () => {
  await expect(target.check(dir)).resolves.toEqual({ playable: false, errors: ["project.godot is missing from the workspace root."] });
});

describe("check with Godot", () => {
  beforeEach((context) => {
    if (godotMissing) context.skip(`Godot missing: ${godotMissing}`);
  });

  test("the scaffold is playable, and the check leaves no override.cfg behind", async () => {
    await target.scaffold(workspace);
    await expect(target.check(workspace)).resolves.toEqual({ playable: true, errors: [] });
    expect(existsSync(path.join(workspace, "override.cfg"))).toBe(false);
  }, 60_000);

  test("a parse error makes the game unplayable", async () => {
    await target.scaffold(workspace);
    script("func _ready() -> void:\n\tvar x = ");
    const result = await target.check(workspace);
    expect(result.playable).toBe(false);
    expect(result.errors[0]).toMatch(/^SCRIPT ERROR: Parse Error: .*\(res:\/\/main\.gd:4\)/);
  }, 60_000);

  test("an error in an input handler is found by the simulated input", async () => {
    await target.scaffold(workspace);
    script('func _unhandled_input(event: InputEvent) -> void:\n\tif event.is_action_pressed("ui_accept"):\n\t\tvar player = null\n\t\tplayer.jump()');
    const result = await target.check(workspace);
    expect(result.playable).toBe(false);
    expect(result.errors[0]).toMatch(/^SCRIPT ERROR: Invalid call\. Nonexistent function 'jump' in base 'Nil'\. \(res:\/\/main\.gd:6\)/);
  }, 60_000);

  test("a missing asset is reported, but the game still counts as playable", async () => {
    await target.scaffold(workspace);
    script('func _ready() -> void:\n\tvar t = load("res://assets/cat.png")');
    const result = await target.check(workspace);
    expect(result.playable).toBe(true);
    expect(result.errors).toEqual([expect.stringMatching(/^ERROR: Resource file not found: res:\/\/assets\/cat\.png.*\(res:\/\/main\.gd:4\)$/)]);
  }, 60_000);

  test("a project's own override.cfg is restored after the check", async () => {
    await target.scaffold(workspace);
    writeFileSync(path.join(workspace, "override.cfg"), '[display]\n\nwindow/size/viewport_width=640\n');
    await expect(target.check(workspace)).resolves.toMatchObject({ playable: true });
    expect(readFileSync(path.join(workspace, "override.cfg"), "utf8")).toBe('[display]\n\nwindow/size/viewport_width=640\n');
  }, 60_000);

  test("a 3D scene with primitive meshes is playable", async () => {
    await target.scaffold(workspace);
    writeFileSync(
      path.join(workspace, "main.tscn"),
      `[gd_scene load_steps=3 format=3]

[sub_resource type="SphereMesh" id="1"]

[sub_resource type="BoxMesh" id="2"]

[node name="Main" type="Node3D"]

[node name="Ball" type="MeshInstance3D" parent="."]
mesh = SubResource("1")

[node name="Floor" type="MeshInstance3D" parent="."]
transform = Transform3D(10, 0, 0, 0, 0.1, 0, 0, 0, 10, 0, -1, 0)
mesh = SubResource("2")

[node name="Camera3D" type="Camera3D" parent="."]
transform = Transform3D(1, 0, 0, 0, 0.9, 0.4, 0, -0.4, 0.9, 0, 3, 6)

[node name="Sun" type="DirectionalLight3D" parent="."]
`,
    );
    await expect(target.check(workspace)).resolves.toEqual({ playable: true, errors: [] });
  }, 60_000);
});

test("with open: false, run starts nothing and says how to play", async () => {
  const running = await target.run(workspace);
  expect(running.location).toBe(`not opened; play it with: godot --path ${workspace}`);
  await running.stop();
});

test("run starts Godot on the project and stop ends it", async () => {
  const fakeGodot = path.join(dir, "fake-godot.sh");
  const marker = path.join(dir, "args.txt");
  writeFileSync(fakeGodot, `#!/bin/sh\necho "$@" > "${marker}"\nexec sleep 30\n`, { mode: 0o755 });
  const windowed = createGodotTarget({ godot: fakeGodot });
  const running = await windowed.run(workspace);
  expect(running.location).toBe("a Godot window");
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(readFileSync(marker, "utf8").trim()).toBe(`--path ${workspace}`);
  const stopped = Date.now();
  await running.stop();
  expect(Date.now() - stopped).toBeLessThan(5000);
  await running.stop();
});
