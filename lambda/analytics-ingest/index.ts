import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { EventBridgeEvent } from "aws-lambda";

const tableName = process.env.ANALYTICS_TABLE_NAME!;
const stage = process.env.STAGE ?? "dev";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type InvoiceOutcomeDetail = {
  invoiceId: string;
  outcome: "AUTO_APPROVED" | "APPROVED" | "REJECTED";
  stage: string;
  reason?: string;
  ts?: string;
};

export const handler = async (event: EventBridgeEvent<string, InvoiceOutcomeDetail>) => {
  const d = event.detail;
  const day = new Date().toISOString().slice(0, 10);
  const pk = `STAGE#${stage}`;
  const counterAttr =
    d.outcome === "AUTO_APPROVED"
      ? "autoApproved"
      : d.outcome === "APPROVED"
        ? "approved"
        : "rejected";

  await doc.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { pk, sk: "TOTALS" },
      UpdateExpression: `ADD #c :one SET #updated = :now`,
      ExpressionAttributeNames: { "#c": counterAttr, "#updated": "updatedAt" },
      ExpressionAttributeValues: { ":one": 1, ":now": new Date().toISOString() },
    }),
  );

  await doc.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { pk, sk: `DAY#${day}` },
      UpdateExpression: `ADD #c :one SET #updated = :now`,
      ExpressionAttributeNames: { "#c": counterAttr, "#updated": "updatedAt" },
      ExpressionAttributeValues: { ":one": 1, ":now": new Date().toISOString() },
    }),
  );
};
