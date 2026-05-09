import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { randomUUID } from "crypto";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});

/** Payload includes Step Functions callback token as `taskToken` when using WAIT_FOR_TASK_TOKEN. */
type Ev = {
  bucket: string;
  key: string;
  invoiceId: string;
  stage: string;
  minConfidence: number;
  /** When true, reviewer must correct/verify OCR on the SPA before approving. */
  manualVerificationRequired: boolean;
  taskToken: string;
};

export const handler = async (event: Ev) => {
  const tableName = process.env.INVOICES_TABLE_NAME!;
  const from = process.env.SES_FROM_ADDRESS!;
  const spaBase = process.env.SPA_BASE_URL!;
  const notifyList = (process.env.HUMAN_REVIEW_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const token = event.taskToken;
  if (!token) throw new Error("Missing Step Functions task token");

  if (!notifyList.length) {
    console.warn("No HUMAN_REVIEW_EMAILS configured; skipping SES send");
  }

  const reviewSessionId = randomUUID();
  await doc.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { invoiceId: event.invoiceId },
      UpdateExpression:
        "SET reviewSessionId = :rs, taskToken = :tt, #st = :st, updatedAt = :u",
      ExpressionAttributeNames: { "#st": "status" },
      ExpressionAttributeValues: {
        ":rs": reviewSessionId,
        ":tt": token,
        ":st": "AWAITING_HUMAN",
        ":u": new Date().toISOString(),
      },
    }),
  );

  const approveUrl = `${spaBase}/?invoiceId=${encodeURIComponent(event.invoiceId)}&session=${encodeURIComponent(reviewSessionId)}`;

  if (process.env.STAGE === "local") {
    console.log(
      `[invoice-notify local] Review URL (open in browser; also sent via SES when configured): ${approveUrl}`,
    );
  }

  const modeHint = event.manualVerificationRequired
    ? "Manual verification is required: please check and correct the extracted values on the form, then approve or reject."
    : "OCR confidence is high: values are pre-verified; please review and explicitly approve or reject (no auto-approval).";

  const bodyText = [
    `Invoice ${event.invoiceId} is ready for your decision.`,
    modeHint,
    `Lowest field confidence: ${event.minConfidence.toFixed(1)}.`,
    `Open the form: ${approveUrl}`,
    ``,
    `This link is single-session and should be treated as sensitive.`,
  ].join("\n");

  if (notifyList.length) {
    await ses.send(
      new SendEmailCommand({
        Source: from,
        Destination: { ToAddresses: notifyList },
        Message: {
          Subject: { Data: `[Invoice] Action required — ${event.invoiceId}` },
          Body: { Text: { Data: bodyText } },
        },
      }),
    );
  }

  return { notified: true, reviewSessionId };
};
