import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { SFNClient, SendTaskSuccessCommand } from "@aws-sdk/client-sfn";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sfn = new SFNClient({});

const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const tableName = process.env.INVOICES_TABLE_NAME!;
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  if (method === "GET" && path.includes("/public/invoice/")) {
    const invoiceId = event.pathParameters?.invoiceId;
    const session = event.queryStringParameters?.session;
    if (!invoiceId || !session) return json(400, { error: "invoiceId and session are required" });

    const rec = await doc.send(new GetCommand({ TableName: tableName, Key: { invoiceId } }));
    const item = rec.Item;
    if (!item) return json(404, { error: "Not found" });
    if (item.reviewSessionId !== session) return json(403, { error: "Invalid session" });
    if (item.status !== "AWAITING_HUMAN") return json(409, { error: "Invoice is not awaiting review" });

    let ocr: unknown = undefined;
    try {
      ocr = item.ocrSummary ? JSON.parse(String(item.ocrSummary)) : undefined;
    } catch {
      ocr = item.ocrSummary;
    }

    return json(200, {
      invoiceId,
      minConfidence: item.minConfidence,
      status: item.status,
      /** false = high OCR confidence: show approval-only UI; true = require manual field verification before approve. */
      manualVerificationRequired: item.manualVerificationRequired === true,
      ocrSummary: ocr,
    });
  }

  if (method === "POST" && path.includes("/public/decision")) {
    const raw = event.body ? JSON.parse(event.body) : {};
    const invoiceId = raw.invoiceId as string | undefined;
    const session = raw.session as string | undefined;
    const action = raw.action as "APPROVE" | "REJECT" | undefined;
    if (!invoiceId || !session || !action) {
      return json(400, { error: "invoiceId, session, and action are required" });
    }

    const rec = await doc.send(new GetCommand({ TableName: tableName, Key: { invoiceId } }));
    const item = rec.Item;
    if (!item) return json(404, { error: "Not found" });
    if (item.reviewSessionId !== session) return json(403, { error: "Invalid session" });
    const token = item.taskToken as string | undefined;
    if (!token) return json(409, { error: "No pending task token" });

    const output =
      action === "APPROVE"
        ? {
            action: "APPROVE" as const,
            invoiceId,
            editedFields: (raw.editedFields as Record<string, unknown>) ?? {},
          }
        : {
            action: "REJECT" as const,
            invoiceId,
            reason: (raw.reason as string) ?? "",
          };

    await sfn.send(
      new SendTaskSuccessCommand({
        taskToken: token,
        output: JSON.stringify(output),
      }),
    );

    return json(200, { ok: true });
  }

  return json(405, { error: "Method not allowed" });
};
