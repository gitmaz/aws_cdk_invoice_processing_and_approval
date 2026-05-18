import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { SFNClient, SendTaskSuccessCommand } from "@aws-sdk/client-sfn";
import type { APIGatewayProxyResultV2 } from "aws-lambda";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sfn = new SFNClient({});
const s3 = new S3Client({});

type ReviewRecord = {
  invoiceId: string;
  reviewSessionId: string;
  status: string;
  bucket?: string;
  objectKey?: string;
  minConfidence?: number;
  manualVerificationRequired?: boolean;
  ocrSummary?: string;
  taskToken?: string;
};

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

const binary = (statusCode: number, contentType: string, bytes: Uint8Array): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: {
    "content-type": contentType,
    "access-control-allow-origin": "*",
    "cache-control": "private, max-age=300",
  },
  body: Buffer.from(bytes).toString("base64"),
  isBase64Encoded: true,
});

function wantsDocumentResponse(
  method: string,
  path: string,
  query: Record<string, string | undefined> | null | undefined,
): boolean {
  if (method !== "GET" || !path.includes("/public/invoice/")) return false;
  if (path.endsWith("/document")) return true;
  const flag = query?.document?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}

async function loadReviewRecord(
  tableName: string,
  invoiceId: string,
  session: string,
): Promise<{ ok: true; item: ReviewRecord } | { ok: false; status: number; error: string }> {
  const rec = await doc.send(new GetCommand({ TableName: tableName, Key: { invoiceId } }));
  const item = rec.Item as ReviewRecord | undefined;
  if (!item) return { ok: false, status: 404, error: "Not found" };
  if (item.reviewSessionId !== session) return { ok: false, status: 403, error: "Invalid session" };
  if (item.status !== "AWAITING_HUMAN") return { ok: false, status: 409, error: "Invoice is not awaiting review" };
  return { ok: true, item };
}

function documentApiUrl(event: unknown, invoiceId: string, session: string): string | undefined {
  let apiBase = (process.env.PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
  if (!apiBase) {
    const e = event as { requestContext?: { domainName?: string } };
    const domain = e?.requestContext?.domainName;
    if (domain) apiBase = `https://${domain}`;
  }
  if (!apiBase) return undefined;
  const q = new URLSearchParams({ session, document: "1" });
  return `${apiBase}/public/invoice/${encodeURIComponent(invoiceId)}?${q.toString()}`;
}

export const handler = async (event: any): Promise<APIGatewayProxyResultV2> => {
  const tableName = process.env.INVOICES_TABLE_NAME!;
  const e = event as any;
  const method = e?.requestContext?.http?.method ?? e?.httpMethod ?? "";
  const path = e?.rawPath ?? e?.path ?? "";

  if (method === "GET" && path.includes("/public/invoice/")) {
    const invoiceId = event.pathParameters?.invoiceId as string | undefined;
    const session = event.queryStringParameters?.session as string | undefined;
    if (!invoiceId || !session) return json(400, { error: "invoiceId and session are required" });

    const loaded = await loadReviewRecord(tableName, invoiceId, session);
    if (!loaded.ok) return json(loaded.status, { error: loaded.error });
    const item = loaded.item;

    if (wantsDocumentResponse(method, path, event.queryStringParameters)) {
      const bucket = String(item.bucket ?? "");
      const objectKey = String(item.objectKey ?? "");
      if (!bucket || !objectKey) return json(404, { error: "Document not stored for this invoice" });

      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
      const bytes = await obj.Body?.transformToByteArray();
      if (!bytes?.length) return json(404, { error: "Empty document object" });

      const contentType = obj.ContentType ?? contentTypeFromKey(objectKey);
      return binary(200, contentType, bytes);
    }

    let ocr: unknown = undefined;
    try {
      ocr = item.ocrSummary ? JSON.parse(String(item.ocrSummary)) : undefined;
    } catch {
      ocr = item.ocrSummary;
    }

    const objectKey = String(item.objectKey ?? "");

    return json(200, {
      invoiceId,
      minConfidence: item.minConfidence,
      status: item.status,
      manualVerificationRequired: item.manualVerificationRequired === true,
      ocrSummary: ocr,
      documentUrl: documentApiUrl(event, invoiceId, session),
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

    const loaded = await loadReviewRecord(tableName, invoiceId, session);
    if (!loaded.ok) return json(loaded.status, { error: loaded.error });
    const item = loaded.item;
    const token = item.taskToken;
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
