import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  domainQuotas, learningOrder, buildExam, recordExam, recordScore, newHistory, seededRng,
  gradeExam, isCorrect, shuffledOptionIds, EXAM_SIZE, SCENARIOS_PER_EXAM, EXAM_PRESETS,
  reconcileHistory, reconcileActiveExam,
} from "../src/selection.js";
import { makeStore } from "../src/storage.js";

const DATA = JSON.parse(readFileSync(new URL("../public/data/questions.en.json", import.meta.url)));
const Q = DATA.questions;
const byId = Object.fromEntries(Q.map((q) => [q.id, q]));
const examQ = Q.filter((q) => !q.t);

function countBy(ids, f) {
  const c = {};
  for (const id of ids) { const k = f(byId[id]); c[k] = (c[k] || 0) + 1; }
  return c;
}

test("domain quotas follow the exam guide weights and sum to 60", () => {
  assert.deepEqual(domainQuotas(60), { 1: 16, 2: 11, 3: 12, 4: 12, 5: 9 });
  assert.equal(Object.values(domainQuotas(37)).reduce((a, b) => a + b), 37);
});

test("learning order: all questions, D1..D5, original order inside a domain", () => {
  const order = learningOrder(Q);
  assert.equal(order.length, Q.length);
  assert.equal(new Set(order).size, Q.length);
  for (let i = 1; i < order.length; i++) {
    const a = byId[order[i - 1]], b = byId[order[i]];
    assert.ok(a.d <= b.d);
    if (a.d === b.d) assert.ok(Q.indexOf(a) < Q.indexOf(b));
  }
});

test("one exam: 60 unique questions, exact domain quotas, no duplicate groups, no trivial", () => {
  const ex = buildExam(Q, newHistory(), seededRng(1));
  assert.equal(ex.ids.length, EXAM_SIZE);
  assert.equal(new Set(ex.ids).size, EXAM_SIZE);
  assert.equal(new Set(ex.ids.map((id) => byId[id].g)).size, EXAM_SIZE);
  assert.deepEqual(countBy(ex.ids, (q) => q.d), { 1: 16, 2: 11, 3: 12, 4: 12, 5: 9 });
  assert.ok(ex.ids.every((id) => !byId[id].t));
});

test("scenarios: only the 4 drawn ones, spread evenly (max 15 each)", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const ex = buildExam(Q, newHistory(), seededRng(seed));
    assert.equal(ex.scenarios.length, SCENARIOS_PER_EXAM);
    const sc = countBy(ex.ids, (q) => q.s);
    for (const [s, n] of Object.entries(sc)) {
      if (Number(s) < 0) continue;
      assert.ok(ex.scenarios.includes(Number(s)), `scenario ${s} not drawn (seed ${seed})`);
      assert.ok(n <= 15, `scenario ${s} has ${n} (seed ${seed})`);
    }
  }
});

test("each start gives a new selection and a new order", () => {
  const a = buildExam(Q, newHistory(), seededRng(11));
  const b = buildExam(Q, newHistory(), seededRng(12));
  assert.notDeepEqual(a.ids, b.ids);
  const same = buildExam(Q, newHistory(), seededRng(11));
  assert.deepEqual(a.ids, same.ids); // deterministic for a given rng (testability)
});

test("no repeats inside a cycle; new cycle only when a domain runs out; minimal overlap after", () => {
  const rng = seededRng(42);
  let h = newHistory();
  const seenInCycle = new Set();
  const quotas = domainQuotas();
  let firstCycleExams = 0;
  let prevGroups = null;
  for (let i = 0; i < 40; i++) {
    const ex = buildExam(Q, h, rng);
    if (ex.newCycle) {
      // must only happen when some domain truly lacks unused groups
      const fresh = {};
      for (const q of examQ) if (!seenInCycle.has(q.g)) (fresh[q.d] ??= new Set()).add(q.g);
      assert.ok(Object.keys(quotas).some((d) => (fresh[d]?.size || 0) < quotas[d]),
        `exam ${ex.examNo}: new cycle although every domain still had unused questions`);
      // first exam of the new cycle avoids the previous exam completely (plenty of older questions)
      const overlap = ex.groups.filter((g) => prevGroups.has(g)).length;
      assert.equal(overlap, 0, `overlap with previous exam: ${overlap}`);
      seenInCycle.clear();
      if (!firstCycleExams) firstCycleExams = ex.examNo - 1;
    } else {
      for (const g of ex.groups) assert.ok(!seenInCycle.has(g), `group ${g} repeated in cycle (exam ${ex.examNo})`);
    }
    for (const g of ex.groups) seenInCycle.add(g);
    prevGroups = new Set(ex.groups);
    h = recordExam(h, ex);
  }
  // lower bound from the data: the scarcest domain limits how many exams fit in one cycle
  const groupsPerDomain = {};
  for (const q of examQ) (groupsPerDomain[q.d] ??= new Set()).add(q.g);
  const bound = Math.min(...Object.keys(quotas).map((d) => Math.floor(groupsPerDomain[d].size / quotas[d])));
  assert.ok(firstCycleExams >= bound - 1, `only ${firstCycleExams} exams before the first repeat (data allows ~${bound})`);
  assert.ok(firstCycleExams >= 8, `only ${firstCycleExams} exams before the first repeat`);
});

