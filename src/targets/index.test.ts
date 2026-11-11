import { expect, test } from "vitest";
import { createTarget, DEFAULT_TARGET } from "./index.js";

test("web is the default target; both targets can be created", () => {
  expect(DEFAULT_TARGET).toBe("web");
  expect(createTarget("web").id).toBe("web");
  expect(createTarget("godot").id).toBe("godot");
});

test("with open: false, running a web game opens nothing", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const dir = mkdtempSync(path.join(tmpdir(), "tempi-target-"));
  try {
    const target = createTarget("web", { open: false });
    await target.scaffold(path.join(dir, "game"));
    const running = await target.run(path.join(dir, "game"));
    expect(running.location).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    await running.stop();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
