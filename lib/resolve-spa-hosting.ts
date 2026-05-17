import type { Construct } from "constructs";

export type SpaHostingMode = "lambda" | "ec2" | "skip";

const VALID = new Set<SpaHostingMode>(["lambda", "ec2", "skip"]);

/** @deprecated Use `skip` — `none` is accepted as an alias only. */
const SKIP_ALIASES = new Set(["none", "skip"]);

function normalizeSpaHostingInput(raw: string): string {
  if (SKIP_ALIASES.has(raw)) return "skip";
  return raw;
}

/**
 * Where the built Vite SPA is published at deploy time.
 *
 * - **`skip`** (default): CDK does not publish SPA assets; set **`spaBaseUrl`** in config.
 * - **`lambda`**: Lambda function URL serves `spa/dist`; review emails use that URL unless overridden.
 * - **`ec2`**: S3 artifact bucket for sync to an existing EC2/nginx host.
 *
 * Override via **`SPA_HOSTING`** env or CDK context **`-c spaHosting=...`**.
 */
export function resolveSpaHosting(scope: Construct): SpaHostingMode {
  const ctx = (scope.node.tryGetContext("spaHosting") as string | undefined)?.trim().toLowerCase();
  const env = process.env.SPA_HOSTING?.trim().toLowerCase();
  const raw = normalizeSpaHostingInput(env || ctx || "skip");
  if (!VALID.has(raw as SpaHostingMode)) {
    throw new Error(`Invalid SPA_HOSTING / spaHosting "${env || ctx}". Use: lambda | ec2 | skip`);
  }
  return raw as SpaHostingMode;
}