test("synthetic: falls back to other scenarios before repeating, then starts a new cycle", () => {
  const mk = (i, d, s) => ({ id: `x${i}`, d, s, g: i, t: 0, c: ["a"] });
  const qs = [];
  let i = 0;
  for (const d of [1, 2, 3, 4, 5]) for (let k = 0; k < 40; k++) qs.push(mk(i++, d, k % 6));
  let h = newHistory();
  const e1 = buildExam(qs, h, seededRng(3)); h = recordExam(h, e1);
  const e2 = buildExam(qs, h, seededRng(4));
  assert.equal(e2.newCycle, false);
  assert.equal(e2.groups.filter((g) => e1.groups.includes(g)).length, 0);
  h = recordExam(h, e2);
  const e3 = buildExam(qs, h, seededRng(5)); // D1 needs 16 but only 40-32=8 unused left -> new cycle
  assert.equal(e3.newCycle, true);
  assert.equal(e3.cycle, 2);
  // prefers the questions unused by e1/e2, then the ones from e1 (older) over e2
  const fromE2 = e3.groups.filter((g) => e2.groups.includes(g)).length;
  const fromE1 = e3.groups.filter((g) => e1.groups.includes(g)).length;
  assert.equal(fromE2, 0, `took ${fromE2} from the latest exam (older/unused were available)`);
  assert.ok(fromE1 > 0);
});

test("history: recordExam marks groups, keeps exams, does not mutate input; scores stored", () => {
  const h0 = newHistory();
  const ex = buildExam(Q, h0, seededRng(7));
  const h1 = recordExam(h0, ex, "2026-11-12T10:00:00Z");
  assert.deepEqual(h0, newHistory());
  assert.equal(h1.examNo, 1);
  assert.ok(ex.groups.every((g) => h1.lastUsed[g] === 1));
  assert.equal(h1.exams[0].ids.length, 60);
  const h2 = recordScore(h1, 1, { correct: 45, total: 60 });
  assert.deepEqual(h2.exams[0].score, { correct: 45, total: 60 });
  let h = h2;
  for (let i = 0; i < 60; i++) h = recordExam(h, buildExam(Q, h, seededRng(100 + i)));
  assert.equal(h.exams.length, 50);
});

test("history survives a save/load round-trip and blocked storage does not crash", () => {
  const mem = new Map();
  const backend = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const store = makeStore(backend);
  const h = recordExam(newHistory(), buildExam(Q, newHistory(), seededRng(9)));
  assert.equal(store.save("history", h), true);
  assert.deepEqual(makeStore(backend).load("history", null), h);

  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("x"); } };
  const s2 = makeStore(broken);
  assert.equal(s2.save("history", h), false);
  assert.deepEqual(s2.load("history", null), h); // in-memory fallback for this page view
  assert.equal(makeStore(broken).load("history", "fallback"), "fallback");
});

test("grading: exact match, multi-answer questions need all correct letters", () => {
  const multi = Q.find((q) => q.c.length > 1);
  assert.ok(isCorrect(multi, [...multi.c].reverse()));
  assert.ok(!isCorrect(multi, [multi.c[0]]));
  assert.ok(!isCorrect(multi, []));
  const ex = buildExam(Q, newHistory(), seededRng(2));
  const ans = Object.fromEntries(ex.ids.map((id) => [id, byId[id].c]));
  const r = gradeExam(byId, ex.ids, ans);
  assert.equal(r.correct, 60);
  assert.equal(gradeExam(byId, ex.ids, {}).correct, 0);
});

test("real data, 24 exams: never outside the drawn scenarios, zero overlap with the last 3 exams", () => {
  for (const seed of [5, 6, 7]) {
    const rng = seededRng(seed);
    let h = newHistory();
    const recent = [];
    for (let i = 0; i < 24; i++) {
      const ex = buildExam(Q, h, rng);
      const off = ex.ids.filter((id) => byId[id].s >= 0 && !ex.scenarios.includes(byId[id].s)).length;
      assert.equal(off, 0, `seed ${seed} exam ${ex.examNo}: ${off} questions outside drawn scenarios`);
      const last3 = new Set(recent.slice(-3).flat());
      const overlap = ex.groups.filter((g) => last3.has(g)).length;
      assert.equal(overlap, 0, `seed ${seed} exam ${ex.examNo}: overlap ${overlap} with last 3 exams`);
      recent.push(ex.groups);
      h = recordExam(h, ex);
    }
  }
});

