/** HTTP API base (no trailing slash). Query `apiBase` overrides build-time env. */
export function getApiBase(): string {
  const fromQuery = new URLSearchParams(window.location.search).get("apiBase");
  const base = (import.meta.env.VITE_API_BASE_URL || fromQuery || "").replace(/\/$/, "");
  return base;
}

export function getCognitoConfig(): { poolId: string; clientId: string; region: string } | null {
  const poolId = import.meta.env.VITE_COGNITO_USER_POOL_ID ?? "";
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID ?? "";
  if (!poolId || !clientId) return null;
  const region = poolId.includes("_") ? poolId.split("_")[0]! : import.meta.env.VITE_AWS_REGION ?? "ap-southeast-2";
  return { poolId, clientId, region };
}

export function getPresignLocalSecret(): string {
  return (import.meta.env.VITE_PRESIGN_LOCAL_SECRET ?? "").trim();
}

export function isLocalPresignMode(): boolean {
  return import.meta.env.VITE_APP_STAGE === "local" || Boolean(getPresignLocalSecret());
}

const TOKEN_KEY = "invoice_spa_id_token";

export function getStoredIdToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setStoredIdToken(token: string | null): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}
