// Minimal static server for local dev and browser tests. No caching, so edits show up on reload.
// Usage: node tests/serve.mjs [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

export function serve(port = 5173) {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (path.endsWith("/")) path += "index.html";
      const file = normalize(join(ROOT, path));
      if (!file.startsWith(ROOT) || /[\\/]\.(git|claude)([\\/]|$)/.test(file)) throw Object.assign(new Error(), { code: "ENOENT" });
      if (!(await stat(file)).isFile()) throw Object.assign(new Error(), { code: "ENOENT" });
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(await readFile(file));
    } catch { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Not found"); }
  });
  return new Promise(r => server.listen(port, "127.0.0.1", () => r(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2]) || 5173;
  serve(port).then(() => console.log(`http://localhost:${port}/`));
}
