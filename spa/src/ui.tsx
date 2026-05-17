import type { CSSProperties, ReactNode } from "react";

export const shell: CSSProperties = {
  maxWidth: 720,
  margin: "40px auto",
  fontFamily: "system-ui, Segoe UI, sans-serif",
  padding: 16,
  lineHeight: 1.5,
};

export const card: CSSProperties = {
  border: "1px solid #e0e0e0",
  borderRadius: 10,
  padding: 20,
  marginTop: 16,
  background: "#fafafa",
};

export const field: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  marginBottom: 14,
  padding: "10px 12px",
  fontSize: 16,
  borderRadius: 6,
  border: "1px solid #ccc",
  boxSizing: "border-box",
};

export const btnPrimary: CSSProperties = {
  padding: "10px 18px",
  fontSize: 16,
  borderRadius: 6,
  border: "none",
  background: "#1565c0",
  color: "#fff",
  cursor: "pointer",
};

export const btnSecondary: CSSProperties = {
  ...btnPrimary,
  background: "#fff",
  color: "#1565c0",
  border: "1px solid #1565c0",
};

export function ErrorAlert({ children }: { children: ReactNode }) {
  return (
    <p style={{ color: "crimson", whiteSpace: "pre-wrap", background: "#fff5f5", padding: 12, borderRadius: 8 }} role="alert">
      {children}
    </p>
  );
}

export function SuccessBox({ children }: { children: ReactNode }) {
  return (
    <p style={{ background: "#e8f5e9", padding: 12, borderRadius: 8, color: "#1b5e20" }}>{children}</p>
  );
}
