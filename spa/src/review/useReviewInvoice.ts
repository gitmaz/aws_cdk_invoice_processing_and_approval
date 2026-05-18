import { useCallback, useEffect, useState } from "react";
import { getApiBase } from "../config";
import type { InvoiceReviewPayload } from "./types";

export function useReviewInvoice(invoiceId: string, session: string) {
  const apiBase = getApiBase();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InvoiceReviewPayload | null>(null);
  const [reason, setReason] = useState("");
  const [editedJson, setEditedJson] = useState("");

  useEffect(() => {
    if (!invoiceId || !session) {
      setLoading(false);
      setError("Open this page from the review link in your email (invoiceId + session query params).");
      return;
    }
    if (!apiBase) {
      setLoading(false);
      setError("API base URL is not configured. Add ?apiBase=https://your-api or set VITE_API_BASE_URL at build time.");
      return;
    }
    void (async () => {
      try {
        const r = await fetch(
          `${apiBase}/public/invoice/${encodeURIComponent(invoiceId)}?session=${encodeURIComponent(session)}`,
        );
        const j = (await r.json()) as InvoiceReviewPayload & { error?: string };
        if (!r.ok) throw new Error(j.error ?? r.statusText);
        setData(j);
        setEditedJson(JSON.stringify(j.ocrSummary ?? {}, null, 2));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [invoiceId, session, apiBase]);

  const submit = useCallback(
    async (action: "APPROVE" | "REJECT", editedFields?: Record<string, unknown>) => {
      setError(null);
      try {
        const body: Record<string, unknown> = {
          invoiceId,
          session,
          action,
          reason: action === "REJECT" ? reason : undefined,
        };
        if (action === "APPROVE") {
          body.editedFields = editedFields ?? (JSON.parse(editedJson || "{}") as Record<string, unknown>);
        }
        const r = await fetch(`${apiBase}/public/decision`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = (await r.json()) as { error?: string };
        if (!r.ok) throw new Error(j.error ?? r.statusText);
        alert(action === "APPROVE" ? "Approved. Thank you." : "Rejection recorded.");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [apiBase, editedJson, invoiceId, reason, session],
  );

  return {
    apiBase,
    loading,
    error,
    setError,
    data,
    reason,
    setReason,
    editedJson,
    setEditedJson,
    submit,
    needManualVerify: data?.manualVerificationRequired === true,
  };
}
