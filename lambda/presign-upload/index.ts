import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "crypto";

function s3ClientFor(stage: string): S3Client {
  if (stage !== "local") return new S3Client({});

  // Important for local E2E: the presigned URL must be reachable from the test runner.
  // LocalStack often runs in Docker; its internal IP (172.17.*) is not reachable from the Windows host.
  // We sign against a "public" edge endpoint instead (defaults to localhost).
  const endpoint =
    process.env.PRESIGN_PUBLIC_S3_ENDPOINT ??
    process.env.PRESIGN_PUBLIC_ENDPOINT ??
    process.env.PUBLIC_AWS_ENDPOINT_URL ??
    "http://localhost:4566";

  return new S3Client({
    endpoint,
    forcePathStyle: true,
  });
}

const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  },
  body: JSON.stringify(body),
});

/** Authenticated user uploads: POST JSON { contentType?: string } → presigned PUT URL + GET URL for processing. */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const bucket = process.env.INVOICES_BUCKET_NAME!;
  const stage = process.env.STAGE!;
  const presignLocalSecret = process.env.PRESIGN_LOCAL_SECRET;
  const s3 = s3ClientFor(stage);

  const ctx = event.requestContext as unknown as {
    authorizer?: { jwt?: { claims?: Record<string, string> } };
  };
  const jwtSub = ctx.authorizer?.jwt?.claims?.sub;

  let sub: string;
  if (stage === "local") {
    if (!presignLocalSecret) {
      return json(500, {
        error: "Misconfigured: PRESIGN_LOCAL_SECRET must be set on the presign Lambda when stage=local.",
      });
    }
    const headerSecret =
      event.headers?.["x-presign-local-secret"] ?? event.headers?.["X-Presign-Local-Secret"] ?? "";
    if (headerSecret === presignLocalSecret) {
      sub = "local-upload";
    } else if (jwtSub) {
      sub = jwtSub;
    } else {
      return json(401, {
        error:
          "Unauthorized: send header x-presign-local-secret matching stack config (recommended for LocalStack Community), or call with JWT if your API authorizer populates claims.",
      });
    }
  } else {
    if (!jwtSub) {
      return json(401, { error: "Unauthorized" });
    }
    sub = jwtSub;
  }

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
