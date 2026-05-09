/**
 * Playwright expects **Node 20+** (matches repo `engines`). If your host Node is older,
 * upgrade Node or use a host Node >= 20.
 */
import { defineConfig, devices } from "@playwright/test";

const spaOrigin = process.env.PLAYWRIGHT_SPA_BASE_URL ?? "http://127.0.0.1:5173";
const apiBase = process.env.PLAYWRIGHT_API_BASE_URL ?? "";

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: spaOrigin,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer:
    process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1"
      ? undefined
      : {
          command: "npm run dev",
          cwd: "spa",
          url: spaOrigin,
          // Vite env (VITE_*) is only read at server start; reusing an existing server can keep stale API base URLs.
          reuseExistingServer: false,
          timeout: 180_000,
          env: {
            ...process.env,
            VITE_API_BASE_URL: apiBase,
          },
        },
});
