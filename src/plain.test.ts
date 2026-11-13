import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { AssetGenerator } from "./assets.js";
import type { StartedAgent } from "./agent.js";
import { readGameManifest } from "./game.js";
import { type PlainCoCreationOptions, type PlainIO, runPlainCoCreation } from "./plain.js";
import { createFakeTarget } from "./targets/fake-target.testutil.js";
import type { CheckResult } from "./targets/target.js";

const CLEAN: CheckResult = { playable: true, errors: [] };
const BROKEN: CheckResult = { playable: false, errors: ["Uncaught TypeError: boom"] };

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "tempi-plain-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A scripted user and agent that record what happens, in order. */
function harness(answers: (string | undefined)[], checks: CheckResult[] = [CLEAN], assetGenerators?: AssetGenerator[]) {
  const fake = createFakeTarget(checks);
  const events: string[] = [];
  const prompts: string[] = [];
  const info: string[] = [];
  const io: PlainIO = {
    info: (message) => void info.push(message),
    ask: async () => answers.shift(),
  };
  const run = (maxFixRounds?: number, extra: Partial<PlainCoCreationOptions> = {}) =>
    runPlainCoCreation({
      idea: "a cat catches falling fish",
      target: fake.target,
      parentDir: dir,
      io,
      maxFixRounds,
      async startAgent(workspace) {
        events.push(`start agent ${workspace}`);
        return {
          agent: {
            prompt: async (text) => {
              prompts.push(text);
              events.push("prompt");
            },
          },
          ...(assetGenerators ? { assetGenerators } : {}),
          dispose: () => void events.push("dispose"),
        } satisfies StartedAgent;
      },
      ...extra,
    });
  return { fake, events, prompts, info, run };
}

test("builds from the idea, plays, carries out a raw change, plays again, and finishes", async () => {
  const h = harness(["make the fish faster", ""]);
  const result = await h.run();
  expect(result).toEqual({ workspace: path.join(dir, "a-cat-catches-falling-fish"), changes: 1, lastCheck: CLEAN });
  expect(h.fake.calls).toEqual([
    `scaffold ${result.workspace}`,
    `check ${result.workspace}`,
    `run ${result.workspace}`,
    "stop",
    `check ${result.workspace}`,
    `run ${result.workspace}`,
    "stop",
  ]);
  // The idea and the change reach the agent as typed, not wrapped (ADR 0008).
  expect(h.prompts).toEqual(["a cat catches falling fish", "make the fish faster"]);
  expect(h.events).toEqual([`start agent ${result.workspace}`, "prompt", "prompt", "dispose"]);
  expect(h.info).toContain("Your game is running: fake://game");
});

test.each([["done"], ["QUIT"], [undefined]])("finishes on %s without another build", async (answer) => {
  const h = harness([answer]);
  const result = await h.run();
  expect(result.changes).toBe(0);
  expect(h.prompts).toHaveLength(1);
  expect(h.fake.calls.at(-1)).toBe("stop");
});

test("without an idea, the first line the user types is the idea", async () => {
  const fake = createFakeTarget([CLEAN]);
  const prompts: string[] = [];
  const lines = ["a cat catches falling fish", ""];
  const result = await runPlainCoCreation({
    target: fake.target,
    parentDir: dir,
    io: { info: () => {}, ask: async () => lines.shift() },
    async startAgent() {
      return { agent: { prompt: async (text) => void prompts.push(text) }, dispose: () => {} };
    },
  });
  expect(prompts).toEqual(["a cat catches falling fish"]);
  expect(result.workspace).toBe(path.join(dir, "a-cat-catches-falling-fish"));
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
  expect(h.fake.calls).toContain(`run ${result.workspace}`);
});

test("without generators, says the game uses placeholder art and how to get generators", async () => {
  const h = harness([""]);
  await h.run();
  expect(h.info[0]).toMatch(/^No asset generators configured: .*pi mcp add/);
});

test("with generators, names them and says when none were used", async () => {
  const generators = [{ name: "comfyui", description: "image generation", tools: 3 }];
  const h = harness([""], [CLEAN], generators);
  await h.run();
  expect(h.info[0]).toBe("Asset generators: comfyui");
  expect(h.info.some((m) => m.startsWith("The agent generated no assets this time"))).toBe(true);
});

test("disposes the agent and stops the game when a turn fails", async () => {
  const h = harness(["change it"]);
  h.fake.target.check = async () => {
    throw new Error("browser crashed");
  };
  await expect(h.run()).rejects.toThrow("browser crashed");
  expect(h.events.at(-1)).toBe("dispose");
});

test("a new game records its target and idea in the manifest", async () => {
  const h = harness([""]);
  const result = await h.run();
  expect(readGameManifest(result.workspace)).toMatchObject({ target: "web", idea: "a cat catches falling fish" });
});

test("an existing game: no scaffold and no first build; it plays, then takes change requests", async () => {
  const workspace = path.join(dir, "existing");
  mkdirSync(workspace);
  const h = harness(["make the fish faster", ""]);
  const result = await h.run(undefined, { idea: undefined, existing: { workspace } });
  expect(result).toEqual({ workspace, changes: 1, lastCheck: CLEAN });
  expect(h.prompts).toEqual(["make the fish faster"]);
  expect(h.fake.calls).toEqual([`run ${workspace}`, "stop", `check ${workspace}`, `run ${workspace}`, "stop"]);
  expect(h.info).toContain(`Continuing your Fake game in ${workspace}`);
});

test("an existing game: the command line's idea is the first change request", async () => {
  const workspace = path.join(dir, "existing");
  mkdirSync(workspace);
  const h = harness([""]);
  const result = await h.run(undefined, { idea: "make it blue", existing: { workspace } });
  expect(h.prompts).toEqual(["make it blue"]);
  expect(result.changes).toBe(1);
  expect(h.fake.calls[0]).toBe(`check ${workspace}`);
});

test("an existing game left unchanged is still checked once, for the exit code", async () => {
  const workspace = path.join(dir, "existing");
  mkdirSync(workspace);
  const h = harness([""], [BROKEN]);
  const result = await h.run(undefined, { idea: undefined, existing: { workspace } });
  expect(result).toEqual({ workspace, changes: 0, lastCheck: BROKEN });
  expect(h.prompts).toEqual([]);
});
