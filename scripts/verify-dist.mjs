// Sanity checks of the built site before deploy: required files exist and every local reference
// in the HTML resolves inside dist/ (catches broken relative paths on the GitHub Pages sub-path).
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const pages = ["dist/index.html", "dist/services.html", "dist/contact.html", "dist/ccar-f/index.html"];
let errors = 0;
for (const p of pages) {
  if (!existsSync(p)) { console.error("missing", p); errors++; continue; }
  const html = readFileSync(p, "utf8");
  for (const [, ref] of html.matchAll(/(?:src|href)="([^"#?]+)[^"]*"/g)) {
    if (/^(https?:|mailto:|tel:|data:|\/\/)/.test(ref)) continue;
    const target = join(dirname(p), ref);
    const ok = existsSync(target) && (statSync(target).isFile() || existsSync(join(target, "index.html")));
    if (!ok) { console.error(`${p}: broken reference ${ref}`); errors++; }
  }
}
for (const f of ["dist/ccar-f/data/questions.en.json", "dist/ccar-f/data/questions.cs.json", "dist/ccar-f/sw.js"]) {
  if (!existsSync(f)) { console.error("missing", f); errors++; }
}
if (errors) { console.error(`${errors} problem(s)`); process.exit(1); }
console.log("dist OK");
