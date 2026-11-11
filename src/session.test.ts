import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import { registerRequiredChildExtensions } from "pi-subagents/required-child-extensions";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createTempiRuntime, createTempiSession, NoModelError, type TempiSessionResult } from "./session.js";
import { createCheckGameTool } from "./targets/check-tool.js";
import { createFakeTarget } from "./targets/fake-target.testutil.js";

const fakeTarget = createFakeTarget().target;

// Each test gets its own pi agent dir, so the user's ~/.pi/agent (models, auth,
// MCP servers, installed packages) is never read and no network is needed.
let dir: string;
let agentDir: string;
let workspace: string;
let opened: TempiSessionResult | undefined;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "tempi-session-"));
  agentDir = path.join(dir, "agent");
  workspace = path.join(dir, "game");
  mkdirSync(agentDir, { recursive: true });
  // Provider keys in the environment would make a model available.
  for (const key of Object.keys(process.env)) {
    if (/API_KEY|TOKEN|CREDENTIALS/.test(key)) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  }
});

afterEach(() => {
  opened?.dispose();
  opened = undefined;
  Object.assign(process.env, savedEnv);
  rmSync(dir, { recursive: true, force: true });
});

async function runtimeWithModel() {
  const modelRuntime = await ModelRuntime.create({ authPath: path.join(agentDir, "auth.json") });
  const model = modelRuntime.getModel("anthropic", "claude-haiku-4-5");
  if (!model) throw new Error("pi's built-in catalog has no anthropic/claude-haiku-4-5");
  return { modelRuntime, model };
}

test("registers the bundled tools and pi's codemode, and writes the workspace settings", async () => {
  opened = await createTempiSession({ target: fakeTarget, workspace, agentDir, ...(await runtimeWithModel()), sessionManager: SessionManager.inMemory(workspace) });
  const tools = opened.session.getAllTools().map((t) => t.name);
  expect(tools).toEqual(expect.arrayContaining(["web_search", "fetch_content", "web_enable", "subagent", "subagents_enable", "codemode", "tool_search"]));
  expect(opened.extensionErrors).toEqual([]);
  // pi-subagents loads through its package root: its prompts and skills come
  // with it, once, not also as separate paths (ADR 0009).
  const prompts = opened.session.resourceLoader.getPrompts();
  expect(prompts.prompts.map((p) => p.name)).toEqual(expect.arrayContaining(["council", "review-loop"]));
  expect(prompts.diagnostics.filter((d) => d.message.includes("collision"))).toEqual([]);
  expect(opened.session.resourceLoader.getSkills().skills.map((s) => s.name)).toEqual(expect.arrayContaining(["council-mode"]));
  expect(JSON.parse(readFileSync(path.join(workspace, ".pi", "settings.json"), "utf8"))).toEqual({ subagents: { defaultExtensions: [] } });
}, 60_000);

test("registers tempi's own tools, such as the target's check_game", async () => {
  const { target } = createFakeTarget();
  opened = await createTempiSession({
    target: fakeTarget,
    workspace,
    agentDir,
    ...(await runtimeWithModel()),
    sessionManager: SessionManager.inMemory(workspace),
    customTools: [createCheckGameTool(target, workspace)],
  });
  expect(opened.session.getActiveToolNames()).toContain("check_game");
}, 60_000);

test.each([
  [true, true],
  [false, false],
])("with mcp: %s, pi's MCP extension (its /mcp command) is loaded: %s", async (mcp, loaded) => {
  opened = await createTempiSession({ target: fakeTarget, workspace, agentDir, ...(await runtimeWithModel()), sessionManager: SessionManager.inMemory(workspace), mcp });
  const commands = opened.session.extensionRunner.getRegisteredCommands().map((c) => c.name);
  expect(commands.includes("mcp")).toBe(loaded);
  expect(opened.session.getAllTools().map((t) => t.name)).toContain("codemode");
}, 60_000);

test("adds tempi's system prompt to pi's", async () => {
  opened = await createTempiSession({ target: fakeTarget, workspace, agentDir, ...(await runtimeWithModel()), sessionManager: SessionManager.inMemory(workspace) });
  expect(opened.session.systemPrompt).toContain("tempi's game-building agent");
}, 60_000);

test("does not load the user's own pi extensions", async () => {
  const extension = path.join(agentDir, "user-extension.js");
  writeFileSync(
    extension,
    `export default function (pi) {
      pi.registerTool({ name: "user_tool", label: "user tool", description: "x", parameters: { type: "object", properties: {} }, execute: async () => ({ content: [] }) });
    }`,
  );
  writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ extensions: [extension] }));
  opened = await createTempiSession({ target: fakeTarget, workspace, agentDir, ...(await runtimeWithModel()), sessionManager: SessionManager.inMemory(workspace) });
  expect(opened.session.getAllTools().map((t) => t.name)).not.toContain("user_tool");
}, 60_000);

test("registers web access for subagent children until disposed", async () => {
  opened = await createTempiSession({ target: fakeTarget, workspace, agentDir, ...(await runtimeWithModel()), sessionManager: SessionManager.inMemory(workspace) });
  const sessionId = opened.session.sessionId;
  const probe = { id: "probe", path: path.join(agentDir, "probe.js") };
  writeFileSync(probe.path, "export default function () {}");
  // pi-subagents allows one registration per session: a second one shows tempi's is in place.
  expect(() => registerRequiredChildExtensions({ sessionId, extensions: [probe] })).toThrow(/already registered/);
  opened.dispose();
  opened.dispose();
  const again = registerRequiredChildExtensions({ sessionId, extensions: [probe] });
  again.dispose();
  opened = undefined;
}, 60_000);

test("fails with a clear error when no model is available", async () => {
  await expect(createTempiSession({ target: fakeTarget, workspace, agentDir, sessionManager: SessionManager.inMemory(workspace) })).rejects.toBeInstanceOf(NoModelError);
}, 60_000);

test("the runtime starts in the lobby unsaved and moves its sessions to the game folder", async () => {
  const lobby = path.join(dir, "lobby");
  const game = path.join(dir, "a-cat-game");
  let workspace: string | undefined;
  const runtime = await createTempiRuntime({
    target: fakeTarget,
    lobby,
    getWorkspace: () => workspace,
    agentDir,
    ...(await runtimeWithModel()),
    customToolsFor: (dir) => [createCheckGameTool(fakeTarget, dir)],
  });
  try {
    expect(runtime.cwd).toBe(lobby);
    expect(runtime.session.sessionFile).toBeUndefined();
    workspace = game;
    await runtime.newSession();
    expect(runtime.cwd).toBe(game);
    expect(runtime.session.getActiveToolNames()).toContain("check_game");
    expect(runtime.session.systemPrompt).toContain("tempi's game-building agent");
    expect(runtime.session.systemPrompt).toContain("Fake target instructions.");
    expect(JSON.parse(readFileSync(path.join(game, ".pi", "settings.json"), "utf8"))).toEqual({ subagents: { defaultExtensions: [] } });
  } finally {
    await runtime.dispose();
  }
}, 60_000);
