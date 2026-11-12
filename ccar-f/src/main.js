// CCAR-F Trainer — UI. Views: home, learn, exam (full/short), result.
// Pure logic lives in selection.js (unit-tested); persistence in storage.js.
import "./app.css";
import {
  learningOrder, buildExam, recordExam, recordScore, newHistory, gradeExam, isCorrect,
  shuffledOptionIds, domainQuotas, EXAM_PRESETS,
} from "./selection.js";
import { makeStore } from "./storage.js";
import { playTerminal, spinnerHtml, animateSpinners } from "./terminal.js";

/* global __DATA_VERSION__ */
const DATA_VERSION = typeof __DATA_VERSION__ !== "undefined" ? __DATA_VERSION__ : "dev";
const DOMAINS = {
  1: "Agentic Architecture & Orchestration",
  2: "Tool Design & MCP Integration",
  3: "Claude Code Configuration & Workflows",
  4: "Prompt Engineering & Structured Output",
  5: "Context Management & Reliability",
};
const LETTERS = "ABCDEFGH";

const store = makeStore();
const $main = document.getElementById("main");
const $bar = document.getElementById("actionbar");

/** @type {{questions: any[], scenarios: string[]}} */ let DATA;
let Q = [], byId = {}, ORDER = [];
let CS = null, csPromise = null;            // Czech texts, fetched on first use
let showCs = store.load("prefs", {}).showCs === true;
let cleanup = [];                            // per-view teardown (timers, listeners, animations)

// ---------------------------------------------------------------- helpers
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const $ = (sel) => document.querySelector(sel);
function on(sel, ev, fn) { document.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn)); }
function teardown() { cleanup.forEach((f) => f()); cleanup = []; }
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
let lastScreen = "";
/**
 * Render a screen. `screen` names the logical screen; changing it (e.g. home → learn, next question)
 * plays the enter animation. Re-renders of the same screen (selecting an option) do not.
 */
function view(html, bar = "", screen = "") {
  teardown();
  const apply = () => {
    $main.innerHTML = html;
    $bar.hidden = !bar;
    $bar.innerHTML = bar ? `<div class="wrap">${bar}</div>` : "";
  };
  const changed = screen && screen !== lastScreen;
  lastScreen = screen || lastScreen;
  apply(); // synchronous on purpose: callers query the new DOM right after view()
  if (changed && !reducedMotion()) {
    $main.classList.remove("enter");
    void $main.offsetWidth; // restart the CSS animation
    $main.classList.add("enter");
  }
  if (!reducedMotion()) {
    // progress bars grow from 0 on first paint
    $main.querySelectorAll(".bar > i").forEach((i) => { if (changed) { i.classList.add("grow-in"); requestAnimationFrame(() => requestAnimationFrame(() => i.classList.remove("grow-in"))); } });
    $main.querySelectorAll("[data-count]").forEach(countUp);
  }
}
/** Animate a number from 0 to data-count (keeps any suffix in data-suffix). */
function countUp(el) {
  const to = Number(el.dataset.count), suffix = el.dataset.suffix || "", t0 = performance.now(), dur = 700;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(to * e) + suffix;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function keys(handler) {
  const fn = (e) => { if (e.target.closest("input, textarea") || e.metaKey || e.ctrlKey || e.altKey) return; handler(e); };
  window.addEventListener("keydown", fn);
  cleanup.push(() => window.removeEventListener("keydown", fn));
}
function toast(text) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = text; t.setAttribute("role", "status");
  document.body.append(t);
  setTimeout(() => t.remove(), 1800);
}
function savePrefs() { store.save("prefs", { ...store.load("prefs", {}), showCs }); }

