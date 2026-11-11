import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { assetPath, createSaveAssetTool, MAX_ASSET_BYTES, saveAsset } from "./save-asset.js";

// The smallest byte strings each format check recognises.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const WAV = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt ")]);
const GLB = Buffer.concat([Buffer.from("glTF"), Buffer.from([2, 0, 0, 0])]);

let dir: string;
let workspace: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "tempi-assets-"));
  workspace = path.join(dir, "game");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const saved = (name: string) => readFileSync(path.join(workspace, "assets", name));

describe("saveAsset", () => {
  test("copies a local file, as ComfyUI returns its output path", async () => {
    const source = path.join(dir, "ComfyUI_00001_.png");
    writeFileSync(source, PNG);
    await expect(saveAsset(workspace, "cat.png", { path: source })).resolves.toEqual({
      path: "assets/cat.png",
      kind: "image",
      mimeType: "image/png",
      bytes: PNG.length,
    });
    expect(saved("cat.png")).toEqual(PNG);
  });

  test("decodes base64 and data URLs, into subdirectories", async () => {
    await saveAsset(workspace, "sfx/jump.wav", { base64: WAV.toString("base64") });
    expect(saved("sfx/jump.wav")).toEqual(WAV);
    const result = await saveAsset(workspace, "assets/ball.glb", { base64: `data:model/gltf-binary;base64,${GLB.toString("base64")}` });
    expect(result).toMatchObject({ path: "assets/ball.glb", kind: "model" });
    expect(saved("ball.glb")).toEqual(GLB);
  });

  test("overwrites an existing asset", async () => {
    await saveAsset(workspace, "cat.png", { base64: PNG.toString("base64") });
    const other = Buffer.concat([PNG, Buffer.from([9, 9])]);
    await saveAsset(workspace, "cat.png", { base64: other.toString("base64") });
    expect(saved("cat.png")).toEqual(other);
  });

  test("refuses data that is not the format its name says, such as an error message", async () => {
    const error = Buffer.from("Error executing tool generate_image").toString("base64");
    await expect(saveAsset(workspace, "cat.png", { base64: error })).rejects.toThrow(/not a \.png file \(it starts with "Error executing tool/);
    await expect(saveAsset(workspace, "cat.png", { base64: WAV.toString("base64") })).rejects.toThrow(/not a \.png file/);
  });

  test("refuses unsupported types, empty data, bad base64, and missing files", async () => {
    await expect(saveAsset(workspace, "notes.txt", { base64: "aGk=" })).rejects.toThrow(/Unsupported asset type "\.txt"/);
    await expect(saveAsset(workspace, "cat.png", { base64: "" })).rejects.toThrow(/exactly one/);
    await expect(saveAsset(workspace, "cat.png", { base64: "not base64!" })).rejects.toThrow(/not base64/);
    await expect(saveAsset(workspace, "cat.png", { path: path.join(dir, "missing.png") })).rejects.toThrow(/No file at/);
  });

  test("needs exactly one source", async () => {
    await expect(saveAsset(workspace, "cat.png", {})).rejects.toThrow(/got none/);
    await expect(saveAsset(workspace, "cat.png", { base64: PNG.toString("base64"), url: "https://x/y.png" })).rejects.toThrow(/got base64, url/);
  });

  test("refuses files over the size limit", async () => {
    const big = path.join(dir, "big.png");
    writeFileSync(big, Buffer.alloc(MAX_ASSET_BYTES + 1));
    await expect(saveAsset(workspace, "big.png", { path: big })).rejects.toThrow(/limit/);
  });
});

describe("assetPath", () => {
  test("keeps names inside assets/", () => {
    expect(assetPath(workspace, "cat.png")).toBe(path.join(workspace, "assets", "cat.png"));
    expect(assetPath(workspace, "assets/sfx/jump.wav")).toBe(path.join(workspace, "assets", "sfx", "jump.wav"));
    expect(() => assetPath(workspace, "../escape.png")).toThrow(/outside assets/);
    expect(() => assetPath(workspace, "assets/../../escape.png")).toThrow(/outside assets/);
    expect(() => assetPath(workspace, "/etc/escape.png")).toThrow(/relative path/);
    expect(() => assetPath(workspace, "  ")).toThrow(/relative path/);
  });
});

describe("downloads", () => {
  let server: Server;
  let base: string;
  beforeEach(async () => {
    server = createServer((req, res) => {
      if (req.url === "/cat.png") res.writeHead(200, { "content-type": "image/png" }).end(PNG);
      else res.writeHead(404).end("not found");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

  test("saves an http download and reports failed ones", async () => {
    await saveAsset(workspace, "cat.png", { url: `${base}/cat.png` });
    expect(saved("cat.png")).toEqual(PNG);
    await expect(saveAsset(workspace, "dog.png", { url: `${base}/dog.png` })).rejects.toThrow(/HTTP 404/);
    await expect(saveAsset(workspace, "cat.png", { url: "file:///etc/passwd" })).rejects.toThrow(/Only http and https/);
  });
});

test("save_asset tool saves and reports the result", async () => {
  const tool = createSaveAssetTool(workspace);
  const result = await tool.execute("call-1", { name: "cat.png", base64: PNG.toString("base64") }, undefined, undefined, undefined as never);
  expect(result.content).toEqual([{ type: "text", text: `Saved assets/cat.png (image, image/png, ${PNG.length} bytes).` }]);
  expect(result.details).toMatchObject({ path: "assets/cat.png" });
});
