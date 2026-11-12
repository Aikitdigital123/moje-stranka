# CCAR-F Trainer

Nezávislý trenažér ke zkoušce **Claude Certified Architect – Foundations (CCAR-F)**.
Je součástí webu AIKIT Digital (`moje-stranka`) jako podstránka `/ccar-f/`.
Jde o statickou aplikaci (Vite, vanilla JS, bez frameworku a bez backendu), stav se ukládá do `localStorage`.

> Nezávislá vzdělávací aplikace, není produktem Anthropic. Logo Anthropic záměrně nepoužíváme:
> pravidla značky jeho použití třetími stranami bez souhlasu nedovolují. Název zkoušky je použit
> jen jako popis.

## Rychlý start
```bash
npm ci                 # v kořeni repa moje-stranka
npm run dev            # vývoj: http://localhost:5173 (Vite, HMR)
npm test               # unit testy logiky (node --test), bez prohlížeče
npm run test:e2e       # produkční build + Playwright (desktop Chromium + iPhone WebKit)
npm run check          # unit testy + build + kontrola odkazů v dist/ (běží i v CI)
npm run preview        # build a lokální server jako GitHub Pages: http://127.0.0.1:4321/moje-stranka/
```
Playwright prohlížeče nainstaluješ jednou příkazem `npx playwright install chromium webkit`.

## Struktura
```
ccar-f/
  index.html            vstupní stránka (Vite entry)
  vite.config.js        base "./" (funguje pod libovolnou podcestou), build → ../dist/ccar-f
  src/
    selection.js        ČISTÁ LOGIKA: kvóty oblastí, výběr testu, historie, cykly, míchání odpovědí, hodnocení
    storage.js          bezpečný wrapper localStorage (funguje i při zablokovaném úložišti)
    main.js             UI: obrazovky home / učení / test / výsledek, klávesové zkratky
    terminal.js         dekorativní animace terminálu na úvodní obrazovce
    app.css             design tokeny (barvy AIKIT) + komponenty + animace
  public/               kopíruje se beze změn
    data/questions.en.json   otázky (EN), načítají se při startu
    data/questions.cs.json   čeština, načte se až po kliknutí na „Přelož“
    sw.js                    service worker (offline)
    manifest.webmanifest, icon.svg
  test/selection.test.mjs    unit testy logiky
../tests/e2e/trainer.spec.js Playwright: projde každé tlačítko, desktop i mobil
```

## Datový model (`questions.en.json`)
```jsonc
{ "scenarios": ["Customer Support Resolution Agent", ...],
  "questions": [{
    "id": "utkarsh-001",        // stabilní ID (zdroj-číslo)
    "d": 1,                     // oblast D1–D5 (oficiální číslování Exam Guide)
    "s": 0,                     // index scénáře, -1 = obecná otázka
    "g": 17,                    // skupina obsahově stejných otázek (v jednom testu max. jedna)
    "t": 0,                     // 1 = lehká otázka: jen v učení, v testu ne
    "q": "…", "o": [["a","…"],["b","…"]],  // možnosti mají stabilní ID a–e
    "c": ["b"],                 // správné ID (víc položek = více odpovědí)
    "e": "…",                   // vysvětlení (odkazuje na původní písmena)
    "src": "…", "url": "…", "lic": "MIT" }] }
```
`questions.cs.json`: `{ "<id>": { "q": "…", "o": { "a": "…" }, "e": "…" } }`

**Data needitujte ručně.** Generují se z ověřené databáze v `~/Projects/cca-f-prep`:
`python3 -I tools/merge_review.py && python3 -I tools/build_public.py` (zapíše přímo sem do `public/data/`).
Původ otázek, licence a výsledky ověření jsou popsané v `cca-f-prep/README.md` a `sources.md`.

## Pravidla režimů (testováno v `test/` a `tests/e2e/`)
- **Učení:** všech 955 otázek v pořadí D1 → D5, uvnitř oblasti pevné pořadí databáze. Řešení se ukáže hned.
  Postup je v `ccarf.v1.learn`.
- **Testy** (`EXAM_PRESETS` v `selection.js`):
  - plný test: 60 otázek, 120 min, 4 scénáře;
  - krátký test: 15 otázek, 30 min, 2 scénáře (stejné tempo 2 min/otázka).
  - Počty z oblastí vycházejí z vah Exam Guide 27/18/20/20/15 metodou největších zbytků:
    60 → 16/11/12/12/9, 15 → 4/3/3/3/2.
  - Pořadí otázek i odpovědí je náhodné. Hodnotí se podle **ID možností**, ne podle písmen.
    Přehled po testu ukazuje původní pořadí, na které odkazují vysvětlení.
  - Historie `ccarf.v1.history` je společná pro oba typy testů. Test se zapíše už při spuštění,
    takže i zahozený test se počítá jako použitý.
  - V cyklu se skupina otázek neopakuje, dokud každá oblast má dost nepoužitých.
    Pak začne nový cyklus a otázky z posledních 3 testů jdou na konec (`RECENT_EXAMS`).
- **Klávesy:** A–E nebo 1–5 výběr · Enter odpovědět/další · ← → · T překlad · F označit (v testu).

## Nasazení
GitHub Actions (`.github/workflows/deploy-pages.yml`): `npm ci` → `npm run check` → `dist/` → GitHub Pages.
`scripts/assemble.mjs` přidá do `dist/` původní statické stránky beze změny.
**V Settings → Pages musí být „Source: GitHub Actions“.**
