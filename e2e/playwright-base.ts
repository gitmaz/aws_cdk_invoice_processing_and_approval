import { defineConfig, devices } from "@playwright/test";

export type PlaywrightStageOptions = {
  /** Glob matched under e2e/ (e.g. invoice-approval-local.spec.ts). */
  testMatch: string;
  /** Per-test timeout (ms). Dev needs headroom for real Textract + Step Functions. */
  testTimeoutMs: number;
  /** Vite --mode when Playwright starts the SPA dev server. */
  spaDevMode?: string;
};

/**
 * Shared Playwright settings for invoice approval E2E (local LocalStack vs deployed dev).
 */
export function defineInvoicePlaywrightConfig(stage: PlaywrightStageOptions) {
  const spaOrigin = process.env.PLAYWRIGHT_SPA_BASE_URL ?? "http://127.0.0.1:5173";
  const apiBase = process.env.PLAYWRIGHT_API_BASE_URL ?? "";

  return defineConfig({
    testDir: "e2e",
    testMatch: stage.testMatch,
    timeout: stage.testTimeoutMs,
    expect: { timeout: 30_000 },
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
            // Explicit host/port so Playwright's URL probe matches on Windows.
            command: stage.spaDevMode
              ? `npm run dev -- --mode ${stage.spaDevMode} --host 127.0.0.1 --port 5173`
              : "npm run dev -- --host 127.0.0.1 --port 5173",
            cwd: "spa",
            url: spaOrigin,
            // Local dev: reuse Vite if already on 5173 (avoids "port already used"). CI always starts fresh.
            reuseExistingServer: !process.env.CI,
            timeout: 240_000,
            env: {
              ...process.env,
              VITE_API_BASE_URL: apiBase,
            },
          },
  });
}
