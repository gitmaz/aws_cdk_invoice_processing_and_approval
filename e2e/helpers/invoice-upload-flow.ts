import { expect } from "@playwright/test";
import { type ReviewKeys, waitForAwaitingHumanReview } from "./wait-for-review-ready";

/**
 * Upload via presign (caller supplies Cognito JWT or local secret) and wait until
 * the invoice pipeline reaches AWAITING_HUMAN (notify-human completed).
 */
export async function runInvoiceUploadE2e(params: {
  invoicesTable: string;
  stageHint: string;
  reviewTimeoutMs: number;
  upload: () => Promise<void>;
}): Promise<ReviewKeys> {
  const notBefore = Date.now();

  await params.upload();

  const keys = await waitForAwaitingHumanReview({
    tableName: params.invoicesTable,
    notBeforeMs: notBefore,
    timeoutMs: params.reviewTimeoutMs,
    stageHint: params.stageHint,
  });

  expect(keys.invoiceId).toBeTruthy();
  expect(keys.reviewSessionId).toBeTruthy();

  return keys;
}
