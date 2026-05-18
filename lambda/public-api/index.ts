import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SFNClient, SendTaskSuccessCommand } from "@aws-sdk/client-sfn";
import type { APIGatewayProxyResultV2 } from "aws-lambda";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sfn = new SFNClient({});
const s3 = new S3Client({});

async function presignedDocumentUrl(bucket: string, key: string): Promise<string | undefined> {
  if (!bucket || !key) return undefined;
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 900 },
  );
}

function contentTypeFromKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  },
  body: JSON.stringify(body),
});

export const handler = async (event: any): Promise<APIGatewayProxyResultV2> => {
  const tableName = process.env.INVOICES_TABLE_NAME!;
  const e = event as any;
  const method = e?.requestContext?.http?.method ?? e?.httpMethod ?? "";
  const path = e?.rawPath ?? e?.path ?? "";

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

    const bucket = String(item.bucket ?? "");
    const objectKey = String(item.objectKey ?? "");
    const documentUrl = await presignedDocumentUrl(bucket, objectKey);

    return json(200, {
      invoiceId,
      minConfidence: item.minConfidence,
      status: item.status,
      /** false = high OCR confidence: show approval-only UI; true = require manual field verification before approve. */
      manualVerificationRequired: item.manualVerificationRequired === true,
      ocrSummary: ocr,
      documentUrl,
      documentContentType: objectKey ? contentTypeFromKey(objectKey) : undefined,
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
