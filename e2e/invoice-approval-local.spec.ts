import { expect, test } from "@playwright/test";
import { ensureUserAndGetIdToken } from "./helpers/cognito-auth";
import { mailhogMessagesIncludeInvoice } from "./helpers/mailhog";
import { presignAndUpload } from "./helpers/upload-test-file";
import { waitForAwaitingHumanReview } from "./helpers/wait-for-review-ready";

const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL ?? "";
const poolId = process.env.PLAYWRIGHT_COGNITO_POOL_ID ?? "";
const clientId = process.env.PLAYWRIGHT_COGNITO_CLIENT_ID ?? "";
const testEmail = process.env.PLAYWRIGHT_TEST_EMAIL ?? "e2e-invoice@local.invalid";
const testPassword = process.env.PLAYWRIGHT_TEST_PASSWORD ?? "TestPass123!";
const invoicesTable =
  process.env.PLAYWRIGHT_INVOICES_TABLE ?? process.env.INVOICES_TABLE_NAME ?? "invoice-records-local";
const mailhogUrl = process.env.PLAYWRIGHT_MAILHOG_URL ?? "";

/** Prefer secret header for LocalStack Community (matches CDK `invoice.local.presignLocalSecret` / config). */
const presignSecret =
  process.env.PLAYWRIGHT_PRESIGN_LOCAL_SECRET ??
  process.env.PRESIGN_LOCAL_SECRET ??
  "localstack-presign-change-me";

/** Set to `1` to force Cognito + JWT even when a presign secret is configured (advanced). */
const forceCognito = process.env.PLAYWRIGHT_USE_COGNITO === "1";

/** When no secret (cleared) or `PLAYWRIGHT_USE_COGNITO=1`, E2E uses Cognito (requires pool + client). */
const useJwtPath = forceCognito || !String(presignSecret).trim();
const hasRequiredEnv = Boolean(apiBaseUrl && (!useJwtPath || (poolId && clientId)));

const missingEnvMessage =
  "Set PLAYWRIGHT_API_BASE_URL. For LocalStack Community use the default presign secret (or PLAYWRIGHT_PRESIGN_LOCAL_SECRET). For Cognito/JWT set PLAYWRIGHT_COGNITO_* and optional PLAYWRIGHT_USE_COGNITO=1. See e2e/env.example.";

test.describe("Invoice approval (local)", () => {
  test.beforeAll(async ({}, testInfo) => {
    testInfo.skip(!hasRequiredEnv, missingEnvMessage);
  });

  test.describe.configure({ mode: "serial" });

  test("presign upload → notify → optional MailHog → SPA approve", async ({ page, baseURL }) => {
      const notBefore = Date.now();

      if (!useJwtPath) {
        await presignAndUpload({ apiBaseUrl, presignLocalSecret: presignSecret });
      } else {
        const idToken = await ensureUserAndGetIdToken({
          userPoolId: poolId,
          clientId,
          email: testEmail,
          password: testPassword,
        });
        await presignAndUpload({ apiBaseUrl, idToken });
      }

      const { invoiceId, reviewSessionId } = await waitForAwaitingHumanReview({
        tableName: invoicesTable,
        notBeforeMs: notBefore,
      });

      if (mailhogUrl) {
        const seen = await mailhogMessagesIncludeInvoice({
          mailhogBaseUrl: mailhogUrl,
          invoiceId,
        });
        expect
          .soft(seen, `Expected MailHog at ${mailhogUrl} to contain message referencing ${invoiceId}`)
          .toBeTruthy();
      }

      const spaOrigin = baseURL ?? "http://127.0.0.1:5173";
      const reviewUrl = `${spaOrigin.replace(/\/$/, "")}/?invoiceId=${encodeURIComponent(invoiceId)}&session=${encodeURIComponent(reviewSessionId)}&apiBase=${encodeURIComponent(apiBaseUrl)}`;

      await page.goto(reviewUrl);

      await expect(page.getByRole("heading", { name: "Invoice review" })).toBeVisible();
      await expect(page.getByText(`Invoice ${invoiceId}`)).toBeVisible();

      page.once("dialog", async (dialog) => {
        expect(dialog.message()).toContain("Approved");
        await dialog.accept();
      });

      await page.getByRole("button", { name: "Approve" }).click();
  });
});
