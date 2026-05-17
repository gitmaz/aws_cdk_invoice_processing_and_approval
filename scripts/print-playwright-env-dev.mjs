import { execFileSync } from "node:child_process";

/**
 * After `npm run deploy:dev`, print PowerShell-friendly env for dev E2E.
 * Uses real AWS (no endpoint-url). Requires AWS CLI + deployed InvoiceProcessing-dev.
 *
 * Usage:
 *   $env:AWS_PROFILE = "my-dev"
 *   $env:AWS_REGION = "ap-southeast-2"
 *   node scripts/print-playwright-env-dev.mjs
 */

const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? process.env.CDK_DEFAULT_REGION ?? "ap-southeast-2";
const stack = process.env.PLAYWRIGHT_CFN_STACK ?? "InvoiceProcessing-dev";
const profile = process.env.AWS_PROFILE;

if (process.env.AWS_ENDPOINT_URL) {
  console.error("Unset AWS_ENDPOINT_URL for dev E2E (real AWS only).");
  process.exit(1);
}

function awsJson(args) {
  const base = ["--region", region, "--output", "json"];
  if (profile) base.unshift("--profile", profile);
  const out = execFileSync("aws", [...base, ...args], {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out);
}

function outputValue(outputs, key) {
  return outputs.find((o) => o.OutputKey === key)?.OutputValue;
}

try {
  const data = awsJson(["cloudformation", "describe-stacks", "--stack-name", stack]);
  const outputs = data.Stacks?.[0]?.Outputs ?? [];
  const apiUrl = outputValue(outputs, "HttpApiUrl");
  const poolId = outputValue(outputs, "CognitoUserPoolId");
  const clientId = outputValue(outputs, "CognitoClientId");
  const spaUrl = outputValue(outputs, "SpaBaseUrlForEmails");

  if (!apiUrl || !poolId || !clientId) {
    console.error(`Stack ${stack} missing outputs. Deploy: npm run deploy:dev`);
    process.exit(1);
  }

  console.log("# Paste into PowerShell (dev E2E — real AWS):");
  if (profile) console.log(`$env:AWS_PROFILE = "${profile}"`);
  console.log(`$env:AWS_REGION = "${region}"`);
  console.log(`Remove-Item Env:AWS_ENDPOINT_URL -ErrorAction SilentlyContinue`);
  console.log(`$env:PLAYWRIGHT_API_BASE_URL = "${apiUrl.replace(/\/$/, "")}"`);
  console.log(`$env:PLAYWRIGHT_COGNITO_POOL_ID = "${poolId}"`);
  console.log(`$env:PLAYWRIGHT_COGNITO_CLIENT_ID = "${clientId}"`);
  console.log(`$env:PLAYWRIGHT_INVOICES_TABLE = "invoice-records-dev"`);
  console.log(`$env:PLAYWRIGHT_REVIEW_TIMEOUT_MS = "300000"`);
  console.log(`$env:PLAYWRIGHT_TEST_EMAIL = "e2e-invoice-dev@example.invalid"`);
  console.log(`$env:PLAYWRIGHT_TEST_PASSWORD = "TestPass123!"`);
  console.log("");
  console.log("# spa/.env.dev (rebuild SPA after editing):");
  console.log(`# VITE_API_BASE_URL=${apiUrl.replace(/\/$/, "")}`);
  console.log(`# VITE_COGNITO_USER_POOL_ID=${poolId}`);
  console.log(`# VITE_COGNITO_CLIENT_ID=${clientId}`);
  if (spaUrl) {
    console.log(`# Optional — use deployed SPA instead of local Vite:`);
    console.log(`# $env:PLAYWRIGHT_SKIP_WEBSERVER = "1"`);
    console.log(`# $env:PLAYWRIGHT_SPA_BASE_URL = "${spaUrl.replace(/\/$/, "")}"`);
  }
  console.log(`\n# Then: npm run test:e2e:dev`);
} catch (e) {
  const msg = e.stderr?.toString?.() ?? e.stdout?.toString?.() ?? e.message ?? String(e);
  console.error(msg.trim());
  console.error(`\nDeploy first: npm run deploy:dev (stack ${stack} in ${region}).`);
  process.exit(1);
}
