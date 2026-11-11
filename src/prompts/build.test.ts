import { expect, test } from "vitest";
import { createFakeTarget } from "../targets/fake-target.testutil.js";
import { createGodotTarget } from "../targets/godot.js";
import { createWebTarget } from "../targets/web.js";
import { ASSET_BUDGET, assetGuidance, buildPrompt, changePrompt } from "./build.js";

const { target } = createFakeTarget();
const GENERATORS = [
  { name: "blender", description: "Running Blender instance: 3D models (GLB)", tools: 26 },
  { name: "comfyui", description: "Local ComfyUI: image generation for sprites and textures", tools: 39 },
];

test("with generators, the guidance names them, says how to save, sets the budget, and adds the target's notes", () => {
  const text = assetGuidance(GENERATORS, target, 6);
  expect(text).toContain("- blender: Running Blender instance: 3D models (GLB)");
  expect(text).toContain("- comfyui: Local ComfyUI: image generation for sprites and textures");
  expect(text).toContain("tools.save_asset");
  expect(text).toContain("at most 6 generated assets");
  expect(text).toContain("use a placeholder for that asset and carry on");
  expect(text).toContain("Fake asset notes.");
});

test("without generators, the guidance asks for art drawn in code and leaves out the target's notes", () => {
  const text = assetGuidance([], target, 6);
  expect(text).toMatch(/no asset generators are configured, so draw all art in code/);
  expect(text).not.toContain("Fake asset notes.");
});

test("build and change prompts carry the idea or request, the generators, and their budgets", () => {
  const build = buildPrompt(" a cat catches fish ", target, GENERATORS);
  expect(build).toContain("Fake target instructions.");
  expect(build).toContain("Build this game: a cat catches fish\n");
  expect(build).toContain(`at most ${ASSET_BUDGET.build} generated assets`);
  const change = changePrompt("faster fish", target, GENERATORS);
  expect(change).toContain("asks for this change: faster fish");
  expect(change).toContain(`at most ${ASSET_BUDGET.change} generated assets`);
  expect(buildPrompt("x", target)).toContain("no asset generators are configured");
});

test("each target has asset notes: web stays 2D, Godot covers GLB models and prefers 3D for moving through space", () => {
  expect(createWebTarget().assetNotes).toContain("2D only, no 3D models");
  const godot = createGodotTarget();
  expect(godot.assetNotes).toContain('load("res://assets/<name>.glb") as a PackedScene');
  expect(godot.instructions).toContain("Use 3D when the idea is about moving through space");
});
