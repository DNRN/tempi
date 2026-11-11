import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { type StaticServer, serveDirectory } from "./static-server.js";

let dir: string;
let server: StaticServer;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "tempi-serve-"));
  mkdirSync(path.join(dir, "game", "src"), { recursive: true });
  mkdirSync(path.join(dir, "game", ".tempi"), { recursive: true });
  writeFileSync(path.join(dir, "game", "index.html"), "<h1>hi</h1>");
  writeFileSync(path.join(dir, "game", "src", "main.js"), "export {};");
  writeFileSync(path.join(dir, "game", ".tempi", "secret.txt"), "no");
  writeFileSync(path.join(dir, "outside.txt"), "no");
  server = await serveDirectory(path.join(dir, "game"));
});
afterEach(async () => {
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

// fetch() normalises "..", so send the raw path to test traversal.
function rawGet(pathname: string): Promise<number> {
  const { port } = new URL(server.url);
  return new Promise((resolve, reject) => {
    request({ host: "127.0.0.1", port, path: pathname }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    })
      .on("error", reject)
      .end();
  });
}

test("serves index.html for the root and files with their content type", async () => {
  const root = await fetch(server.url);
  expect(root.status).toBe(200);
  expect(root.headers.get("content-type")).toBe("text/html; charset=utf-8");
  expect(await root.text()).toBe("<h1>hi</h1>");
  const js = await fetch(`${server.url}src/main.js`);
  expect(js.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
});

test("returns 404 for missing files, dot-paths, and paths outside the directory", async () => {
  expect((await fetch(`${server.url}missing.png`)).status).toBe(404);
  expect(await rawGet("/.tempi/secret.txt")).toBe(404);
  expect(await rawGet("/../outside.txt")).toBe(404);
  expect(await rawGet("/%2e%2e/outside.txt")).toBe(404);
  expect(await rawGet("/%E0%A4%A")).toBe(400);
});
