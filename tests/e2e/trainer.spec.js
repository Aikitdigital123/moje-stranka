// End-to-end tests of the whole site: existing pages + every control of the CCAR-F Trainer.
// They run against dist/ (production build) served under /moje-stranka/ like GitHub Pages.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { learningOrder } from "../../ccar-f/src/selection.js";

const DATA = JSON.parse(readFileSync(new URL("../../dist/ccar-f/data/questions.en.json", import.meta.url)));
const Q = DATA.questions;
const byId = Object.fromEntries(Q.map((q) => [q.id, q]));
const ORDER = learningOrder(Q);
const TOTAL = Q.length;

// ---------- fixtures ----------
test.beforeEach(async ({ page }, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(`console: ${m.text()}`); });
  page.on("dialog", (d) => d.accept());
  info.consoleErrors = errors;
});
test.afterEach(async ({}, info) => {
  expect(info.consoleErrors, "no JS / console errors").toEqual([]);
});

const app = (page) => page.goto("ccar-f/");
const meta = (page) => page.locator(".qmeta span").first();
const qid = (page) => page.locator("article[data-qid]").first().getAttribute("data-qid");
async function noHorizontalScroll(page) {
  const [sw, w] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw, "no horizontal scrolling").toBeLessThanOrEqual(w + 1);
}
async function answerCorrectly(page) {
  const id = await qid(page);
  for (const c of byId[id].c) await page.locator(`.opt[data-opt="${c}"]`).click();
  return id;
}

// ---------- existing site ----------
for (const pageName of ["index.html", "services.html", "contact.html"]) {
  test(`existing page ${pageName} still renders and links to the trainer`, async ({ page }) => {
    await page.goto(pageName);
    await expect(page.locator("nav a")).toHaveCount(4);
    await expect(page.locator("nav a").first()).toHaveText("Domů");
    await page.locator('nav a[href="ccar-f/"]').click();
    await expect(page).toHaveURL(/\/moje-stranka\/ccar-f\/$/);
    await expect(page.locator("h1")).toContainText("Claude Certified Architect");
  });
}

// ---------- home ----------
test("home dashboard: hero, terminal, stats, domains, modes, disclaimer, brand link", async ({ page }) => {
  await app(page);
  await expect(page.locator("h1")).toContainText("Foundations");
  await expect(page.locator("#term")).toContainText("připraveno", { timeout: 15_000 });
  await expect(page.locator("#term")).toContainText(`${TOTAL} otázek`);
  await expect(page.locator(".stat")).toHaveCount(4);
  await expect(page.locator("[data-dom]")).toHaveCount(5);
  for (const id of ["#go-learn", "#go-short", "#go-full", "#go-learn2", "#go-short2", "#go-full2"]) await expect(page.locator(id)).toBeVisible();
  await expect(page.locator(".site-foot")).toContainText("Není produktem společnosti Anthropic");
  await expect(page.locator(".tag")).toHaveText("Neoficiální");
  await noHorizontalScroll(page);
  await page.locator(".brand").click();
  await expect(page).toHaveURL(/\/moje-stranka\/index\.html$/);
});

