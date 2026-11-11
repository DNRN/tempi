import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { AssetGenerator } from "./assets.js";
import { type LoopIO, PrerequisiteError, runCoCreation } from "./loop.js";
import { createFakeTarget } from "./targets/fake-target.testutil.js";
import type { CheckResult } from "./targets/target.js";

const CLEAN: CheckResult = { playable: true, errors: [] };
const BROKEN: CheckResult = { playable: false, errors: ["Uncaught TypeError: boom"] };

let dir: string;
let workspace: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "tempi-loop-"));
  workspace = path.join(dir, "game");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A scripted user and agent that record what happens, in order. */
function harness(answers: (string | undefined)[], checks: CheckResult[] = [CLEAN], assetGenerators?: AssetGenerator[]) {
  const fake = createFakeTarget(checks);
  const events: string[] = [];
  const prompts: string[] = [];
  const info: string[] = [];
  const io: LoopIO = {
    info: (message) => void info.push(message),
    ask: async () => answers.shift(),
  };
  const run = (maxFixRounds?: number) =>
    runCoCreation({
      idea: "a cat catches falling fish",
      target: fake.target,
      workspace,
      io,
      maxFixRounds,
      async startAgent() {
        events.push("start agent");
        return {
          agent: {
            prompt: async (text) => {
              prompts.push(text);
              events.push("prompt");
            },
          },
          ...(assetGenerators ? { assetGenerators } : {}),
          dispose: () => void events.push("dispose"),
        };
      },
    });
  return { fake, events, prompts, info, run };
}

test("builds, plays, carries out a change, plays again, and finishes", async () => {
  const h = harness(["make the fish faster", ""]);
  const result = await h.run();
  expect(result).toEqual({ workspace, changes: 1, lastCheck: CLEAN });
  expect(h.fake.calls).toEqual([
    "prerequisites",
    `scaffold ${workspace}`,
    `check ${workspace}`,
    `run ${workspace}`,
    "stop",
    `check ${workspace}`,
    `run ${workspace}`,
    "stop",
  ]);
  expect(h.prompts).toHaveLength(2);
  expect(h.prompts[0]).toContain("Fake target instructions.");
  expect(h.prompts[0]).toContain("Build this game: a cat catches falling fish");
  expect(h.prompts[1]).toContain("asks for this change: make the fish faster");
  expect(h.events).toEqual(["start agent", "prompt", "prompt", "dispose"]);
  expect(h.info).toContain("Your game is running: fake://game");
});

test.each([["done"], ["QUIT"], [undefined]])("finishes on %s without another build", async (answer) => {
  const h = harness([answer]);
  const result = await h.run();
  expect(result.changes).toBe(0);
  expect(h.prompts).toHaveLength(1);
  expect(h.fake.calls.at(-1)).toBe("stop");
});

test("asks the agent to fix what tempi's check finds, until it is clean", async () => {
  const h = harness([""], [BROKEN, BROKEN, CLEAN]);
  const result = await h.run();
  expect(result.lastCheck).toEqual(CLEAN);
  expect(h.prompts).toHaveLength(3);
  expect(h.prompts[1]).toContain("Uncaught TypeError: boom");
  expect(h.info.filter((m) => m.includes("asking the agent to fix"))).toHaveLength(2);
});

test("stops fixing after the limit, tells the user, and still starts the game", async () => {
  const h = harness([""], [BROKEN]);
  const result = await h.run(2);
  expect(result.lastCheck).toEqual(BROKEN);
  expect(h.prompts).toHaveLength(3);
  expect(h.info.some((m) => m.includes("The game still has problems"))).toBe(true);
  expect(h.fake.calls).toContain(`run ${workspace}`);
});

test("without generators, says the game uses placeholder art and how to get generators", async () => {
  const h = harness([""]);
  await h.run();
  expect(h.info[0]).toMatch(/^No asset generators configured: .*pi mcp add/);
  expect(h.prompts[0]).toContain("no asset generators are configured");
});

test("with generators, names them, passes them to the prompts, and says when none were used", async () => {
  const generators = [{ name: "comfyui", description: "image generation", tools: 3 }];
  const h = harness(["blue fish", ""], [CLEAN], generators);
  await h.run();
  expect(h.info[0]).toBe("Asset generators: comfyui");
  expect(h.prompts[0]).toContain("- comfyui: image generation");
  expect(h.prompts[1]).toContain("- comfyui: image generation");
  expect(h.info.some((m) => m.startsWith("The agent generated no assets this time"))).toBe(true);

  rmSync(workspace, { recursive: true, force: true });
  mkdirSync(path.join(workspace, "assets"), { recursive: true });
  writeFileSync(path.join(workspace, "assets", "fish.png"), "x");
  const withAssets = harness([""], [CLEAN], generators);
  await withAssets.run();
  expect(withAssets.info.some((m) => m.startsWith("The agent generated no assets"))).toBe(false);
});

test("refuses to start when the target's prerequisites are missing", async () => {
  const h = harness([""]);
  h.fake.target.prerequisites = async () => ["Google Chrome is not installed."];
  await expect(h.run()).rejects.toBeInstanceOf(PrerequisiteError);
  await expect(h.run()).rejects.toThrow(/can't run on this machine:\n- Google Chrome is not installed\./);
  expect(h.events).toEqual([]);
});

test("disposes the agent and stops the game when a turn fails", async () => {
  const h = harness(["change it"]);
  let turns = 0;
  const original = h.run;
  h.fake.target.check = async () => {
    turns += 1;
    if (turns === 2) throw new Error("browser crashed");
    return CLEAN;
  };
  await expect(original()).rejects.toThrow("browser crashed");
  expect(h.events.at(-1)).toBe("dispose");
});
