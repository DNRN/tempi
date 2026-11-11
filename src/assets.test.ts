import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { configuredMcpServerCount, listAssetGenerators, waitForAssetGenerators } from "./assets.js";

const comfy = { name: "mcp__comfyui", aliases: ["comfyui"], description: "Local ComfyUI: image generation for sprites and textures" };
const blender = { name: "mcp__blender", aliases: ["blender"], description: "Running Blender instance: 3D models (GLB)" };
const TOOLS = [
  { name: "read" },
  { name: "mcp__comfyui__generate_image", namespace: comfy },
  { name: "mcp__comfyui__run_workflow", namespace: comfy },
  { name: "mcp__blender__execute_blender_code", namespace: blender },
  { name: "list_mcp_resources" },
  { name: "mcp__docs__search", namespace: { name: "mcp__docs" } },
];

test("listAssetGenerators groups MCP tools by server, with descriptions", () => {
  expect(listAssetGenerators(TOOLS)).toEqual([
    { name: "blender", description: "Running Blender instance: 3D models (GLB)", tools: 1 },
    { name: "comfyui", description: "Local ComfyUI: image generation for sprites and textures", tools: 2 },
    { name: "docs", tools: 1 },
  ]);
  expect(listAssetGenerators([{ name: "read" }, { name: "codemode" }])).toEqual([]);
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "tempi-mcp-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("configuredMcpServerCount counts enabled servers, reads comments, and says when it can't tell", () => {
  expect(configuredMcpServerCount(dir)).toBe(0);
  writeFileSync(path.join(dir, "mcp.json"), JSON.stringify({ mcpServers: { a: { command: "x" }, b: { command: "y", enabled: false }, c: { url: "z" } } }));
  expect(configuredMcpServerCount(dir)).toBe(2);
  writeFileSync(path.join(dir, "mcp.json"), '{\n  // images\n  "mcpServers": { /* main */ "a": { "command": "x" } }\n}');
  expect(configuredMcpServerCount(dir)).toBe(1);
  writeFileSync(path.join(dir, "mcp.json"), "{ not json");
  expect(configuredMcpServerCount(dir)).toBeUndefined();
});

test("waitForAssetGenerators returns once the expected servers are there", async () => {
  let calls = 0;
  const getTools = () => (++calls < 3 ? [] : TOOLS.slice(0, 4));
  const started = Date.now();
  const generators = await waitForAssetGenerators(getTools, 2, 5000, 10);
  expect(generators.map((g) => g.name)).toEqual(["blender", "comfyui"]);
  expect(calls).toBe(3);
  expect(Date.now() - started).toBeLessThan(1000);
});

test("waitForAssetGenerators doesn't wait when none are configured, and stops at the timeout otherwise", async () => {
  await expect(waitForAssetGenerators(() => [], 0, 5000, 10)).resolves.toEqual([]);
  const started = Date.now();
  await expect(waitForAssetGenerators(() => [], 2, 100, 10)).resolves.toEqual([]);
  expect(Date.now() - started).toBeGreaterThanOrEqual(100);
  await expect(waitForAssetGenerators(() => TOOLS.slice(0, 3), undefined, 50, 10)).resolves.toHaveLength(1);
});
