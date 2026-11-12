// Sanity checks of the built site before deploy: required files exist and every local reference
// in the HTML resolves inside dist/ (catches broken relative paths on the GitHub Pages sub-path).
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const pages = ["dist/index.html", "dist/services.html", "dist/contact.html", "dist/ccar-f/index.html", "dist/ccar-f/licence.html"];
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
for (const f of ["dist/ccar-f/data/questions.en.json", "dist/ccar-f/data/questions.cs.json", "dist/ccar-f/data/sources.json", "dist/ccar-f/sw.js"]) {
  if (!existsSync(f)) { console.error("missing", f); errors++; }
}
// published data must not contain official sample / practice-test material (see ccar-f/README.md)
const en = JSON.parse(readFileSync("dist/ccar-f/data/questions.en.json", "utf8")).questions;
const banned = en.filter((q) => /^(official|hamza)-/.test(q.id));
if (banned.length) { console.error("excluded questions present:", banned.map((q) => q.id).join(", ")); errors++; }
const sources = JSON.parse(readFileSync("dist/ccar-f/data/sources.json", "utf8")).sources;
const known = new Set(sources.map((s) => s.repo));
const unattributed = en.filter((q) => !known.has(q.src));
if (unattributed.length) { console.error("questions without a listed source:", unattributed.length); errors++; }
for (const s of sources) if (s.license === "MIT" && !/Permission is hereby granted/.test(s.licenseText || "")) { console.error("MIT text missing:", s.repo); errors++; }
if (errors) { console.error(`${errors} problem(s)`); process.exit(1); }
console.log("dist OK");
