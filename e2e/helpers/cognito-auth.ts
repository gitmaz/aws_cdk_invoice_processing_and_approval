import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognitoClient } from "./aws-clients";

function idTokenFromAuth(result: { AuthenticationResult?: { IdToken?: string } }): string {
  const idToken = result.AuthenticationResult?.IdToken;
  if (!idToken) throw new Error("Cognito did not return IdToken — check pool/client auth flows on LocalStack.");
  return idToken;
}

/**
 * Ensures a cognito user exists (LocalStack / dev pools) and returns an ID token for USER_PASSWORD_AUTH.
 */
export async function ensureUserAndGetIdToken(params: {
  userPoolId: string;
  clientId: string;
  email: string;
  password: string;
}): Promise<string> {
  const cognito = cognitoClient();
  const { userPoolId, clientId, email, password } = params;

  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "email_verified", Value: "true" },
        ],
        MessageAction: "SUPPRESS",
      }),
    );
  } catch (e: unknown) {
    const name = e && typeof e === "object" && "name" in e ? (e as { name: string }).name : "";
    if (name !== "UsernameExistsException") throw e;
  }

  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: email,
      Password: password,
      Permanent: true,
    }),
  );

  try {
    const out = await cognito.send(
      new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: clientId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      }),
    );
    return idTokenFromAuth(out);
  } catch {
    const out = await cognito.send(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      }),
    );
    return idTokenFromAuth(out);
  }
}
