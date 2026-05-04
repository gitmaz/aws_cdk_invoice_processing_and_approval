/**
 * Lambda confidence — shared `emitInvoiceOutcome` (EventBridge PutEvents).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ebSend } = vi.hoisted(() => ({ ebSend: vi.fn() }));

vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class MockEb {
    send = ebSend;
  },
  PutEventsCommand: vi.fn((input: unknown) => input),
}));

import { emitInvoiceOutcome } from "../../lambda/shared/outcomes";

describe("emitInvoiceOutcome", () => {
  beforeEach(() => {
    ebSend.mockReset();
    ebSend.mockResolvedValue({});
  });

  it("sends PutEvents with InvoiceOutcome detail", async () => {
    await emitInvoiceOutcome({
      eventBusName: "bus-1",
      invoiceId: "inv-9",
      outcome: "APPROVED",
      stage: "dev",
    });

    expect(ebSend).toHaveBeenCalledTimes(1);
    const cmd = ebSend.mock.calls[0][0] as {
      Entries?: Array<{ EventBusName?: string; Source?: string; DetailType?: string; Detail?: string }>;
    };
    const entry = cmd.Entries?.[0];
    expect(entry?.EventBusName).toBe("bus-1");
    expect(entry?.Source).toBe("invoice.processing");
    expect(entry?.DetailType).toBe("InvoiceOutcome");
    const detail = JSON.parse(entry?.Detail ?? "{}") as { invoiceId: string; outcome: string };
    expect(detail.invoiceId).toBe("inv-9");
    expect(detail.outcome).toBe("APPROVED");
  });
});
