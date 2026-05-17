import { getApiBase, getPresignLocalSecret, isLocalPresignMode } from "../config";

export type PresignResponse = {
  uploadUrl: string;
  objectKey?: string;
  bucket?: string;
  headUrl?: string;
};

export async function presignUpload(contentType: string, idToken?: string): Promise<PresignResponse> {
  const apiBase = getApiBase();
  if (!apiBase) throw new Error("API base URL is not configured (VITE_API_BASE_URL or ?apiBase=).");

  const headers: Record<string, string> = { "content-type": "application/json" };
  const localSecret = getPresignLocalSecret();

  if (isLocalPresignMode() && localSecret) {
    headers["x-presign-local-secret"] = localSecret;
  } else if (idToken) {
    headers.authorization = `Bearer ${idToken}`;
  } else {
    throw new Error("Sign in required, or set VITE_PRESIGN_LOCAL_SECRET for local uploads.");
  }

  const res = await fetch(`${apiBase}/upload/presign`, {
    method: "POST",
    headers,
    body: JSON.stringify({ contentType }),
  });
  const body = (await res.json()) as PresignResponse & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Presign failed (${res.status})`);
  if (!body.uploadUrl) throw new Error("Presign response missing uploadUrl.");
  return body;
}

export async function putToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`S3 upload failed (${res.status}): ${t.slice(0, 200)}`);
  }
}

/** LocalStack only — starts Step Functions after S3 PUT when notifications are unreliable. */
export async function completeLocalUpload(bucket: string, key: string): Promise<{ invoiceId?: string }> {
  const apiBase = getApiBase();
  const localSecret = getPresignLocalSecret();
  if (!localSecret) throw new Error("VITE_PRESIGN_LOCAL_SECRET is required for upload complete.");

  const res = await fetch(`${apiBase}/upload/complete`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-presign-local-secret": localSecret,
    },
    body: JSON.stringify({ bucket, key }),
  });
  const body = (await res.json()) as { invoiceId?: string; error?: string };
  if (!res.ok) throw new Error(body.error ?? `Upload complete failed (${res.status})`);
  return body;
}

export async function uploadInvoiceFile(file: File, idToken?: string): Promise<void> {
  const contentType = file.type || "application/octet-stream";
  const presign = await presignUpload(contentType, idToken);
  await putToPresignedUrl(presign.uploadUrl, file);

  if (isLocalPresignMode() && presign.bucket && presign.objectKey) {
    await completeLocalUpload(presign.bucket, presign.objectKey);
  }
}