test("option shuffle: permutation of stable ids, varies, grading by id is order-independent", () => {
  const q = Q.find((x) => x.o.length === 4);
  const ids = q.o.map((o) => o[0]);
  const orders = new Set();
  const rng = seededRng(8);
  for (let i = 0; i < 30; i++) {
    const ord = shuffledOptionIds(q, rng);
    assert.deepEqual([...ord].sort(), [...ids].sort());
    orders.add(ord.join(""));
  }
  assert.ok(orders.size > 5, "shuffle should produce different orders");
  // the user picks the option shown first; correctness depends only on its id
  const ord = shuffledOptionIds(q, seededRng(1));
  const picked = ord[0];
  assert.equal(isCorrect(q, [picked]), q.c.includes(picked));
  assert.ok(isCorrect(q, [...q.c]));
});

test("short test: 15 questions / 30 min, weights kept (4/3/3/3/2), 2 scenarios, shares history", () => {
  const { n, minutes, scenarios } = EXAM_PRESETS.short;
  assert.equal(minutes / n, EXAM_PRESETS.full.minutes / EXAM_PRESETS.full.n); // same pace as the real exam
  assert.deepEqual(domainQuotas(n), { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 });
  let h = newHistory();
  const rng = seededRng(21);
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    const kind = i % 2 ? "short" : "full";
    const p = EXAM_PRESETS[kind];
    const ex = buildExam(Q, h, rng, p.n, p.scenarios);
    assert.equal(ex.ids.length, p.n);
    assert.equal(new Set(ex.groups).size, p.n);
    for (const g of ex.groups) { assert.ok(!seen.has(g), "repeat across short/full tests"); seen.add(g); }
    if (kind === "short") {
      assert.equal(ex.scenarios.length, 2);
      const off = ex.ids.filter((id) => byId[id].s >= 0 && !ex.scenarios.includes(byId[id].s)).length;
      assert.equal(off, 0);
    }
    h = recordExam(h, ex, undefined, kind);
  }
  assert.deepEqual(h.exams.map((e) => e.kind), ["full", "short", "full", "short", "full", "short"]);
});

test("storage: a throwing localStorage getter does not crash makeStore()", () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
  try {
    const s = makeStore();
    assert.equal(s.save("x", 1), false);
    assert.equal(s.load("x", 0), 1);
  } finally {
    if (desc) Object.defineProperty(globalThis, "localStorage", desc); else delete globalThis.localStorage;
  }
});

test("published data: no official/practice-test material, every question attributed", () => {
  assert.equal(Q.filter((q) => /^(official|hamza)-/.test(q.id)).length, 0);
  const sources = JSON.parse(readFileSync(new URL("../public/data/sources.json", import.meta.url))).sources;
  const repos = new Set(sources.map((s) => s.repo));
  assert.ok(Q.every((q) => repos.has(q.src) && q.url && q.lic));
  assert.equal(sources.reduce((a, s) => a + s.count, 0), Q.length);
  for (const s of sources) {
    if (s.license === "MIT") assert.match(s.licenseText, /Permission is hereby granted/);
    else assert.equal(s.licenseUrl, "https://creativecommons.org/licenses/by/4.0/");
  }
});

test("reconcileHistory: rebuilds lastUsed from stored exam ids after a database change", () => {
  const ids = Q.slice(0, 5).map((q) => q.id);
  const old = { v: 1, examNo: 3, cycle: 1, cycleStart: 1, lastUsed: { 999: 3, 1: 2 },
    exams: [{ no: 2, ids: [ids[0], "official-p001"], score: { correct: 1, total: 2 } }, { no: 3, ids: [ids[1], "hamza-001"], score: null }] };
  const h = reconcileHistory(old, Q, "v-new");
  assert.equal(h.dataVersion, "v-new");
  assert.deepEqual(h.lastUsed, { [byId[ids[0]].g]: 2, [byId[ids[1]].g]: 3 });
  assert.equal(h.examNo, 3);
  assert.equal(h.exams[0].score.correct, 1);
  assert.equal(reconcileHistory(h, Q, "v-new"), h); // idempotent, no rewrite when up to date
  // a following exam does not reuse the questions stored in history
  const ex = buildExam(Q, h, seededRng(4));
  assert.ok(!ex.groups.includes(byId[ids[0]].g) && !ex.groups.includes(byId[ids[1]].g));
});

test("reconcileActiveExam: removed questions are dropped, answers and position kept", () => {
  const a = Q[0].id, b = Q[1].id;
  const ex = { ids: ["official-p001", a, "hamza-002", b], pos: 3, answers: { a0: 1, [a]: ["a"], "official-p001": ["b"] },
    optOrder: { [a]: ["a", "b"], [b]: ["b", "a"], "official-p001": ["a"] }, flags: ["hamza-002", b] };
  const r = reconcileActiveExam(ex, byId);
  assert.deepEqual(r.ids, [a, b]);
  assert.equal(r.pos, 1); // still on question b
  assert.deepEqual(Object.keys(r.answers), [a]);
  assert.deepEqual(r.flags, [b]);
  assert.equal(reconcileActiveExam({ ...ex, ids: ["official-p001"] }, byId), null);
});
