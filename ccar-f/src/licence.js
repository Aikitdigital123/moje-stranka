// "Licence a zdroje" page: renders attribution, licence texts and modification lists from
// data/sources.json (generated together with the question data by cca-f-prep/tools/build_public.py).
import "./app.css";

/* global __DATA_VERSION__ */
const DATA_VERSION = typeof __DATA_VERSION__ !== "undefined" ? __DATA_VERSION__ : "dev";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LIC = { MIT: "MIT License", "CC-BY-4.0": "Creative Commons Attribution 4.0 International (CC BY 4.0)" };

async function main() {
  const root = document.getElementById("sources");
  let data;
  try {
    const r = await fetch(`data/sources.json?v=${DATA_VERSION}`);
    if (!r.ok) throw new Error(r.status);
    data = await r.json();
  } catch {
    root.innerHTML = `<p class="verdict bad">Seznam zdrojů se nepodařilo načíst.</p>`;
    return;
  }
  const total = data.sources.reduce((a, s) => a + s.count, 0);
  const modified = data.sources.reduce((a, s) => a + s.modified.length, 0);
  document.getElementById("mod-count").textContent = `${modified} z ${total}`;
  document.getElementById("excl-count").textContent = `${data.excludedCount}`;
  root.innerHTML = data.sources.map((s, i) => `
    <article class="card src-card" id="src-${i}" data-license="${esc(s.license)}">
      <h3><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.repo)}</a></h3>
      <dl class="meta">
        <dt>Autor</dt><dd>${esc(s.creator)}</dd>
        ${s.copyright ? `<dt>Copyright</dt><dd>${esc(s.copyright)}</dd>` : ""}
        <dt>Licence</dt><dd><a href="${esc(s.licenseUrl)}" target="_blank" rel="noopener noreferrer license">${esc(LIC[s.license] || s.license)}</a></dd>
        <dt>Zdroj</dt><dd><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.url)}</a></dd>
        <dt>Otázek v aplikaci</dt><dd>${s.count}</dd>
        <dt>Změny</dt><dd>${s.license === "CC-BY-4.0" ? "Materiál byl upraven: " : ""}převedeno do jednotného formátu, přeloženo do češtiny${s.modified.length ? `, opraveno ${s.modified.length} otázek (${s.modified.map(esc).join(", ")})` : ""}.</dd>
      </dl>
      ${s.license === "CC-BY-4.0" ? `<p class="small muted">Licencováno pod <a href="${esc(s.licenseUrl)}" target="_blank" rel="noopener noreferrer license">CC BY 4.0</a>. Dílo je poskytnuto „tak, jak je“, bez záruk; podrobnosti viz text licence.</p>` : ""}
      ${s.licenseText ? `<details><summary>Úplný text licence</summary><pre class="lic">${esc(s.licenseText)}</pre></details>` : ""}
    </article>`).join("");
}
main();
