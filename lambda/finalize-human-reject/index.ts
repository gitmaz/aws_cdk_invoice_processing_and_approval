import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { emitInvoiceOutcome } from "../shared/outcomes";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});

type In = {
  action: "REJECT";
  invoiceId: string;
  reason?: string;
};

export const handler = async (input: In) => {
  const tableName = process.env.INVOICES_TABLE_NAME!;
  const bus = process.env.EVENT_BUS_NAME!;
  const from = process.env.SES_FROM_ADDRESS!;
  const rejectionList = (process.env.REJECTION_NOTIFY_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const cur = await doc.send(new GetCommand({ TableName: tableName, Key: { invoiceId: input.invoiceId } }));
  const stage = (cur.Item?.stage as string) ?? "dev";

  await doc.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { invoiceId: input.invoiceId },
      UpdateExpression:
        "SET #st = :st, resolvedAt = :t, updatedAt = :t, rejectReason = :r REMOVE taskToken, reviewSessionId",
      ExpressionAttributeNames: { "#st": "status" },
      ExpressionAttributeValues: {
        ":st": "REJECTED",
        ":t": new Date().toISOString(),
        ":r": input.reason ?? "",
      },
    }),
  );

  await emitInvoiceOutcome({
    eventBusName: bus,
    invoiceId: input.invoiceId,
    outcome: "REJECTED",
    stage,
    reason: input.reason,
  });

  const body = [
    `Invoice ${input.invoiceId} was rejected.`,
    input.reason ? `Reason: ${input.reason}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (rejectionList.length) {
    await ses.send(
      new SendEmailCommand({
        Source: from,
        Destination: { ToAddresses: rejectionList },
        Message: {
          Subject: { Data: `[Invoice] Rejected — ${input.invoiceId}` },
          Body: { Text: { Data: body } },
        },
      }),
    );
  }

  return { invoiceId: input.invoiceId, status: "REJECTED" };
};
