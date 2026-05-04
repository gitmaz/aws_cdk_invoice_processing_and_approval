import { useEffect, useMemo, useState } from "react";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

function useQuery() {
  return useMemo(() => new URLSearchParams(window.location.search), []);
}

export default function App() {
  const q = useQuery();
  const invoiceId = q.get("invoiceId") ?? "";
  const session = q.get("session") ?? "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    minConfidence?: number;
    ocrSummary?: unknown;
    status?: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [editedJson, setEditedJson] = useState("");

  useEffect(() => {
    if (!invoiceId || !session) {
      setLoading(false);
      setError("Open this page from the review link in your email (invoiceId + session query params).");
      return;
    }
    void (async () => {
      try {
        const r = await fetch(
          `${apiBase}/public/invoice/${encodeURIComponent(invoiceId)}?session=${encodeURIComponent(session)}`,
        );
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? r.statusText);
        setData(j);
        setEditedJson(JSON.stringify(j.ocrSummary ?? {}, null, 2));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [invoiceId, session]);

  async function submit(action: "APPROVE" | "REJECT") {
    setError(null);
    try {
      const editedFields =
        action === "APPROVE" ? JSON.parse(editedJson || "{}") as Record<string, unknown> : undefined;
      const r = await fetch(`${apiBase}/public/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          session,
          action,
          editedFields,
          reason: action === "REJECT" ? reason : undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      alert(action === "APPROVE" ? "Approved. Thank you." : "Rejection recorded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) return <p style={{ fontFamily: "system-ui" }}>Loading…</p>;

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui", padding: 16 }}>
      <h1>Invoice review</h1>
      {error && (
        <p style={{ color: "crimson", whiteSpace: "pre-wrap" }} role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <p>
            <strong>Invoice</strong> {invoiceId}
          </p>
          <p>
            <strong>Lowest field confidence</strong> {data.minConfidence?.toFixed?.(1) ?? "—"}
          </p>
          <label style={{ display: "block", marginTop: 16 }}>
            <strong>OCR payload (edit before approve)</strong>
            <textarea
              style={{ width: "100%", minHeight: 220, marginTop: 8, fontFamily: "monospace" }}
              value={editedJson}
              onChange={(e) => setEditedJson(e.target.value)}
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
            <button type="button" onClick={() => void submit("APPROVE")}>
              Approve
            </button>
            <button type="button" onClick={() => void submit("REJECT")}>
              Reject
            </button>
          </div>
        </>
      )}
    </div>
  );
}