async function loadCs() {
  if (CS) return CS;
  csPromise ??= fetch(`data/questions.cs.json?v=${DATA_VERSION}`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  try { CS = await csPromise; } catch { csPromise = null; toast("Překlad se nepodařilo načíst"); }
  return CS;
}
/** Toggle translation; re-render the current view after the Czech file is loaded. */
async function toggleCs(rerender) {
  showCs = !showCs;
  savePrefs();
  if (showCs && !CS) { toast("Načítám překlad…"); await loadCs(); }
  rerender();
}
const cs = (id) => (showCs && CS ? CS[id] : null);
const csBtn = () => `<button class="btn sm ghost" id="cs" title="Český překlad (klávesa T)" aria-pressed="${showCs}">${showCs ? "EN" : "Přelož"}</button>`;

// ---------------------------------------------------------------- question rendering
/**
 * @param q        question
 * @param order    option ids in display order
 * @param chosen   chosen option ids
 * @param reveal   show correct / wrong
 * @param labels   "position" = A,B,C by display position (exam); "id" = original letters (learn/review)
 */
function optionsHtml(q, order, chosen, reveal, labels) {
  const t = cs(q.id);
  const text = Object.fromEntries(q.o);
  return order.map((id, i) => {
    const sel = chosen.includes(id);
    const cls = reveal ? (q.c.includes(id) ? "ok" : sel ? "bad" : "") : sel ? "sel" : "";
    const label = labels === "position" ? LETTERS[i] : id.toUpperCase();
    return `<button class="opt ${cls}" data-opt="${id}" aria-pressed="${sel}" ${reveal ? "disabled" : ""}>
      <span class="key">${label}</span><span>${fmt(text[id])}${t ? `<div class="cs">${fmt(t.o[id])}</div>` : ""}</span></button>`;
  }).join("");
}
function questionHtml(q, meta, progress) {
  const t = cs(q.id);
  return `<div class="qmeta"><span>${meta}</span><span class="d">D${q.d}</span></div>
    ${progress != null ? `<div class="bar qprog"><i style="width:${progress}%"></i></div>` : ""}
    <div class="qtext">${fmt(q.q)}${t ? `<div class="cs">${fmt(t.q)}</div>` : ""}</div>
    ${q.c.length > 1 ? `<p class="multi">▸ Vyber ${q.c.length} odpovědi</p>` : ""}`;
}
function explanationHtml(q, chosen) {
  const ok = isCorrect(q, chosen);
  const t = cs(q.id);
  return `<div class="expl">
    <p class="verdict ${ok ? "ok" : "bad"}">${ok ? "✔ SPRÁVNĚ" : "✖ ŠPATNĚ"} · správně: ${q.c.map((c) => c.toUpperCase()).join(", ")}</p>
    <p>${fmt(q.e)}</p>${t ? `<p class="cs">${fmt(t.e)}</p>` : ""}
    <div class="src">zdroj: <a href="${esc(q.url)}" target="_blank" rel="noopener noreferrer">${esc(q.src)}</a> · ${esc(q.lic)}</div></div>`;
}
function toggleChoice(q, chosen, id) {
  if (q.c.length === 1) return [id];
  return chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id].slice(-q.c.length);
}

// ---------------------------------------------------------------- home
function stats() {
  const learn = store.load("learn", { pos: 0, answers: {} });
  const hist = store.load("history", newHistory());
  const answered = Object.values(learn.answers);
  const finished = hist.exams.filter((e) => e.score);
  const scores = finished.map((e) => pct(e.score.correct, e.score.total));
  const perD = {};
  for (const q of Q) { perD[q.d] ??= { n: 0, done: 0, ok: 0 }; perD[q.d].n++; const a = learn.answers[q.id]; if (a) { perD[q.d].done++; if (a.ok) perD[q.d].ok++; } }
  const examGroups = new Set(Q.filter((q) => !q.t).map((q) => q.g)).size;
  const usedInCycle = Object.values(hist.lastUsed).filter((n) => n >= hist.cycleStart).length;
  return { learn, hist, done: answered.length, good: answered.filter((a) => a.ok).length, finished, scores, perD, examGroups, usedInCycle };
}
function sparkline(values) {
  if (values.length < 2) return "";
  const w = 300, h = 44, max = 100, step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 4 - (v / max) * (h - 8)).toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Vývoj výsledků simulací">
    <defs><linearGradient id="sg" x1="0" x2="1"><stop offset="0" stop-color="#bb0e4c"/><stop offset="1" stop-color="#ff007f"/></linearGradient></defs>
    <polyline points="${pts}" fill="none" stroke="url(#sg)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

