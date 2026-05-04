import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "crypto";

const s3 = new S3Client({});

const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** Authenticated user uploads: POST JSON { contentType?: string } → presigned PUT URL + GET URL for processing. */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const bucket = process.env.INVOICES_BUCKET_NAME!;
  const stage = process.env.STAGE!;

  const ctx = event.requestContext as unknown as {
    authorizer?: { jwt?: { claims?: Record<string, string> } };
  };
  const sub = ctx.authorizer?.jwt?.claims?.sub ?? "unknown-user";

  const body = event.body ? JSON.parse(event.body) : {};
  const contentType = (body.contentType as string) || "application/octet-stream";
  const ext = contentType.includes("pdf") ? "pdf" : contentType.includes("png") ? "png" : "jpg";
  const key = `uploads/${stage}/${sub}/${randomUUID()}.${ext}`;

  const putUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 900 },
  );

  const getUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 900 },
  );

  return json(200, {
    uploadUrl: putUrl,
    objectKey: key,
    bucket,
    headUrl: getUrl,
  });
};
