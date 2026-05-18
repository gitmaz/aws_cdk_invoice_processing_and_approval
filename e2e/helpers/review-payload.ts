/** Mirrors spa/src/review/ocrOverlayModel.ts (count only — no SPA import in E2E). */
export function countPositionedOverlayFields(ocrSummary: unknown): number {
  const docs = (ocrSummary as { expenseDocuments?: unknown[] } | null)?.expenseDocuments ?? [];
  let n = 0;
  for (const doc of docs) {
    const fields = (doc as { SummaryFields?: unknown[] })?.SummaryFields ?? [];
    for (const raw of fields) {
      const sf = raw as Record<string, unknown>;
      const box = (sf.ValueDetection as { Geometry?: { BoundingBox?: Record<string, number> } } | undefined)
        ?.Geometry?.BoundingBox;
      if (box?.Width == null || box.Width <= 0 || box.Height == null || box.Height <= 0) continue;
      const text = String(
        (sf.ValueDetection as { Text?: string } | undefined)?.Text ?? "",
      ).trim();
      if (!text) continue;
      n += 1;
    }
  }
  return n;
}

export type ReviewInvoicePayload = {
  invoiceId: string;
  documentUrl?: string;
  ocrSummary?: unknown;
  manualVerificationRequired?: boolean;
};

export async function fetchReviewInvoice(params: {
  apiBaseUrl: string;
  invoiceId: string;
  reviewSessionId: string;
}): Promise<ReviewInvoicePayload> {
  const base = params.apiBaseUrl.replace(/\/$/, "");
  const url = `${base}/public/invoice/${encodeURIComponent(params.invoiceId)}?session=${encodeURIComponent(params.reviewSessionId)}`;
  const res = await fetch(url);
  const body = (await res.json()) as ReviewInvoicePayload & { error?: string };
  if (!res.ok) {
    throw new Error(`GET review invoice failed (${res.status}): ${body.error ?? res.statusText}`);
  }
  return body;
}

export function assertReviewReadyForSimplePreview(payload: ReviewInvoicePayload): void {
  const docs = (payload.ocrSummary as { expenseDocuments?: unknown[] } | null)?.expenseDocuments;
  if (!Array.isArray(docs) || docs.length === 0) {
    throw new Error(
      "Review API ocrSummary has no expenseDocuments. Run upload with sample-invoice.png or check Textract output.",
    );
  }
}

export function assertReviewReadyForAdvancedPreview(payload: ReviewInvoicePayload): void {
  if (!payload.documentUrl) {
    throw new Error(
      "Review API returned no documentUrl. Re-deploy stack (public-api document proxy + PUBLIC_API_BASE_URL).",
    );
  }
  const overlayCount = countPositionedOverlayFields(payload.ocrSummary);
  if (overlayCount === 0) {
    throw new Error(
      "Textract ocrSummary has no SummaryFields with ValueDetection.Geometry.BoundingBox. " +
        "Advanced overlay E2E needs a realistic invoice PNG (npm run generate:e2e-sample-invoice) or a scan Textract can read.",
    );
  }
}
