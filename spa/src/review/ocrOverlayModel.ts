/** Normalized Textract bounding box (0–1 relative to page). */
export type NormBox = { left: number; top: number; width: number; height: number };

export type OverlayField = {
  id: string;
  docIndex: number;
  summaryFieldIndex: number;
  label: string;
  value: string;
  confidence: number;
  box: NormBox;
};

type TextractBox = {
  Left?: number;
  Top?: number;
  Width?: number;
  Height?: number;
};

function normBox(raw: TextractBox | undefined): NormBox | null {
  if (
    raw?.Left == null ||
    raw.Top == null ||
    raw.Width == null ||
    raw.Height == null ||
    raw.Width <= 0 ||
    raw.Height <= 0
  ) {
    return null;
  }
  return { left: raw.Left, top: raw.Top, width: raw.Width, height: raw.Height };
}

function fieldLabel(sf: Record<string, unknown>): string {
  const type = (sf.Type as { Text?: string } | undefined)?.Text;
  const label = (sf.LabelDetection as { Text?: string } | undefined)?.Text;
  return (type || label || "Field").trim();
}

/** Flatten Textract AnalyzeExpense summary fields that have geometry for overlay UI. */
export function overlayFieldsFromOcrSummary(ocrSummary: unknown): OverlayField[] {
  const root = ocrSummary as { expenseDocuments?: unknown[] } | null;
  const docs = root?.expenseDocuments ?? [];
  const out: OverlayField[] = [];

  docs.forEach((doc, docIndex) => {
    const summaryFields = (doc as { SummaryFields?: unknown[] })?.SummaryFields ?? [];
    summaryFields.forEach((raw, summaryFieldIndex) => {
      const sf = raw as Record<string, unknown>;
      const vd = sf.ValueDetection as
        | { Text?: string; Confidence?: number; Geometry?: { BoundingBox?: TextractBox } }
        | undefined;
      const box = normBox(vd?.Geometry?.BoundingBox);
      if (!box) return;

      const value = String(vd?.Text ?? "").trim();
      if (!value) return;

      out.push({
        id: `d${docIndex}-s${summaryFieldIndex}`,
        docIndex,
        summaryFieldIndex,
        label: fieldLabel(sf),
        value,
        confidence: typeof vd?.Confidence === "number" ? vd.Confidence : 0,
        box,
      });
    });
  });

  return out;
}

/** Apply overlay edits back into the stored Textract-shaped ocrSummary. */
export function applyOverlayFieldsToOcrSummary(ocrSummary: unknown, fields: OverlayField[]): unknown {
  const clone = structuredClone(ocrSummary ?? {}) as { expenseDocuments?: unknown[] };
  if (!Array.isArray(clone.expenseDocuments)) return clone;

  for (const f of fields) {
    const doc = clone.expenseDocuments[f.docIndex] as { SummaryFields?: unknown[] } | undefined;
    const sf = doc?.SummaryFields?.[f.summaryFieldIndex] as Record<string, unknown> | undefined;
    const vd = sf?.ValueDetection as { Text?: string } | undefined;
    if (vd) vd.Text = f.value;
  }

  return clone;
}
