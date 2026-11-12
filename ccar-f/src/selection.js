// Pure logic for the CCAR-F trainer: learning order, exam selection, history, grading.
// No DOM, no storage — tested with `node --test` (see test/).

// Official blueprint weights (CCAR-F Exam Guide v1.0, section 4).
export const DOMAIN_WEIGHTS = { 1: 27, 2: 18, 3: 20, 4: 20, 5: 15 };
export const EXAM_SIZE = 60;
export const EXAM_MINUTES = 120;
export const SCENARIOS_PER_EXAM = 4; // "4 scenarios are presented, picked at random from the 6" (guide §5)

/** Exam variants. `full` mirrors the real exam; `short` keeps its pace (2 min/question) and weights. */
export const EXAM_PRESETS = {
  full: { n: 60, minutes: 120, scenarios: 4, label: "Plná simulace" },
  short: { n: 15, minutes: 30, scenarios: 2, label: "Krátký test" },
};
export const HISTORY_KEEP = 50;
export const RECENT_EXAMS = 3; // at a cycle boundary, overlap with these last exams is minimised

/** Largest-remainder apportionment of n questions by domain weight. */
export function domainQuotas(n = EXAM_SIZE, weights = DOMAIN_WEIGHTS) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const raw = Object.entries(weights).map(([d, w]) => ({ d: Number(d), x: (n * w) / total }));
  const q = Object.fromEntries(raw.map((r) => [r.d, Math.floor(r.x)]));
  let left = n - Object.values(q).reduce((a, b) => a + b, 0);
  raw.sort((a, b) => (b.x - Math.floor(b.x)) - (a.x - Math.floor(a.x)) || a.d - b.d);
  for (let i = 0; left > 0; i++, left--) q[raw[i % raw.length].d]++;
  return q;
}

/** Learning mode: all questions, D1..D5, fixed (database) order inside each domain. */
export function learningOrder(questions) {
  return questions
    .map((q, i) => ({ q, i }))
    .sort((a, b) => a.q.d - b.q.d || a.i - b.i)
    .map((x) => x.q.id);
}

export function newHistory() {
  // lastUsed: group id -> number of the exam that last used it (0 = never)
  return { v: 1, examNo: 0, cycle: 1, cycleStart: 1, lastUsed: {}, exams: [] };
}

/** Seedable RNG (mulberry32) so tests are deterministic; the app uses Math.random. */
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pick one exam.
 * - Domain counts are exact (domainQuotas).
 * - `scenariosPerExam` random scenarios (4 for the full exam); scenario questions only from those,
 *   spread evenly (soft target n/scenarios each);
 *   general questions (no scenario) fill the rest; other scenarios are used only as a last resort.
 * - Never two questions of the same duplicate group in one exam.
 * - While the current cycle still has enough unused groups for every domain quota, only unused groups
 *   are drawn. Otherwise a new cycle starts: questions from the last RECENT_EXAMS exams are pushed to
 *   the back (most recent last), so overlap with the latest exams is minimal.
 * Does not modify `history`; call recordExam() when the exam starts.
 */
export function buildExam(questions, history = newHistory(), rng = Math.random, n = EXAM_SIZE, scenariosPerExam = SCENARIOS_PER_EXAM) {
  const pool = questions.filter((q) => !q.t);
  const quotas = domainQuotas(n);
  const examNo = history.examNo + 1;
  const used = (q) => history.lastUsed[q.g] || 0;
  const scenarioIds = [...new Set(pool.map((q) => q.s).filter((s) => s >= 0))];
  const noise = new Map(pool.map((q) => [q.id, rng()]));
  // questions from the last RECENT_EXAMS exams go to the back (more recent = worse); older = equal
  const recency = (q) => Math.max(0, used(q) - (examNo - 1 - RECENT_EXAMS));

  const attempt = (chosen, freshOnly, cycleStart) => {
    const perScenario = Math.ceil(n / chosen.length);
    const isFresh = (q) => used(q) < cycleStart;
    const takenGroups = new Set();
    const scenCount = Object.fromEntries(chosen.map((s) => [s, 0]));
    const picked = [];
    const need = { ...quotas };
    const cand = {};
    for (const d of Object.keys(quotas)) {
      cand[d] = pool.filter((q) => q.d === Number(d) && (!freshOnly || isFresh(q)));
      if (new Set(cand[d].map((q) => q.g)).size < quotas[d]) return null;
    }
    const scenPref = (q) => {
      if (q.s < 0) return 1;
      if (!(q.s in scenCount)) return 3;
      return scenCount[q.s] < perScenario ? 0 : 2;
    };
    let penalty = 0;
    while (picked.length < n) {
      // domain with the largest unmet share goes next, so scenario capacity is shared fairly
      const d = Object.keys(need)
        .filter((k) => need[k] > 0)
        .sort((a, b) => need[b] / quotas[b] - need[a] / quotas[a] || a - b)[0];
      let best = null, bestKey = null;
      for (const q of cand[d]) {
        if (takenGroups.has(q.g)) continue;
        const key = [recency(q), scenPref(q), noise.get(q.id)];
        if (!best || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] ||
            (key[1] === bestKey[1] && key[2] < bestKey[2])))) { best = q; bestKey = key; }
      }
      if (!best) return null; // groups shared across domains ran out
      // cost of this exam: repeats from recent exams >> questions outside the drawn scenarios
      // >> over-full scenario >> general (scenario-less) question
      penalty += bestKey[0] * 1e6 + [0, 1, 100, 1000][bestKey[1]];
      picked.push(best);
      takenGroups.add(best.g);
      if (best.s in scenCount) scenCount[best.s]++;
      need[d]--;
    }
    return { picked, penalty, chosen };
  };

  // Every 4-of-6 scenario combination in random order; keep the cheapest (ties -> random first).
  const combos = [];
  const k = Math.min(scenariosPerExam, scenarioIds.length);
  const rec = (start, acc) => {
    if (acc.length === k) { combos.push(acc); return; }
    for (let i = start; i < scenarioIds.length; i++) rec(i + 1, [...acc, scenarioIds[i]]);
  };
  rec(0, []);
  const best = (freshOnly, cycleStart) => {
    let b = null;
    for (const c of shuffle(combos, rng)) {
      const r = attempt(shuffle(c, rng), freshOnly, cycleStart);
      if (r && (!b || r.penalty < b.penalty)) b = r;
      if (b && b.penalty === 0) break;
    }
    return b;
  };

  let newCycle = false;
  let cycleStart = history.cycleStart;
  let res = best(true, cycleStart);
  if (!res) {
    newCycle = true;
    cycleStart = examNo;
    res = best(false, cycleStart);
  }
  if (!res) throw new Error("Not enough questions to build an exam");
  return {
    examNo,
    ids: shuffle(res.picked.map((q) => q.id), rng),
    groups: res.picked.map((q) => q.g),
    scenarios: res.chosen,
    newCycle,
    cycle: newCycle ? history.cycle + 1 : history.cycle,
    cycleStart,
  };
}

