import { expect, type Locator, type Page } from "@playwright/test";
import {
  assertReviewReadyForAdvancedPreview,
  countPositionedOverlayFields,
  fetchReviewInvoice,
  type ReviewInvoicePayload,
} from "./review-payload";
import { buildReviewSpaUrl } from "./review-spa-url";

function invoiceImage(page: Page): Locator {
  return page.getByRole("img", { name: "Invoice" });
}

function overlayInputs(page: Page): Locator {
  return page
    .getByTestId("review-field-overlay")
    .or(page.locator('[title*="Ctrl+click to"] input[type="text"]'));
}

function overlayWrap(page: Page, index: number): Locator {
  return page
    .getByTestId("review-field-overlay-wrap")
    .or(page.locator('[title*="Ctrl+click to"]'))
    .nth(index);
}

async function waitForReviewShell(page: Page, apiAlreadyLoaded = false): Promise<void> {
  await expect(page.getByRole("heading", { name: "Invoice review" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Loading…")).toBeHidden({ timeout: apiAlreadyLoaded ? 15_000 : 60_000 });
}

async function assertAdvancedModeNotSimple(page: Page): Promise<void> {
  const hasCanvas = (await page.getByTestId("review-document-canvas").count()) > 0;
  const hasCtrlHint = (await page.getByText(/Ctrl\+click/i).count()) > 0;
  if (hasCanvas || hasCtrlHint) return;

  const simpleTextarea = page.locator("textarea").first();
  if (await simpleTextarea.isVisible().catch(() => false)) {
    throw new Error(
      "Review SPA rendered simple mode (JSON textarea). Use ?reviewRender=advanced and redeploy SPA if query override is missing.",
    );
  }

  const noFields = page.getByText(/No positioned OCR fields/i);
  if (await noFields.isVisible().catch(() => false)) {
    throw new Error(
      "Advanced review loaded but Textract returned no overlay geometry. Re-run upload with sample-invoice.png or check ocrSummary in DynamoDB.",
    );
  }

  const noDoc = page.getByText(/Document image is not available/i);
  if (await noDoc.isVisible().catch(() => false)) {
    throw new Error("Advanced review: document image URL missing on deployed API.");
  }
}

async function waitForOverlayFields(page: Page, expectedMin: number): Promise<void> {
  await page.waitForFunction(
    (min) => {
      const byTestId = document.querySelectorAll('[data-testid="review-field-overlay"]');
      if (byTestId.length >= min) return true;
      const byTitle = document.querySelectorAll('[title*="Ctrl+click to"] input[type="text"]');
      return byTitle.length >= min;
    },
    expectedMin,
    { timeout: 20_000 },
  );
}

/** Assert advanced review layout: document image + positioned OCR overlays. */
export async function assertAdvancedReviewPreview(params: {
  page: Page;
  invoiceId: string;
  /** At least this many overlay inputs must appear (default 1). */
  minOverlayCount?: number;
}): Promise<void> {
  const { page, invoiceId } = params;
  const expectedMin = Math.max(1, params.minOverlayCount ?? 1);

  await waitForReviewShell(page, true);
  await assertAdvancedModeNotSimple(page);

  await expect(page.getByText(`Invoice ${invoiceId}`)).toBeVisible();
  await expect(page.getByText(/Ctrl\+click/i)).toBeVisible();

  await expect(invoiceImage(page)).toBeVisible({ timeout: 45_000 });
  await waitForOverlayFields(page, expectedMin);

  const overlays = overlayInputs(page);
  await expect(overlays.first()).toBeVisible({ timeout: 10_000 });
  expect(await overlays.count()).toBeGreaterThanOrEqual(expectedMin);

  const firstWrap = overlayWrap(page, 0);
  await firstWrap.dispatchEvent("mousedown", { ctrlKey: true });
  await expect(firstWrap).toHaveCSS("opacity", "0");
  await firstWrap.dispatchEvent("mousedown", { ctrlKey: true });
  await expect(firstWrap).toHaveCSS("opacity", "1");
}

export async function openAdvancedReviewPreview(params: {
  page: Page;
  baseURL: string | undefined;
  apiBaseUrl: string;
  invoiceId: string;
  reviewSessionId: string;
  /** When set, skips GET /public/invoice (caller already preflighted). */
  prefetched?: ReviewInvoicePayload;
}): Promise<void> {
  const payload =
    params.prefetched ??
    (await fetchReviewInvoice({
      apiBaseUrl: params.apiBaseUrl,
      invoiceId: params.invoiceId,
      reviewSessionId: params.reviewSessionId,
    }));

  assertReviewReadyForAdvancedPreview(payload);
  const overlayCount = countPositionedOverlayFields(payload.ocrSummary);

  const spaOrigin = params.baseURL ?? "http://127.0.0.1:5173";
  const reviewUrl = buildReviewSpaUrl({
    spaOrigin,
    apiBaseUrl: params.apiBaseUrl,
    invoiceId: params.invoiceId,
    reviewSessionId: params.reviewSessionId,
    reviewRender: "advanced",
  });

  console.log(`[e2e] Opening review SPA (${overlayCount} positioned fields, documentUrl ok)…`);
  const apiReady = params.page.waitForResponse(
    (r) => r.url().includes("/public/invoice/") && r.status() === 200,
    { timeout: 60_000 },
  );
  await params.page.goto(reviewUrl, { waitUntil: "commit" });
  await apiReady;
  await assertAdvancedReviewPreview({
    page: params.page,
    invoiceId: params.invoiceId,
    minOverlayCount: Math.min(overlayCount, 1),
  });
}

export { fetchReviewInvoice, assertReviewReadyForAdvancedPreview, countPositionedOverlayFields } from "./review-payload";
