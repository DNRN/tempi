import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Browser, chromium } from "playwright";
import { serveDirectory } from "./static-server.js";
import type { CheckOptions, CheckResult, RunningGame, Target } from "./target.js";

export interface WebTargetOptions {
  /** How long the check lets the game run after it loads. Default 3000 ms. */
  checkDurationMs?: number;
  /** Opens a URL for the user. Default: the system's browser opener. */
  openUrl?: (url: string) => Promise<void>;
}

const CHROME_MISSING =
  "Google Chrome is not installed; the web target's check runs it headless. Install Chrome, or run `npx playwright install chrome`.";

export const WEB_INSTRUCTIONS = `Target: web (HTML5). Build the game as a static web page:
- index.html at the workspace root is the entry point. JavaScript goes in src/ as ES modules (<script type="module">), styles in style.css.
- No build step, no npm packages, no CDN or other network requests: everything the game needs is in the workspace. Draw with the Canvas 2D API.
- Load assets from assets/ with relative paths (assets/cat.png), and wait for images and sounds to load before using them.
- Keyboard and mouse input. Show the controls on screen. Start sounds only after the player's first input: browsers block audio before it.
- check_game serves the workspace on localhost, loads it in headless Chrome, presses the arrow keys, space, and enter and clicks the page centre, then reports uncaught exceptions, console errors, and failed requests, and saves a screenshot to .tempi/check.png (open it with read to see the game).`;

const SCAFFOLD: Record<string, string> = {
  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Game</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <canvas id="game" width="800" height="600"></canvas>
    <script type="module" src="src/main.js"></script>
  </body>
</html>
`,
  "style.css": `html, body { margin: 0; height: 100%; background: #111; }
body { display: flex; align-items: center; justify-content: center; }
canvas { background: #000; max-width: 100vw; max-height: 100vh; }
`,
  "src/main.js": `const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

function frame() {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = "24px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Your game goes here", canvas.width / 2, canvas.height / 2);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
`,
};

/** Opens a URL with the platform's opener, detached. */
async function openWithSystem(url: string): Promise<void> {
  const [command, args] =
    process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function launchChrome(): Promise<Browser> {
  return chromium.launch({ channel: "chrome", headless: true });
}

/** Where a request points, relative to the game's server when it is local. */
function shortUrl(url: string, base: string): string {
  return url.startsWith(base) ? url.slice(base.length) || "/" : url;
}

/** The web (HTML5) target: a static page checked in headless Chrome (ADR 0007). */
export function createWebTarget(options: WebTargetOptions = {}): Target {
  const checkDurationMs = options.checkDurationMs ?? 3000;
  const openUrl = options.openUrl ?? openWithSystem;

  return {
    id: "web",
    name: "Web (HTML5)",
    instructions: WEB_INSTRUCTIONS,

    async prerequisites() {
      try {
        const browser = await launchChrome();
        await browser.close();
        return [];
      } catch {
        return [CHROME_MISSING];
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
      if (!existsSync(path.join(workspace, "index.html"))) {
        return { playable: false, errors: ["index.html is missing from the workspace root."] };
      }
      const errors: string[] = [];
      let uncaught = false;
      const server = await serveDirectory(workspace);
      let browser: Browser | undefined;
      const abort = () => void browser?.close();
      checkOptions.signal?.addEventListener("abort", abort, { once: true });
      try {
        browser = await launchChrome().catch(() => {
          throw new Error(CHROME_MISSING);
        });
        const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
        page.on("pageerror", (error) => {
          uncaught = true;
          const where = error.stack?.split("\n").find((line) => line.includes("http"))?.trim();
          errors.push(`Uncaught ${error.name}: ${error.message}${where ? ` (${shortUrl(where, server.url)})` : ""}`);
        });
        page.on("console", (message) => {
          // Failed loads are reported from the response below, with their URL.
          if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) {
            errors.push(`console.error: ${message.text()}`);
          }
        });
        page.on("response", (response) => {
          if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${shortUrl(response.url(), server.url)}`);
        });
        page.on("requestfailed", (request) => {
          errors.push(`Request failed: ${shortUrl(request.url(), server.url)} (${request.failure()?.errorText ?? "unknown error"})`);
        });

        try {
          await page.goto(server.url, { waitUntil: "load", timeout: 15_000 });
        } catch (error) {
          errors.push(`The page did not load: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
          return { playable: false, errors };
        }
        // Let the game start, then exercise the usual input handlers.
        await page.waitForTimeout(Math.min(1000, checkDurationMs));
        for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "Enter"]) {
          await page.keyboard.press(key);
        }
        await page.mouse.click(512, 384);
        await page.waitForTimeout(Math.max(0, checkDurationMs - 1000));

        const screenshot = ".tempi/check.png";
        mkdirSync(path.join(workspace, ".tempi"), { recursive: true });
        await page.screenshot({ path: path.join(workspace, screenshot) });
        return { playable: !uncaught, errors, screenshot };
      } catch (error) {
        if (checkOptions.signal?.aborted) throw new Error("The check was cancelled.");
        throw error;
      } finally {
        checkOptions.signal?.removeEventListener("abort", abort);
        await browser?.close().catch(() => {});
        await server.close();
      }
    },

    async run(workspace): Promise<RunningGame> {
      const server = await serveDirectory(workspace);
      try {
        await openUrl(server.url);
      } catch {
        // No opener (a headless machine): the URL is still shown to the user.
      }
      return { location: server.url, stop: () => server.close() };
    },
  };
}
