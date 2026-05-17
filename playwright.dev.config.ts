/**
 * Deployed **dev** stage E2E — Cognito JWT, real AWS (no LocalStack endpoint).
 * See `npm run test:e2e:dev` and `e2e/env.dev.example`.
 */
import { defineInvoicePlaywrightConfig } from "./e2e/playwright-base";

export default defineInvoicePlaywrightConfig({
  testMatch: "**/*dev.spec.ts",
  testTimeoutMs: 360_000,
  spaDevMode: "dev",
});
