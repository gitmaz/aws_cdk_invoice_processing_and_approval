import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { btnPrimary, btnSecondary } from "../ui";
import {
  applyOverlayFieldsToOcrSummary,
  overlayFieldsFromOcrSummary,
  type OverlayField,
} from "./ocrOverlayModel";
import type { useReviewInvoice } from "./useReviewInvoice";

type Props = {
  invoiceId: string;
  review: ReturnType<typeof useReviewInvoice>;
};

export default function ReviewPageAdvanced({ invoiceId, review }: Props) {
  const { data, reason, setReason, submit, needManualVerify } = review;
  const [fields, setFields] = useState<OverlayField[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  const documentUrl = data?.documentUrl;
  const isPdf =
    data?.documentContentType?.includes("pdf") || (documentUrl?.toLowerCase().includes(".pdf") ?? false);

  useEffect(() => {
    if (data?.ocrSummary) {
      setFields(overlayFieldsFromOcrSummary(data.ocrSummary));
    }
  }, [data?.ocrSummary]);

  const measure = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const img = el.querySelector("img");
    if (!img) return;
    const width = img.clientWidth || img.naturalWidth;
    const height =
      img.clientHeight ||
      (img.naturalWidth > 0 ? Math.round((img.naturalHeight * width) / img.naturalWidth) : 0);
    if (width > 0 && height > 0) {
      setLayout({ width, height });
    }
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, documentUrl]);

  useEffect(() => {
    if (!documentUrl || fields.length === 0) return;
    measure();
    const t = window.setInterval(measure, 150);
    const stop = window.setTimeout(() => window.clearInterval(t), 4000);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(stop);
    };
  }, [documentUrl, fields.length, measure]);

  const fieldsWithBoxes = useMemo(() => {
    if (!layout.width || !layout.height) return [];
    return fields.map((f) => ({
      ...f,
      style: {
        left: f.box.left * layout.width,
        top: f.box.top * layout.height,
        width: Math.max(f.box.width * layout.width, 48),
        height: Math.max(f.box.height * layout.height, 22),
      },
    }));
  }, [fields, layout]);

  const toggleHidden = (id: string, ctrlKey: boolean) => {
    if (!ctrlKey) return;
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onApprove = () => {
    if (!data?.ocrSummary) {
      void submit("APPROVE");
      return;
    }
    const patched = applyOverlayFieldsToOcrSummary(data.ocrSummary, fields);
    void submit("APPROVE", patched as Record<string, unknown>);
  };

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
          <strong>Manual verification required</strong> — edit values on the document.{" "}
          <strong>Ctrl+click</strong> an overlay field to hide it and read the image underneath.
        </p>
      ) : (
        <p style={{ background: "#e8f5e9", padding: 12, borderRadius: 8 }}>
          <strong>Verification automatic</strong> — fields are read-only; Ctrl+click still hides overlays to compare
          with the scan.
        </p>
      )}

      {!documentUrl ? (
        <p style={{ color: "crimson" }}>
          Document image is not available (missing presigned URL). Re-deploy the API or use simple review mode.
        </p>
      ) : fields.length === 0 ? (
        <p style={{ color: "#666" }}>
          No positioned OCR fields in this invoice (Textract geometry missing). Use simple mode or check the scan
          quality.
        </p>
      ) : null}

      {documentUrl && (
        <div
          ref={canvasRef}
          data-testid="review-document-canvas"
          style={{
            position: "relative",
            width: "100%",
            marginTop: 16,
            border: "1px solid #ccc",
            borderRadius: 8,
            overflow: "hidden",
            background: "#f0f0f0",
          }}
        >
          {isPdf ? (
            <>
              <object
                data={documentUrl}
                type="application/pdf"
                style={{ display: "block", width: "100%", minHeight: 720 }}
                aria-label="Invoice PDF"
              />
              <p style={{ padding: 12, fontSize: 13, background: "#fff8e6", margin: 0 }}>
                PDF preview: positioned overlays work on PNG/JPEG uploads. Edit fields in simple mode or upload an
                image for overlay review.
              </p>
            </>
          ) : (
            <img
              src={documentUrl}
              alt="Invoice"
              data-testid="review-invoice-image"
              style={{ display: "block", width: "100%", height: "auto" }}
              onLoad={measure}
            />
          )}

          {!isPdf &&
            fieldsWithBoxes.map((f) => {
              const hidden = hiddenIds.has(f.id);
              const lowConf = needManualVerify && f.confidence < 90;
              return (
                <div
                  key={f.id}
                  data-testid="review-field-overlay-wrap"
                  data-overlay-hidden={hidden ? "true" : "false"}
                  title={`${f.label} (${f.confidence.toFixed(1)}%) — Ctrl+click to ${hidden ? "show" : "hide"}`}
                  style={{
                    position: "absolute",
                    left: f.style.left,
                    top: f.style.top,
                    width: f.style.width,
                    minHeight: f.style.height,
                    boxSizing: "border-box",
                    zIndex: hidden ? 0 : 2,
                    opacity: hidden ? 0 : 1,
                    pointerEvents: hidden ? "none" : "auto",
                  }}
                  onMouseDown={(e) => {
                    if (e.ctrlKey) {
                      e.preventDefault();
                      toggleHidden(f.id, true);
                    }
                  }}
                >
                  <input
                    type="text"
                    data-testid="review-field-overlay"
                    value={f.value}
                    readOnly={!needManualVerify}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFields((prev) => prev.map((row) => (row.id === f.id ? { ...row, value: v } : row)));
                    }}
                    style={{
                      width: "100%",
                      height: "100%",
                      fontSize: Math.min(14, Math.max(10, f.style.height * 0.55)),
                      padding: "2px 4px",
                      border: lowConf ? "2px solid #e65100" : "1px solid #1565c0",
                      borderRadius: 3,
                      background: "rgba(255,255,255,0.92)",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              );
            })}
        </div>
      )}

      <p style={{ fontSize: 13, color: "#555", marginTop: 8 }}>
        Orange border = field confidence under 90% (manual verify mode). Hidden overlays: {hiddenIds.size}.
      </p>

      <label style={{ display: "block", marginTop: 16 }}>
        <strong>Rejection reason</strong> (required for reject)
        <textarea
          style={{ width: "100%", minHeight: 80, marginTop: 8 }}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
        <button type="button" style={btnPrimary} onClick={() => void onApprove()}>
          Approve
        </button>
        <button type="button" style={btnSecondary} onClick={() => void submit("REJECT")}>
          Reject
        </button>
      </div>
    </>
  );
}
