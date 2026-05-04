import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { emitInvoiceOutcome } from "../shared/outcomes";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type In = {
  action: "APPROVE";
  invoiceId: string;
  editedFields?: Record<string, unknown>;
};

export const handler = async (input: In) => {
  const tableName = process.env.INVOICES_TABLE_NAME!;
  const bus = process.env.EVENT_BUS_NAME!;

  const cur = await doc.send(new GetCommand({ TableName: tableName, Key: { invoiceId: input.invoiceId } }));
  const stage = (cur.Item?.stage as string) ?? "dev";

  await doc.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { invoiceId: input.invoiceId },
      UpdateExpression:
        "SET #st = :st, resolvedAt = :t, updatedAt = :t, editedFields = :ef REMOVE taskToken, reviewSessionId",
      ExpressionAttributeNames: { "#st": "status" },
      ExpressionAttributeValues: {
        ":st": "APPROVED",
        ":t": new Date().toISOString(),
        ":ef": input.editedFields ?? {},
      },
    }),
  );

  await emitInvoiceOutcome({
    eventBusName: bus,
    invoiceId: input.invoiceId,
    outcome: "APPROVED",
    stage,
  });

  return { invoiceId: input.invoiceId, status: "APPROVED" };
};
