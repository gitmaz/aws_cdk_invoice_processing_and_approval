import { test } from "@playwright/test";
import { ensureUserAndGetIdToken } from "./helpers/cognito-auth";
import { devE2eEnv, devE2eSkipReason, devReviewOnlyKeys, hasDevE2eEnv } from "./helpers/dev-e2e-env";
import {
  fetchReviewInvoice,
  openSimpleReviewPreview,
} from "./helpers/invoice-simple-preview-flow";
import { runInvoiceUploadE2e } from "./helpers/invoice-upload-flow";
import { readSampleInvoicePng } from "./helpers/sample-invoice-fixture";
import { presignAndUpload } from "./helpers/upload-test-file";

const missingEnvMessage = devE2eSkipReason();

test.describe("Invoice review — simple JSON preview (dev)", () => {
  test.beforeAll(async ({}, testInfo) => {
    testInfo.skip(!hasDevE2eEnv(), missingEnvMessage);
  });

  test("simple review UI only (skip upload when env set)", async ({ page, baseURL }) => {
    const keys = devReviewOnlyKeys();
    test.skip(!keys, "Set PLAYWRIGHT_REVIEW_INVOICE_ID and PLAYWRIGHT_REVIEW_SESSION_ID");

    await openSimpleReviewPreview({
      page,
      baseURL,
      apiBaseUrl: devE2eEnv.apiBaseUrl,
      invoiceId: keys.invoiceId,
      reviewSessionId: keys.reviewSessionId,
    });
  });

  test("sample PNG upload → simple review SPA (OCR JSON + actions)", async ({ page, baseURL }) => {
    test.skip(Boolean(devReviewOnlyKeys()), "Review-only env set — skipping full pipeline");

    console.log(
      "[e2e] Full run: Cognito upload → Textract → AWAITING_HUMAN (often 1–3 min on dev). " +
        "For a fast re-run, set PLAYWRIGHT_REVIEW_INVOICE_ID + PLAYWRIGHT_REVIEW_SESSION_ID.",
    );

    const { invoiceId, reviewSessionId } = await test.step("Upload and wait for AWAITING_HUMAN", async () =>
      runInvoiceUploadE2e({
        invoicesTable: devE2eEnv.invoicesTable,
        stageHint: "dev",
        reviewTimeoutMs: devE2eEnv.reviewTimeoutMs,
        upload: async () => {
          const idToken = await ensureUserAndGetIdToken({
            userPoolId: devE2eEnv.poolId,
            clientId: devE2eEnv.clientId,
            email: devE2eEnv.testEmail,
            password: devE2eEnv.testPassword,
          });
          await presignAndUpload({
            apiBaseUrl: devE2eEnv.apiBaseUrl,
            mode: "cognito-jwt",
            idToken,
            body: readSampleInvoicePng(),
            contentType: "image/png",
          });
        },
      }),
    );

    console.log(`[e2e] Ready for review — invoiceId=${invoiceId} session=${reviewSessionId}`);

    await test.step("Open simple review SPA", async () => {
      const payload = await fetchReviewInvoice({
        apiBaseUrl: devE2eEnv.apiBaseUrl,
        invoiceId,
        reviewSessionId,
      });
      await openSimpleReviewPreview({
        page,
        baseURL,
        apiBaseUrl: devE2eEnv.apiBaseUrl,
        invoiceId,
        reviewSessionId,
        prefetched: payload,
      });
    });
  });
});
