import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDocClient } from "./aws-clients";

export type ReviewKeys = { invoiceId: string; reviewSessionId: string };

/**
 * Poll DynamoDB until an invoice reaches AWAITING_HUMAN after upload (notify-human completed).
 */
export async function waitForAwaitingHumanReview(params: {
  tableName: string;
  /** Prefer rows updated after this time (ms since epoch), with skew allowance */
  notBeforeMs: number;
  pollMs?: number;
  timeoutMs?: number;
  /** Shown on timeout (e.g. `stage=local` vs `stage=dev`). */
  stageHint?: string;
}): Promise<ReviewKeys> {
  const {
    tableName,
    notBeforeMs,
    pollMs = 2000,
    timeoutMs = 120_000,
    stageHint = "local",
  } = params;
  const deadline = Date.now() + timeoutMs;
  const skewMs = 60_000;

  while (Date.now() < deadline) {
    const res = await dynamoDocClient().send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: "#st = :st",
        ExpressionAttributeNames: { "#st": "status" },
        ExpressionAttributeValues: { ":st": "AWAITING_HUMAN" },
      }),
    );

    const items = (res.Items ?? []).filter((item) => {
      const u = item.updatedAt;
      if (typeof u !== "string") return false;
      const ts = Date.parse(u);
      return Number.isFinite(ts) && ts >= notBeforeMs - skewMs;
    });

    items.sort((a, b) => Date.parse(String(b.updatedAt)) - Date.parse(String(a.updatedAt)));

    const top = items[0];
    if (top?.invoiceId && top?.reviewSessionId) {
      return {
        invoiceId: String(top.invoiceId),
        reviewSessionId: String(top.reviewSessionId),
      };
    }

    await new Promise((r) => setTimeout(r, pollMs));
  }

  throw new Error(
    `Timeout (${timeoutMs}ms) waiting for status AWAITING_HUMAN on ${tableName} (${stageHint}). ` +
      `Check pipeline (S3→SQS→Step Functions), IAM (DynamoDB Scan), and PLAYWRIGHT_REVIEW_TIMEOUT_MS.`,
  );
}
