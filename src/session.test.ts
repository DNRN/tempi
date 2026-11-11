import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import { registerRequiredChildExtensions } from "pi-subagents/required-child-extensions";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createTempiSession, NoModelError, type TempiSession } from "./session.js";

// Each test gets its own pi agent dir, so the user's ~/.pi/agent (models, auth,
// MCP servers, installed packages) is never read and no network is needed.
let dir: string;
let agentDir: string;
let workspace: string;
let opened: TempiSession | undefined;
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
  opened = await createTempiSession({ workspace, agentDir, ...(await runtimeWithModel()), sessionManager: SessionManager.inMemory(workspace) });
  const tools = opened.session.getAllTools().map((t) => t.name);
  expect(tools).toEqual(expect.arrayContaining(["web_search", "fetch_content", "web_enable", "subagent", "subagents_enable", "codemode", "tool_search"]));
  expect(opened.extensionErrors).toEqual([]);
  expect(JSON.parse(readFileSync(path.join(workspace, ".pi", "settings.json"), "utf8"))).toEqual({ subagents: { defaultExtensions: [] } });
}, 60_000);

test("adds tempi's system prompt to pi's", async () => {
  opened = await createTempiSession({ workspace, agentDir, ...(await runtimeWithModel()), sessionManager: SessionManager.inMemory(workspace) });
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
  opened = await createTempiSession({ workspace, agentDir, ...(await runtimeWithModel()), sessionManager: SessionManager.inMemory(workspace) });
  expect(opened.session.getAllTools().map((t) => t.name)).not.toContain("user_tool");
}, 60_000);

test("registers web access for subagent children until disposed", async () => {
  opened = await createTempiSession({ workspace, agentDir, ...(await runtimeWithModel()), sessionManager: SessionManager.inMemory(workspace) });
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
  await expect(createTempiSession({ workspace, agentDir, sessionManager: SessionManager.inMemory(workspace) })).rejects.toBeInstanceOf(NoModelError);
}, 60_000);
