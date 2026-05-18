export type InvoiceReviewPayload = {
  invoiceId?: string;
  minConfidence?: number;
  status?: string;
  manualVerificationRequired?: boolean;
  ocrSummary?: unknown;
  documentUrl?: string;
  documentContentType?: string;
};

export type ReviewRenderMode = "simple" | "advanced";
