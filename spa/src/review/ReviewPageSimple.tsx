import { btnPrimary, btnSecondary } from "../ui";
import type { useReviewInvoice } from "./useReviewInvoice";

type Props = {
  invoiceId: string;
  review: ReturnType<typeof useReviewInvoice>;
};

export default function ReviewPageSimple({ invoiceId, review }: Props) {
  const { data, reason, setReason, editedJson, setEditedJson, submit, needManualVerify } = review;

  if (!data) return null;

  return (
    <>
      <p>
        <strong>Invoice</strong> {invoiceId}
      </p>
      <p>
        <strong>Lowest field confidence</strong> {data.minConfidence?.toFixed?.(1) ?? "—"}
      </p>
      {needManualVerify ? (
        <p style={{ background: "#fff8e6", padding: 12, borderRadius: 8 }}>
          <strong>Manual verification required</strong> — correct the OCR payload below before approving.
        </p>
      ) : (
        <p style={{ background: "#e8f5e9", padding: 12, borderRadius: 8 }}>
          <strong>Verification automatic</strong> — OCR met the confidence threshold. Review the summary and confirm
          with Approve or Reject (approval is never automatic).
        </p>
      )}
      <label style={{ display: "block", marginTop: 16 }}>
        <strong>{needManualVerify ? "OCR payload (edit before approve)" : "Extracted data (read-only)"}</strong>
        <textarea
          style={{ width: "100%", minHeight: 220, marginTop: 8, fontFamily: "monospace" }}
          value={editedJson}
          onChange={needManualVerify ? (e) => setEditedJson(e.target.value) : undefined}
          readOnly={!needManualVerify}
        />
      </label>
      <label style={{ display: "block", marginTop: 16 }}>
        <strong>Rejection reason</strong> (required for reject)
        <textarea
          style={{ width: "100%", minHeight: 80, marginTop: 8 }}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
        <button type="button" style={btnPrimary} onClick={() => void submit("APPROVE")}>
          Approve
        </button>
        <button type="button" style={btnSecondary} onClick={() => void submit("REJECT")}>
          Reject
        </button>
      </div>
    </>
  );
}
