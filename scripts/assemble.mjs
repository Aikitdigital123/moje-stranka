// Assemble the GitHub Pages artifact in dist/: the original static pages stay byte-for-byte as they
// are in the repo root; the CCAR-F Trainer is built by Vite into dist/ccar-f/.
import { cpSync, existsSync, mkdirSync } from "node:fs";

const STATIC = ["index.html", "services.html", "contact.html", "styles.css", "script.js"];
mkdirSync("dist", { recursive: true });
for (const f of STATIC) {
  if (!existsSync(f)) throw new Error(`missing static file: ${f}`);
  cpSync(f, `dist/${f}`);
}
console.log(`assembled dist/: ${STATIC.length} static files + ccar-f/`);
