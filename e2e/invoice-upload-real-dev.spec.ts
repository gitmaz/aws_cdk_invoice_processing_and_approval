import { test } from "@playwright/test";
import { ensureUserAndGetIdToken } from "./helpers/cognito-auth";
import { devE2eEnv, devE2eSkipReason, hasDevE2eEnv } from "./helpers/dev-e2e-env";
import { runInvoiceUploadE2e } from "./helpers/invoice-upload-flow";
import { readSampleInvoicePng } from "./helpers/sample-invoice-fixture";
import { presignAndUpload } from "./helpers/upload-test-file";

const missingEnvMessage = devE2eSkipReason();

test.describe("Invoice upload — realistic fixture (dev)", () => {
  test.beforeAll(async ({}, testInfo) => {
    testInfo.skip(!hasDevE2eEnv(), missingEnvMessage);
  });

  test("sample invoice PNG → Cognito presign → S3 PUT → pipeline AWAITING_HUMAN", async () => {
    const invoicePng = readSampleInvoicePng();

    await runInvoiceUploadE2e({
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
          body: invoicePng,
          contentType: "image/png",
        });
      },
    });
  });
});
