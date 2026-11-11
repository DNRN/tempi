import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { BUNDLED_PACKAGES, bundledResources, resolvePackageRoot } from "./packages.js";

describe("bundled packages tempi ships", () => {
  test("resolve to installed roots, including one whose exports hide package.json", () => {
    for (const { name } of BUNDLED_PACKAGES) {
      expect(path.basename(resolvePackageRoot(name))).toBe(name);
    }
  });

  test("give the loader each package root, and web access for children; a root's skills and prompts come with it, not as paths", () => {
    const resources = bundledResources();
    expect(resources.extensionPaths.map((p) => path.basename(p))).toEqual(["pi-web-access", "pi-subagents"]);
    // pi-subagents has extensions, so its root loads with its manifest: passing
    // its skills and prompts as paths too would load them twice (ADR 0009).
    expect(resources.skillPaths).toEqual([]);
    expect(resources.promptPaths).toEqual([]);
    expect(resources.childExtensions).toEqual([
      { id: "pi-web-access", path: path.join(resolvePackageRoot("pi-web-access"), "dist", "index.js") },
    ]);
  });

  test("pass a package's skill and prompt paths only when it has no extensions", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tempi-packages-"));
    try {
      const root = path.join(dir, "node_modules", "docs-only");
      mkdirSync(root, { recursive: true });
      writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "docs-only", pi: { skills: ["./skills"], prompts: ["./prompts"] } }));
      mkdirSync(path.join(root, "skills"), { recursive: true });
      mkdirSync(path.join(root, "prompts"), { recursive: true });
      const resources = bundledResources([{ name: "docs-only", inChildren: false }], pathToFileURL(path.join(dir, "index.js")).href);
      expect(resources.extensionPaths).toEqual([]);
      expect(resources.skillPaths).toEqual([path.join(root, "skills")]);
      expect(resources.promptPaths).toEqual([path.join(root, "prompts")]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("bundledResources with fixture packages", () => {
  let dir: string;
  const from = () => pathToFileURL(path.join(dir, "index.js")).href;
  const fixture = (name: string, pi: unknown, files: string[] = []) => {
    const root = path.join(dir, "node_modules", name);
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ name, pi }));
    for (const file of files) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), "");
    }
    return root;
  };

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("resolves a directory extension to its index file for children", () => {
    dir = mkdtempSync(path.join(tmpdir(), "tempi-packages-"));
    const root = fixture("dir-ext", { extensions: ["./dist"] }, ["dist/index.js"]);
    const resources = bundledResources([{ name: "dir-ext", inChildren: true }], from());
    expect(resources.extensionPaths).toEqual([root]);
    expect(resources.childExtensions).toEqual([{ id: "dir-ext", path: path.join(root, "dist", "index.js") }]);
  });

  test("rejects globs, missing paths, packages without a manifest, and missing packages", () => {
    dir = mkdtempSync(path.join(tmpdir(), "tempi-packages-"));
    fixture("globbed", { extensions: ["./ext/*.js"] });
    fixture("missing-path", { skills: ["./skills"] });
    fixture("no-manifest", undefined);
    const load = (name: string) => () => bundledResources([{ name, inChildren: false }], from());
    expect(load("globbed")).toThrow(/glob/);
    expect(load("missing-path")).toThrow(/missing path/);
    expect(load("no-manifest")).toThrow(/no "pi" manifest/);
    expect(load("not-installed")).toThrow(/not installed/);
  });
});
