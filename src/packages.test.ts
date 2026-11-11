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

  test("give the loader each package root, the manifest's skills and prompts, and web access for children", () => {
    const resources = bundledResources();
    expect(resources.extensionPaths.map((p) => path.basename(p))).toEqual(["pi-web-access", "pi-subagents"]);
    expect(resources.skillPaths).toEqual([path.join(resolvePackageRoot("pi-subagents"), "skills")]);
    expect(resources.promptPaths).toEqual([path.join(resolvePackageRoot("pi-subagents"), "prompts")]);
    expect(resources.childExtensions).toEqual([
      { id: "pi-web-access", path: path.join(resolvePackageRoot("pi-web-access"), "dist", "index.js") },
    ]);
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
