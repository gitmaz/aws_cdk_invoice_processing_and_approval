/**
 * Lambda confidence — finalize human approve (DynamoDB + EventBridge outcome).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ddbSend, mockEmit } = vi.hoisted(() => ({
  ddbSend: vi.fn(),
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

vi.mock("../../lambda/shared/outcomes", () => ({
  emitInvoiceOutcome: mockEmit,
}));

import { handler } from "../../lambda/finalize-human-approve/index";

describe("finalize-human-approve handler", () => {
  beforeEach(() => {
    ddbSend.mockReset();
    mockEmit.mockClear();
    process.env.INVOICES_TABLE_NAME = "inv-table";
    process.env.EVENT_BUS_NAME = "invoice-events-dev";
  });

  it("loads stage from invoice, updates status APPROVED, emits APPROVED outcome", async () => {
    ddbSend
      .mockResolvedValueOnce({ Item: { invoiceId: "i1", stage: "test" } })
      .mockResolvedValueOnce({});

    const out = await handler({
      action: "APPROVE",
      invoiceId: "i1",
      editedFields: { total: 100 },
    });

    expect(out.status).toBe("APPROVED");
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "APPROVED",
        invoiceId: "i1",
        stage: "test",
        eventBusName: "invoice-events-dev",
      }),
    );
    expect(ddbSend).toHaveBeenCalledTimes(2);
  });
});
