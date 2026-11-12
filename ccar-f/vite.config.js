import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));

// Data files live in public/data and are fetched at runtime (not bundled). Their content hash is
// injected as __DATA_VERSION__ so browsers and the service worker pick up a new question set.
const dataVersion = createHash("sha256")
  .update(readFileSync(new URL("./public/data/questions.en.json", import.meta.url)))
  .update(readFileSync(new URL("./public/data/questions.cs.json", import.meta.url)))
  .update(readFileSync(new URL("./public/data/sources.json", import.meta.url)))
  .digest("hex").slice(0, 10);

export default defineConfig({
  base: "./", // works under any sub-path (GitHub Pages project site: /moje-stranka/ccar-f/)
  define: { __DATA_VERSION__: JSON.stringify(dataVersion) },
  build: {
    rollupOptions: { input: { main: here("./index.html"), licence: here("./licence.html") } },
    outDir: "../dist/ccar-f",
    emptyOutDir: true,
    target: "es2022",
    cssMinify: true,
    assetsInlineLimit: 0,
  },
  server: { port: 5173 },
});
