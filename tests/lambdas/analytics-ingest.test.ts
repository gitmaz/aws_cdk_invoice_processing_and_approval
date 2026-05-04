/**
 * Lambda confidence — analytics-ingest (EventBridge → DynamoDB counters).
 */
import type { EventBridgeEvent } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ddbSend } = vi.hoisted(() => ({ ddbSend: vi.fn() }));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class MockDdb {},
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send: ddbSend }),
  },
  UpdateCommand: vi.fn((input: unknown) => input),
}));

import { handler, type InvoiceOutcomeDetail } from "../../lambda/analytics-ingest/index";

describe("analytics-ingest handler", () => {
  beforeEach(() => {
    ddbSend.mockReset();
    process.env.ANALYTICS_TABLE_NAME = "analytics-table";
    process.env.STAGE = "dev";
  });

  function evt(detail: InvoiceOutcomeDetail): EventBridgeEvent<string, InvoiceOutcomeDetail> {
    return {
      version: "0",
      id: "e1",
      "detail-type": "InvoiceOutcome",
      source: "invoice.processing",
      account: "",
      time: "",
      region: "",
      resources: [],
      detail,
    };
  }

  it("increments approved counter on TOTALS and DAY# keys", async () => {
    ddbSend.mockResolvedValue({});

    await handler(
      evt({
        invoiceId: "x",
        outcome: "APPROVED",
        stage: "dev",
      }),
    );

    expect(ddbSend).toHaveBeenCalledTimes(2);
    const totals = ddbSend.mock.calls[0][0] as {
      Key?: { pk?: string; sk?: string };
      ExpressionAttributeNames?: Record<string, string>;
    };
    expect(totals.Key?.pk).toBe("STAGE#dev");
    expect(totals.Key?.sk).toBe("TOTALS");
    expect(totals.ExpressionAttributeNames?.["#c"]).toBe("approved");
  });

  it("uses rejected counter for REJECTED outcome", async () => {
    ddbSend.mockResolvedValue({});

    await handler(
      evt({
        invoiceId: "y",
        outcome: "REJECTED",
        stage: "dev",
      }),
    );

    const totals = ddbSend.mock.calls[0][0] as { ExpressionAttributeNames?: Record<string, string> };
    expect(totals.ExpressionAttributeNames?.["#c"]).toBe("rejected");
  });
});
