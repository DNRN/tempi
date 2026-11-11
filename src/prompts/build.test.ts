import { expect, test } from "vitest";
import { createFakeTarget } from "../targets/fake-target.testutil.js";
import { createGodotTarget } from "../targets/godot.js";
import { createWebTarget } from "../targets/web.js";
import { ASSET_BUDGET, assetGuidance, fixPrompt, targetGuidance } from "./build.js";

const { target } = createFakeTarget();
const GENERATORS = [
  { name: "blender", description: "Running Blender instance: 3D models (GLB)", tools: 26 },
  { name: "comfyui", description: "Local ComfyUI: image generation for sprites and textures", tools: 39 },
];

test("with generators, the guidance names them, says how to save, sets the budget, and adds the target's notes", () => {
  const text = assetGuidance(GENERATORS, target);
  expect(text).toContain("- blender: Running Blender instance: 3D models (GLB)");
  expect(text).toContain("- comfyui: Local ComfyUI: image generation for sprites and textures");
  expect(text).toContain("tools.save_asset");
  expect(text).toContain(`at most ${ASSET_BUDGET.change} generated assets per turn, ${ASSET_BUDGET.build} for the first build`);
  expect(text).toContain("use a placeholder for that asset and carry on");
  expect(text).toContain("Fake asset notes.");
  expect(text).toContain("search their tools and templates for that kind");
  expect(text).toContain("synthesize simple game sounds");
  expect(text).toContain("Use a sound generator for realistic sounds");
  expect(text).toContain("Build in a new temporary scene, export to a file, then delete that scene and everything you created for it");
});

test("without generators, the guidance asks for art drawn in code and leaves out the target's notes", () => {
  const text = assetGuidance([], target);
  expect(text).toMatch(/no asset generators are configured, so draw all art in code/);
  expect(text).toContain("synthesize simple game sounds");
  expect(text).not.toContain("sound generator");
  expect(text).not.toContain("Fake asset notes.");
});

test("the target guidance carries the target's rules, the first-build rule, and the question rule", () => {
  const text = targetGuidance(target);
  expect(text).toContain("Game target: Fake.");
  expect(text).toContain("Fake target instructions.");
  expect(text).toContain("the user's next message is the idea for a new game");
  expect(text).toContain("For a question, answer it and leave the game's files alone");
  expect(text).toContain("tempi checks the game again after your turn and starts it for the user");
  expect(text).not.toContain("asset generators");
});

test("the fix prompt carries the formatted check result", () => {
  const text = fixPrompt({ playable: false, errors: ["Uncaught TypeError: boom"] }, target);
  expect(text).toContain("still has problems");
  expect(text).toContain("- Uncaught TypeError: boom");
  expect(text).toContain("run check_game until it reports no errors");
});

test("each target has asset notes: web stays 2D, Godot covers GLB models and prefers 3D for moving through space", () => {
  expect(createWebTarget().assetNotes).toContain("2D only, no 3D models");
  const godot = createGodotTarget();
  expect(godot.assetNotes).toContain('load("res://assets/<name>.glb") as a PackedScene');
  expect(godot.instructions).toContain("Use 3D when the idea is about moving through space");
});