// ---------- learning ----------
test("learning: answer, explanation, lazy translation, prev/next, menu, persistence", async ({ page }) => {
  const csRequests = [];
  page.on("request", (r) => { if (r.url().includes("questions.cs.json")) csRequests.push(r.url()); });
  await app(page);
  await page.locator("#go-learn").click();
  await expect(meta(page)).toContainText(`1/${TOTAL}`);
  expect(await qid(page)).toBe(ORDER[0]);
  await expect(page.locator("#answer")).toBeDisabled();
  await page.locator(".opt").first().click();
  await expect(page.locator(".opt").first()).toHaveClass(/sel/);
  await expect(page.locator("#answer")).toBeEnabled();
  await page.locator("#answer").click();
  await expect(page.locator(".expl .verdict")).toBeVisible();
  await expect(page.locator(".opt.ok")).toHaveCount(byId[ORDER[0]].c.length);
  await noHorizontalScroll(page);

  expect(csRequests, "Czech file is not loaded before it is needed").toHaveLength(0);
  await page.locator("#cs").click();
  await expect(page.locator(".qtext .cs")).toBeVisible();
  await expect(page.locator(".expl .cs")).toBeVisible();
  expect(csRequests.length).toBe(1);
  await page.locator("#cs").click();
  await expect(page.locator(".cs")).toHaveCount(0);

  await page.locator("#next").click();
  await expect(meta(page)).toContainText(`2/${TOTAL}`);
  await page.locator("#prev").click();
  await expect(meta(page)).toContainText(`1/${TOTAL}`);
  await expect(page.locator(".expl")).toBeVisible(); // answered state is kept
  await page.locator("#next").click();
  await page.locator("#home").click();
  await expect(page.locator("#go-learn2")).toContainText("otázka 2");
  await page.reload();
  await expect(page.locator("#go-learn2")).toContainText("otázka 2");
  await expect(page.locator(".stat .v").first()).toHaveText("0 %"); // 1 of 955 rounds to 0 %
  await page.locator("#go-learn2").click();
  await expect(meta(page)).toContainText(`2/${TOTAL}`);
});

test("learning: domain jump buttons D1–D5", async ({ page }) => {
  await app(page);
  for (const d of [1, 2, 3, 4, 5]) {
    await page.locator(`[data-dom="${d}"]`).click();
    await expect(page.locator(".qmeta .d")).toHaveText(`D${d}`);
    expect(await qid(page)).toBe(ORDER.find((id) => byId[id].d === d));
    await page.locator("#home").click();
  }
});

test("learning: multi-answer question needs all answers", async ({ page }) => {
  const idx = ORDER.findIndex((id) => byId[id].c.length > 1);
  await app(page);
  await page.evaluate((pos) => localStorage.setItem("ccarf.v1.learn", JSON.stringify({ pos, answers: {} })), idx);
  await page.reload();
  await page.locator("#go-learn2").click();
  const q = byId[ORDER[idx]];
  await expect(page.locator(".multi")).toContainText(`Vyber ${q.c.length}`);
  await page.locator(`.opt[data-opt="${q.c[0]}"]`).click();
  await expect(page.locator("#answer")).toBeDisabled();
  await page.locator(`.opt[data-opt="${q.c[1]}"]`).click();
  await expect(page.locator("#answer")).toBeEnabled();
  await page.locator("#answer").click();
  await expect(page.locator(".verdict")).toContainText("SPRÁVNĚ");
});

test("learning: keyboard shortcuts", async ({ page, isMobile }) => {
  test.skip(isMobile, "no hardware keyboard on mobile");
  await app(page);
  await page.locator("#go-learn").click();
  const id = await qid(page);
  await page.keyboard.press(byId[id].c[0]);
  await expect(page.locator(`.opt[data-opt="${byId[id].c[0]}"]`)).toHaveClass(/sel/);
  await page.keyboard.press("Enter");
  await expect(page.locator(".verdict")).toContainText("SPRÁVNĚ");
  await page.keyboard.press("t");
  await expect(page.locator(".qtext .cs")).toBeVisible();
  await page.keyboard.press("t");
  await page.keyboard.press("Enter");
  await expect(meta(page)).toContainText(`2/${TOTAL}`);
  await page.keyboard.press("ArrowLeft");
  await expect(meta(page)).toContainText(`1/${TOTAL}`);
});

test("learning: reset clears progress", async ({ page }) => {
  await app(page);
  await page.locator("#go-learn").click();
  await page.locator(".opt").first().click();
  await page.locator("#answer").click();
  await page.locator("#home").click();
  await expect(page.locator("#reset-learn")).toBeVisible();
  await page.locator("#reset-learn").click();
  await expect(page.locator("#reset-learn")).toHaveCount(0);
  await expect(page.locator("#go-learn2")).toHaveText("Začít od D1");
});

