#!/usr/bin/env node
/**
 * Run dev E2E with env loaded from CloudFormation (and optional CLI flags).
 *
 *   npm run test:e2e:dev
 *   npm run test:e2e:dev:headed
 *   node scripts/run-playwright-dev.mjs -- --headed --slow-mo=500
 *
 * Requires AWS CLI + AWS_PROFILE (e.g. my-dev). Set PLAYWRIGHT_SKIP_WEBSERVER=0 to use local Vite.
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

console.log("Dev E2E env:");
console.log(`  PLAYWRIGHT_API_BASE_URL=${env.PLAYWRIGHT_API_BASE_URL}`);
console.log(`  PLAYWRIGHT_SPA_BASE_URL=${env.PLAYWRIGHT_SPA_BASE_URL}`);
console.log(`  PLAYWRIGHT_SKIP_WEBSERVER=${env.PLAYWRIGHT_SKIP_WEBSERVER ?? ""}`);
console.log(`  AWS_REGION=${env.AWS_REGION}`);

const bin = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  bin,
  ["playwright", "test", "-c", "playwright.dev.config.ts", ...playwrightArgs],
  { cwd: projectRoot, env, stdio: "inherit", shell: process.platform === "win32" },
);

process.exit(result.status ?? 1);
