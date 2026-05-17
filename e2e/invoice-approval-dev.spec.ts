import { test } from "@playwright/test";
import { awsEndpoint } from "./helpers/aws-clients";
import { ensureUserAndGetIdToken } from "./helpers/cognito-auth";
import { runInvoiceApprovalE2e } from "./helpers/invoice-approval-flow";
import { presignAndUpload } from "./helpers/upload-test-file";

const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL ?? "";
const poolId = process.env.PLAYWRIGHT_COGNITO_POOL_ID ?? "";
const clientId = process.env.PLAYWRIGHT_COGNITO_CLIENT_ID ?? "";
const testEmail = process.env.PLAYWRIGHT_TEST_EMAIL ?? "e2e-invoice-dev@example.invalid";
const testPassword = process.env.PLAYWRIGHT_TEST_PASSWORD ?? "TestPass123!";
const invoicesTable =
  process.env.PLAYWRIGHT_INVOICES_TABLE ?? process.env.INVOICES_TABLE_NAME ?? "invoice-records-dev";
const reviewTimeoutMs = Number(process.env.PLAYWRIGHT_REVIEW_TIMEOUT_MS ?? "300000");

const hasRealAws = !awsEndpoint();

function devEnvSkipReason(): string {
  const missing: string[] = [];
  if (!apiBaseUrl) missing.push("PLAYWRIGHT_API_BASE_URL");
  if (!poolId) missing.push("PLAYWRIGHT_COGNITO_POOL_ID");
  if (!clientId) missing.push("PLAYWRIGHT_COGNITO_CLIENT_ID");
  if (!hasRealAws) missing.push("unset AWS_ENDPOINT_URL (dev uses real AWS)");
  if (missing.length === 0) return "";
  return (
    `Dev E2E skipped — missing: ${missing.join(", ")}. ` +
    "Run: npm run test:e2e:dev (loads from stack) or npm run playwright:print-env:dev"
  );
}

const hasRequiredEnv = Boolean(apiBaseUrl && poolId && clientId && hasRealAws);
const missingEnvMessage = devEnvSkipReason();

test.describe("Invoice approval (dev)", () => {
  test.beforeAll(async ({}, testInfo) => {
    testInfo.skip(!hasRequiredEnv, missingEnvMessage);
  });

  test.describe.configure({ mode: "serial" });

  test("Cognito upload → pipeline → SPA approve", async ({ page, baseURL }) => {
    await runInvoiceApprovalE2e({
      page,
      baseURL,
      apiBaseUrl,
      invoicesTable,
      stageHint: "dev",
      reviewTimeoutMs,
      upload: async () => {
        const idToken = await ensureUserAndGetIdToken({
          userPoolId: poolId,
          clientId,
          email: testEmail,
          password: testPassword,
        });
        await presignAndUpload({ apiBaseUrl, mode: "cognito-jwt", idToken });
      },
    });
  });
});