// ---------- short test ----------
test("short test: 15 questions, 30 min, shuffled options, flag, grid, resume, 100 % result, review", async ({ page }) => {
  await app(page);
  await page.locator("#go-short").click();
  await expect(meta(page)).toContainText("KRÁTKÝ TEST · 1/15");
  await expect(page.locator("#timer")).toHaveText(/^(30:00|29:5\d)$/);
  await expect(page.locator(".opt .key").first()).toHaveText("A");

  const ids = [];
  let shuffledSeen = false;
  for (let i = 0; i < 15; i++) {
    await expect(meta(page)).toContainText(`${i + 1}/15`);
    const order = await page.locator(".opt").evaluateAll((els) => els.map((e) => e.dataset.opt));
    if (order.join("") !== [...order].sort().join("")) shuffledSeen = true;
    await expect(page.locator(".expl")).toHaveCount(0); // no feedback during the test
    ids.push(await answerCorrectly(page));
    if (i === 0) {
      await page.locator("#flag").click();
      await expect(page.locator("#flag")).toContainText("Označeno");
    }
    if (i === 4) { // reload mid-test and resume via the dashboard
      await page.reload();
      await page.locator("#go-resume").click();
      await expect(meta(page)).toContainText("5/15");
      await expect(page.locator(".opt.sel")).toHaveCount(byId[ids[4]].c.length);
    }
    if (i < 14) await page.locator("#next").click();
  }
  expect(shuffledSeen, "answer order is shuffled in the test").toBe(true);
  expect(new Set(ids).size).toBe(15);
  const domains = ids.reduce((a, id) => ((a[byId[id].d] = (a[byId[id].d] || 0) + 1), a), {});
  expect(domains).toEqual({ 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 });

  await page.locator("#grid").click();
  await expect(page.locator(".grid button")).toHaveCount(15);
  await expect(page.locator(".grid button.ans")).toHaveCount(15);
  await expect(page.locator(".grid button.flag")).toHaveCount(1);
  await page.locator('[data-go="2"]').click();
  await expect(meta(page)).toContainText("3/15");
  await page.locator("#prev").click();
  await expect(meta(page)).toContainText("2/15");
  await noHorizontalScroll(page);

  await page.locator("#submit").click(); // confirm dialog auto-accepted
  await expect(page.locator(".score .big")).toHaveText("100 %");
  await expect(page.locator(".score")).toContainText("15/15");
  await expect(page.locator("article.review")).toHaveCount(15);
  // review keeps the original order/letters that the explanations refer to
  const firstOrder = await page.locator("article.review").first().locator(".opt").evaluateAll((els) => els.map((e) => e.dataset.opt));
  expect(firstOrder).toEqual([...firstOrder].sort());
  await page.locator("#wrong").click();
  await expect(page.locator("article.review")).toHaveCount(0);
  await page.locator("#all").click();
  await expect(page.locator("article.review")).toHaveCount(15);
  await page.locator("#cs").click();
  await expect(page.locator("article.review .expl .cs").first()).toBeVisible();
  await noHorizontalScroll(page);

  await page.locator("#home").click();
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  await expect(page.locator("table tbody tr")).toContainText("krátký");
  await expect(page.locator("table .pill")).toHaveText("100 %");
  await expect(page.locator(".stat .v").nth(2)).toHaveText("1");
});

