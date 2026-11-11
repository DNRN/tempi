import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/** The largest asset tempi saves: a generous cap for a sprite, a sound effect, or a small model. */
export const MAX_ASSET_BYTES = 50 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 60_000;

export type AssetKind = "image" | "audio" | "model";

/** File formats the targets load, by extension, with how to recognise their bytes. */
const FORMATS: Record<string, { kind: AssetKind; mimeType: string; matches: (b: Buffer) => boolean }> = {
  png: { kind: "image", mimeType: "image/png", matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  jpg: { kind: "image", mimeType: "image/jpeg", matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  jpeg: { kind: "image", mimeType: "image/jpeg", matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  webp: { kind: "image", mimeType: "image/webp", matches: (b) => ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP") },
  gif: { kind: "image", mimeType: "image/gif", matches: (b) => ascii(b, 0, "GIF87a") || ascii(b, 0, "GIF89a") },
  wav: { kind: "audio", mimeType: "audio/wav", matches: (b) => ascii(b, 0, "RIFF") && ascii(b, 8, "WAVE") },
  ogg: { kind: "audio", mimeType: "audio/ogg", matches: (b) => ascii(b, 0, "OggS") },
  // An ID3 tag, or an MPEG audio frame sync (11 set bits).
  mp3: { kind: "audio", mimeType: "audio/mpeg", matches: (b) => ascii(b, 0, "ID3") || (b.length > 1 && b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0) },
  glb: { kind: "model", mimeType: "model/gltf-binary", matches: (b) => ascii(b, 0, "glTF") },
};

function startsWith(bytes: Buffer, prefix: number[]): boolean {
  return bytes.length >= prefix.length && prefix.every((value, i) => bytes[i] === value);
}

function ascii(bytes: Buffer, offset: number, text: string): boolean {
  return bytes.length >= offset + text.length && bytes.toString("latin1", offset, offset + text.length) === text;
}

/** Where the asset's bytes come from: exactly one field is set. */
export interface AssetSource {
  /** A file on this machine, such as a ComfyUI output path. */
  path?: string;
  /** Base64 data, or a `data:<mime>;base64,` URL. */
  base64?: string;
  /** An http(s) URL to download. */
  url?: string;
}

export interface SavedAsset {
  /** Path relative to the workspace, with forward slashes, such as `assets/cat.png`. */
  path: string;
  kind: AssetKind;
  mimeType: string;
  bytes: number;
}

/**
 * Resolves `name` inside the workspace's `assets/` directory. Rejects absolute
 * paths and anything that would land outside it.
 */
export function assetPath(workspace: string, name: string): string {
  const assets = path.resolve(workspace, "assets");
  const trimmed = name.trim().replace(/\\/g, "/").replace(/^assets\//, "");
  if (!trimmed || path.isAbsolute(trimmed)) throw new Error(`Asset name must be a relative path inside assets/, got "${name}".`);
  const target = path.resolve(assets, trimmed);
  if (!target.startsWith(assets + path.sep)) throw new Error(`Asset name "${name}" points outside assets/.`);
  return target;
}

async function readSource(source: AssetSource, signal?: AbortSignal): Promise<Buffer> {
  const given = (["path", "base64", "url"] as const).filter((key) => source[key] !== undefined && source[key] !== "");
  if (given.length !== 1) throw new Error(`Give exactly one of path, base64, or url (got ${given.length === 0 ? "none" : given.join(", ")}).`);

  if (source.path !== undefined && source.path !== "") {
    const stat = statSync(source.path, { throwIfNoEntry: false });
    if (!stat?.isFile()) throw new Error(`No file at ${source.path}.`);
    if (stat.size > MAX_ASSET_BYTES) throw tooLarge(stat.size);
    return readFileSync(source.path);
  }

  if (source.base64 !== undefined && source.base64 !== "") {
    const data = source.base64.replace(/^data:[^,]*;base64,/, "").replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(data)) throw new Error("base64 holds characters that are not base64.");
    return Buffer.from(data, "base64");
  }

  const url = new URL(source.url ?? "");
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`Only http and https URLs can be downloaded, got ${url.protocol}`);
  const timeout = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} from ${url.href}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_ASSET_BYTES) throw tooLarge(length);
  return Buffer.from(await response.arrayBuffer());
}

function tooLarge(bytes: number): Error {
  return new Error(`Asset is ${bytes} bytes; the limit is ${MAX_ASSET_BYTES}.`);
}

/**
 * Saves an asset into the workspace's `assets/` directory, after checking that
 * its bytes are the format its name says. Overwrites an existing file, so a
 * change request can replace an asset.
 */
export async function saveAsset(workspace: string, name: string, source: AssetSource, signal?: AbortSignal): Promise<SavedAsset> {
  const target = assetPath(workspace, name);
  const extension = path.extname(target).slice(1).toLowerCase();
  const format = FORMATS[extension];
  if (!format) throw new Error(`Unsupported asset type ".${extension}". Use one of: ${Object.keys(FORMATS).map((e) => `.${e}`).join(", ")}.`);

  const bytes = await readSource(source, signal);
  if (bytes.length === 0) throw new Error("The asset is empty.");
  if (bytes.length > MAX_ASSET_BYTES) throw tooLarge(bytes.length);
  if (!format.matches(bytes)) {
    const preview = bytes.toString("utf8", 0, Math.min(bytes.length, 120)).replace(/\s+/g, " ");
    throw new Error(`The data is not a .${extension} file (it starts with "${preview}"). The source may have returned an error or a different format.`);
  }

  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return {
    path: path.relative(workspace, target).split(path.sep).join("/"),
    kind: format.kind,
    mimeType: format.mimeType,
    bytes: bytes.length,
  };
}

const parameters = Type.Object({
  name: Type.String({ description: "File name inside assets/, with its extension, such as cat.png or sfx/jump.wav." }),
  path: Type.Optional(Type.String({ description: "A file on this machine to copy, such as an image generator's output path." })),
  base64: Type.Optional(Type.String({ description: "Base64 data, or a data: URL." })),
  url: Type.Optional(Type.String({ description: "An http(s) URL to download." })),
});

/**
 * The `save_asset` tool. Callable directly or from a codemode script, where MCP
 * tools usually run, so a script can pass a generator's output straight on.
 */
export function createSaveAssetTool(workspace: string) {
  return defineTool<typeof parameters, SavedAsset>({
    name: "save_asset",
    label: "Save asset",
    description:
      "Save a generated image, sound, or 3D model into the game's assets/ directory. Give the file name and exactly one source: " +
      "a local file path, base64 data, or a URL. Checks that the data really is the format the name says. " +
      `Formats: ${Object.keys(FORMATS).map((e) => `.${e}`).join(", ")}.`,
    promptSnippet: "save_asset: save a generated image, sound, or model into assets/",
    parameters,
    async execute(_toolCallId, params, signal) {
      const { name, ...source } = params;
      const saved = await saveAsset(workspace, name, source, signal);
      return {
        content: [{ type: "text", text: `Saved ${saved.path} (${saved.kind}, ${saved.mimeType}, ${saved.bytes} bytes).` }],
        details: saved,
      };
    },
  });
}
