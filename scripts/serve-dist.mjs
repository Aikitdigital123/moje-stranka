// Static server that mimics GitHub Pages for a project site: dist/ is served under /moje-stranka/.
// Used by the Playwright tests (and handy for a manual check: `node scripts/serve-dist.mjs`).
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 4321);
const PREFIX = "/moje-stranka";
const ROOT = new URL("../dist/", import.meta.url).pathname;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon" };

createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/" || url.pathname === PREFIX) { res.writeHead(301, { Location: `${PREFIX}/` }); return res.end(); }
  if (!url.pathname.startsWith(PREFIX + "/")) { res.writeHead(404); return res.end("404"); }
  let file = normalize(join(ROOT, decodeURIComponent(url.pathname.slice(PREFIX.length))));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!url.pathname.endsWith("/")) { res.writeHead(301, { Location: url.pathname + "/" }); return res.end(); } // like GitHub Pages
    file = join(file, "index.html");
  }
  if (!existsSync(file)) { res.writeHead(404); return res.end("404"); }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(PORT, "127.0.0.1", () => console.log(`serving dist/ at http://127.0.0.1:${PORT}${PREFIX}/`));
