import { useState } from "react";
import {
  confirmSignUp,
  signInWithPassword,
  signOut,
  signUp,
} from "./auth/cognito";
import { uploadInvoiceFile } from "./api/upload";
import {
  getApiBase,
  getCognitoConfig,
  getStoredIdToken,
  isLocalPresignMode,
} from "./config";
import {
  btnPrimary,
  btnSecondary,
  card,
  ErrorAlert,
  field,
  shell,
  SuccessBox,
} from "./ui";

type AuthMode = "signIn" | "signUp" | "confirm";

export default function UploadPage() {
  const cognito = getCognitoConfig();
  const localMode = isLocalPresignMode();
  const [idToken, setIdToken] = useState<string | null>(() => getStoredIdToken());
  const [authMode, setAuthMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState(() => sessionStorage.getItem("invoice_spa_email") ?? "");
  const [password, setPassword] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canUpload = localMode || Boolean(idToken);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const trimmed = email.trim();
      const token = await signInWithPassword(trimmed, password);
      sessionStorage.setItem("invoice_spa_email", trimmed);
      setIdToken(token);
      setSuccess("Signed in. You can upload an invoice below.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signUp(email.trim(), password);
      setAuthMode("confirm");
      setSuccess("Account created. Enter the verification code from email (if required), then sign in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await confirmSignUp(email.trim(), confirmCode.trim());
      setAuthMode("signIn");
      setSuccess("Email confirmed. Sign in to upload.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function handleSignOut() {
    signOut();
    sessionStorage.removeItem("invoice_spa_email");
    setIdToken(null);
    setSuccess(null);
    setError(null);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a PDF or image file first.");
      return;
    }
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      await uploadInvoiceFile(file, idToken ?? undefined);
      setSuccess(
        "Upload sent. Processing runs in the background (OCR + human review). " +
          "Check your review inbox email for the approval link when ready.",
      );
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={shell}>
      <h1>Upload invoice</h1>
      <p style={{ color: "#555" }}>
        Sign in with Cognito, then upload a PDF or image. Review and approval use the link in your email (no login on
        that page).
      </p>
      {!getApiBase() && (
        <ErrorAlert>Set VITE_API_BASE_URL at build time or add ?apiBase=https://your-http-api to the URL.</ErrorAlert>
      )}

      {localMode && (
        <p style={{ background: "#e3f2fd", padding: 12, borderRadius: 8 }}>
          <strong>Local mode</strong> — uploads use presign secret (no Cognito required).
        </p>
      )}

      {!localMode && !cognito && (
        <ErrorAlert>
          Cognito is not configured. Set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID in spa/.env.dev and
          rebuild the SPA.
        </ErrorAlert>
      )}

      {error && <ErrorAlert>{error}</ErrorAlert>}
      {success && <SuccessBox>{success}</SuccessBox>}

      {!localMode && cognito && (
        <div style={card}>
          {idToken ? (
            <>
              <p>
                Signed in as <strong>{email || "Cognito user"}</strong>
              </p>
              <button type="button" style={btnSecondary} onClick={handleSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button
                  type="button"
                  style={authMode === "signIn" ? btnPrimary : btnSecondary}
                  onClick={() => setAuthMode("signIn")}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  style={authMode === "signUp" ? btnPrimary : btnSecondary}
                  onClick={() => setAuthMode("signUp")}
                >
                  Sign up
                </button>
              </div>

              {authMode === "signIn" && (
                <form onSubmit={(e) => void handleSignIn(e)}>
                  <label>
                    Email
                    <input
                      type="email"
                      autoComplete="username"
                      required
                      style={field}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      autoComplete="current-password"
                      required
                      style={field}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  <button type="submit" style={btnPrimary} disabled={busy}>
                    {busy ? "Signing in…" : "Sign in"}
                  </button>
                </form>
              )}

              {authMode === "signUp" && (
                <form onSubmit={(e) => void handleSignUp(e)}>
                  <label>
                    Email
                    <input
                      type="email"
                      autoComplete="username"
                      required
                      style={field}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      style={field}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  <button type="submit" style={btnPrimary} disabled={busy}>
                    {busy ? "Creating account…" : "Create account"}
                  </button>
                </form>
              )}

              {authMode === "confirm" && (
                <form onSubmit={(e) => void handleConfirm(e)}>
                  <label>
                    Verification code
                    <input
                      type="text"
                      required
                      style={field}
                      value={confirmCode}
                      onChange={(e) => setConfirmCode(e.target.value)}
                    />
                  </label>
                  <button type="submit" style={btnPrimary} disabled={busy}>
                    Confirm email
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      )}

      <div style={card}>
        <h2 style={{ marginTop: 0 }}>File</h2>
        <form onSubmit={(e) => void handleUpload(e)}>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p style={{ fontSize: 14, color: "#666" }}>PDF, PNG, or JPEG. Max size depends on API/S3 limits.</p>
          <button type="submit" style={{ ...btnPrimary, marginTop: 12 }} disabled={busy || !canUpload || !file}>
            {busy ? "Uploading…" : "Upload invoice"}
          </button>
        </form>
      </div>
    </div>
  );
}
