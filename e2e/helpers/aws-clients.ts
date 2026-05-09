import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const region = process.env.AWS_REGION ?? process.env.CDK_DEFAULT_REGION ?? "us-east-1";

/** LocalStack & emulator defaults */
export function localCredentials() {
  return {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
  };
}

export function awsEndpoint(): string | undefined {
  return process.env.AWS_ENDPOINT_URL ?? process.env.PLAYWRIGHT_AWS_ENDPOINT_URL;
}

export function cognitoClient() {
  return new CognitoIdentityProviderClient({
    region,
    endpoint: awsEndpoint(),
    credentials: localCredentials(),
  });
}

export function dynamoDocClient() {
  const low = new DynamoDBClient({
    region,
    endpoint: awsEndpoint(),
    credentials: localCredentials(),
  });
  return DynamoDBDocumentClient.from(low, {
    marshallOptions: { removeUndefinedValues: true },
  });
}
