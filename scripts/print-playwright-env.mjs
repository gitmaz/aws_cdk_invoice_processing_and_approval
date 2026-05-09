import { execFileSync } from "node:child_process";

/**
 * After `npm run deploy:local`, print PowerShell-friendly env lines for Playwright.
 * Requires AWS CLI and a completed **InvoiceProcessing-local** stack on LocalStack.
 *
 * Usage:
 *   node scripts/print-playwright-env.mjs
 *   $env:AWS_ENDPOINT_URL = "http://localhost:4566"; node scripts/print-playwright-env.mjs
 */

const endpoint = process.env.AWS_ENDPOINT_URL ?? "http://127.0.0.1:4566";
const region = process.env.AWS_DEFAULT_REGION ?? process.env.AWS_REGION ?? "us-east-1";
const stack = process.env.PLAYWRIGHT_CFN_STACK ?? "InvoiceProcessing-local";

const env = {
  ...process.env,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? "test",
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
};

function awsJson(args) {
  const out = execFileSync("aws", args, {
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out);
}

try {
  const data = awsJson([
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    stack,
    "--region",
    region,
    "--endpoint-url",
    endpoint,
    "--output",
    "json",
  ]);
  const outputs = data.Stacks?.[0]?.Outputs ?? [];
  const url = outputs.find((o) => o.OutputKey === "HttpApiUrl")?.OutputValue;
  if (!url) {
    console.error(`Stack ${stack} has no HttpApiUrl output. Is stage=local deployed?`);
    process.exit(1);
  }
  const awsUrl = endpoint.replace("127.0.0.1", "localhost");
  console.log("# Paste into PowerShell:");
  console.log(`$env:PLAYWRIGHT_API_BASE_URL = "${url}"`);
  console.log(`$env:AWS_ENDPOINT_URL = "${awsUrl}"`);
  console.log(`$env:AWS_REGION = "${region}"`);
  console.log(`$env:PLAYWRIGHT_PRESIGN_LOCAL_SECRET = "localstack-presign-change-me"`);
  console.log(`$env:PLAYWRIGHT_INVOICES_TABLE = "invoice-records-local"`);
} catch (e) {
  const msg = e.stderr?.toString?.() ?? e.stdout?.toString?.() ?? e.message ?? String(e);
  console.error(msg.trim());
  console.error(`\nDeploy first: npm run deploy:local (stack ${stack} on ${endpoint}).`);
  process.exit(1);
}
