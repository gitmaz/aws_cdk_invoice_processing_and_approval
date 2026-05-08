import { afterEach, describe, expect, it } from "vitest";
import { minConfidenceFromAnalyze, mockAnalyzeExpenseOutput } from "./textract-helpers";

describe("mockAnalyzeExpenseOutput", () => {
  afterEach(() => {
    delete process.env.MOCK_TEXTRACT_MIN_CONFIDENCE;
  });

  it("returns AnalyzeExpense-shaped output with default confidence 90", () => {
    const out = mockAnalyzeExpenseOutput();
    expect(minConfidenceFromAnalyze(out)).toBe(90);
  });

  it("honors MOCK_TEXTRACT_MIN_CONFIDENCE for manual-verification scenarios", () => {
    process.env.MOCK_TEXTRACT_MIN_CONFIDENCE = "40";
    const out = mockAnalyzeExpenseOutput();
    expect(minConfidenceFromAnalyze(out)).toBe(40);
  });
});
