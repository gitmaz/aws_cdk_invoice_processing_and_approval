import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const region =
  process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? process.env.CDK_DEFAULT_REGION ?? "us-east-1";

/** LocalStack & emulator defaults (only when an emulator endpoint is set). */
export function emulatorCredentials() {
  return {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
  };
}

export function awsEndpoint(): string | undefined {
  const v = process.env.AWS_ENDPOINT_URL ?? process.env.PLAYWRIGHT_AWS_ENDPOINT_URL;
  return v && String(v).trim() ? v : undefined;
}

function awsClientBase() {
  const endpoint = awsEndpoint();
  if (!endpoint) {
    return { region };
  }
  return { region, endpoint, credentials: emulatorCredentials() };
}

export function cognitoClient() {
  return new CognitoIdentityProviderClient(awsClientBase());
}

export function dynamoDocClient() {
  const low = new DynamoDBClient(awsClientBase());
  return DynamoDBDocumentClient.from(low, {
    marshallOptions: { removeUndefinedValues: true },
  });
}
