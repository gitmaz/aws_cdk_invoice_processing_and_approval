/**
 * Lambda confidence — `validate` (S3 + Textract + threshold → `manualVerificationRequired`).
 * All AWS clients mocked; no network.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { s3Send, textractSend, ddbSend } = vi.hoisted(() => ({
  s3Send: vi.fn(),
  textractSend: vi.fn(),
  ddbSend: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class MockS3 {
    send = s3Send;
  },
  GetObjectCommand: vi.fn((input: unknown) => input),
}));

vi.mock("@aws-sdk/client-textract", () => ({
  TextractClient: class MockTextract {
    send = textractSend;
  },
  AnalyzeExpenseCommand: vi.fn((input: unknown) => input),
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class MockDdb {},
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send: ddbSend }),
  },
  PutCommand: vi.fn((input: unknown) => input),
}));

import { handler } from "../../lambda/validate/index";

describe("validate handler", () => {
  beforeEach(() => {
    s3Send.mockReset();
    textractSend.mockReset();
    ddbSend.mockReset();
    delete process.env.MOCK_TEXTRACT;
    delete process.env.MOCK_TEXTRACT_MIN_CONFIDENCE;
    process.env.INVOICES_TABLE_NAME = "invoice-records-test";
    process.env.OCR_CONFIDENCE_THRESHOLD = "85";

    s3Send.mockResolvedValue({
      Body: {
        transformToByteArray: async () => new Uint8Array([1, 2, 3]),
      },
    });
    ddbSend.mockResolvedValue({});
  });

  it("sets manualVerificationRequired false when min field confidence is at/above threshold", async () => {
    textractSend.mockResolvedValue({
      ExpenseDocuments: [
        {
          SummaryFields: [{ ValueDetection: { Confidence: 92 } }, { ValueDetection: { Confidence: 95 } }],
        },
      ],
    });

    const out = await handler({
      bucket: "b",
      key: "k.png",
      invoiceId: "inv-high",
      stage: "dev",
    });

    expect(out.manualVerificationRequired).toBe(false);
    expect(out.minConfidence).toBe(92);
    expect(ddbSend).toHaveBeenCalledTimes(1);
    const put = ddbSend.mock.calls[0][0] as { Item?: Record<string, unknown> };
    expect(put.Item?.manualVerificationRequired).toBe(false);
    expect(put.Item?.status).toBe("PENDING_HUMAN_APPROVAL");
  });

  it("sets manualVerificationRequired true when confidence is below threshold", async () => {
    textractSend.mockResolvedValue({
      ExpenseDocuments: [
        {
          SummaryFields: [{ ValueDetection: { Confidence: 72 } }],
        },
      ],
    });

    const out = await handler({
      bucket: "b",
      key: "k.png",
      invoiceId: "inv-low",
      stage: "dev",
    });

    expect(out.manualVerificationRequired).toBe(true);
    expect(out.minConfidence).toBe(72);
    const put = ddbSend.mock.calls[0][0] as { Item?: Record<string, unknown> };
    expect(put.Item?.manualVerificationRequired).toBe(true);
  });

  it("throws when S3 body is empty", async () => {
    s3Send.mockResolvedValue({
      Body: {
        transformToByteArray: async () => new Uint8Array(),
      },
    });
    textractSend.mockResolvedValue({ ExpenseDocuments: [] });

    await expect(
      handler({ bucket: "b", key: "k", invoiceId: "inv-empty", stage: "dev" }),
    ).rejects.toThrow(/Empty S3 object/);
  });

  it("skips Textract and uses mock OCR when MOCK_TEXTRACT=1 (LocalStack path)", async () => {
    vi.resetModules();
    process.env.MOCK_TEXTRACT = "1";
    process.env.MOCK_TEXTRACT_MIN_CONFIDENCE = "88";
    process.env.INVOICES_TABLE_NAME = "invoice-records-test";
    process.env.OCR_CONFIDENCE_THRESHOLD = "85";
    s3Send.mockResolvedValue({
      Body: {
        transformToByteArray: async () => new Uint8Array([1, 2, 3]),
      },
    });
    ddbSend.mockResolvedValue({});

    const { handler: h } = await import("../../lambda/validate/index");

    const out = await h({
      bucket: "b",
      key: "k.png",
      invoiceId: "inv-mock",
      stage: "local",
    });

    expect(textractSend).not.toHaveBeenCalled();
    expect(out.minConfidence).toBe(88);
    expect(out.manualVerificationRequired).toBe(false);
  });
});
