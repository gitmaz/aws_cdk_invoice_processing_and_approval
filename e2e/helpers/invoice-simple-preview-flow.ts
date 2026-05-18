import { expect, type Page } from "@playwright/test";
import {
  assertReviewReadyForSimplePreview,
  fetchReviewInvoice,
  type ReviewInvoicePayload,
} from "./review-payload";
import { buildReviewSpaUrl } from "./review-spa-url";

async function waitForReviewShell(page: Page, apiAlreadyLoaded = false): Promise<void> {
  await expect(page.getByRole("heading", { name: "Invoice review" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Loading…")).toBeHidden({ timeout: apiAlreadyLoaded ? 15_000 : 60_000 });
}

async function assertSimpleModeNotAdvanced(page: Page): Promise<void> {
  const hasCanvas = (await page.getByTestId("review-document-canvas").count()) > 0;
  const hasCtrlHint = (await page.getByText(/Ctrl\+click/i).count()) > 0;
  if (hasCanvas || hasCtrlHint) {
    throw new Error(
      "Review SPA rendered advanced mode. Omit ?reviewRender=advanced or set ?reviewRender=simple.",
    );
  }
}

/** Assert simple review layout: OCR JSON textarea + approve/reject actions. */
export async function assertSimpleReviewPreview(params: {
  page: Page;
  invoiceId: string;
}): Promise<void> {
  const { page, invoiceId } = params;

  await waitForReviewShell(page, true);
  await assertSimpleModeNotAdvanced(page);

  await expect(page.getByText(`Invoice ${invoiceId}`)).toBeVisible();
  await expect(page.getByText(/Extracted data|OCR payload/i)).toBeVisible();
  await expect(page.getByText(/Verification automatic|Manual verification required/i)).toBeVisible();

  const ocrTextarea = page.locator("textarea").first();
  await expect(ocrTextarea).toBeVisible();
  const json = await ocrTextarea.inputValue();
  expect(json).toContain("expenseDocuments");

  await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();
}

export async function openSimpleReviewPreview(params: {
  page: Page;
  baseURL: string | undefined;
  apiBaseUrl: string;
  invoiceId: string;
  reviewSessionId: string;
  prefetched?: ReviewInvoicePayload;
}): Promise<void> {
  const payload =
    params.prefetched ??
    (await fetchReviewInvoice({
      apiBaseUrl: params.apiBaseUrl,
      invoiceId: params.invoiceId,
      reviewSessionId: params.reviewSessionId,
    }));

  assertReviewReadyForSimplePreview(payload);

  const spaOrigin = params.baseURL ?? "http://127.0.0.1:5173";
  const reviewUrl = buildReviewSpaUrl({
    spaOrigin,
    apiBaseUrl: params.apiBaseUrl,
    invoiceId: params.invoiceId,
    reviewSessionId: params.reviewSessionId,
    reviewRender: "simple",
  });

  console.log("[e2e] Opening simple review SPA (ocrSummary ok)…");
  const apiReady = params.page.waitForResponse(
    (r) => r.url().includes("/public/invoice/") && r.status() === 200,
    { timeout: 60_000 },
  );
  await params.page.goto(reviewUrl, { waitUntil: "commit" });
  await apiReady;
  await assertSimpleReviewPreview({ page: params.page, invoiceId: params.invoiceId });
}

export { fetchReviewInvoice, assertReviewReadyForSimplePreview } from "./review-payload";
