import { test } from "@playwright/test";
import { ensureUserAndGetIdToken } from "./helpers/cognito-auth";
import { runInvoiceApprovalE2e } from "./helpers/invoice-approval-flow";
import { presignAndUpload } from "./helpers/upload-test-file";
import { awsEndpoint } from "./helpers/aws-clients";

const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL ?? "";
const poolId = process.env.PLAYWRIGHT_COGNITO_POOL_ID ?? "";
const clientId = process.env.PLAYWRIGHT_COGNITO_CLIENT_ID ?? "";
const testEmail = process.env.PLAYWRIGHT_TEST_EMAIL ?? "e2e-invoice@local.invalid";
const testPassword = process.env.PLAYWRIGHT_TEST_PASSWORD ?? "TestPass123!";
const invoicesTable =
  process.env.PLAYWRIGHT_INVOICES_TABLE ?? process.env.INVOICES_TABLE_NAME ?? "invoice-records-local";
const mailhogUrl = process.env.PLAYWRIGHT_MAILHOG_URL ?? "";
const reviewTimeoutMs = Number(process.env.PLAYWRIGHT_REVIEW_TIMEOUT_MS ?? "120000");

const presignSecret =
  process.env.PLAYWRIGHT_PRESIGN_LOCAL_SECRET ??
  process.env.PRESIGN_LOCAL_SECRET ??
  "localstack-presign-change-me";

/** Set to `1` to force Cognito + JWT even when presign secret is configured (advanced). */
const forceCognito = process.env.PLAYWRIGHT_USE_COGNITO === "1";
const useJwtPath = forceCognito || !String(presignSecret).trim();
const hasRequiredEnv = Boolean(apiBaseUrl && awsEndpoint() && (!useJwtPath || (poolId && clientId)));

const missingEnvMessage =
  "Local E2E: set PLAYWRIGHT_API_BASE_URL and AWS_ENDPOINT_URL (LocalStack). " +
  "Use presign secret (default) or PLAYWRIGHT_USE_COGNITO=1 with PLAYWRIGHT_COGNITO_*. " +
  "See e2e/env.local.example and `npm run playwright:print-env:local`.";

test.describe("Invoice approval (local / LocalStack)", () => {
  test.beforeAll(async ({}, testInfo) => {
    testInfo.skip(!hasRequiredEnv, missingEnvMessage);
  });

  test.describe.configure({ mode: "serial" });

  test("presign upload → notify → optional MailHog → SPA approve", async ({ page, baseURL }) => {
    await runInvoiceApprovalE2e({
      page,
      baseURL,
      apiBaseUrl,
      invoicesTable,
      stageHint: "local",
      reviewTimeoutMs,
      mailhogUrl: mailhogUrl || undefined,
      upload: async () => {
        if (!useJwtPath) {
          await presignAndUpload({
            apiBaseUrl,
            mode: "local-secret",
            presignLocalSecret: presignSecret,
          });
        } else {
          const idToken = await ensureUserAndGetIdToken({
            userPoolId: poolId,
            clientId,
            email: testEmail,
            password: testPassword,
          });
          await presignAndUpload({ apiBaseUrl, mode: "cognito-jwt", idToken });
        }
      },
    });
  });
});
