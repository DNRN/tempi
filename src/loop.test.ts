import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AgentSessionRuntime } from "@earendil-works/pi-coding-agent";
import { readGameManifest, writeGameManifest } from "./game.js";
import { createTempiLoop, filesChanged, scanWorkspace, type TempiLoopOptions } from "./loop.js";
import { createFakeTarget } from "./targets/fake-target.testutil.js";
import type { CheckResult } from "./targets/target.js";

const CLEAN: CheckResult = { playable: true, errors: [] };
const BROKEN: CheckResult = { playable: false, errors: ["Uncaught TypeError: boom"] };

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "tempi-loop-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("scanWorkspace lists files but not tempi's own state; filesChanged spots new and deleted files", () => {
  const workspace = path.join(dir, "scan");
  mkdirSync(path.join(workspace, "src"), { recursive: true });
  mkdirSync(path.join(workspace, ".tempi"), { recursive: true });
  writeFileSync(path.join(workspace, "src", "main.js"), "1");
  writeFileSync(path.join(workspace, "index.html"), "1");
  writeFileSync(path.join(workspace, ".tempi", "check.png"), "1");
  const before = scanWorkspace(workspace);
  expect([...before.keys()].sort()).toEqual(["index.html", "src/main.js"]);
  expect(filesChanged(before, scanWorkspace(workspace))).toBe(false);
  writeFileSync(path.join(workspace, "new.js"), "1");
  expect(filesChanged(before, scanWorkspace(workspace))).toBe(true);
  rmSync(path.join(workspace, "new.js"));
  expect(filesChanged(before, scanWorkspace(workspace))).toBe(false);
  writeFileSync(path.join(workspace, ".tempi", "check.png"), "2");
  expect(filesChanged(before, scanWorkspace(workspace))).toBe(false);
});

/** A scripted extension host: records handlers, commands, and what tempi sends. */
function harness(checks: CheckResult[] = [CLEAN], extra: Partial<TempiLoopOptions> = {}) {
  const fake = createFakeTarget(checks);
  const info: string[] = [];
  const sentToAgent: string[] = [];
  const loop = createTempiLoop({
    target: fake.target,
    parentDir: dir,
    agentDir: path.join(dir, "agent"),
    info: (message) => void info.push(message),
    ...extra,
  });
  const handlers = new Map<string, ((event: never, ctx: never) => Promise<unknown>)[]>();
  const commands = new Map<string, { handler: (args: unknown, ctx: unknown) => Promise<void> }>();
  const pi = {
    on(type: string, handler: (event: never, ctx: never) => Promise<unknown>) {
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
      return () => {};
    },
    registerCommand(name: string, definition: { handler: (args: unknown, ctx: unknown) => Promise<void> }) {
      commands.set(name, definition);
    },
    getAllTools: () => [],
  };
  loop.factory(pi as never);
  const ctx = { cwd: "", hasUI: false, ui: { setStatus: vi.fn(), notify: vi.fn() } };
  const emit = async <E>(type: string, event: E) => {
    let result: unknown;
    for (const handler of handlers.get(type) ?? []) result = await handler(event as never, ctx as never);
    return result;
  };
  const newSession = vi.fn(async ({ withSession }: { withSession?: (ctx: unknown) => Promise<void> }) => {
    await withSession?.({ sendUserMessage: async (text: string) => void sentToAgent.push(text) });
    return { cancelled: false };
  });
  loop.setRuntime({ newSession } as unknown as AgentSessionRuntime);

  /** One user turn: start, settle, and settle the agent. */
  const turn = async (prompt: string) => {
    const start = await emit("before_agent_start", { type: "before_agent_start", messageType: "user", prompt, systemPrompt: "BASE" });
    const settle = await emit("agent_before_settle", { type: "agent_before_settle", entries: [], continue: false, context: {}, outcome: {} });
    await emit("agent_settled", { type: "agent_settled", aborted: false });
    return { start, settle };
  };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  return { fake, info, sentToAgent, loop, emit, turn, flush, commands, ctx };
}

test("the first message creates the game folder, moves the session, and is sent to the agent as the idea", async () => {
  const h = harness();
  await h.emit("session_start", { type: "session_start", reason: "startup" });
  const result = await h.emit("input", { type: "input", text: "a cat catches fish", source: "interactive", images: [] });
  expect(result).toEqual({ action: "handled" });
  await h.flush();
  const workspace = path.join(dir, "a-cat-catches-fish");
  expect(h.loop.state).toMatchObject({ workspace, idea: "a cat catches fish" });
  expect(h.fake.calls).toEqual([`scaffold ${workspace}`]);
  expect(h.sentToAgent).toEqual(["a cat catches fish"]);
});

