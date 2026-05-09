import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "crypto";

const sfn = new SFNClient({});

const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  },
  body: JSON.stringify(body),
});

/**
 * LocalStack-only helper: after the client PUTs to S3, it calls this endpoint to kick off ingestion.
 *
 * Rationale: LocalStack Community does not reliably apply S3 → SQS notification configuration via
 * CloudFormation/CDK custom resources, so the automatic pipeline may not fire locally.
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const stage = process.env.STAGE!;
  if (stage !== "local") return json(404, { error: "Not found" });

  const presignLocalSecret = process.env.PRESIGN_LOCAL_SECRET;
  if (!presignLocalSecret) {
    return json(500, { error: "Misconfigured: PRESIGN_LOCAL_SECRET must be set for stage=local." });
  }

  const headerSecret =
    event.headers?.["x-presign-local-secret"] ?? event.headers?.["X-Presign-Local-Secret"] ?? "";
  if (headerSecret !== presignLocalSecret) {
    return json(401, { error: "Unauthorized" });
  }

  const machineArn = process.env.STATE_MACHINE_ARN!;
  const body = event.body ? JSON.parse(event.body) : {};
  const bucket = String(body.bucket ?? "");
  const key = String(body.key ?? body.objectKey ?? "");

  if (!bucket || !key) {
    return json(400, { error: "Expected JSON body: { bucket, key }" });
  }

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

  return json(200, { started: true, invoiceId });
};

