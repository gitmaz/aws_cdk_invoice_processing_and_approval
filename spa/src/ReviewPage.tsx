import { useMemo } from "react";
import { getReviewRenderMode } from "./config";
import ReviewPageAdvanced from "./review/ReviewPageAdvanced";
import ReviewPageSimple from "./review/ReviewPageSimple";
import { useReviewInvoice } from "./review/useReviewInvoice";
import { ErrorAlert, shell } from "./ui";

function useQuery() {
  return useMemo(() => new URLSearchParams(window.location.search), []);
}

export default function ReviewPage() {
  const q = useQuery();
  const invoiceId = q.get("invoiceId") ?? "";
  const session = q.get("session") ?? "";
  const renderMode = getReviewRenderMode();
  const review = useReviewInvoice(invoiceId, session);

  if (review.loading) return <p style={shell}>Loading…</p>;

  const shellWide = renderMode === "advanced" ? { ...shell, maxWidth: 1100 } : shell;

  return (
    <div style={shellWide}>
      <h1>Invoice review</h1>
      <p>
        <a href="/">← Upload another invoice</a>
      </p>
      {review.error && <ErrorAlert>{review.error}</ErrorAlert>}
      {review.data &&
        (renderMode === "advanced" ? (
          <ReviewPageAdvanced invoiceId={invoiceId} review={review} />
        ) : (
          <ReviewPageSimple invoiceId={invoiceId} review={review} />
        ))}
    </div>
  );
}
