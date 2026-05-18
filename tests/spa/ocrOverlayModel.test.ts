import { describe, expect, it } from "vitest";
import {
  applyOverlayFieldsToOcrSummary,
  overlayFieldsFromOcrSummary,
} from "../../spa/src/review/ocrOverlayModel";

describe("ocrOverlayModel", () => {
  it("extracts summary fields with bounding boxes", () => {
    const ocr = {
      expenseDocuments: [
        {
          SummaryFields: [
            {
              Type: { Text: "TOTAL" },
              ValueDetection: {
                Text: "760.10",
                Confidence: 72,
                Geometry: { BoundingBox: { Left: 0.5, Top: 0.8, Width: 0.2, Height: 0.04 } },
              },
            },
          ],
        },
      ],
    };
    const fields = overlayFieldsFromOcrSummary(ocr);
    expect(fields).toHaveLength(1);
    expect(fields[0]?.label).toBe("TOTAL");
    expect(fields[0]?.value).toBe("760.10");

    fields[0]!.value = "761.00";
    const patched = applyOverlayFieldsToOcrSummary(ocr, fields) as typeof ocr;
    expect(patched.expenseDocuments[0]?.SummaryFields[0]?.ValueDetection?.Text).toBe("761.00");
  });
});
