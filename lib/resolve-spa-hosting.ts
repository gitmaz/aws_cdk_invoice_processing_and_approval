import type { Construct } from "constructs";

export type SpaHostingMode = "lambda" | "ec2" | "none";

const VALID = new Set<SpaHostingMode>(["lambda", "ec2", "none"]);

/**
 * Where the built Vite SPA is published at deploy time.
 *
 * - **`none`** (default): manual host (Vite dev, S3+CloudFront, nginx, etc.); set **`spaBaseUrl`** in config.
 * - **`lambda`**: Lambda function URL serves `spa/dist`; review emails use that URL unless overridden in config.
 * - **`ec2`**: S3 artifact bucket for sync to an existing EC2/nginx host.
 *
 * Override via **`SPA_HOSTING`** env or CDK context **`-c spaHosting=...`**.
 */
export function resolveSpaHosting(scope: Construct): SpaHostingMode {
  const ctx = (scope.node.tryGetContext("spaHosting") as string | undefined)?.trim().toLowerCase();
  const env = process.env.SPA_HOSTING?.trim().toLowerCase();
  const raw = env || ctx || "none";
  if (!VALID.has(raw as SpaHostingMode)) {
    throw new Error(`Invalid SPA_HOSTING / spaHosting "${raw}". Use: lambda | ec2 | none`);
  }
  return raw as SpaHostingMode;
}

export function envTruthySpa(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
