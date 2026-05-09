import type { AnalyzeExpenseCommandOutput } from "@aws-sdk/client-textract";

export function minConfidenceFromAnalyze(output: AnalyzeExpenseCommandOutput): number {
  let min = 100;
  for (const doc of output.ExpenseDocuments ?? []) {
    for (const f of doc.SummaryFields ?? []) {
      const c = f.ValueDetection?.Confidence ?? 0;
      if (c > 0) min = Math.min(min, c);
    }
  }
  return min === 100 ? 0 : min;
}

/** Shape-compatible with AnalyzeExpense for local / LocalStack where Textract is not available. */
export function mockAnalyzeExpenseOutput(): AnalyzeExpenseCommandOutput {
  const forced = process.env.MOCK_TEXTRACT_MIN_CONFIDENCE;
  let confidence = 90;
  if (forced !== undefined && forced !== "") {
    const n = Number(forced);
    if (!Number.isNaN(n)) confidence = n;
  }
  return {
    $metadata: { httpStatusCode: 200 },
    ExpenseDocuments: [
      {
        SummaryFields: [{ ValueDetection: { Confidence: confidence } }],
      },
    ],
  };
}
