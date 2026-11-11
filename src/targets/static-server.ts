import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

export interface StaticServer {
  /** Base URL with a trailing slash, such as http://127.0.0.1:41234/ */
  url: string;
  close(): Promise<void>;
}

/**
 * Serves a directory over http on localhost: ES modules and fetch() don't
 * work from file:// URLs. Only files inside `root` are served; dot-paths
 * (`.pi/`, `.tempi/`) are not.
 */
export async function serveDirectory(root: string, port = 0): Promise<StaticServer> {
  const base = path.resolve(root);
  const server = createServer((req, res) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    } catch {
      res.writeHead(400).end("Bad request");
      return;
    }
    const segments = pathname.split("/").filter(Boolean);
    if (segments.some((s) => s.startsWith(".") || s.includes("\0"))) {
      res.writeHead(404).end("Not found");
      return;
    }
    let file = path.join(base, ...segments);
    if (file !== base && !file.startsWith(base + path.sep)) {
      res.writeHead(404).end("Not found");
      return;
    }
    let stat = statSync(file, { throwIfNoEntry: false });
    if (stat?.isDirectory()) {
      file = path.join(file, "index.html");
      stat = statSync(file, { throwIfNoEntry: false });
    }
    if (!stat?.isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": MIME_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "content-length": stat.size,
      "cache-control": "no-store",
    });
    if (req.method === "HEAD") res.end();
    else createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  const { port: actual } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${actual}/`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
