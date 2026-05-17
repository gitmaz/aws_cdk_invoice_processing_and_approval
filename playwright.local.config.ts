/**
 * LocalStack E2E — presign secret + optional MailHog; see `npm run test:e2e:local`.
 * Playwright requires Node 20+ (repo `engines`).
 */
import { defineInvoicePlaywrightConfig } from "./e2e/playwright-base";

export default defineInvoicePlaywrightConfig({
  testMatch: "**/*local.spec.ts",
  testTimeoutMs: 180_000,
  spaDevMode: "local",
});
