import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createWebTarget } from "./web.js";

// These tests run the real headless Chrome (ADR 0007), as the check does.
const target = createWebTarget({ checkDurationMs: 1200, openUrl: async () => {} });
let chromeMissing: string | undefined;
beforeAll(async () => {
  chromeMissing = (await target.prerequisites())[0];
}, 60_000);

let dir: string;
let workspace: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "tempi-web-"));
  workspace = path.join(dir, "game");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function game(files: Record<string, string>) {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true });
    writeFileSync(path.join(workspace, file), content);
  }
}
const page = (script: string) => ({
  "index.html": `<!doctype html><canvas id="game"></canvas><script type="module" src="src/main.js"></script>`,
  "src/main.js": script,
});

test("scaffold writes a starting game into an empty workspace only", async () => {
  await target.scaffold(workspace);
  expect(readFileSync(path.join(workspace, "index.html"), "utf8")).toContain('src="src/main.js"');
  expect(existsSync(path.join(workspace, "src", "main.js"))).toBe(true);
  expect(existsSync(path.join(workspace, "assets"))).toBe(true);
  await expect(target.scaffold(workspace)).rejects.toThrow(/not empty/);
});

test("a workspace without index.html is not playable, without starting Chrome", async () => {
  mkdirSync(workspace, { recursive: true });
  await expect(target.check(workspace)).resolves.toEqual({ playable: false, errors: ["index.html is missing from the workspace root."] });
});

describe("check in headless Chrome", () => {
  beforeEach((context) => {
    if (chromeMissing) context.skip(`Chrome missing: ${chromeMissing}`);
  });

  test("the scaffold is playable, with a screenshot", async () => {
    await target.scaffold(workspace);
    const result = await target.check(workspace);
    expect(result).toEqual({ playable: true, errors: [], screenshot: ".tempi/check.png" });
    expect(readFileSync(path.join(workspace, ".tempi", "check.png")).subarray(1, 4).toString()).toBe("PNG");
  }, 30_000);

  test("an uncaught exception makes the game unplayable, with where it happened", async () => {
    game(page("const player = undefined;\nplayer.x = 1;"));
    const result = await target.check(workspace);
    expect(result.playable).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/^Uncaught TypeError: .*\(.*src\/main\.js:2/);
  }, 30_000);

  test("errors in input handlers are caught by the simulated input", async () => {
    game(page(`addEventListener("keydown", (e) => { if (e.code === "Space") jump(); });`));
    const result = await target.check(workspace);
    expect(result.playable).toBe(false);
    expect(result.errors[0]).toMatch(/^Uncaught ReferenceError: jump is not defined/);
  }, 30_000);

  test("console errors and missing assets are reported, but the game still counts as playable", async () => {
    game(page(`console.error("sprite sheet broken");\nconst img = new Image();\nimg.src = "assets/missing.png";`));
    const result = await target.check(workspace);
    expect(result.playable).toBe(true);
    expect(result.errors).toEqual(expect.arrayContaining(["console.error: sprite sheet broken", "HTTP 404: assets/missing.png"]));
    expect(result.errors).toHaveLength(2);
  }, 30_000);

  // Cancelling at different moments hits different steps: launching Chrome, loading the page, the run.
  test.each([0, 50, 150, 300, 800])("a check cancelled after %i ms rejects as cancelled", async (delay) => {
    await target.scaffold(workspace);
    const controller = new AbortController();
    const checking = target.check(workspace, { signal: controller.signal });
    setTimeout(() => controller.abort(), delay);
    await expect(checking).rejects.toThrow("The check was cancelled.");
  }, 30_000);
});

test("run serves the game and opens its URL until stopped", async () => {
  const opened: string[] = [];
  const web = createWebTarget({ openUrl: async (url) => void opened.push(url) });
  await web.scaffold(workspace);
  const running = await web.run(workspace);
  expect(opened).toEqual([running.location]);
  expect(await (await fetch(running.location)).text()).toContain("<canvas");
  await running.stop();
  await expect(fetch(running.location)).rejects.toThrow();
});
