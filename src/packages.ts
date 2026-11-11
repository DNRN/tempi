import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/** A pi package tempi ships as a pinned npm dependency (ADR 0005). */
export interface BundledPackage {
  /** npm package name, as in tempi's package.json. */
  name: string;
  /** Load the package's extensions into subagent children too. */
  inChildren: boolean;
}

/**
 * The pi packages tempi's sessions load. Nothing else is loaded: the user's own
 * pi packages, extensions, skills, and prompts stay out (ADR 0005).
 */
export const BUNDLED_PACKAGES: readonly BundledPackage[] = [
  { name: "pi-web-access", inChildren: true },
  { name: "pi-subagents", inChildren: false },
];

/** An extension pi-subagents loads into every child session. */
export interface ChildExtension {
  id: string;
  /** Absolute path of the extension's entry file. */
  path: string;
}

/** Paths to hand to pi's DefaultResourceLoader, and the extensions children need. */
export interface BundledResources {
  extensionPaths: string[];
  skillPaths: string[];
  promptPaths: string[];
  childExtensions: ChildExtension[];
}

interface PiManifest {
  extensions?: string[];
  skills?: string[];
  prompts?: string[];
}

/**
 * Finds an installed package's root directory. Walks the module lookup paths
 * instead of resolving `<name>/package.json`, which a package's `exports` may
 * hide (pi-subagents does).
 */
export function resolvePackageRoot(name: string, from: string = import.meta.url): string {
  const require = createRequire(from);
  for (const dir of require.resolve.paths(name) ?? []) {
    const candidate = path.join(dir, name);
    if (existsSync(path.join(candidate, "package.json"))) return candidate;
  }
  throw new Error(`Bundled pi package "${name}" is not installed. Run npm install in tempi.`);
}

function readManifest(root: string, name: string): PiManifest {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { pi?: PiManifest };
  if (!pkg.pi) throw new Error(`Bundled package "${name}" has no "pi" manifest in its package.json.`);
  return pkg.pi;
}

function manifestPaths(root: string, name: string, entries: string[] | undefined): string[] {
  return (entries ?? []).map((entry) => {
    if (/[*?!{[]/.test(entry)) {
      throw new Error(`Bundled package "${name}" uses a glob in its pi manifest ("${entry}"); tempi supports plain paths only.`);
    }
    const resolved = path.resolve(root, entry);
    if (!existsSync(resolved)) throw new Error(`Bundled package "${name}" lists a missing path: ${entry}`);
    return resolved;
  });
}

/** A directory entry stands for its index file; pi-subagents needs a file. */
function entryFile(entry: string): string {
  if (!statSync(entry).isDirectory()) return entry;
  for (const index of ["index.js", "index.ts"]) {
    const file = path.join(entry, index);
    if (existsSync(file)) return file;
  }
  throw new Error(`Extension directory has no index.js or index.ts: ${entry}`);
}

/** Resolves the bundled packages to the paths tempi's sessions load. */
export function bundledResources(
  packages: readonly BundledPackage[] = BUNDLED_PACKAGES,
  from: string = import.meta.url,
): BundledResources {
  const resources: BundledResources = { extensionPaths: [], skillPaths: [], promptPaths: [], childExtensions: [] };
  for (const { name, inChildren } of packages) {
    const root = resolvePackageRoot(name, from);
    const manifest = readManifest(root, name);
    const extensions = manifestPaths(root, name, manifest.extensions);
    // pi loads a package root through its manifest, as `pi install` would.
    if (extensions.length > 0) resources.extensionPaths.push(root);
    resources.skillPaths.push(...manifestPaths(root, name, manifest.skills));
    resources.promptPaths.push(...manifestPaths(root, name, manifest.prompts));
    if (inChildren) {
      extensions.forEach((entry, i) => {
        resources.childExtensions.push({ id: extensions.length > 1 ? `${name}-${i + 1}` : name, path: entryFile(entry) });
      });
    }
  }
  return resources;
}
