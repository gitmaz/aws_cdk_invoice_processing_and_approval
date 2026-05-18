/**
 * Lambda confidence — `public-api` (GET invoice for SPA, POST decision → SendTaskSuccess).
 * All AWS clients mocked; no network.
 */
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ddbSend, sfnSend } = vi.hoisted(() => ({
  ddbSend: vi.fn(),
  sfnSend: vi.fn(),
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class MockDdb {},
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send: ddbSend }),
  },
  GetCommand: vi.fn((input: unknown) => input),
}));

vi.mock("@aws-sdk/client-sfn", () => ({
  SFNClient: class MockSfn {
    send = sfnSend;
  },
  SendTaskSuccessCommand: vi.fn((input: unknown) => input),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class MockS3 {},
  GetObjectCommand: vi.fn((input: unknown) => input),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://example.com/presigned-doc"),
}));

import { handler } from "../../lambda/public-api/index";

function mkGetEvent(invoiceId: string, session: string): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "GET /public/invoice/{invoiceId}",
    rawPath: `/public/invoice/${invoiceId}`,
    requestContext: {
      accountId: "local",
      apiId: "local",
      domainName: "local",
      domainPrefix: "local",
      http: {
        method: "GET",
        path: `/public/invoice/${invoiceId}`,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "vitest",
      },
      requestId: "req-1",
      routeKey: "GET /public/invoice/{invoiceId}",
      stage: "$default",
      time: "",
      timeEpoch: 0,
    },
    pathParameters: { invoiceId },
    queryStringParameters: { session },
    body: undefined,
    isBase64Encoded: false,
    headers: {},
  } as APIGatewayProxyEventV2;
}

function mkPostDecisionEvent(body: Record<string, unknown>): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "POST /public/decision",
    rawPath: "/public/decision",
    requestContext: {
      accountId: "local",
      apiId: "local",
      domainName: "local",
      domainPrefix: "local",
      http: {
        method: "POST",
        path: "/public/decision",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "vitest",
      },
      requestId: "req-2",
      routeKey: "POST /public/decision",
      stage: "$default",
      time: "",
      timeEpoch: 0,
    },
    pathParameters: undefined,
    queryStringParameters: undefined,
    body: JSON.stringify(body),
    isBase64Encoded: false,
    headers: { "content-type": "application/json" },
  } as APIGatewayProxyEventV2;
}

describe("public-api handler", () => {
  beforeEach(() => {
    ddbSend.mockReset();
    sfnSend.mockReset();
    process.env.INVOICES_TABLE_NAME = "invoice-records-test";
  });

  it("GET returns invoice payload and manualVerificationRequired for SPA", async () => {
    ddbSend.mockResolvedValueOnce({
      Item: {
        invoiceId: "inv-1",
        reviewSessionId: "sess-abc",
        status: "AWAITING_HUMAN",
        minConfidence: 88,
        manualVerificationRequired: true,
        ocrSummary: JSON.stringify({ expenseDocuments: [] }),
        bucket: "bkt",
        objectKey: "uploads/dev/u1/inv.png",
      },
    });

    const res = await handler(mkGetEvent("inv-1", "sess-abc"));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? "{}") as Record<string, unknown>;
    expect(body.invoiceId).toBe("inv-1");
    expect(body.manualVerificationRequired).toBe(true);
    expect(body.minConfidence).toBe(88);
    expect(body.status).toBe("AWAITING_HUMAN");
    expect(body.documentUrl).toBe("https://example.com/presigned-doc");
    expect(body.documentContentType).toBe("image/png");
  });

  it("GET returns 403 when session does not match", async () => {
    ddbSend.mockResolvedValueOnce({
      Item: {
        invoiceId: "inv-1",
        reviewSessionId: "other",
        status: "AWAITING_HUMAN",
      },
    });

    const res = await handler(mkGetEvent("inv-1", "wrong-session"));
    expect(res.statusCode).toBe(403);
  });

  it("GET returns 409 when status is not AWAITING_HUMAN", async () => {
    ddbSend.mockResolvedValueOnce({
      Item: {
        invoiceId: "inv-x",
        reviewSessionId: "sess",
        status: "APPROVED",
      },
    });

    const res = await handler(mkGetEvent("inv-x", "sess"));
    expect(res.statusCode).toBe(409);
  });

  it("POST APPROVE calls SendTaskSuccess with structured output", async () => {
    ddbSend.mockResolvedValueOnce({
      Item: {
        invoiceId: "inv-2",
        reviewSessionId: "sess-x",
        taskToken: "task-token-xyz",
        status: "AWAITING_HUMAN",
      },
    });
    sfnSend.mockResolvedValue({});

    const res = await handler(
      mkPostDecisionEvent({
        invoiceId: "inv-2",
        session: "sess-x",
        action: "APPROVE",
        editedFields: { vendor: "Acme" },
      }),
    );

    expect(res.statusCode).toBe(200);
    expect(sfnSend).toHaveBeenCalledTimes(1);
    const cmd = sfnSend.mock.calls[0][0] as { taskToken?: string; output?: string };
    expect(cmd.taskToken).toBe("task-token-xyz");
    const out = JSON.parse(cmd.output ?? "{}") as { action: string; invoiceId: string };
    expect(out.action).toBe("APPROVE");
    expect(out.invoiceId).toBe("inv-2");
  });

  it("POST REJECT calls SendTaskSuccess with reject payload", async () => {
    ddbSend.mockResolvedValueOnce({
      Item: {
        invoiceId: "inv-3",
        reviewSessionId: "sess-y",
        taskToken: "tok-r",
        status: "AWAITING_HUMAN",
      },
    });
    sfnSend.mockResolvedValue({});

    const res = await handler(
      mkPostDecisionEvent({
        invoiceId: "inv-3",
        session: "sess-y",
        action: "REJECT",
        reason: "bad total",
      }),
    );

    expect(res.statusCode).toBe(200);
    const cmd = sfnSend.mock.calls[0][0] as { output?: string };
    const out = JSON.parse(cmd.output ?? "{}") as { action: string; reason: string };
    expect(out.action).toBe("REJECT");
    expect(out.reason).toBe("bad total");
  });
});
