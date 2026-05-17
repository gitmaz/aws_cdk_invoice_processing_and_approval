import { execFileSync } from "node:child_process";

/**
 * Resolve dev E2E env from the shell and/or CloudFormation (InvoiceProcessing-dev).
 * @returns {Record<string, string>}
 */
export function resolveDevPlaywrightEnv() {
  if (process.env.AWS_ENDPOINT_URL) {
    throw new Error("Unset AWS_ENDPOINT_URL for dev E2E (real AWS only).");
  }

  const region =
    process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? process.env.CDK_DEFAULT_REGION ?? "ap-southeast-2";
  const stack = process.env.PLAYWRIGHT_CFN_STACK ?? "InvoiceProcessing-dev";
  const profile = process.env.AWS_PROFILE;

  let apiUrl = process.env.PLAYWRIGHT_API_BASE_URL ?? "";
  let poolId = process.env.PLAYWRIGHT_COGNITO_POOL_ID ?? "";
  let clientId = process.env.PLAYWRIGHT_COGNITO_CLIENT_ID ?? "";
  let spaUrl = process.env.PLAYWRIGHT_SPA_BASE_URL ?? "";

  if (!apiUrl || !poolId || !clientId) {
    const base = ["--region", region, "--output", "json"];
    if (profile) base.unshift("--profile", profile);
    const out = execFileSync("aws", [...base, "cloudformation", "describe-stacks", "--stack-name", stack], {
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const outputs = JSON.parse(out).Stacks?.[0]?.Outputs ?? [];
    const get = (key) => outputs.find((o) => o.OutputKey === key)?.OutputValue ?? "";

    apiUrl = apiUrl || get("HttpApiUrl");
    poolId = poolId || get("CognitoUserPoolId");
    clientId = clientId || get("CognitoClientId");
    if (!spaUrl) spaUrl = get("SpaBaseUrlForEmails") || "";
  }

  if (!apiUrl || !poolId || !clientId) {
    throw new Error(
      `Missing dev E2E config (stack ${stack}). Deploy with npm run deploy:dev or set PLAYWRIGHT_API_BASE_URL, PLAYWRIGHT_COGNITO_POOL_ID, PLAYWRIGHT_COGNITO_CLIENT_ID.`,
    );
  }

  const env = {
    ...process.env,
    AWS_REGION: region,
    PLAYWRIGHT_API_BASE_URL: apiUrl.replace(/\/$/, ""),
    PLAYWRIGHT_COGNITO_POOL_ID: poolId,
    PLAYWRIGHT_COGNITO_CLIENT_ID: clientId,
    PLAYWRIGHT_INVOICES_TABLE: process.env.PLAYWRIGHT_INVOICES_TABLE ?? "invoice-records-dev",
    PLAYWRIGHT_REVIEW_TIMEOUT_MS: process.env.PLAYWRIGHT_REVIEW_TIMEOUT_MS ?? "300000",
    PLAYWRIGHT_TEST_EMAIL: process.env.PLAYWRIGHT_TEST_EMAIL ?? "e2e-invoice-dev@example.invalid",
    PLAYWRIGHT_TEST_PASSWORD: process.env.PLAYWRIGHT_TEST_PASSWORD ?? "TestPass123!",
  };

  delete env.AWS_ENDPOINT_URL;
  delete env.PLAYWRIGHT_AWS_ENDPOINT_URL;

  // Default: deployed Lambda SPA (no local Vite / port 5173 conflicts).
  if (process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "0") {
    env.PLAYWRIGHT_SKIP_WEBSERVER = "1";
    if (spaUrl) env.PLAYWRIGHT_SPA_BASE_URL = spaUrl.replace(/\/$/, "");
    else if (!env.PLAYWRIGHT_SPA_BASE_URL) env.PLAYWRIGHT_SPA_BASE_URL = "http://127.0.0.1:5173";
  }

  return env;
}
