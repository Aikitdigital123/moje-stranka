# moje-stranka – AIKIT Digital (Divize Industry 4.0)

Web: https://aikitdigital123.github.io/moje-stranka/

| Část | Kde | Technologie |
|---|---|---|
| Statické stránky (Domů, Služby, Kontakt) | `index.html`, `services.html`, `contact.html`, `styles.css`, `script.js` | čisté HTML/CSS/JS, při buildu se kopírují beze změny |
| CCAR-F Trainer | `ccar-f/` → `/ccar-f/` | Vite, viz [`ccar-f/README.md`](ccar-f/README.md) |

```bash
npm ci
npm run dev        # vývoj CCAR-F Traineru
npm run check      # unit testy + build + kontrola dist/
npm run test:e2e   # Playwright (desktop + mobil)
npm run preview    # náhled celého webu jako na GitHub Pages
```
Nasazení: push do `main` → GitHub Actions → Pages (Settings → Pages → Source: GitHub Actions).
