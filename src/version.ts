import { readFileSync } from "node:fs";

/** tempi's version, read from package.json. */
export function tempiVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  return pkg.version;
}
