import { expect, type Page } from "@playwright/test";
import { runInvoiceUploadE2e } from "./invoice-upload-flow";
import { mailhogMessagesIncludeInvoice } from "./mailhog";

export async function approveInvoiceInSpa(params: {
  page: Page;
  baseURL: string | undefined;
  apiBaseUrl: string;
  invoiceId: string;
  reviewSessionId: string;
}): Promise<void> {
  const { page, baseURL, apiBaseUrl, invoiceId, reviewSessionId } = params;
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
}

export async function runInvoiceApprovalE2e(params: {
  page: Page;
  baseURL: string | undefined;
  apiBaseUrl: string;
  invoicesTable: string;
  stageHint: string;
  reviewTimeoutMs: number;
  mailhogUrl?: string;
  upload: () => Promise<void>;
}): Promise<void> {
  const { invoiceId, reviewSessionId } = await runInvoiceUploadE2e({
    invoicesTable: params.invoicesTable,
    stageHint: params.stageHint,
    reviewTimeoutMs: params.reviewTimeoutMs,
    upload: params.upload,
  });

  if (params.mailhogUrl) {
    const seen = await mailhogMessagesIncludeInvoice({
      mailhogBaseUrl: params.mailhogUrl,
      invoiceId,
    });
    expect
      .soft(seen, `Expected MailHog at ${params.mailhogUrl} to contain message referencing ${invoiceId}`)
      .toBeTruthy();
  }

  await approveInvoiceInSpa({
    page: params.page,
    baseURL: params.baseURL,
    apiBaseUrl: params.apiBaseUrl,
    invoiceId,
    reviewSessionId,
  });
}
