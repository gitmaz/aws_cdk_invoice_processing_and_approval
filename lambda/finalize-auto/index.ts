import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { emitInvoiceOutcome } from "../shared/outcomes";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type In = {
  validated: {
    invoiceId: string;
    stage: string;
    minConfidence: number;
  };
};

export const handler = async (input: In) => {
  const tableName = process.env.INVOICES_TABLE_NAME!;
  const bus = process.env.EVENT_BUS_NAME!;
  const id = input.validated.invoiceId;

  await doc.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { invoiceId: id },
      UpdateExpression: "SET #st = :st, resolvedAt = :t, updatedAt = :t",
      ExpressionAttributeNames: { "#st": "status" },
      ExpressionAttributeValues: {
        ":st": "AUTO_APPROVED",
        ":t": new Date().toISOString(),
      },
    }),
  );

  await emitInvoiceOutcome({
    eventBusName: bus,
    invoiceId: id,
    outcome: "AUTO_APPROVED",
    stage: input.validated.stage,
  });

  return { invoiceId: id, status: "AUTO_APPROVED" };
};