function home() {
  const s = stats();
  const active = store.load("exam", null);
  const last = s.finished.slice(-6).reverse();
  const best = s.scores.length ? Math.max(...s.scores) : null;
  view(`
    <section class="hero anim">
      <div>
        <p class="kicker">// exam trainer · CCAR-F</p>
        <h1 class="glitch" data-text="Claude Certified Architect – Foundations">Claude Certified Architect <span class="grad-text">– Foundations</span></h1>
        <p class="lead">Příprava na certifikační zkoušku Anthropic. ${Q.length} ověřených otázek v angličtině jako na zkoušce, české vysvětlení na jedno kliknutí. Postup se ukládá v tomto prohlížeči.</p>
        <div class="ctas">
          <button class="btn primary" id="go-learn">${s.done ? "Pokračovat v učení" : "Začít učení"}</button>
          ${active ? `<button class="btn" id="go-resume">Dokončit ${active.kind === "short" ? "krátký test" : "simulaci"}</button>`
                   : `<button class="btn" id="go-short">Krátký test · 30 min</button><button class="btn ghost" id="go-full">Plná simulace · 120 min</button>`}
        </div>
      </div>
      <div class="term" aria-hidden="true"><div class="term-bar"><i></i><i></i><i></i><span>~/ccar-f — status</span></div><div class="term-body" id="term"></div></div>
    </section>

    <section class="stats anim" aria-label="Přehled">
      <div class="stat" style="--i:0"><div class="v" data-count="${pct(s.done, Q.length)}" data-suffix=" %">${pct(s.done, Q.length)} %</div><div class="l">učení · ${s.done}/${Q.length}</div></div>
      <div class="stat" style="--i:1"><div class="v" ${s.done ? `data-count="${pct(s.good, s.done)}" data-suffix=" %"` : ""}>${s.done ? pct(s.good, s.done) + " %" : "–"}</div><div class="l">přesnost v učení</div></div>
      <div class="stat" style="--i:2"><div class="v" data-count="${s.finished.length}">${s.finished.length}</div><div class="l">dokončené testy</div></div>
      <div class="stat" style="--i:3"><div class="v" ${best != null ? `data-count="${best}" data-suffix=" %"` : ""}>${best != null ? best + " %" : "–"}</div><div class="l">nejlepší test</div></div>
    </section>

    <section class="modes anim">
      <article class="card mode">
        <h2><span class="num">01</span> Učení</h2>
        <p class="muted small">Všechny otázky postupně podle oblastí D1–D5 v pevném pořadí. Po každé odpovědi hned řešení a vysvětlení.</p>
        <div class="dom-list">${Object.entries(DOMAINS).map(([d, name]) => {
          const p = s.perD[d] || { n: 0, done: 0 };
          return `<button class="dom" data-dom="${d}" title="Přejít na oblast D${d}"><b>D${d}</b><span><span class="t">${name}</span><span class="bar"><i style="width:${pct(p.done, p.n)}%"></i></span></span><span class="n">${p.done}/${p.n}</span></button>`;
        }).join("")}</div>
        <div class="row"><button class="btn primary grow" id="go-learn2">${s.done ? `Pokračovat · otázka ${Math.min(s.learn.pos + 1, Q.length)}` : "Začít od D1"}</button>
          ${s.done ? `<button class="btn sm ghost" id="reset-learn" title="Smazat postup učení">Reset</button>` : ""}</div>
      </article>

      <article class="card mode">
        <h2><span class="num">02</span> Simulace zkoušky</h2>
        <p class="muted small">Náhodný výběr podle vah oblastí z Exam Guide, náhodné pořadí otázek i odpovědí. Výsledky a vysvětlení až po odevzdání.</p>
        <div class="row" style="margin:12px 0">
          ${active ? `<button class="btn primary grow" id="go-resume2">Pokračovat · ${active.ids.length} otázek</button><button class="btn sm ghost" id="drop">Zahodit</button>`
                   : `<button class="btn primary grow stack" id="go-short2">Krátký test<span class="k">15 otázek · 30 min</span></button>
                      <button class="btn grow stack" id="go-full2">Plná simulace<span class="k">60 otázek · 120 min</span></button>`}
        </div>
        <p class="muted small mono">cyklus ${s.hist.cycle} · použito ${s.usedInCycle}/${s.examGroups} otázek · bez opakování, dokud stačí nepoužité</p>
        ${sparkline(s.scores.slice(-12))}
        ${last.length ? `<table><thead><tr><th>#</th><th>typ</th><th>datum</th><th class="r">výsledek</th></tr></thead><tbody>${last.map((e) => {
          const p = pct(e.score.correct, e.score.total);
          return `<tr><td class="mono">${e.no}</td><td>${e.kind === "short" ? "krátký" : "plný"}</td><td>${new Date(e.date).toLocaleDateString("cs-CZ")}</td><td class="r"><span class="pill ${p >= 72 ? "pass" : "fail"}">${p} %</span></td></tr>`;
        }).join("")}</tbody></table>` : `<p class="muted small">Zatím žádný dokončený test.</p>`}
      </article>
    </section>
    ${footerHtml()}`, "", "home");

  const learnGo = () => learnView(s.learn.pos);
  on("#go-learn, #go-learn2", "click", learnGo);
  on("[data-dom]", "click", (e) => learnView(ORDER.findIndex((id) => byId[id].d === Number(e.currentTarget.dataset.dom))));
  on("#go-short, #go-short2", "click", () => startExam("short"));
  on("#go-full, #go-full2", "click", () => startExam("full"));
  on("#go-resume, #go-resume2", "click", () => examView());
  on("#drop", "click", () => { if (confirm("Zahodit rozpracovaný test? Otázky zůstanou v historii jako použité.")) { store.remove("exam"); home(); } });
  on("#reset-learn", "click", () => { if (confirm("Smazat celý postup učení?")) { store.remove("learn"); home(); } });

  const ctrl = new AbortController();
  cleanup.push(() => ctrl.abort());
  const lastScore = s.scores.length ? `${s.scores.at(-1)} %` : "–";
  playTerminal($("#term"), {
    cmd: "ccar-f status --exam CCAR-F",
    steps: [
      { busy: "načítám ověřenou databázi…", done: `<span class="ok">✔</span> ${Q.length} otázek · 5 oblastí · 6 scénářů` },
      { busy: "kontroluji postup učení…", done: `<span class="ok">✔</span> učení <span class="hl">${pct(s.done, Q.length)} %</span> · přesnost ${s.done ? pct(s.good, s.done) + " %" : "–"}` },
      { busy: "čtu historii simulací…", done: `<span class="ok">✔</span> testů <span class="hl">${s.finished.length}</span> · poslední ${lastScore} · cyklus ${s.hist.cycle}` },
    ],
    prompt: active ? "rozpracovaný test čeká" : "připraveno",
  }, ctrl.signal);
}

