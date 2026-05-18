/** Review SPA URL with session auth and optional apiBase / reviewRender query params. */
export function buildReviewSpaUrl(params: {
  spaOrigin: string;
  apiBaseUrl: string;
  invoiceId: string;
  reviewSessionId: string;
  reviewRender?: "simple" | "advanced";
}): string {
  const base = params.spaOrigin.replace(/\/$/, "");
  const q = new URLSearchParams({
    invoiceId: params.invoiceId,
    session: params.reviewSessionId,
    apiBase: params.apiBaseUrl.replace(/\/$/, ""),
  });
  if (params.reviewRender === "advanced" || params.reviewRender === "simple") {
    q.set("reviewRender", params.reviewRender);
  }
  return `${base}/?${q.toString()}`;
}