/** Return a new history with the exam's groups marked as used. */
export function recordExam(history, exam, date = new Date().toISOString(), kind = "full") {
  const h = structuredClone(history);
  h.examNo = exam.examNo;
  h.cycle = exam.cycle;
  h.cycleStart = exam.cycleStart;
  for (const g of exam.groups) h.lastUsed[g] = exam.examNo;
  h.exams.push({ no: exam.examNo, date, kind, ids: exam.ids, cycle: exam.cycle, score: null });
  if (h.exams.length > HISTORY_KEEP) h.exams = h.exams.slice(-HISTORY_KEEP);
  return h;
}

/** Store the finished exam's score in history. */
export function recordScore(history, examNo, result) {
  const h = structuredClone(history);
  const e = h.exams.find((x) => x.no === examNo);
  if (e) e.score = { correct: result.correct, total: result.total };
  return h;
}

export function isCorrect(q, chosen) {
  const a = [...(chosen || [])].sort().join(",");
  return a !== "" && a === [...q.c].sort().join(",");
}

/** answers: { [id]: ["a"] } */
export function gradeExam(questionsById, ids, answers) {
  const byDomain = {};
  let correct = 0;
  for (const id of ids) {
    const q = questionsById[id];
    const ok = isCorrect(q, answers[id]);
    byDomain[q.d] ??= { correct: 0, total: 0 };
    byDomain[q.d].total++;
    if (ok) { correct++; byDomain[q.d].correct++; }
  }
  return { correct, total: ids.length, pct: ids.length ? correct / ids.length : 0, byDomain };
}

/**
 * Display order of a question's options for the exam (random). Options keep their stable ids
 * ("a".."e"), answers and grading always use those ids, so shuffling never changes correctness.
 * The review after the exam shows the original order, which the explanations refer to.
 */
export function shuffledOptionIds(q, rng = Math.random) {
  return shuffle(q.o.map((o) => o[0]), rng);
}

/**
 * Make a stored history consistent with the current question database. Group ids (`g`) are
 * recomputed whenever the database changes, so `lastUsed` is rebuilt from the question ids that
 * every recorded exam keeps. Questions no longer in the database are ignored; exam numbers,
 * cycle and scores are kept. Returns the same object if nothing needed to change.
 */
export function reconcileHistory(history, questions, dataVersion) {
  if (!history || history.dataVersion === dataVersion) return history;
  const byId = Object.fromEntries(questions.map((q) => [q.id, q]));
  const h = structuredClone(history);
  h.lastUsed = {};
  for (const e of h.exams) {
    for (const id of e.ids || []) {
      const q = byId[id];
      if (q) h.lastUsed[q.g] = Math.max(h.lastUsed[q.g] || 0, e.no);
    }
  }
  h.dataVersion = dataVersion;
  return h;
}

/**
 * Drop questions that no longer exist from an exam in progress (database update).
 * Returns null when nothing is left.
 */
export function reconcileActiveExam(exam, byId) {
  if (!exam) return null;
  const keep = exam.ids.filter((id) => byId[id]);
  if (keep.length === exam.ids.length) return exam;
  if (!keep.length) return null;
  const cur = exam.ids[exam.pos];
  const pick = (o) => Object.fromEntries(Object.entries(o || {}).filter(([id]) => byId[id]));
  return {
    ...exam,
    ids: keep,
    optOrder: pick(exam.optOrder),
    answers: pick(exam.answers),
    flags: (exam.flags || []).filter((id) => byId[id]),
    pos: Math.max(0, keep.indexOf(cur) >= 0 ? keep.indexOf(cur) : Math.min(exam.pos, keep.length - 1)),
  };
}
