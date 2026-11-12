import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against the PRODUCTION build served like GitHub Pages (/moje-stranka/ sub-path).
// Run: npm run test:e2e   (builds first). Desktop = Chromium, mobile = WebKit (iPhone).
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://127.0.0.1:4321/moje-stranka/",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "node scripts/serve-dist.mjs",
    url: "http://127.0.0.1:4321/moje-stranka/ccar-f/",
    reuseExistingServer: !process.env.CI,
  },
});
