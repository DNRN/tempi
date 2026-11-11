import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { InteractiveMode, ModelRuntime, initTheme } from "@earendil-works/pi-coding-agent";
import type { Terminal } from "@earendil-works/pi-tui";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createTempiLoop } from "./loop.js";
import { createTempiRuntime } from "./session.js";
import { createCheckGameTool } from "./targets/check-tool.js";
import { createWebTarget } from "./targets/web.js";
import { createSaveAssetTool } from "./tools/save-asset.js";

// A smoke test of pi's interactive front end on tempi's runtime (ADR 0008): a
// fake terminal drives the TUI, the faux model builds and changes the game,
// and the loop extension must scaffold, check, start, and restart it. Same
// shape as the plain end-to-end tests, so CI needs no keys; Chrome must be
// installed for the web check.

let dir: string;
let agentDir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "tempi-tui-"));
  agentDir = path.join(dir, "agent");
  mkdirSync(agentDir, { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const WEB_GAME = `const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let x = 400;
addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") x -= 10; if (e.key === "ArrowRight") x += 10; });
function frame() { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "#0f0"; ctx.fillRect(x - 20, 500, 40, 40); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
`;

/** A terminal that records output and hands typed keys to the TUI. */
function fakeTerminal(): { terminal: Terminal; output(): string; type(text: string): Promise<void> } {
  let out = "";
  let onInput: ((data: string) => void) | undefined;
  const terminal: Terminal = {
    start(input: (data: string) => void) {
      onInput = input;
    },
    stop() {},
    async drainInput() {},
    write(data: string) {
      out += data;
    },
    get columns() {
      return 100;
    },
    get rows() {
      return 40;
    },
    get kittyProtocolActive() {
      return false;
    },
    moveBy() {},
    hideCursor() {},
    showCursor() {},
    clearLine() {},
    clearFromCursor() {},
    clearScreen() {},
    setTitle() {},
    setProgress() {},
    setProgramStatus() {},
  };
  return {
    terminal,
    output: () => out.replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07/g, ""),
    async type(text: string) {
      if (!onInput) throw new Error("terminal not started");
      for (const ch of text) {
        onInput(ch);
        await new Promise((resolve) => setTimeout(resolve, 4));
      }
      onInput("\r");
      console.error(`CHECKPOINT: typed "${text.slice(0, 20)}", waiting for the turn`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      console.error(`CHECKPOINT: done waiting for "${text.slice(0, 20)}"`);
    },
  };
}

const web = createWebTarget({ checkDurationMs: 1000, openUrl: async () => {} });
const webReady = web.prerequisites().then((problems) => problems[0]);

test("idea → build → question (no restart) → change (restart), in the TUI", async (context) => {
  const missing = await webReady;
  if (missing) context.skip(missing);
    const modelRuntime = await ModelRuntime.create({ authPath: path.join(agentDir, "auth.json") });
  const faux = fauxProvider({ provider: "tempi-faux" });
  modelRuntime.registerNativeProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("write", { path: "src/main.js", content: WEB_GAME }), { stopReason: "toolUse" }),
    fauxAssistantMessage("Built: arrow keys move the square."),
    fauxAssistantMessage("The cat is slow because the fall speed is 2."),
    fauxAssistantMessage(fauxToolCall("edit", { path: "src/main.js", edits: [{ oldText: '"#000"', newText: '"#00f"' }] }), { stopReason: "toolUse" }),
    fauxAssistantMessage("Blue now."),
  ]);

  const parentDir = path.join(dir, "games");
  const notifications: string[] = [];
  const loop = createTempiLoop({ target: web, parentDir, agentDir, mcp: false, info: (message) => void notifications.push(message) });
  const runtime = await createTempiRuntime({
    target: web,
    lobby: path.join(dir, "lobby"),
    getWorkspace: () => loop.state.workspace,
    agentDir,
    modelRuntime,
    model: faux.getModel(),
    mcp: false,
    extensionFactories: [loop.factory],
    customToolsFor: (workspace) => [createCheckGameTool(web, workspace), createSaveAssetTool(workspace)],
  });
  loop.setRuntime(runtime);
  const { terminal, output, type } = fakeTerminal();
  initTheme(runtime.services.settingsManager.getTheme(), true);
  const mode = new InteractiveMode(runtime, { terminal });
  const offline = process.env.PI_OFFLINE;
  process.env.PI_OFFLINE = "1"; // no catalog or update checks from a test
  const done = mode.run();
  try {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(runtime.session.sessionFile).toBeUndefined(); // the lobby session is unsaved
    await type("a cat catches fish");
    const workspace = path.join(parentDir, "a-cat-catches-fish");
    expect(loop.state.workspace).toBe(workspace);
    expect(runtime.cwd).toBe(workspace);
    expect(readdirSync(path.join(workspace, ".tempi", "sessions"))).toHaveLength(1);
    expect(runtime.session.getActiveToolNames()).toContain("check_game");
    expect(runtime.session.systemPrompt).toContain("Web (HTML5)");
    await type("why is the cat slow?");
    await type("make the background blue");
    expect(faux.getPendingResponseCount()).toBe(0);
    expect(loop.state.changes).toBe(1);
    expect(loop.state.lastCheck).toMatchObject({ playable: true, errors: [] });
    expect(readFileSync(path.join(workspace, "src", "main.js"), "utf8")).toContain('"#00f"');

    // The build and the change each started the game; the question did not.
    const started = notifications.filter((m) => m.startsWith("Your game is running: http://127.0.0.1:"));
    expect(started).toHaveLength(2);
    // The bundled packages load once: no startup panel about collisions (ADR 0009).
    expect(output()).not.toContain("Prompt conflicts");
  } finally {
    // pi's interactive loop only ends with the process; stop the TUI, dispose
    // the runtime, and restore the environment instead of awaiting it.
    mode.stop();
    void done.catch(() => {});
    await runtime.dispose().finally(() => {
      if (offline === undefined) delete process.env.PI_OFFLINE;
      else process.env.PI_OFFLINE = offline;
    });
  }
}, 120_000);
