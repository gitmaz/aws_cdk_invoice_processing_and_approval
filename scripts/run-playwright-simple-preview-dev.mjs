#!/usr/bin/env node
/**
 * Simple review preview E2E — dev runner with shorter pipeline wait.
 *
 *   npm run test:e2e:real:simple-preview:dev
 *   npm run test:e2e:simple-preview:review-only:dev
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { resolveDevPlaywrightEnv } from "./playwright-dev-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

const argv = process.argv.slice(2);
const dash = argv.indexOf("--");
const playwrightArgs = dash >= 0 ? argv.slice(dash + 1) : [];

let env;
try {
  env = resolveDevPlaywrightEnv();
} catch (e) {
  console.error(e.message ?? e);
  process.exit(1);
}

if (!env.PLAYWRIGHT_REVIEW_TIMEOUT_MS || env.PLAYWRIGHT_REVIEW_TIMEOUT_MS === "300000") {
  env.PLAYWRIGHT_REVIEW_TIMEOUT_MS = "180000";
}

const reviewOnly = Boolean(env.PLAYWRIGHT_REVIEW_INVOICE_ID && env.PLAYWRIGHT_REVIEW_SESSION_ID);
console.log("Simple preview E2E:");
console.log(`  PLAYWRIGHT_REVIEW_TIMEOUT_MS=${env.PLAYWRIGHT_REVIEW_TIMEOUT_MS}`);
const defaultArgs = reviewOnly
  ? ["-g", "simple review UI only"]
  : ["e2e/invoice-review-simple-preview-dev.spec.ts", "-g", "sample PNG upload"];
if (reviewOnly) {
  console.log("  Mode: review-only (~5–15s).");
} else {
  console.log("  Mode: full pipeline (upload + Textract, often 1–3 min).");
}
const extraArgs = playwrightArgs.length > 0 ? playwrightArgs : defaultArgs;

const bin = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  bin,
  ["playwright", "test", "-c", "playwright.dev.config.ts", ...extraArgs],
  { cwd: projectRoot, env, stdio: "inherit", shell: process.platform === "win32" },
);

process.exit(result.status ?? 1);
