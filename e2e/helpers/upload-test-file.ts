/** Minimal valid PNG (1×1 pixel) for S3 upload smoke tests */
export const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export type PresignUploadMode = "local-secret" | "cognito-jwt";

export async function presignAndUpload(params: {
  apiBaseUrl: string;
  mode: PresignUploadMode;
  /** Required when `mode` is `local-secret` (LocalStack `stage=local`). */
  presignLocalSecret?: string;
  /** Required when `mode` is `cognito-jwt` (deployed dev/test/prod). */
  idToken?: string;
  body?: Buffer;
  contentType?: string;
}): Promise<void> {
  const {
    apiBaseUrl,
    mode,
    presignLocalSecret,
    idToken,
    body = MINIMAL_PNG,
    contentType = "image/png",
  } = params;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (mode === "local-secret") {
    if (!presignLocalSecret) {
      throw new Error("presignAndUpload(local-secret): presignLocalSecret is required");
    }
    headers["x-presign-local-secret"] = presignLocalSecret;
  } else {
    if (!idToken) {
      throw new Error("presignAndUpload(cognito-jwt): idToken is required");
    }
    headers.authorization = `Bearer ${idToken}`;
  }

  const presignRes = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/upload/presign`, {
    method: "POST",
    headers,
    body: JSON.stringify({ contentType }),
  });
  if (!presignRes.ok) {
    const t = await presignRes.text();
    throw new Error(`presign failed ${presignRes.status}: ${t}`);
  }
  const presignJson = (await presignRes.json()) as {
    uploadUrl?: string;
    bucket?: string;
    objectKey?: string;
  };
  const uploadUrl = presignJson.uploadUrl;
  if (!uploadUrl) throw new Error("presign response missing uploadUrl");

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body,
  });
  if (!putRes.ok) {
    const t = await putRes.text();
    throw new Error(`S3 PUT failed ${putRes.status}: ${t}`);
  }

  // LocalStack Community: S3 → SQS notifications are not consistently applied via CDK/CloudFormation.
  if (mode === "local-secret" && presignJson.bucket && presignJson.objectKey) {
    const completeRes = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/upload/complete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-presign-local-secret": presignLocalSecret!,
      },
      body: JSON.stringify({ bucket: presignJson.bucket, key: presignJson.objectKey }),
    });
    if (!completeRes.ok) {
      const t = await completeRes.text();
      throw new Error(`upload complete failed ${completeRes.status}: ${t}`);
    }
  }
}