test("short test: wrong answers are graded by option id, 'Nový test' never repeats questions", async ({ page }) => {
  await app(page);
  await page.locator("#go-short").click();
  const first = [];
  for (let i = 0; i < 15; i++) {
    const id = await qid(page);
    first.push(id);
    const wrong = byId[id].o.map((o) => o[0]).find((o) => !byId[id].c.includes(o));
    if (byId[id].c.length === 1) await page.locator(`.opt[data-opt="${wrong}"]`).click();
    if (i < 14) await page.locator("#next").click();
  }
  await page.locator("#submit2").click();
  await expect(page.locator(".score .big")).toHaveText("0 %");
  await page.locator("#wrong").click();
  await expect(page.locator("article.review")).toHaveCount(15);
  await expect(page.locator("article.review .opt.bad").first()).toBeVisible();
  await page.locator("#again").click();
  await expect(meta(page)).toContainText("KRÁTKÝ TEST · 1/15");
  const second = [];
  for (let i = 0; i < 15; i++) {
    second.push(await qid(page));
    if (i < 14) await page.locator("#next").click();
  }
  expect(second.filter((id) => first.includes(id))).toEqual([]);
});

test("short test: time-up submits automatically", async ({ page }) => {
  await app(page);
  await page.locator("#go-short").click();
  await expect(meta(page)).toContainText("1/15");
  await page.evaluate(() => {
    const ex = JSON.parse(localStorage.getItem("ccarf.v1.exam"));
    ex.startedAt = Date.now() - 31 * 60_000;
    localStorage.setItem("ccarf.v1.exam", JSON.stringify(ex));
  });
  await page.reload();
  await page.locator("#go-resume").click();
  await expect(page.locator("main > p.verdict.bad")).toContainText("čas vypršel");
});

// ---------- full simulation ----------
test("full simulation: 60 questions, 120 min, keyboard, menu while running, discard", async ({ page, isMobile }) => {
  await app(page);
  await page.locator("#go-full2").click();
  await expect(meta(page)).toContainText("SIMULACE · 1/60");
  await expect(page.locator("#timer")).toHaveText(/^(120:00|119:5\d)$/);
  const ex = await page.evaluate(() => JSON.parse(localStorage.getItem("ccarf.v1.exam")));
  expect(ex.ids).toHaveLength(60);
  const domains = ex.ids.reduce((a, id) => ((a[byId[id].d] = (a[byId[id].d] || 0) + 1), a), {});
  expect(domains).toEqual({ 1: 16, 2: 11, 3: 12, 4: 12, 5: 9 });
  if (!isMobile) {
    await page.keyboard.press("a");
    await expect(page.locator(".opt").first()).toHaveClass(/sel/);
    await page.keyboard.press("f");
    await expect(page.locator("#flag")).toContainText("Označeno");
    await page.keyboard.press("ArrowRight");
    await expect(meta(page)).toContainText("2/60");
  }
  await page.locator("#home").click();
  await expect(page.locator("#go-resume2")).toContainText("60 otázek");
  await page.locator("#go-resume2").click();
  await expect(meta(page)).toContainText("SIMULACE");
  await page.locator("#home").click();
  await page.locator("#drop").click();
  await expect(page.locator("#go-full2")).toBeVisible();
  const hist = await page.evaluate(() => JSON.parse(localStorage.getItem("ccarf.v1.history")));
  expect(hist.exams).toHaveLength(1); // a discarded test still counts as used (no repeats)
});

// ---------- robustness / GitHub Pages ----------
test("works when localStorage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } });
  });
  await app(page);
  await page.locator("#go-learn").click();
  await page.locator(".opt").first().click();
  await page.locator("#answer").click();
  await expect(page.locator(".expl")).toBeVisible();
});

test("service worker registers and the app works offline after the first visit", async ({ page, context, browserName }) => {
  test.skip(browserName === "webkit", "Playwright WebKit does not support service workers");
  await app(page);
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toMatch(/\/moje-stranka\/ccar-f\/$/);
  await page.reload(); // now controlled by the SW, caches the assets
  await expect(page.locator("#term")).toContainText("připraveno", { timeout: 15_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("h1")).toContainText("Foundations");
  await page.locator("#go-learn").click();
  await expect(meta(page)).toContainText(`1/${TOTAL}`);
  await context.setOffline(false);
});
