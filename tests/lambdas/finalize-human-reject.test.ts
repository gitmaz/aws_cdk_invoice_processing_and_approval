/**
 * Lambda confidence — finalize human reject (DynamoDB + SES when configured + EventBridge).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ddbSend, sesSend, mockEmit } = vi.hoisted(() => ({
  ddbSend: vi.fn(),
  sesSend: vi.fn(),
  mockEmit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class MockDdb {},
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send: ddbSend }),
  },
  GetCommand: vi.fn((input: unknown) => input),
  UpdateCommand: vi.fn((input: unknown) => input),
}));

vi.mock("@aws-sdk/client-ses", () => ({
  SESClient: class MockSes {
    send = sesSend;
  },
  SendEmailCommand: vi.fn((input: unknown) => input),
}));

vi.mock("../../lambda/shared/outcomes", () => ({
  emitInvoiceOutcome: mockEmit,
}));

import { handler } from "../../lambda/finalize-human-reject/index";

describe("finalize-human-reject handler", () => {
  beforeEach(() => {
    ddbSend.mockReset();
    sesSend.mockReset();
    mockEmit.mockClear();
    process.env.INVOICES_TABLE_NAME = "inv-table";
    process.env.EVENT_BUS_NAME = "invoice-events-dev";
    process.env.SES_FROM_ADDRESS = "from@example.com";
    process.env.REJECTION_NOTIFY_EMAILS = "";
  });

  it("updates REJECTED, emits outcome; skips SES when recipient list empty", async () => {
    ddbSend.mockResolvedValueOnce({ Item: { invoiceId: "i2", stage: "dev" } }).mockResolvedValueOnce({});

    const out = await handler({
      action: "REJECT",
      invoiceId: "i2",
      reason: "invalid VAT",
    });

    expect(out.status).toBe("REJECTED");
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "REJECTED",
        invoiceId: "i2",
        stage: "dev",
        reason: "invalid VAT",
      }),
    );
    expect(sesSend).not.toHaveBeenCalled();
  });

  it("sends SES when REJECTION_NOTIFY_EMAILS is set", async () => {
    process.env.REJECTION_NOTIFY_EMAILS = "ops@example.com";
    ddbSend.mockResolvedValueOnce({ Item: { invoiceId: "i3", stage: "dev" } }).mockResolvedValueOnce({});
    sesSend.mockResolvedValue({});

    await handler({ action: "REJECT", invoiceId: "i3", reason: "no" });

    expect(sesSend).toHaveBeenCalledTimes(1);
  });
});
