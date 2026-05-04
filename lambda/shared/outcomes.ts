import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";

const eb = new EventBridgeClient({});

export async function emitInvoiceOutcome(params: {
  eventBusName: string;
  invoiceId: string;
  outcome: "AUTO_APPROVED" | "APPROVED" | "REJECTED";
  stage: string;
  reason?: string;
}): Promise<void> {
  await eb.send(
    new PutEventsCommand({
      Entries: [
        {
          EventBusName: params.eventBusName,
          Source: "invoice.processing",
          DetailType: "InvoiceOutcome",
          Detail: JSON.stringify({
            invoiceId: params.invoiceId,
            outcome: params.outcome,
            stage: params.stage,
            reason: params.reason,
            ts: new Date().toISOString(),
          }),
        },
      ],
    }),
  );
}
