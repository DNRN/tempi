import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { call, runScripted, say } from "./e2e.testutil.js";
import { createGodotTarget } from "./targets/godot.js";
import { createWebTarget } from "./targets/web.js";

// End-to-end smoke tests: the whole loop as the CLI runs it (real session,
// tools, targets, and checks), with a scripted model and a pi agent dir that
// has no credentials and no MCP servers, so CI needs no keys or network.

let dir: string;
let agentDir: string;
let workspace: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "tempi-e2e-"));
  agentDir = path.join(dir, "agent");
  workspace = path.join(dir, "game");
  mkdirSync(agentDir, { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const WEB_BROKEN = `const ctx = document.getElementById("game").getContext("2d");\nplayer.draw(ctx);\n`;
const webGame = (colour: string) => `const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let x = 400;
addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") x -= 10;
  if (e.key === "ArrowRight") x += 10;
});
function frame() {
  ctx.fillStyle = "${colour}";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0f0";
  ctx.fillRect(x - 20, 500, 40, 40);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
`;

const web = createWebTarget({ checkDurationMs: 1200, openUrl: async () => {} });
const webReady = web.prerequisites().then((problems) => problems[0]);

test("web: idea → broken build → tempi's fix round → play → change → play → done", async (context) => {
  const missing = await webReady;
  if (missing) context.skip(missing);
  const run = await runScripted({
    target: web,
    workspace,
    agentDir,
    idea: "a green square dodges things",
    answers: ["make the background blue", ""],
    responses: [
      // Build: the agent writes a broken game and stops without checking.
      call("write", { path: "src/main.js", content: WEB_BROKEN }),
      say("Built it."),
      // tempi's own check fails and asks for a fix.
      call("write", { path: "src/main.js", content: webGame("#000") }),
      call("check_game", {}),
      say("Fixed: the square moves with the arrow keys."),
      // The change request.
      call("edit", { path: "src/main.js", edits: [{ oldText: '"#000"', newText: '"#00f"' }] }),
      call("check_game", {}),
      say("The background is blue now."),
    ],
  });

  expect(run.unused).toBe(0);
  expect(run.result).toEqual({ workspace, changes: 1, lastCheck: { playable: true, errors: [], screenshot: ".tempi/check.png" } });
  expect(run.info).toContain("No asset generators configured: the game will use placeholder art. Add an image, sound, or 3D model generator with `pi mcp add` to get real assets.");
  expect(run.info).toContain("tempi's check found problems; asking the agent to fix them (round 1 of 3).");
  expect(run.info.filter((m) => m.startsWith("Your game is running: http://127.0.0.1:"))).toHaveLength(2);
  expect(run.tools.filter((t) => t.name === "check_game").map((t) => t.text)).toEqual([
    "The Web (HTML5) game loaded and ran without errors.\nScreenshot at the end of the check: .tempi/check.png",
    "The Web (HTML5) game loaded and ran without errors.\nScreenshot at the end of the check: .tempi/check.png",
  ]);
  expect(run.tools.every((t) => !t.isError)).toBe(true);
  expect(readFileSync(path.join(workspace, "src", "main.js"), "utf8")).toContain('"#00f"');
}, 120_000);

const godotGame = (colour: string) => `extends Node2D

var x := 576.0

func _process(delta: float) -> void:
\tx += Input.get_axis("ui_left", "ui_right") * 300.0 * delta
\tqueue_redraw()

func _draw() -> void:
\tdraw_rect(Rect2(Vector2.ZERO, get_viewport_rect().size), Color("${colour}"))
\tdraw_rect(Rect2(x - 20, 500, 40, 40), Color.GREEN)
`;

const godot = createGodotTarget({ checkFrames: 90, open: false });
const godotReady = godot.prerequisites().then((problems) => problems[0]);

test("godot: idea → build → play → change → play → done", async (context) => {
  const missing = await godotReady;
  if (missing) context.skip(missing);
  const run = await runScripted({
    target: godot,
    workspace,
    agentDir,
    idea: "a green square dodges things",
    answers: ["make the background blue"],
    responses: [
      call("write", { path: "main.gd", content: godotGame("#000000") }),
      call("check_game", {}),
      say("Built it: arrow keys move the square."),
      call("write", { path: "main.gd", content: godotGame("#0000ff") }),
      call("check_game", {}),
      say("The background is blue now."),
    ],
  });

  expect(run.unused).toBe(0);
  expect(run.result).toEqual({ workspace, changes: 1, lastCheck: { playable: true, errors: [] } });
  expect(run.tools.filter((t) => t.name === "check_game").map((t) => t.text)).toEqual([
    "The Godot 4 game loaded and ran without errors.",
    "The Godot 4 game loaded and ran without errors.",
  ]);
  expect(run.info).toContain(`Your game is running: not opened; play it with: godot --path ${workspace}`);
  expect(readFileSync(path.join(workspace, "main.gd"), "utf8")).toContain('Color("#0000ff")');
}, 120_000);