test("messages after the game exists pass through, and extension messages are never the idea", async () => {
  const h = harness();
  await h.emit("input", { type: "input", text: "a cat catches fish", source: "interactive", images: [] });
  await h.flush();
  expect(await h.emit("input", { type: "input", text: "make it blue", source: "interactive", images: [] })).toEqual({ action: "continue" });
  expect(await h.emit("input", { type: "input", text: "anything", source: "extension", images: [] })).toEqual({ action: "continue" });
  expect(h.loop.state.changes).toBe(0);
});

test("a turn appends the asset guidance to the system prompt", async () => {
  const h = harness();
  await h.emit("input", { type: "input", text: "a cat catches fish", source: "interactive", images: [] });
  await h.flush();
  const { start } = await h.turn("a cat catches fish");
  expect(start).toMatchObject({ systemPrompt: expect.stringContaining("BASE") });
  expect((start as { systemPrompt: string }).systemPrompt).toContain("no asset generators are configured");
});

test("a clean build is checked once and the game is started", async () => {
  const h = harness([CLEAN]);
  await h.emit("input", { type: "input", text: "a cat catches fish", source: "interactive", images: [] });
  await h.flush();
  const workspace = h.loop.state.workspace;
  await h.turn("a cat catches fish");
  expect(h.fake.calls).toEqual([`scaffold ${workspace}`, `check ${workspace}`, `run ${workspace}`]);
  expect(h.info).toContain("Your game is running: fake://game");
  expect(h.loop.state.changes).toBe(0);
});

test("a broken build asks for fixes until the check is clean, then starts the game once", async () => {
  const h = harness([BROKEN, CLEAN]);
  await h.emit("input", { type: "input", text: "a cat catches fish", source: "interactive", images: [] });
  await h.flush();
  const workspace = h.loop.state.workspace!;
  writeFileSync(path.join(workspace, "index.html"), "game");

  const first = await h.emit("agent_before_settle", { type: "agent_before_settle", entries: [], continue: false, context: {}, outcome: {} });
  expect(first).toMatchObject({ continue: true });
  const fixEntry = (first as { entries: { type: string; customType: string; content: string }[] }).entries.at(-1);
  expect(fixEntry).toMatchObject({ type: "custom_message", customType: "tempi/fix" });
  expect(fixEntry?.content).toContain("Uncaught TypeError: boom");
  await h.emit("agent_settled", { type: "agent_settled", aborted: false });
  expect(h.info).toContain("tempi's check found problems; asking the agent to fix them (round 1 of 3).");
  expect(h.fake.calls).toEqual([`scaffold ${workspace}`, `check ${workspace}`]);

  // The fix run's settle: clean now, so no more fixes and the game starts.
  await h.emit("agent_before_settle", { type: "agent_before_settle", entries: [], continue: false, context: {}, outcome: {} });
  await h.emit("agent_settled", { type: "agent_settled", aborted: false });
  expect(h.fake.calls.at(-1)).toBe(`run ${workspace}`);
  expect(h.info.filter((m) => m.includes("asking the agent to fix"))).toHaveLength(1);
});

test("stops asking for fixes after the limit, tells the user, and still starts the game", async () => {
  const h = harness([BROKEN]);
  await h.emit("input", { type: "input", text: "a cat catches fish", source: "interactive", images: [] });
  await h.flush();
  const workspace = h.loop.state.workspace!;
  writeFileSync(path.join(workspace, "index.html"), "game");
  for (let round = 0; round <= 3; round++) {
    await h.emit("agent_before_settle", { type: "agent_before_settle", entries: [], continue: false, context: {}, outcome: {} });
    writeFileSync(path.join(workspace, "index.html"), `game ${round}`);
    await h.emit("agent_settled", { type: "agent_settled", aborted: false });
  }
  expect(h.info.filter((m) => m.includes("asking the agent to fix"))).toHaveLength(3);
  expect(h.info.some((m) => m.includes("The game still has problems"))).toBe(true);
  expect(h.fake.calls.at(-1)).toBe(`run ${workspace}`);
});

