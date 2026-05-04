import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import type { SQSEvent } from "aws-lambda";
import { randomUUID } from "crypto";

const sfn = new SFNClient({});

export const handler = async (event: SQSEvent): Promise<void> => {
  const machineArn = process.env.STATE_MACHINE_ARN!;
  const stage = process.env.STAGE!;

  for (const record of event.Records) {
    const body = JSON.parse(record.body) as {
      Records?: Array<{ s3: { bucket: { name: string }; object: { key: string } } }>;
    };
    const s3Rec = body.Records?.[0]?.s3;
    if (!s3Rec) continue;

    const bucket = s3Rec.bucket.name;
    const key = decodeURIComponent(s3Rec.object.key.replace(/\+/g, " "));
    const invoiceId = randomUUID();

    await sfn.send(
      new StartExecutionCommand({
        stateMachineArn: machineArn,
        name: `${invoiceId}-${Date.now()}`.replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 80),
        input: JSON.stringify({
          bucket,
          key,
          invoiceId,
          stage,
        }),
      }),
    );
  }
};
