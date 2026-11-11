import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { call, runScripted, say } from "./e2e.testutil.js";
import { createGodotTarget } from "./targets/godot.js";
import { createWebTarget } from "./targets/web.js";

// End-to-end with the user's own MCP servers: a scripted model generates an
// image with the local ComfyUI server, saves it with save_asset, and builds a
// game that uses it. Uses the GPU (about 20 s per image), so it runs only with
// TEMPI_LOCAL_MCP=1 (`npm run test:local-mcp`) and needs a `comfyui` server
// with generate_image in pi's mcp.json.

const enabled = process.env.TEMPI_LOCAL_MCP === "1";

/** The codemode script a model would write: generate, then save the output file. */
const GENERATE_AND_SAVE = `const r = await tools.mcp__comfyui__generate_image({ prompt: "pixel art sprite of a red apple, plain white background" });
const text = typeof r === "string" ? r : (r.content ?? []).map((c) => c.text ?? "").join("");
const output = JSON.parse(text).outputs[0];
return await tools.save_asset({ name: "apple.png", path: output });`;

let dir: string;
let workspace: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "tempi-e2e-mcp-"));
  workspace = path.join(dir, "game");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function expectSavedApple(tools: { name: string; isError: boolean; text: string }[]) {
  const codemode = tools.find((t) => t.name === "codemode");
  expect(codemode?.isError).toBe(false);
  expect(codemode?.text).toMatch(/Saved assets\/apple\.png \(image, image\/png, \d+ bytes\)/);
  const png = readFileSync(path.join(workspace, "assets", "apple.png"));
  expect(png.subarray(1, 4).toString()).toBe("PNG");
}

describe.skipIf(!enabled)("with the local ComfyUI MCP server", () => {
  test("web: generates a sprite, saves it, and the game that draws it passes the check", async () => {
    const run = await runScripted({
      target: createWebTarget({ checkDurationMs: 1500, openUrl: async () => {} }),
      workspace,
      agentDir: getAgentDir(),
      idea: "catch the apple",
      answers: [""],
      responses: [
        call("codemode", { code: GENERATE_AND_SAVE }),
        call("write", {
          path: "src/main.js",
          content: `const ctx = document.getElementById("game").getContext("2d");
const apple = new Image();
apple.onload = () => ctx.drawImage(apple, 350, 250, 100, 100);
apple.src = "assets/apple.png";
`,
        }),
        call("check_game", {}),
        say("Done: the apple is drawn from the generated sprite."),
      ],
    });
    expect(run.info[0]).toMatch(/^Asset generators: .*comfyui/);
    expect(run.unused).toBe(0);
    expectSavedApple(run.tools);
    expect(run.result.lastCheck).toEqual({ playable: true, errors: [], screenshot: ".tempi/check.png" });
    expect(run.info.some((m) => m.startsWith("The agent generated no assets"))).toBe(false);
  }, 300_000);

  test("godot: generates a texture, saves it, and the game that imports and shows it passes the check", async () => {
    const run = await runScripted({
      target: createGodotTarget({ checkFrames: 90, open: false }),
      workspace,
      agentDir: getAgentDir(),
      idea: "catch the apple",
      answers: [""],
      responses: [
        call("codemode", { code: GENERATE_AND_SAVE }),
        call("write", {
          path: "main.gd",
          content: `extends Node2D

func _ready() -> void:
\tvar sprite := Sprite2D.new()
\tsprite.texture = load("res://assets/apple.png")
\tsprite.position = Vector2(576, 324)
\tsprite.scale = Vector2(0.1, 0.1)
\tadd_child(sprite)
`,
        }),
        call("check_game", {}),
        say("Done: the apple is a Sprite2D with the generated texture."),
      ],
    });
    expect(run.unused).toBe(0);
    expectSavedApple(run.tools);
    expect(run.result.lastCheck).toEqual({ playable: true, errors: [] });
  }, 300_000);
});