test("a turn that changes files restarts the game; a question does not", async () => {
  const h = harness([CLEAN, CLEAN, CLEAN]);
  await h.emit("input", { type: "input", text: "a cat catches fish", source: "interactive", images: [] });
  await h.flush();
  const workspace = h.loop.state.workspace!;
  writeFileSync(path.join(workspace, "index.html"), "v1");
  await h.turn("a cat catches fish");
  expect(h.fake.calls).toContain(`run ${workspace}`);

  writeFileSync(path.join(workspace, "index.html"), "v2");
  await h.turn("make the cat faster");
  expect(h.fake.calls).toEqual([`scaffold ${workspace}`, `check ${workspace}`, `run ${workspace}`, `check ${workspace}`, `stop`, `run ${workspace}`]);
  expect(h.loop.state.changes).toBe(1);

  await h.turn("why is the cat slow?");
  expect(h.fake.calls.at(-1)).toBe(`run ${workspace}`);
  expect(h.loop.state.changes).toBe(1);
});

test("stopping the session stops the game, and /play and /check work", async () => {
  const h = harness([CLEAN, CLEAN]);
  await h.emit("input", { type: "input", text: "a cat catches fish", source: "interactive", images: [] });
  await h.flush();
  const workspace = h.loop.state.workspace!;
  writeFileSync(path.join(workspace, "index.html"), "v1");
  await h.turn("a cat catches fish");

  await h.emit("session_shutdown", { type: "session_shutdown", reason: "new" });
  expect(h.fake.calls.at(-1)).toBe("stop");

  await h.commands.get("play")!.handler(undefined, h.ctx);
  expect(h.fake.calls.at(-1)).toBe(`run ${workspace}`);
  await h.commands.get("check")!.handler(undefined, h.ctx);
  expect(h.fake.calls.at(-1)).toBe(`check ${workspace}`);
  expect(h.info.some((m) => m.includes("loaded and ran without errors"))).toBe(true);
});

test("a new game's folder records its target and idea in the manifest", async () => {
  const h = harness();
  await h.emit("input", { type: "input", text: "a cat catches fish", source: "interactive", images: [] });
  await h.flush();
  expect(readGameManifest(h.loop.state.workspace!)).toMatchObject({ target: "web", idea: "a cat catches fish" });
});

/** An existing game's folder, as tempi continues it. */
function existingGame(): string {
  const workspace = path.join(dir, "existing");
  mkdirSync(workspace);
  writeFileSync(path.join(workspace, "index.html"), "game");
  writeGameManifest(workspace, { target: "web", idea: "a cat catches fish" });
  return workspace;
}

test("an existing game: no new folder, and a turn that changes nothing is a question", async () => {
  const workspace = existingGame();
  const h = harness([CLEAN], { workspace, existing: { idea: "a cat catches fish" } });
  await h.emit("session_start", { type: "session_start", reason: "startup" });
  expect(h.info).toContain(`Continuing your Fake game in ${workspace}.`);
  expect(await h.emit("input", { type: "input", text: "what are the controls?", source: "interactive", images: [] })).toEqual({ action: "continue" });
  await h.turn("what are the controls?");
  expect(h.fake.calls).toEqual([]);
  expect(h.loop.state).toMatchObject({ workspace, idea: "a cat catches fish", changes: 0 });
});

test("an existing game: a turn that changes files is a change, checked and restarted", async () => {
  const workspace = existingGame();
  const h = harness([CLEAN], { workspace, existing: {} });
  await h.emit("session_start", { type: "session_start", reason: "startup" });
  writeFileSync(path.join(workspace, "game.js"), "faster");
  await h.turn("make it faster");
  expect(h.fake.calls).toEqual([`check ${workspace}`, `run ${workspace}`]);
  expect(h.loop.state.changes).toBe(1);
});

test("/resume into a game's folder continues it instead of building a new one", async () => {
  const workspace = existingGame();
  const h = harness();
  h.ctx.cwd = workspace;
  await h.emit("session_start", { type: "session_start", reason: "resume" });
  await h.turn("what are the controls?");
  expect(h.fake.calls).toEqual([]);
  writeFileSync(path.join(workspace, "game.js"), "blue");
  await h.turn("make it blue");
  expect(h.loop.state.changes).toBe(1);
});

test("/resume into a folder from an earlier tempi, with no manifest, continues it too", async () => {
  const workspace = path.join(dir, "older");
  mkdirSync(workspace);
  writeFileSync(path.join(workspace, "project.godot"), "");
  const h = harness();
  h.ctx.cwd = workspace;
  await h.emit("session_start", { type: "session_start", reason: "resume" });
  await h.turn("what are the controls?");
  expect(h.fake.calls).toEqual([]);
});
