import { getCognitoConfig, setStoredIdToken } from "../config";

type CognitoErrorBody = { __type?: string; message?: string };

async function cognitoRequest<T>(target: string, body: Record<string, unknown>): Promise<T> {
  const cfg = getCognitoConfig();
  if (!cfg) throw new Error("Cognito is not configured (VITE_COGNITO_USER_POOL_ID / VITE_COGNITO_CLIENT_ID).");

  const res = await fetch(`https://cognito-idp.${cfg.region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as T & CognitoErrorBody;
  if (!res.ok || data.__type) {
    throw new Error(data.message ?? data.__type ?? `Cognito ${target} failed (${res.status})`);
  }
  return data;
}

type AuthResult = {
  AuthenticationResult?: { IdToken?: string; AccessToken?: string; RefreshToken?: string };
  ChallengeName?: string;
  Session?: string;
};

export async function signInWithPassword(email: string, password: string): Promise<string> {
  const cfg = getCognitoConfig()!;
  const data = await cognitoRequest<AuthResult>("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: cfg.clientId,
    AuthParameters: { USERNAME: email, PASSWORD: password },
  });

  if (data.ChallengeName === "NEW_PASSWORD_REQUIRED") {
    throw new Error("Account requires a new password. Reset it in the Cognito console or use a permanent password.");
  }

  const idToken = data.AuthenticationResult?.IdToken;
  if (!idToken) throw new Error("Sign-in did not return an ID token.");
  setStoredIdToken(idToken);
  return idToken;
}

export async function signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
  const cfg = getCognitoConfig()!;
  await cognitoRequest<{ UserConfirmed?: boolean }>("SignUp", {
    ClientId: cfg.clientId,
    Username: email,
    Password: password,
    UserAttributes: [{ Name: "email", Value: email }],
  });
  return { needsConfirmation: true };
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  const cfg = getCognitoConfig()!;
  await cognitoRequest("ConfirmSignUp", {
    ClientId: cfg.clientId,
    Username: email,
    ConfirmationCode: code,
  });
}

export function signOut(): void {
  setStoredIdToken(null);
}