function footerHtml() {
  return `<footer class="site-foot">
    <p><b>Nezávislá vzdělávací aplikace.</b> Není produktem společnosti Anthropic, PBC, a není jí schválena ani sponzorována. Claude a Anthropic jsou ochranné známky Anthropic, PBC; zde jsou použity jen k označení zkoušky.</p>
    <p>Otázky jsou neoficiální, z open-source zdrojů (MIT, CC BY 4.0) a jako parafráze ukázek z Exam Guide; ověřené proti oficiálnímu Exam Guide v1.0 a kurzům Anthropic Academy. U každé otázky je odkaz na zdroj a licenci. Oficiální informace: Anthropic Partner Academy.</p>
    <p class="mono">© AIKIT Digital · data ${esc(DATA_VERSION)}</p></footer>`;
}

// ---------------------------------------------------------------- learning
function learnView(pos) {
  const learn = store.load("learn", { pos: 0, answers: {} });
  pos = Math.max(0, Math.min(pos, ORDER.length - 1));
  learn.pos = pos;
  store.save("learn", learn);
  const q = byId[ORDER[pos]];
  const order = q.o.map((o) => o[0]);
  let chosen = learn.answers[q.id]?.chosen || [];

  const render = () => {
    const reveal = !!learn.answers[q.id];
    view(`<div class="narrow" style="margin:0 auto"><article class="card" data-qid="${q.id}">
        ${questionHtml(q, `UČENÍ · ${pos + 1}/${ORDER.length} · ${DOMAINS[q.d]}`, pct(pos + 1, ORDER.length))}
        <div class="opts" role="group" aria-label="Možnosti">${optionsHtml(q, order, chosen, reveal, "id")}</div>
        ${reveal ? explanationHtml(q, chosen) : ""}</article>
        <p class="muted small mono" style="margin-top:12px">klávesy: A–E výběr · Enter odpovědět/další · ← → · T překlad</p></div>`,
      `<button class="btn sm ghost" id="home" title="Přehled">☰</button>${csBtn()}<span class="grow"></span>
       <button class="btn sm" id="prev" ${pos === 0 ? "disabled" : ""} aria-label="Předchozí">←</button>
       ${reveal ? `<button class="btn primary" id="next" ${pos === ORDER.length - 1 ? "disabled" : ""}>Další →</button>`
                : `<button class="btn primary" id="answer" ${chosen.length === q.c.length ? "" : "disabled"}>Odpovědět</button>`}`, `learn-${q.id}`);
    const answer = () => {
      if (learn.answers[q.id] || chosen.length !== q.c.length) return;
      learn.answers[q.id] = { chosen, ok: isCorrect(q, chosen) };
      store.save("learn", learn);
      render();
    };
    on("[data-opt]", "click", (e) => { chosen = toggleChoice(q, chosen, e.currentTarget.dataset.opt); render(); });
    on("#answer", "click", answer);
    on("#next", "click", () => learnView(pos + 1));
    on("#prev", "click", () => learnView(pos - 1));
    on("#home", "click", home);
    on("#cs", "click", () => toggleCs(render));
    keys((e) => {
      const k = e.key.toLowerCase();
      const idx = "abcdefgh".indexOf(k) >= 0 ? "abcdefgh".indexOf(k) : "12345678".indexOf(k);
      if (idx >= 0 && idx < order.length && !learn.answers[q.id]) { chosen = toggleChoice(q, chosen, order[idx]); render(); }
      else if (k === "enter") { learn.answers[q.id] ? pos < ORDER.length - 1 && learnView(pos + 1) : answer(); }
      else if (k === "arrowright" && learn.answers[q.id]) learnView(pos + 1);
      else if (k === "arrowleft" && pos > 0) learnView(pos - 1);
      else if (k === "t") toggleCs(render);
    });
  };
  render();
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- exam
function startExam(kind) {
  const p = EXAM_PRESETS[kind];
  view(`<div class="card narrow" style="margin:40px auto"><p class="mono">${spinnerHtml(`sestavuji ${p.label.toLowerCase()}: ${p.n} otázek…`)}</p></div>`);
  cleanup.push(animateSpinners());
  setTimeout(() => {
    const hist = store.load("history", newHistory());
    const ex = buildExam(Q, hist, Math.random, p.n, p.scenarios);
    store.save("history", recordExam(hist, ex, undefined, kind)); // recorded at start: abandoned tests count as used
    const optOrder = Object.fromEntries(ex.ids.map((id) => [id, shuffledOptionIds(byId[id])]));
    store.save("exam", { kind, examNo: ex.examNo, minutes: p.minutes, ids: ex.ids, optOrder, answers: {}, flags: [], pos: 0, startedAt: Date.now(), newCycle: ex.newCycle });
    examView();
  }, 450);
}
const remaining = (ex) => ex.startedAt + ex.minutes * 60000 - Date.now();
const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

function examView(showGrid = false) {
  const ex = store.load("exam", null);
  if (!ex) return home();
  if (remaining(ex) <= 0) return finishExam(true);
  const q = byId[ex.ids[ex.pos]];
  const order = ex.optOrder[q.id];
  const chosen = ex.answers[q.id] || [];
  const answered = ex.ids.filter((id) => (ex.answers[id] || []).length).length;
  const title = ex.kind === "short" ? "KRÁTKÝ TEST" : "SIMULACE";
  const save = () => store.save("exam", ex);
  const go = (i) => { ex.pos = Math.max(0, Math.min(i, ex.ids.length - 1)); save(); examView(showGrid); window.scrollTo(0, 0); };
  const submit = () => {
    const left = ex.ids.length - answered;
    if (confirm(left ? `Nezodpovězeno: ${left}. Opravdu odevzdat?` : "Odevzdat test?")) finishExam(false);
  };

  view(`<div class="narrow" style="margin:0 auto">
      ${ex.newCycle && answered === 0 ? `<p class="muted small mono">▸ nepoužité otázky došly – nový cyklus, vybrány nejdéle neviděné</p>` : ""}
      <article class="card" data-qid="${q.id}">
        ${questionHtml(q, `${title} · ${ex.pos + 1}/${ex.ids.length} · zodpovězeno ${answered}`, pct(answered, ex.ids.length))}
        <div class="opts" role="group" aria-label="Možnosti">${optionsHtml(q, order, chosen, false, "position")}</div>
        <div class="row" style="margin-top:14px">
          <button class="btn sm ghost" id="flag" aria-pressed="${ex.flags.includes(q.id)}">${ex.flags.includes(q.id) ? "◆ Označeno" : "◇ Označit"}</button>
          <button class="btn sm ghost" id="grid">${showGrid ? "Skrýt přehled" : "Přehled otázek"}</button>
          <span class="grow"></span><button class="btn sm" id="submit">Odevzdat</button>
        </div>
        ${showGrid ? `<div class="grid">${ex.ids.map((id, i) => `<button data-go="${i}" class="${(ex.answers[id] || []).length ? "ans" : ""} ${ex.flags.includes(id) ? "flag" : ""} ${i === ex.pos ? "cur" : ""}" aria-label="Otázka ${i + 1}">${i + 1}</button>`).join("")}</div>
          <p class="muted small mono">◆ = označené na později</p>` : ""}
      </article></div>`,
    `<button class="btn sm ghost" id="home" title="Přehled (test běží dál)">☰</button><span class="timer" id="timer" role="timer" aria-live="off"></span>${csBtn()}<span class="grow"></span>
     <button class="btn sm" id="prev" ${ex.pos === 0 ? "disabled" : ""} aria-label="Předchozí">←</button>
     ${ex.pos === ex.ids.length - 1 ? `<button class="btn primary" id="submit2">Odevzdat</button>` : `<button class="btn primary" id="next">Další →</button>`}`, `exam-${q.id}`);

  on("[data-opt]", "click", (e) => { ex.answers[q.id] = toggleChoice(q, chosen, e.currentTarget.dataset.opt); save(); examView(showGrid); });
  on("#next", "click", () => go(ex.pos + 1));
  on("#prev", "click", () => go(ex.pos - 1));
  on("#flag", "click", () => { ex.flags = ex.flags.includes(q.id) ? ex.flags.filter((x) => x !== q.id) : [...ex.flags, q.id]; save(); examView(showGrid); });
  on("#grid", "click", () => examView(!showGrid));
  on("[data-go]", "click", (e) => { showGrid = false; go(Number(e.currentTarget.dataset.go)); });
  on("#submit, #submit2", "click", submit);
  on("#home", "click", home);
  on("#cs", "click", () => toggleCs(() => examView(showGrid)));
  keys((e) => {
    const k = e.key.toLowerCase();
    const idx = "abcdefgh".indexOf(k) >= 0 ? "abcdefgh".indexOf(k) : "12345678".indexOf(k);
    if (idx >= 0 && idx < order.length) { ex.answers[q.id] = toggleChoice(q, chosen, order[idx]); save(); examView(showGrid); }
    else if (k === "arrowright" || k === "enter") ex.pos < ex.ids.length - 1 && go(ex.pos + 1);
    else if (k === "arrowleft") ex.pos > 0 && go(ex.pos - 1);
    else if (k === "f") $("#flag").click();
    else if (k === "t") toggleCs(() => examView(showGrid));
  });

  const tick = () => {
    const ms = remaining(ex);
    const el = $("#timer");
    if (el) { el.textContent = clock(ms); el.classList.toggle("low", ms < (ex.kind === "short" ? 3 : 10) * 60000); }
    if (ms <= 0) finishExam(true);
  };
  tick();
  const t = setInterval(tick, 1000);
  cleanup.push(() => clearInterval(t));
}

function finishExam(timeUp) {
  teardown();
  const ex = store.load("exam", null);
  if (!ex) return home();
  const result = gradeExam(byId, ex.ids, ex.answers);
  store.save("history", recordScore(store.load("history", newHistory()), ex.examNo, result));
  store.save("lastResult", { ...ex, result, timeUp, finishedAt: Date.now() });
  store.remove("exam");
  resultView();
}

function resultView(onlyWrong = false) {
  const r = store.load("lastResult", null);
  if (!r) return home();
  const { result } = r;
  const quotas = domainQuotas(r.ids.length);
  const p = pct(result.correct, result.total);
  const list = r.ids.map((id, i) => ({ q: byId[id], i, chosen: r.answers[id] || [] })).filter((x) => x.q && (!onlyWrong || !isCorrect(x.q, x.chosen)));
  const render = () => resultView(onlyWrong);
  view(`
    <p class="kicker">// výsledek · ${r.kind === "short" ? "krátký test" : "plná simulace"} #${r.examNo}</p>
    ${r.timeUp ? `<p class="verdict bad">▸ čas vypršel – test byl odevzdán automaticky</p>` : ""}
    <section class="card" style="margin-top:12px">
      <div class="score"><span class="big ${p >= 72 ? "grad-text" : ""}" data-count="${p}" data-suffix=" %">${p} %</span><span class="muted mono">${result.correct}/${result.total} správně</span></div>
      <p class="muted small">Ostrá zkouška se hodnotí škálou 100–1000 s hranicí 720. Procenta zde nejsou přepočet na tuto škálu – ber je jako orientační.</p>
      <table><thead><tr><th>oblast</th><th class="r">výsledek</th></tr></thead><tbody>${Object.keys(DOMAINS).map((d) => {
        const b = result.byDomain[d] || { correct: 0, total: quotas[d] };
        return `<tr><td><b class="mono">D${d}</b> ${DOMAINS[d]}</td><td class="r mono">${b.correct}/${b.total} · ${pct(b.correct, b.total)} %</td></tr>`;
      }).join("")}</tbody></table>
    </section>
    <div class="filters"><button class="btn sm ${onlyWrong ? "ghost" : ""}" id="all" aria-pressed="${!onlyWrong}">Všechny (${r.ids.length})</button>
      <button class="btn sm ${onlyWrong ? "" : "ghost"}" id="wrong" aria-pressed="${onlyWrong}">Jen chyby (${result.total - result.correct})</button>${csBtn()}</div>
    <p class="muted small">Odpovědi jsou zde v původním pořadí a s původními písmeny, na která odkazuje vysvětlení (v testu byly zamíchané).</p>
    ${list.map(({ q, i, chosen }) => `<article class="card review" data-qid="${q.id}" style="margin:12px 0">${questionHtml(q, `OTÁZKA ${i + 1}`)}
      <div class="opts">${optionsHtml(q, q.o.map((o) => o[0]), chosen, true, "id")}</div>${explanationHtml(q, chosen)}</article>`).join("")}
    ${footerHtml()}`,
    `<button class="btn sm ghost" id="home">☰ Přehled</button><span class="grow"></span>
     <button class="btn primary" id="again">Nový ${r.kind === "short" ? "krátký test" : "test"}</button>`, `result-${r.examNo}-${onlyWrong}`);
  on("#all", "click", () => resultView(false));
  on("#wrong", "click", () => resultView(true));
  on("#cs", "click", () => toggleCs(render));
  on("#home", "click", home);
  on("#again", "click", () => startExam(r.kind || "full"));
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- boot
async function boot() {
  try {
    const res = await fetch(`data/questions.en.json?v=${DATA_VERSION}`);
    if (!res.ok) throw new Error(res.status);
    DATA = await res.json();
  } catch {
    view(`<div class="card narrow" style="margin:40px auto"><p class="verdict bad">Otázky se nepodařilo načíst.</p><p class="muted">Zkontroluj připojení a obnov stránku.</p></div>`);
    return;
  }
  Q = DATA.questions;
  byId = Object.fromEntries(Q.map((q) => [q.id, q]));
  ORDER = learningOrder(Q);
  // drop stale state after a database update
  const learn = store.load("learn", null);
  if (learn) { for (const id of Object.keys(learn.answers)) if (!byId[id]) delete learn.answers[id]; store.save("learn", learn); }
  const ex = store.load("exam", null);
  if (ex && (ex.ids.some((id) => !byId[id]) || !ex.optOrder)) store.remove("exam");
  if (showCs) loadCs();
  home();
  if ("serviceWorker" in navigator && import.meta.env.PROD) navigator.serviceWorker.register("sw.js").catch(() => {});
}
boot();
