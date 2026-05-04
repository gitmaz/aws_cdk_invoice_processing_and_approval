import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { AnalyzeExpenseCommand, TextractClient, type AnalyzeExpenseCommandOutput } from "@aws-sdk/client-textract";

const s3 = new S3Client({});
const textract = new TextractClient({});
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type In = {
  bucket: string;
  key: string;
  invoiceId: string;
  stage: string;
};

function minConfidenceFromAnalyze(output: AnalyzeExpenseCommandOutput): number {
  let min = 100;
  for (const doc of output.ExpenseDocuments ?? []) {
    for (const f of doc.SummaryFields ?? []) {
      const c = f.ValueDetection?.Confidence ?? 0;
      if (c > 0) min = Math.min(min, c);
    }
  }
  return min === 100 ? 0 : min;
}

export const handler = async (input: In) => {
  const tableName = process.env.INVOICES_TABLE_NAME!;
  const threshold = Number(process.env.OCR_CONFIDENCE_THRESHOLD ?? "85");

  const obj = await s3.send(new GetObjectCommand({ Bucket: input.bucket, Key: input.key }));
  const bytes = await obj.Body?.transformToByteArray();
  if (!bytes?.length) throw new Error("Empty S3 object");

  const analyze = await textract.send(
    new AnalyzeExpenseCommand({
      Document: { Bytes: Buffer.from(bytes) },
    }),
  );

  const minConfidence = minConfidenceFromAnalyze(analyze);
  /** Below threshold: SPA requires manual correction of OCR fields before approve. At/above: verification automatic; human still must approve. */
  const manualVerificationRequired = minConfidence < threshold;

  await doc.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        invoiceId: input.invoiceId,
        bucket: input.bucket,
        objectKey: input.key,
        stage: input.stage,
        status: "PENDING_HUMAN_APPROVAL",
        minConfidence,
        manualVerificationRequired,
        ocrSummary: JSON.stringify({
          expenseDocuments: analyze.ExpenseDocuments ?? [],
        }),
        updatedAt: new Date().toISOString(),
      },
    }),
  );

  return {
    ...input,
    minConfidence,
    manualVerificationRequired,
    threshold,
  };
};
