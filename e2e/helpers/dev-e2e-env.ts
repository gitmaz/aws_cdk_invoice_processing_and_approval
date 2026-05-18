import { awsEndpoint } from "./aws-clients";

export const devE2eEnv = {
  apiBaseUrl: process.env.PLAYWRIGHT_API_BASE_URL ?? "",
  poolId: process.env.PLAYWRIGHT_COGNITO_POOL_ID ?? "",
  clientId: process.env.PLAYWRIGHT_COGNITO_CLIENT_ID ?? "",
  testEmail: process.env.PLAYWRIGHT_TEST_EMAIL ?? "e2e-invoice-dev@example.invalid",
  testPassword: process.env.PLAYWRIGHT_TEST_PASSWORD ?? "TestPass123!",
  invoicesTable:
    process.env.PLAYWRIGHT_INVOICES_TABLE ?? process.env.INVOICES_TABLE_NAME ?? "invoice-records-dev",
  reviewTimeoutMs: Number(process.env.PLAYWRIGHT_REVIEW_TIMEOUT_MS ?? "300000"),
};

export function devE2eSkipReason(): string {
  const missing: string[] = [];
  if (!devE2eEnv.apiBaseUrl) missing.push("PLAYWRIGHT_API_BASE_URL");
  if (!devE2eEnv.poolId) missing.push("PLAYWRIGHT_COGNITO_POOL_ID");
  if (!devE2eEnv.clientId) missing.push("PLAYWRIGHT_COGNITO_CLIENT_ID");
  if (awsEndpoint()) missing.push("unset AWS_ENDPOINT_URL (dev uses real AWS)");
  if (missing.length === 0) return "";
  return (
    `Dev E2E skipped — missing: ${missing.join(", ")}. ` +
    "Run: npm run test:e2e:dev (loads from stack) or npm run playwright:print-env:dev"
  );
}

export function hasDevE2eEnv(): boolean {
  return Boolean(devE2eEnv.apiBaseUrl && devE2eEnv.poolId && devE2eEnv.clientId && !awsEndpoint());
}
